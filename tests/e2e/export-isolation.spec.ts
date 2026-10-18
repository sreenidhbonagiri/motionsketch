import { expect, test } from '@playwright/test'
import { makeGeometryEdit } from '../../src/core/edit'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  fingerprintProjectScene,
  MS_MOTION_OK_CLASS,
} from '../../src/core/export/sceneScope'
import {
  buildEmbedCompanionProject,
  buildEmbedMarkProject,
  EMBED_SCENE_A_OPTIONS,
  EMBED_SCENE_B_OPTIONS,
} from '../fixtures/embedScenes'
import { buildExportIsolationPage } from '../fixtures/exportIsolationPage'
import {
  makeActor,
  makeProject,
  makeRecording,
  makeSamples,
} from '../unit/helpers/project'
import { loadHtmlDocument } from './helpers'

test.describe('export scene isolation + reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('two scenes and host .stage/.actor keep independent geometry', async ({
    page,
  }) => {
    const projectA = makeProject({
      name: 'Scene A',
      actors: [
        makeActor({
          id: 'a1',
          recording: makeRecording(16),
          appearance: { color: '#0f766e', width: 0.22, height: 0.22 },
          clip: {
            start: 0.15,
            end: 0.85,
            hideBeforeStart: true,
            hideAfterEnd: true,
          },
        }),
      ],
      playback: { durationMs: 2000, loop: false, loopMode: 'repeat' },
      stageAspect: 1.6,
    })
    const projectB = makeProject({
      name: 'Scene B',
      actors: [
        makeActor({
          id: 'b1',
          recording: makeRecording(16),
          appearance: { color: '#c2410c', width: 0.12, height: 0.12 },
          clip: {
            start: 0,
            end: 1,
            hideBeforeStart: false,
            hideAfterEnd: false,
          },
        }),
      ],
      playback: { durationMs: 900, loop: true, loopMode: 'alternate' },
      stageAspect: 1.0,
    })

    const html = buildExportIsolationPage({
      projectA,
      projectB,
      projectACopy: projectA,
      optionsACopy: { instancePrefix: 'copy-' },
    })
    await loadHtmlDocument(page, html)

    const meta = await page.evaluate(() => {
      const w = window as unknown as {
        __msIsolation: {
          rootA: string
          rootB: string
          sceneIdA: string
          sceneIdB: string
        }
      }
      return w.__msIsolation
    })
    expect(meta.rootA).not.toBe(meta.rootB)
    expect(meta.sceneIdA).not.toBe(meta.sceneIdB)

    const host = page.getByTestId('host-actor')
    const hostBox = await host.boundingBox()
    expect(hostBox).toBeTruthy()
    expect(hostBox!.width).toBeGreaterThan(30)
    expect(hostBox!.width).toBeLessThan(50)

    async function sampleScene(rootClass: string, tNorm: number) {
      return page.evaluate(
        ({ root, t }) => {
          const scene = document.querySelector(`.${root}`) as HTMLElement | null
          if (!scene) throw new Error('missing scene ' + root)
          const stage = scene.querySelector('.ms-stage') as HTMLElement | null
          const actor = scene.querySelector(
            '[class^="ms-actor"]',
          ) as HTMLElement | null
          if (!stage || !actor) throw new Error('missing stage/actor')
          const anims = actor.getAnimations().filter((a) => {
            const name = (a as Animation & { animationName?: unknown })
              .animationName
            return typeof name === 'string' && name !== '' && name !== 'none'
          })
          let dur = 0
          for (const anim of anims) {
            const d = Number(anim.effect?.getTiming().duration ?? 0)
            if (d > dur) dur = d
          }
          if (!(dur > 0)) {
            const durCss = getComputedStyle(actor).animationDuration
            dur = (parseFloat(durCss) || 1) * 1000
          }
          for (const anim of anims) {
            const d = Number(anim.effect?.getTiming().duration ?? dur)
            if (!(d > 0)) continue
            anim.pause()
            anim.currentTime = t * d
          }
          void actor.offsetWidth
          const box = actor.getBoundingClientRect()
          const stageBox = stage.getBoundingClientRect()
          return {
            width: box.width,
            height: box.height,
            centerX: box.left + box.width / 2,
            centerY: box.top + box.height / 2,
            stageW: stageBox.width,
            stageH: stageBox.height,
            aspect: stageBox.width / stageBox.height,
            visibility: getComputedStyle(actor).visibility,
            durationMs: dur,
            bg: getComputedStyle(actor).backgroundColor,
          }
        },
        { root: rootClass, t: tNorm },
      )
    }

    const aMid = await sampleScene(meta.rootA, 0.5)
    const bMid = await sampleScene(meta.rootB, 0.5)
    expect(aMid.durationMs).toBeCloseTo(2000, 0)
    expect(bMid.durationMs).toBeCloseTo(900, 0)
    expect(aMid.aspect).toBeCloseTo(1.6, 1)
    expect(bMid.aspect).toBeCloseTo(1.0, 1)
    expect(aMid.width).toBeGreaterThan(bMid.width)
    expect(aMid.bg).not.toBe(bMid.bg)

    // Visibility flags on A — nearby samples (exact 0.15/0.85 are Firefox step-end).
    const aBefore = await sampleScene(meta.rootA, 0.05)
    const aInside = await sampleScene(meta.rootA, 0.16)
    const aNearEnd = await sampleScene(meta.rootA, 0.84)
    const aAfterEnd = await sampleScene(meta.rootA, 0.86)
    expect(aBefore.visibility).toBe('hidden')
    expect(aInside.visibility).toBe('visible')
    expect(aNearEnd.visibility).toBe('visible')
    expect(aAfterEnd.visibility).toBe('hidden')

    // Host actor still uses host keyframes (not MotionSketch transforms).
    const hostTransform = await host.evaluate((el) => getComputedStyle(el).transform)
    expect(hostTransform).not.toBe('none')

    // Independent copy of A with instance prefix.
    const copyRoot = `copy-${meta.rootA}`
    const copyMid = await sampleScene(copyRoot, 0.5)
    expect(copyMid.durationMs).toBeCloseTo(2000, 0)
    expect(copyMid.width).toBeCloseTo(aMid.width, 0)
    expect(copyMid.bg).toBe(aMid.bg)

    // Responsive: narrow mount B keeps aspect.
    await page.setViewportSize({ width: 390, height: 800 })
    const bNarrow = await sampleScene(meta.rootB, 0.5)
    expect(bNarrow.aspect).toBeCloseTo(1.0, 1)
  })

  test('reduced motion static pose, play opt-in, replay, preference change', async ({
    page,
  }) => {
    const project = makeProject({
      actors: [
        makeActor({
          recording: makeRecording(12),
          clip: {
            start: 0.3,
            end: 0.8,
            hideBeforeStart: true,
            hideAfterEnd: true,
          },
          appearance: { color: '#0369a1' },
        }),
      ],
      playback: { durationMs: 1500, loop: true, loopMode: 'repeat' },
    })
    const html = buildHtmlDemoFromProject(project)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadHtmlDocument(page, html)

    const scene = page.getByTestId('demo-scene')
    const actor = page.getByTestId('demo-actor')
    const button = page.getByTestId('demo-replay')

    await expect(button).toHaveText('Play animation')
    await expect(scene).not.toHaveClass(new RegExp(MS_MOTION_OK_CLASS))

    // Static pose visible despite hide-before (t≈0 would hide while animating).
    await expect(actor).toBeVisible()
    const staticVis = await actor.evaluate((el) => getComputedStyle(el).visibility)
    expect(staticVis).toBe('visible')
    const staticAnim = await actor.evaluate((el) => getComputedStyle(el).animationName)
    expect(staticAnim === 'none' || staticAnim === '').toBeTruthy()

    await button.click()
    await expect(scene).toHaveClass(new RegExp(MS_MOTION_OK_CLASS))
    await expect(button).toHaveText('Replay')

    const playingAnim = await actor.evaluate((el) => getComputedStyle(el).animationName)
    expect(playingAnim).not.toBe('none')
    expect(playingAnim.length).toBeGreaterThan(0)

    // Replay while opted in restarts motion.
    await button.click()
    await expect(scene).toHaveClass(new RegExp(MS_MOTION_OK_CLASS))

    // Preference cleared → default autoplay, opt-in class removed.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect
      .poll(async () => scene.getAttribute('class'))
      .not.toContain(MS_MOTION_OK_CLASS)
    await expect(button).toHaveText('Replay')

    // Preference returns to reduce without opt-in → static again.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(button).toHaveText('Play animation')
    await expect
      .poll(async () =>
        actor.evaluate((el) => getComputedStyle(el).visibility),
      )
      .toBe('visible')
  })

  test('near-identical geometryEdit paths keep distinct keyframes when embedded together', async ({
    page,
  }) => {
    const samplesA = makeSamples(120)
    const samplesB = samplesA.map((s) => ({ ...s }))
    samplesB[2] = { ...samplesB[2]!, x: samplesB[2]!.x + 0.017 }

    const projectA = makeProject({
      name: 'Path twin A',
      actors: [
        makeActor({
          id: 'path',
          recording: makeRecording(120),
          geometryEdit: makeGeometryEdit(samplesA, 0.2, [0, 30, 60, 119]),
          appearance: { color: '#0f766e', width: 0.18, height: 0.18 },
        }),
      ],
      playback: {
        durationMs: 1600,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const projectB = makeProject({
      name: 'Path twin B',
      actors: [
        makeActor({
          id: 'path',
          recording: makeRecording(120),
          geometryEdit: makeGeometryEdit(samplesB, 0.2, [0, 30, 60, 119]),
          appearance: { color: '#c2410c', width: 0.18, height: 0.18 },
        }),
      ],
      playback: {
        durationMs: 1600,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })

    const idA = fingerprintProjectScene(projectA)
    const idB = fingerprintProjectScene(projectB)
    expect(idA).not.toBe(idB)

    const html = buildExportIsolationPage({
      projectA,
      projectB,
      withReplayControls: true,
    })
    await loadHtmlDocument(page, html)

    const meta = await page.evaluate(() => {
      const w = window as unknown as {
        __msIsolation: {
          rootA: string
          rootB: string
          sceneIdA: string
          sceneIdB: string
        }
      }
      return w.__msIsolation
    })
    expect(meta.sceneIdA).toBe(idA)
    expect(meta.sceneIdB).toBe(idB)
    expect(meta.rootA).not.toBe(meta.rootB)

    const styleA = await page
      .locator('style[data-ms="scene-a"]')
      .evaluate((el) => el.textContent ?? '')
    const styleB = await page
      .locator('style[data-ms="scene-b"]')
      .evaluate((el) => el.textContent ?? '')
    expect(styleA).toContain(`@keyframes ms-${idA}`)
    expect(styleB).toContain(`@keyframes ms-${idB}`)
    expect(styleA).not.toContain(`@keyframes ms-${idB}`)
    expect(styleB).not.toContain(`@keyframes ms-${idA}`)

    const actorA = page.locator(`.${meta.rootA} [class^="ms-actor"]`).first()
    const actorB = page.locator(`.${meta.rootB} [class^="ms-actor"]`).first()
    const nameA = await actorA.evaluate((el) => getComputedStyle(el).animationName)
    const nameB = await actorB.evaluate((el) => getComputedStyle(el).animationName)
    expect(nameA).toContain(idA)
    expect(nameB).toContain(idB)
    expect(nameA).not.toBe(nameB)

    // Replay A must not rewrite B's animation name.
    await page.getByTestId('replay-a').click()
    const nameBAfter = await actorB.evaluate(
      (el) => getComputedStyle(el).animationName,
    )
    expect(nameBAfter).toBe(nameB)
  })

  test('authored embed scenes: containment, scoped replay, responsive aspect', async ({
    page,
  }) => {
    const projectA = buildEmbedMarkProject()
    const projectB = buildEmbedCompanionProject()
    const html = buildExportIsolationPage({
      projectA,
      projectB,
      optionsA: { ...EMBED_SCENE_A_OPTIONS },
      optionsB: { ...EMBED_SCENE_B_OPTIONS },
      withReplayControls: true,
    })
    await loadHtmlDocument(page, html)

    const meta = await page.evaluate(() => {
      const w = window as unknown as {
        __msIsolation: { rootA: string; rootB: string; sceneIdA: string; sceneIdB: string }
      }
      return w.__msIsolation
    })
    expect(meta.rootA).toBe('embed-a-ms-scene-mark-in')
    expect(meta.rootB).toBe('embed-b-ms-scene-pulse')
    expect(meta.sceneIdA).not.toBe(meta.sceneIdB)

    const sceneStyleA = await page
      .locator('style[data-ms="scene-a"]')
      .evaluate((el) => el.textContent ?? '')
    const sceneStyleB = await page
      .locator('style[data-ms="scene-b"]')
      .evaluate((el) => el.textContent ?? '')
    expect(sceneStyleA).toContain(meta.rootA)
    expect(sceneStyleB).toContain(meta.rootB)
    expect(sceneStyleA).not.toContain(meta.rootB)
    expect(sceneStyleB).not.toContain(meta.rootA)

    const headline = page.getByTestId('host-headline')
    const mountA = page.getByTestId('mount-a')
    const stageA = page.locator(`.${meta.rootA} .ms-stage`)
    const headlineBox = await headline.boundingBox()
    const mountBox = await mountA.boundingBox()
    const stageBox = await stageA.boundingBox()
    expect(headlineBox).toBeTruthy()
    expect(mountBox).toBeTruthy()
    expect(stageBox).toBeTruthy()
    // Stage stays inside its mount; mount does not cover the host headline.
    expect(stageBox!.x).toBeGreaterThanOrEqual(mountBox!.x - 1)
    expect(stageBox!.y).toBeGreaterThanOrEqual(mountBox!.y - 1)
    expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(
      mountBox!.x + mountBox!.width + 1,
    )
    expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(
      mountBox!.y + mountBox!.height + 1,
    )
    expect(mountBox!.y).toBeGreaterThan(headlineBox!.y)

    expect(stageBox!.width / stageBox!.height).toBeCloseTo(
      projectA.stageAspect,
      1,
    )

    // Advance B, then replay only A — B's timeline must keep progressing.
    const actorB = page.locator(`.${meta.rootB} [class^="ms-actor"]`).first()
    await actorB.evaluate((el) => {
      for (const anim of el.getAnimations()) {
        const name = (anim as Animation & { animationName?: unknown })
          .animationName
        if (typeof name !== 'string' || name === '' || name === 'none') continue
        anim.pause()
        anim.currentTime = 600
      }
    })
    const timeBefore = await actorB.evaluate((el) => {
      const anim = el.getAnimations().find((a) => {
        const name = (a as Animation & { animationName?: unknown }).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      return anim && typeof anim.currentTime === 'number'
        ? Number(anim.currentTime)
        : -1
    })
    expect(timeBefore).toBeCloseTo(600, 0)

    await page.getByTestId('replay-a').click()
    const timeAfter = await actorB.evaluate((el) => {
      const anim = el.getAnimations().find((a) => {
        const name = (a as Animation & { animationName?: unknown }).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      return anim && typeof anim.currentTime === 'number'
        ? Number(anim.currentTime)
        : -1
    })
    expect(timeAfter).toBeCloseTo(600, 0)

    const actorA = page.locator(`.${meta.rootA} [class^="ms-actor"]`).first()
    const animA = await actorA.evaluate((el) => getComputedStyle(el).animationName)
    expect(animA).not.toBe('none')

    await page.setViewportSize({ width: 390, height: 844 })
    const narrowStage = await stageA.boundingBox()
    expect(narrowStage).toBeTruthy()
    expect(narrowStage!.width).toBeLessThanOrEqual(390)
    expect(narrowStage!.width / narrowStage!.height).toBeCloseTo(
      projectA.stageAspect,
      1,
    )
  })
})
