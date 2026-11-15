import { expect, test } from '@playwright/test'
import type { MotionEasing } from '../../src/core/easing'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { buildOwnElementExport } from '../../src/core/export/ownElement'
import { evaluate } from '../../src/core/playback'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { loadHtmlDocument } from './helpers'

function pausePath(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 15; i++) {
    samples.push({ t: i * 30, x: 0.25 + i * 0.01, y: 0.4 })
  }
  for (let i = 1; i <= 8; i++) {
    samples.push({ t: 450 + i * 40, x: 0.4, y: 0.4 })
  }
  for (let i = 1; i <= 30; i++) {
    samples.push({
      t: 770 + i * 30,
      x: 0.4 + i * 0.015,
      y: 0.4,
    })
  }
  return samples
}

function projectWithEasing(kind: MotionEasing): Project {
  const samples = pausePath()
  const actor = createSceneActor({
    id: `render-${kind}`,
    name: 'Render Actor',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit: {
      samples: samples.map((s) => ({ ...s })),
      bakedSmoothing: 0,
      handleIndices: [0, samples.length - 1],
    },
    smoothing: 0,
    steadySpeed: 0,
    glide: 0,
    easing: kind,
  })
  return {
    version: 1,
    name: `Easing ${kind} render`,
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
    playback: {
      durationMs: samples[samples.length - 1]!.t,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [actor],
  }
}

async function sampleRenderedPoses(
  page: import('@playwright/test').Page,
  absMsList: number[],
  actorTestId: string,
  stageTestId: string,
) {
  return page.evaluate(
    ({ times, actorSel, stageSel }) => {
      const el = document.querySelector(actorSel) as HTMLElement | null
      const stage = document.querySelector(stageSel) as HTMLElement | null
      if (!el || !stage) throw new Error('missing demo nodes')
      const anim = el.getAnimations().find((a) => {
        const name = (a as Animation & { animationName?: unknown })
          .animationName
        return (
          typeof name === 'string' &&
          name !== '' &&
          name !== 'none' &&
          !name.includes('-vis')
        )
      })
      if (!anim) throw new Error('missing motion animation')
      anim.pause()
      const dur =
        Number(anim.effect?.getTiming().duration) ||
        parseFloat(getComputedStyle(el).animationDuration) * 1000 ||
        1000
      const stageBox = stage.getBoundingClientRect()
      return times.map((absMs) => {
        const tNorm = absMs / dur
        anim.currentTime = Math.min(dur, Math.max(0, tNorm * dur))
        void el.offsetWidth
        const box = el.getBoundingClientRect()
        return {
          absMs,
          x: (box.left + box.width / 2 - stageBox.left) / stageBox.width,
          y: (box.top + box.height / 2 - stageBox.top) / stageBox.height,
        }
      })
    },
    {
      times: absMsList,
      actorSel: `[data-testid="${actorTestId}"]`,
      stageSel: `[data-testid="${stageTestId}"]`,
    },
  )
}

test.describe('easing export rendered playback', () => {
  test.use({ viewport: { width: 900, height: 700 } })

  for (const kind of ['easeOut', 'spring', 'bounce'] as const) {
    test(`${kind}: HTML demo rendered poses match editor (protected pause)`, async ({
      page,
    }) => {
      const project = projectWithEasing(kind)
      const actor = project.actors[0]!
      const path = selectProcessedPathForActor(project, actor)
      const duration = path[path.length - 1]!.t
      // Mid-pause hold + before/after for motion.
      const probeAbsMs = [200, 630, 750, 900, duration - 40]
      const editorPoses = probeAbsMs.map((absMs) => {
        const pos = evaluate(path, absMs / duration)
        return { absMs, x: pos.x, y: pos.y }
      })

      const html = buildHtmlDemoFromProject(project)
      await loadHtmlDocument(page, html)
      await expect(page.getByTestId('demo-actor')).toBeVisible()

      const rendered = await sampleRenderedPoses(
        page,
        probeAbsMs,
        'demo-actor',
        'demo-stage',
      )
      expect(rendered).toHaveLength(editorPoses.length)

      for (let i = 0; i < editorPoses.length; i++) {
        const e = editorPoses[i]!
        const r = rendered[i]!
        const err = Math.hypot(e.x - r.x, e.y - r.y)
        expect(err, `${kind} absMs=${e.absMs}`).toBeLessThan(0.025)
      }
      // Protected pause: mid-hold stays put.
      const hold = rendered.find((p) => p.absMs === 750)!
      expect(hold.x).toBeCloseTo(0.4, 2)
      expect(hold.y).toBeCloseTo(0.4, 2)
    })

    test(`${kind}: own-element CSS (HTML/React wrapper) renders matching motion`, async ({
      page,
    }) => {
      const project = projectWithEasing(kind)
      const actor = project.actors[0]!
      const path = selectProcessedPathForActor(project, actor)
      const duration = path[path.length - 1]!.t
      const own = buildOwnElementExport(project, actor.id)
      expect(own.ok).toBe(true)
      if (!own.ok) return
      // React snippets consume the same scoped CSS + wrapper class as htmlExample.
      expect(own.reactExample).toContain(own.wrapperClass)
      expect(own.reactExample).toMatch(/ms-actor|animation|keyframes/i)

      const html = `<!doctype html><html><head><style>
html,body{margin:0}
${own.css}
.${own.scope.stageClass}{width:640px;height:400px;position:relative;background:#f8fafc}
</style></head><body>
${own.htmlExample.replace(
  `class="${own.wrapperClass}"`,
  `class="${own.wrapperClass}" data-testid="own-actor"`,
).replace(
  `class="${own.scope.stageClass}"`,
  `class="${own.scope.stageClass}" data-testid="own-stage"`,
)}
</body></html>`

      await loadHtmlDocument(page, html)
      await expect(page.getByTestId('own-actor')).toBeVisible()

      const probeAbsMs = [630, 750, 900]
      const editorPoses = probeAbsMs.map((absMs) => {
        const pos = evaluate(path, absMs / duration)
        return { absMs, x: pos.x, y: pos.y }
      })
      const rendered = await sampleRenderedPoses(
        page,
        probeAbsMs,
        'own-actor',
        'own-stage',
      )
      for (let i = 0; i < editorPoses.length; i++) {
        const e = editorPoses[i]!
        const r = rendered[i]!
        expect(
          Math.hypot(e.x - r.x, e.y - r.y),
          `${kind} own absMs=${e.absMs}`,
        ).toBeLessThan(0.03)
      }
      const hold = rendered.find((p) => p.absMs === 750)!
      expect(hold.x).toBeCloseTo(0.4, 2)
    })
  }
})
