import { expect, test, type Page } from '@playwright/test'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../../src/core/persist/document'
import {
  resolveProjectStageSize,
  toCompositionPoint,
} from '../../src/core/stageResize'
import { makeActor, makeProject, makeRecording } from '../unit/helpers/project'
import {
  clickContinuePath,
  closeOpenChromePanels,
  dragActor,
  ensureEditor,
  loadHtmlDocument,
  loadProjectSnapshot,
  openPanel,
  recordSimplePath,
} from './helpers'

async function waitForSaved(page: Page) {
  await openPanel(page, 'project')
  await expect(page.getByTestId('save-status')).toHaveText(
    'Saved in this browser',
  )
  await closeOpenChromePanels(page)
}

async function readStageMeta(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('motionsketch.project.v1')
    if (!raw) return null
    const doc = JSON.parse(raw) as {
      project: {
        stageAspect: number
        stageWidth: number
        stageHeight: number
        actors: Array<{
          recording: {
            samples: Array<{ t: number; x: number; y: number }>
          } | null
          geometryEdit: {
            samples: Array<{ t: number; x: number; y: number }>
          } | null
          appearance: { width: number; height: number }
          restPosition: { x: number; y: number }
        }>
      }
    }
    const actor = doc.project.actors[0]!
    const samples =
      actor.geometryEdit?.samples ?? actor.recording?.samples ?? []
    return {
      stageAspect: doc.project.stageAspect,
      stageWidth: doc.project.stageWidth,
      stageHeight: doc.project.stageHeight,
      sampleCount: samples.length,
      first: samples[0] ?? null,
      last: samples[samples.length - 1] ?? null,
      appearanceWidth: actor.appearance.width,
      rest: actor.restPosition,
      samples,
    }
  })
}

async function resizeStageUi(
  page: Page,
  width: number,
  height: number,
  anchor: string,
) {
  await openPanel(page, 'project')
  await expect(page.getByTestId('stage-size-section')).toBeVisible()
  await page.getByTestId('stage-size-width').fill(String(width))
  await page.getByTestId('stage-size-height').fill(String(height))
  await page.getByTestId(`stage-size-anchor-${anchor}`).click()
  await page.getByTestId('btn-stage-resize').click()
}

