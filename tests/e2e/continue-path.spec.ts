import { expect, test, type Page } from '@playwright/test'
import { projectToLocal } from '../../src/core/clip'
import {
  displayedPathSamples,
  planContinuePathCommit,
} from '../../src/core/continuePath'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { evaluate } from '../../src/core/playback'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import { evaluateTransform } from '../../src/core/transform'
import type { Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { makeActor, makeProject, makeSamples } from '../unit/helpers/project'
import {
  clickAddActor,
  closeOpenChromePanels,
  dispatchActivePointerCancel,
  dragActor,
  clickContinuePath,
  ensureEditor,
  ensureRefineMotionOpen,
  loadHtmlDocument,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

async function waitForSaved(page: Page) {
  await openPanel(page, 'project')
  await expect(page.getByTestId('save-status')).toHaveText(
    'Saved in this browser',
  )
  await closeOpenChromePanels(page)
}

async function readProjectActor0(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('motionsketch.project.v1')
    if (!raw) return null
    const doc = JSON.parse(raw) as {
      project: {
        playback: { durationMs: number }
        actors: Array<{
          recording: {
            recordedDurationMs: number
            samples: Array<{ t: number; x: number; y: number }>
          }
          geometryEdit: {
            samples: Array<{ t: number; x: number; y: number }>
            timingBaked?: boolean
          } | null
          steadySpeed: number
          glide: number
          clip: { start: number; end: number }
        }>
      }
    }
    const actor = doc.project.actors[0]!
    // Displayed path: geometryEdit (continued) or original recording.
    const samples =
      actor.geometryEdit?.samples ?? actor.recording.samples
    const pathMs = samples[samples.length - 1]?.t ?? 0
    let strictlyIncreasing = true
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]!.t <= samples[i - 1]!.t) {
        strictlyIncreasing = false
        break
      }
    }
    return {
      durationMs: doc.project.playback.durationMs,
      pathMs,
      recordingPathMs: actor.recording.recordedDurationMs,
      recordingSampleCount: actor.recording.samples.length,
      sampleCount: samples.length,
      clipEnd: actor.clip.end,
      strictlyIncreasing,
      samples,
      hasGeometryEdit: !!actor.geometryEdit,
      timingBaked: actor.geometryEdit?.timingBaked === true,
      steadySpeed: actor.steadySpeed,
      glide: actor.glide,
    }
  })
}

async function continuePathStroke(
  page: Page,
  delta: { x: number; y: number },
) {
  await clickContinuePath(page)
  await expect(page.getByTestId('dock-status')).toContainText(
    /Drag the actor to continue its path/i,
  )
  await dragActor(page, { x: 4, y: 2 }, delta)
  await expect(page.getByTestId('btn-play')).toBeEnabled()
  await waitForSaved(page)
}