test.describe('stage resize', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('same-aspect 2× expand persists; Continue into new space; HTML export', async ({
    page,
  }, testInfo) => {
    const project = makeProject({
      name: 'Stage expand 2x',
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [makeActor({ recording: makeRecording(10) })],
    })
    await loadProjectSnapshot(page, serializeSnapshot(buildSnapshot(project)))
    await ensureEditor(page, 'Stage expand 2x')

    const before = await readStageMeta(page)
    expect(before!.stageWidth).toBe(1600)
    expect(before!.stageHeight).toBe(1000)
    const beforeComp = toCompositionPoint(before!.first!, {
      width: 1600,
      height: 1000,
    })

    await resizeStageUi(page, 3200, 2000, 'center')
    await expect(page.getByTestId('stage-size-error')).toHaveCount(0)
    await expect(page.getByTestId('stage-size-width')).toHaveValue('3200')
    await expect(page.getByTestId('stage-size-height')).toHaveValue('2000')
    await closeOpenChromePanels(page)
    await waitForSaved(page)

    const after = await readStageMeta(page)
    expect(after!.stageWidth).toBe(3200)
    expect(after!.stageHeight).toBe(2000)
    expect(after!.stageAspect).toBeCloseTo(1.6, 5)
    // Composition placement preserved (center expand offsets by 800,500)
    const afterComp = toCompositionPoint(
      after!.first!,
      { width: 3200, height: 2000 },
      800,
      500,
    )
    expect(afterComp.x).toBeCloseTo(beforeComp.x, 4)
    expect(afterComp.y).toBeCloseTo(beforeComp.y, 4)
    // cqmin size halved so composition artwork size stays
    expect(after!.appearanceWidth).toBeCloseTo(before!.appearanceWidth * 0.5, 5)

    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
    await page.screenshot({
      path: `tmp/stage-resize/after-expand-${testInfo.project.name}.png`,
      fullPage: false,
    })

    // Reload — dimensions and composition placement must survive.
    await page.reload()
    await ensureEditor(page)
    const reopened = await readStageMeta(page)
    expect(reopened!.stageWidth).toBe(3200)
    expect(reopened!.stageHeight).toBe(2000)
    expect(reopened!.first).toEqual(after!.first)

    await page.getByTestId('btn-zoom-in').click()
    const stage = page.getByTestId('stage')
    const box = await stage.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + 40, box!.y + box!.height - 40)
    await page.mouse.down()
    await page.mouse.move(box!.x + 120, box!.y + box!.height - 80, {
      steps: 10,
    })
    await page.mouse.up()

    const beforeContinue = await readStageMeta(page)
    await clickContinuePath(page)
    await dragActor(page, { x: 4, y: 2 }, { x: 100, y: -50 })
    await waitForSaved(page)
    const continued = await readStageMeta(page)
    expect(continued!.sampleCount).toBeGreaterThan(beforeContinue!.sampleCount)

    await page.getByTestId('btn-restart').click()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.getByTestId('btn-pause').click()

    const raw = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1')!,
    )
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.stageWidth).toBe(3200)
    expect(parsed.snapshot.project.stageHeight).toBe(2000)
    const html = buildHtmlDemoFromProject(parsed.snapshot.project)
    expect(html).toMatch(/aspect-ratio/)

    const actor0 = parsed.snapshot.project.actors[0]!
    const first =
      actor0.geometryEdit?.samples[0] ?? actor0.recording!.samples[0]!
    const stageW = parsed.snapshot.project.stageWidth
    const stageH = parsed.snapshot.project.stageHeight
    const editorComp = {
      x: first.x * stageW,
      y: first.y * stageH,
      art: actor0.appearance.width * Math.min(stageW, stageH),
    }

    await loadHtmlDocument(page, html)
    await expect(page.getByTestId('demo-stage')).toBeVisible()
    await expect(page.getByTestId('demo-actor')).toBeVisible()
    const demo = await page.evaluate(
      ({ stageW: w, stageH: h }) => {
        const stageEl = document.querySelector(
          '[data-testid="demo-stage"]',
        ) as HTMLElement
        const actorEl = document.querySelector(
          '[data-testid="demo-actor"]',
        ) as HTMLElement
        // Freeze at the first keyframe so composition matches editor t=0.
        for (const anim of actorEl.getAnimations()) {
          anim.pause()
          anim.currentTime = 0
        }
        const sr = stageEl.getBoundingClientRect()
        const ar = actorEl.getBoundingClientRect()
        const nx = (ar.left + ar.width / 2 - sr.left) / sr.width
        const ny = (ar.top + ar.height / 2 - sr.top) / sr.height
        return {
          aspect: sr.width / sr.height,
          x: nx * w,
          y: ny * h,
          art:
            (Math.max(ar.width, ar.height) / Math.min(sr.width, sr.height)) *
            Math.min(w, h),
        }
      },
      { stageW, stageH },
    )
    expect(demo.aspect).toBeCloseTo(stageW / stageH, 1)
    // Composition units (demo chrome border ≈1u); match position and size, not aspect alone.
    expect(demo.x).toBeCloseTo(editorComp.x, -1)
    expect(demo.y).toBeCloseTo(editorComp.y, -1)
    expect(demo.art).toBeCloseTo(editorComp.art, -1)
  })

  test('taller expand 1600×2000 keeps width; UI shows persisted height', async ({
    page,
  }) => {
    const project = makeProject({
      name: 'Stage taller',
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [makeActor({ recording: makeRecording(8) })],
    })
    await loadProjectSnapshot(page, serializeSnapshot(buildSnapshot(project)))
    await resizeStageUi(page, 1600, 2000, 'top')
    await expect(page.getByTestId('stage-size-error')).toHaveCount(0)
    await expect(page.getByTestId('stage-size-width')).toHaveValue('1600')
    await expect(page.getByTestId('stage-size-height')).toHaveValue('2000')
    await waitForSaved(page)
    const meta = await readStageMeta(page)
    expect(meta!.stageWidth).toBe(1600)
    expect(meta!.stageHeight).toBe(2000)
    expect(resolveProjectStageSize(meta!)).toEqual({
      width: 1600,
      height: 2000,
    })
  })

  test('undo restores stage and path after resize', async ({ page }) => {
    const project = makeProject({
      name: 'Stage resize undo',
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [makeActor({ recording: makeRecording(8) })],
    })
    await loadProjectSnapshot(page, serializeSnapshot(buildSnapshot(project)))
    const before = await readStageMeta(page)

    await resizeStageUi(page, 2400, 1000, 'left')
    await closeOpenChromePanels(page)
    await waitForSaved(page)
    const mid = await readStageMeta(page)
    expect(mid!.stageWidth).toBe(2400)

    await page.getByTestId('btn-undo-transform').click()
    await waitForSaved(page)
    const undone = await readStageMeta(page)
    expect(undone!.stageWidth).toBe(before!.stageWidth)
    expect(undone!.stageHeight).toBe(before!.stageHeight)
    expect(undone!.first).toEqual(before!.first)

    await page.getByTestId('btn-redo-transform').click()
    await waitForSaved(page)
    const redone = await readStageMeta(page)
    expect(redone!.stageWidth).toBe(mid!.stageWidth)
  })

  test('rejects shrink past content with a clear explanation', async ({
    page,
  }) => {
    const project = makeProject({
      name: 'Shrink reject',
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [
        makeActor({
          recording: {
            samples: [
              { t: 0, x: 0.05, y: 0.1 },
              { t: 200, x: 0.95, y: 0.85 },
            ],
            recordedDurationMs: 200,
          },
        }),
      ],
    })
    await loadProjectSnapshot(page, serializeSnapshot(buildSnapshot(project)))
    await resizeStageUi(page, 720, 1000, 'center')
    await expect(page.getByTestId('stage-size-error')).toContainText(
      /cut off existing motion or artwork/i,
    )
    const meta = await readStageMeta(page)
    expect(meta!.stageWidth).toBe(1600)
    expect(meta!.stageHeight).toBe(1000)
  })
})

test.describe('stage resize mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Stage size section is reachable and usable on narrow layout', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)

    await openPanel(page, 'project')
    const section = page.getByTestId('stage-size-section')
    await expect(section).toBeVisible()
    await section.scrollIntoViewIfNeeded()

    const live = await readStageMeta(page)
    await page
      .getByTestId('stage-size-width')
      .fill(String(live!.stageWidth + 400))
    await page.getByTestId('btn-stage-resize').click()
    await expect(page.getByTestId('stage-size-error')).toHaveCount(0)
    await expect(page.getByTestId('stage-size-width')).toHaveValue(
      String(live!.stageWidth + 400),
    )

    await page.screenshot({
      path: `tmp/stage-resize/narrow-${testInfo.project.name}.png`,
      fullPage: false,
    })
  })
})