test.describe('Continue path', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('pointer continuation keeps new endpoint through playback and reload', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Continue pointer')
    await recordSimplePath(page)
    await waitForSaved(page)

    const before = await readProjectActor0(page)
    expect(before).toBeTruthy()
    const beforeEnd = before!.samples[before!.samples.length - 1]!

    await continuePathStroke(page, { x: 95, y: -45 })
    const continued = await readProjectActor0(page)
    expect(continued!.hasGeometryEdit).toBe(true)
    expect(continued!.timingBaked).toBe(true)
    const newEnd = continued!.samples[continued!.samples.length - 1]!
    expect(Math.hypot(newEnd.x - beforeEnd.x, newEnd.y - beforeEnd.y)).toBeGreaterThan(
      0.04,
    )

    // Playback at the end of the clip must land on the continued endpoint.
    await page.getByTestId('playback-scrubber').fill('1')
    const playPose = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="actor"]') as HTMLElement
      const stage = document.querySelector('[data-testid="stage"]') as HTMLElement
      const box = el.getBoundingClientRect()
      const sb = stage.getBoundingClientRect()
      return {
        x: (box.left + box.width / 2 - sb.left) / sb.width,
        y: (box.top + box.height / 2 - sb.top) / sb.height,
      }
    })
    expect(Math.hypot(playPose.x - newEnd.x, playPose.y - newEnd.y)).toBeLessThan(
      0.04,
    )

    await page.reload()
    await ensureEditor(page, 'Continue pointer')
    const reloaded = await readProjectActor0(page)
    expect(reloaded!.hasGeometryEdit).toBe(true)
    expect(reloaded!.timingBaked).toBe(true)
    expect(reloaded!.sampleCount).toBe(continued!.sampleCount)
    const reloadedEnd = reloaded!.samples[reloaded!.samples.length - 1]!
    expect(reloadedEnd.x).toBeCloseTo(newEnd.x, 4)
    expect(reloadedEnd.y).toBeCloseTo(newEnd.y, 4)
    expect(reloaded!.durationMs).toBe(continued!.durationMs)

    // Second continuation through real pointer interaction.
    await continuePathStroke(page, { x: -40, y: 55 })
    const twice = await readProjectActor0(page)
    expect(twice!.sampleCount).toBeGreaterThan(reloaded!.sampleCount)
    const twiceEnd = twice!.samples[twice!.samples.length - 1]!
    expect(Math.hypot(twiceEnd.x - reloadedEnd.x, twiceEnd.y - reloadedEnd.y)).toBeGreaterThan(
      0.03,
    )
  })

  test('trackpad-style pointercancel commits a continue stroke', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readProjectActor0(page)

    await clickContinuePath(page)
    await expect(page.getByTestId('dock-status')).toContainText(
      /continue its path/i,
    )

    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 70, startY - 35, { steps: 10 })
    await page.waitForTimeout(80)
    await dispatchActivePointerCancel(page)
    // Release Playwright's mouse so later UI clicks are not blocked.
    await page.mouse.up()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect
      .poll(async () => (await readProjectActor0(page))?.hasGeometryEdit)
      .toBe(true)

    const after = await readProjectActor0(page)
    expect(after!.sampleCount).toBeGreaterThan(before!.sampleCount)
    const end = after!.samples[after!.samples.length - 1]!
    const prev = before!.samples[before!.samples.length - 1]!
    expect(Math.hypot(end.x - prev.x, end.y - prev.y)).toBeGreaterThan(0.03)

    // Single undo entry — pointerup after cancel must not double-commit.
    await page.getByTestId('btn-undo-transform').click()
    await waitForSaved(page)
    const undone = await readProjectActor0(page)
    expect(undone!.hasGeometryEdit).toBe(false)
    expect(undone!.sampleCount).toBe(before!.sampleCount)
  })

  test('window blur commits a partial continue and ignores later pointerup', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readProjectActor0(page)

    await clickContinuePath(page)
    await expect(page.getByTestId('dock-status')).toContainText(
      /continue its path/i,
    )

    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 55, startY + 45, { steps: 8 })
    await page.waitForTimeout(80)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.mouse.up()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect
      .poll(async () => (await readProjectActor0(page))?.hasGeometryEdit)
      .toBe(true)

    const after = await readProjectActor0(page)
    expect(after!.sampleCount).toBeGreaterThan(before!.sampleCount)

    // One continue undo only.
    await page.getByTestId('btn-undo-transform').click()
    const undone = await readProjectActor0(page)
    expect(undone!.hasGeometryEdit).toBe(false)
    expect(undone!.sampleCount).toBe(before!.sampleCount)
  })

  test('Escape mid-continue discards without committing', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readProjectActor0(page)

    await clickContinuePath(page)
    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 40, startY - 25, { steps: 6 })
    await page.waitForTimeout(60)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.getByTestId('btn-record')).toBeVisible()
    const after = await readProjectActor0(page)
    expect(after!.hasGeometryEdit).toBe(false)
    expect(after!.sampleCount).toBe(before!.sampleCount)
    expect(after!.durationMs).toBe(before!.durationMs)
  })

  test('zero-motion continue is a no-op', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readProjectActor0(page)

    await clickContinuePath(page)
    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Hold without meaningful travel past the pinned endpoint.
    await page.waitForTimeout(120)
    await page.mouse.up()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    const after = await readProjectActor0(page)
    expect(after!.hasGeometryEdit).toBe(false)
    expect(after!.sampleCount).toBe(before!.sampleCount)
    expect(after!.durationMs).toBe(before!.durationMs)
  })

  test('appends from the endpoint, extends Duration, and undo restores', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Continue path')
    await recordSimplePath(page)
    await waitForSaved(page)

    const before = await readProjectActor0(page)
    expect(before).toBeTruthy()

    await continuePathStroke(page, { x: 80, y: -40 })

    const after = await readProjectActor0(page)
    expect(after).toBeTruthy()
    expect(after!.strictlyIncreasing).toBe(true)
    expect(after!.hasGeometryEdit).toBe(true)
    expect(after!.timingBaked).toBe(true)
    // Original take preserved on recording; displayed path grows in geometryEdit.
    expect(after!.recordingPathMs).toBe(before!.recordingPathMs)
    expect(after!.recordingSampleCount).toBe(before!.recordingSampleCount)
    expect(after!.sampleCount).toBeGreaterThan(before!.sampleCount)
    expect(after!.pathMs).toBeGreaterThan(before!.pathMs)
    expect(after!.durationMs).toBeGreaterThan(before!.durationMs)

    await continuePathStroke(page, { x: -30, y: 50 })
    const twice = await readProjectActor0(page)
    expect(twice!.pathMs).toBeGreaterThan(after!.pathMs)
    expect(twice!.recordingPathMs).toBe(before!.recordingPathMs)

    await page.getByTestId('btn-undo-transform').click()
    await page.getByTestId('btn-undo-transform').click()
    await waitForSaved(page)
    const undone = await readProjectActor0(page)
    expect(undone!.hasGeometryEdit).toBe(false)
    expect(undone!.pathMs).toBeCloseTo(before!.pathMs, 0)
    expect(undone!.durationMs).toBe(before!.durationMs)

    await page.getByTestId('btn-redo-transform').click()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
  })

  test('Escape cancels an armed continue without changing the path', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readProjectActor0(page)

    await clickContinuePath(page)
    await expect(page.getByTestId('btn-stop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await waitForSaved(page)

    const after = await readProjectActor0(page)
    expect(after!.pathMs).toBe(before!.pathMs)
  })

  test('Record replace remains distinct from Continue path', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-record').click()
    await page.getByTestId('btn-rerecord-confirm').click()
    await expect(page.getByTestId('dock-status')).toContainText(
      /Drag the element to record/i,
    )
    await page.getByTestId('btn-stop').click()

    const continueBtn = page.getByTestId('btn-continue-path')
    await expect(continueBtn).toBeVisible()
    // Main dock placement: after Record, before Play — not inside Refine.
    await expect(
      page.getByTestId('refine-motion-tools').getByTestId('btn-continue-path'),
    ).toHaveCount(0)
    await continueBtn.click()
    await expect(page.getByTestId('dock-status')).toContainText(
      /continue its path/i,
    )
    await page.getByTestId('btn-stop').click()
  })

  test('HTML export duration matches extended project Duration after continue', async ({
    page,
  }) => {
    const project: Project = {
      version: 1,
      name: 'Continue export',
      stageAspect: 1.6,
      playback: {
        durationMs: 1200,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
      actors: [
        createSceneActor({
          id: 'actor-1',
          name: 'Actor 1',
          restPosition: { x: 0.2, y: 0.5 },
          smoothing: 0,
          steadySpeed: 0,
          glide: 0,
          recording: {
            recordedDurationMs: 400,
            samples: [
              { t: 0, x: 0.2, y: 0.5 },
              { t: 200, x: 0.45, y: 0.45 },
              { t: 400, x: 0.7, y: 0.5 },
            ],
          },
        }),
      ],
    }

    await loadProjectSnapshot(
      page,
      serializeSnapshot(buildSnapshot(project, null, '2026-01-01T00:00:00.000Z')),
    )
    await ensureEditor(page, 'Continue export')
    await continuePathStroke(page, { x: 60, y: 20 })

    const saved = await readProjectActor0(page)
    expect(saved).toBeTruthy()
    expect(saved!.strictlyIncreasing).toBe(true)
    expect(saved!.hasGeometryEdit).toBe(true)
    // Original recording unchanged; displayed path continues past 400ms.
    expect(saved!.recordingPathMs).toBe(400)
    const seam = saved!.samples.find((s) => Math.abs(s.t - 400) < 1)
    expect(seam).toBeTruthy()
    const afterSeam = saved!.samples.find((s) => s.t > 400 + 1e-6)
    expect(afterSeam).toBeTruthy()

    const css = await readExportedCss(page)
    expect(css).toContain(`${Math.round(saved!.durationMs)}ms`)
    const offsets = [...css.matchAll(/(\d+(?:\.\d+)?)%\s*\{/g)].map((m) =>
      Number(m[1]),
    )
    expect(offsets.length).toBeGreaterThan(3)
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]!).toBeGreaterThanOrEqual(offsets[i - 1]!)
    }
  })

  test('preserves another actor’s absolute Sequence timing', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await clickAddActor(page)
    await selectActorByIndex(page, 1)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: -20, y: 10 }, { x: 40, y: -30 })
    await waitForSaved(page)

    await selectActorByIndex(page, 0)
    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('motionsketch.project.v1')
      const doc = JSON.parse(raw!) as {
        project: {
          playback: { durationMs: number }
          actors: Array<{ clip: { start: number; end: number } }>
        }
      }
      const d = doc.project.playback.durationMs
      const b = doc.project.actors[1]!
      return {
        durationMs: d,
        otherStartAbs: b.clip.start * d,
        otherEndAbs: b.clip.end * d,
      }
    })

    await continuePathStroke(page, { x: 70, y: 10 })

    const after = await page.evaluate(() => {
      const raw = localStorage.getItem('motionsketch.project.v1')
      const doc = JSON.parse(raw!) as {
        project: {
          playback: { durationMs: number }
          actors: Array<{ clip: { start: number; end: number } }>
        }
      }
      const d = doc.project.playback.durationMs
      const b = doc.project.actors[1]!
      return {
        durationMs: d,
        otherStartAbs: b.clip.start * d,
        otherEndAbs: b.clip.end * d,
      }
    })
    expect(after.durationMs).toBeGreaterThan(before.durationMs)
    expect(after.otherStartAbs).toBeCloseTo(before.otherStartAbs, 0)
    expect(after.otherEndAbs).toBeCloseTo(before.otherEndAbs, 0)
  })

  test('HTML demo rendered transforms match editor after baked Steady+Glide continue', async ({
    page,
  }) => {
    const samples = makeSamples(24).map((s, i) => ({
      ...s,
      x: 0.15 + i * 0.025,
      y: 0.4 + Math.sin(i / 3) * 0.1,
    }))
    let t = 0
    for (let i = 0; i < samples.length; i++) {
      if (i === 0) samples[i]!.t = 0
      else {
        t += 25 + (i % 4) * 10
        samples[i]!.t = t
      }
    }
    const recording = {
      samples,
      recordedDurationMs: samples[samples.length - 1]!.t,
    }
    const before = makeProject({
      actors: [
        makeActor({
          id: 'a1',
          recording,
          smoothing: 0,
          steadySpeed: 0.85,
          glide: 0.7,
          transform: {
            keyframes: [
              { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
              { id: 'k1', t: 0.55, rotationDeg: 25, scale: 1.2 },
            ],
          },
          clip: {
            start: 0,
            end: 1,
            hideBeforeStart: false,
            hideAfterEnd: false,
          },
        }),
      ],
      playback: {
        durationMs: 1400,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })

    const displayed = displayedPathSamples(
      before.actors[0]!,
      before.stageAspect,
    )
    const oldPathMs = displayed[displayed.length - 1]!.t
    const joinAbs = 1400
    const end = displayed[displayed.length - 1]!
    const plan = planContinuePathCommit({
      project: before,
      actorId: 'a1',
      addition: {
        samples: [
          { t: 0, x: end.x, y: end.y },
          { t: 220, x: Math.min(0.99, end.x + 0.14), y: end.y + 0.05 },
        ],
        recordedDurationMs: 220,
      },
    })
    expect('error' in plan).toBe(false)
    if ('error' in plan) return

    const after: Project = {
      ...before,
      playback: { ...before.playback, durationMs: plan.durationMs },
      actors: before.actors.map((a) => {
        const p = plan.actors.find((x) => x.id === a.id)!
        return {
          ...a,
          geometryEdit: p.geometryEdit ?? plan.geometryEdit,
          steadySpeed: 0,
          glide: 0,
          clip: p.clip,
          transform: p.transform,
        }
      }),
    }
    expect(after.actors[0]!.geometryEdit?.timingBaked).toBe(true)

    const newDur = after.playback.durationMs
    // Absolute times: deep in prefix, near join, just after join, mid append.
    const probeAbsMs = [
      0.25 * joinAbs,
      0.7 * joinAbs,
      joinAbs - 8,
      joinAbs + 40,
      joinAbs + 140,
      newDur - 20,
    ]

    const editorPoses = probeAbsMs.map((absMs) => {
      const tNorm = absMs / newDur
      const actor = after.actors[0]!
      const path = selectProcessedPathForActor(after, actor)
      const local = projectToLocal(tNorm, actor.clip)
      const pos = evaluate(path, local)
      const xf = evaluateTransform(actor.transform, local)
      return { absMs, tNorm, x: pos.x, y: pos.y, scale: xf.scale, rotationDeg: xf.rotationDeg }
    })

    // Prefix times must still match pre-continue editor poses.
    for (const absMs of [0.25 * joinAbs, 0.7 * joinAbs, joinAbs - 8]) {
      const tBefore = absMs / 1400
      const pathB = selectProcessedPathForActor(before, before.actors[0]!)
      const localB = projectToLocal(tBefore, before.actors[0]!.clip)
      const posB = evaluate(pathB, localB)
      const afterPose = editorPoses.find((p) => p.absMs === absMs)!
      expect(Math.abs(afterPose.x - posB.x)).toBeLessThanOrEqual(1e-9)
      expect(Math.abs(afterPose.y - posB.y)).toBeLessThanOrEqual(1e-9)
    }

    const html = buildHtmlDemoFromProject(after)
    await loadHtmlDocument(page, html)
    await expect(page.getByTestId('demo-actor')).toBeVisible()

    const rendered = await page.evaluate((times) => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const stage = document.querySelector(
        '[data-testid="demo-stage"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as Animation & { animationName?: unknown }).animationName
        return typeof name === 'string' && name !== '' && name !== 'none' && !name.includes('-vis')
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
        const style = getComputedStyle(el)
        let scale = 1
        let rotationDeg = 0
        const m = style.transform
        if (m && m !== 'none') {
          const m2 = m.match(/^matrix\((.+)\)$/)
          const m3 = m.match(/^matrix3d\((.+)\)$/)
          if (m2) {
            const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
            scale = Math.hypot(a, b)
            rotationDeg = (Math.atan2(b, a) * 180) / Math.PI
          } else if (m3) {
            const parts = m3[1].split(',').map((v) => Number(v.trim()))
            scale = Math.hypot(parts[0], parts[1])
            rotationDeg = (Math.atan2(parts[1], parts[0]) * 180) / Math.PI
          }
        }
        return {
          absMs,
          x: (box.left + box.width / 2 - stageBox.left) / stageBox.width,
          y: (box.top + box.height / 2 - stageBox.top) / stageBox.height,
          scale,
          rotationDeg,
        }
      })
    }, probeAbsMs)

    expect(rendered).toHaveLength(editorPoses.length)
    let maxPosErr = 0
    for (let i = 0; i < editorPoses.length; i++) {
      const e = editorPoses[i]!
      const r = rendered[i]!
      const posErr = Math.hypot(e.x - r.x, e.y - r.y)
      maxPosErr = Math.max(maxPosErr, posErr)
      // Export RDP thinning — require real browser parity, not path-array equality.
      expect(posErr, `absMs=${e.absMs} pos`).toBeLessThan(0.02)
      expect(Math.abs(e.scale - r.scale), `absMs=${e.absMs} scale`).toBeLessThan(
        0.05,
      )
      const rotDelta = Math.abs(
        ((((e.rotationDeg - r.rotationDeg) % 360) + 540) % 360) - 180,
      )
      expect(rotDelta, `absMs=${e.absMs} rot`).toBeLessThan(3)
    }
    // Appended samples must leave the old endpoint neighborhood.
    const nearJoin = rendered.find((p) => p.absMs === joinAbs - 8)!
    const midAppend = rendered.find((p) => p.absMs === joinAbs + 140)!
    expect(Math.hypot(midAppend.x - nearJoin.x, midAppend.y - nearJoin.y)).toBeGreaterThan(
      0.02,
    )
    // Keep the measured bound visible in failures.
    expect(maxPosErr).toBeLessThan(0.02)
    void oldPathMs
  })

  test('Continue help and Restore confirm explain bake and full restore', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await expect(page.getByTestId('continue-path-help')).toContainText(
      /smoothing and timing become part of the stroke/i,
    )
    await continuePathStroke(page, { x: 50, y: -20 })
    await ensureRefineMotionOpen(page)
    await expect(page.getByTestId('restore-path-help')).toContainText(
      /Removes every continuation/i,
    )
    await page.getByTestId('btn-restore-path').click()
    await expect(page.getByTestId('restore-path-confirm')).toBeVisible()
    await expect(page.getByTestId('restore-path-confirm')).toContainText(
      /original recording/i,
    )
    await page.getByTestId('btn-restore-path-confirm').click()
    const after = await readProjectActor0(page)
    expect(after!.hasGeometryEdit).toBe(false)
  })
})
