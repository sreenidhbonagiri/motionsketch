import { expect, test, type Page } from '@playwright/test'
import {
  clickContinuePath,
  closeOpenChromePanels,
  dragActor,
  ensureEditor,
  ensureRefineMotionOpen,
  expandExportOtherWays,
  loadHtmlDocument,
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

async function readCamera(page: Page) {
  return page.evaluate(() => {
    const label = document.querySelector('[data-testid="zoom-percent"]')
    const world = document.querySelector(
      '[data-testid="workspace-world"]',
    ) as HTMLElement | null
    const transform = world?.style.transform ?? ''
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(
      transform,
    )
    return {
      zoomLabel: label?.textContent?.trim() ?? '',
      panX: m ? Number(m[1]) : NaN,
      panY: m ? Number(m[2]) : NaN,
      zoom: m ? Number(m[3]) : NaN,
    }
  })
}

async function readActor0Samples(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('motionsketch.project.v1')
    if (!raw) return null
    const snap = JSON.parse(raw) as {
      project: {
        stageAspect: number
        actors: Array<{
          recording: {
            samples: Array<{ x: number; y: number; t: number }>
          } | null
          geometryEdit: {
            samples: Array<{ x: number; y: number; t: number }>
          } | null
        }>
      }
    }
    const actor = snap.project.actors[0]
    const samples =
      actor?.geometryEdit?.samples ?? actor?.recording?.samples ?? []
    return {
      stageAspect: snap.project.stageAspect,
      sampleCount: samples.length,
      samples: samples.map((s) => ({ x: s.x, y: s.y, t: s.t })),
      end: samples[samples.length - 1] ?? null,
    }
  })
}

async function stageFrameBox(page: Page) {
  const box = await page.getByTestId('stage-frame').boundingBox()
  expect(box).toBeTruthy()
  return box!
}

/** Pan by dragging empty canvas (not the actor). */
async function panEmptyCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test.describe('workspace camera', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Fit stage shows a subtle export bound; pan/zoom leave project data unchanged', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readActor0Samples(page)
    expect(before).toBeTruthy()

    await expect(page.getByTestId('stage-frame')).toBeVisible()
    await expect(page.getByTestId('workspace-camera-bar')).toBeVisible()
    await expect(page.getByTestId('btn-hand-tool')).toHaveCount(0)
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')

    const frame = await stageFrameBox(page)
    const viewport = page.viewportSize()!
    expect(frame.width / frame.height).toBeCloseTo(before!.stageAspect, 1)
    // Frame stays within the viewport (Fit).
    expect(frame.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(frame.height).toBeLessThanOrEqual(viewport.height + 1)

    await page.getByTestId('btn-zoom-in').click()
    await expect(page.getByTestId('zoom-percent')).not.toHaveText('100%')
    const zoomed = await readCamera(page)
    expect(zoomed.zoom).toBeGreaterThan(1)

    // Empty-canvas pan — no Hand toggle.
    await panEmptyCanvas(page, { x: 80, y: 500 }, { x: 160, y: 560 })
    const panned = await readCamera(page)
    expect(
      Math.hypot(panned.panX - zoomed.panX, panned.panY - zoomed.panY),
    ).toBeGreaterThan(5)

    await page.getByTestId('btn-fit-stage').click()
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')

    const after = await readActor0Samples(page)
    expect(after!.sampleCount).toBe(before!.sampleCount)
    expect(after!.stageAspect).toBe(before!.stageAspect)
    expect(after!.samples).toEqual(before!.samples)
  })

  test('empty-canvas pan does not record or change the path; actor drag still records', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const before = await readActor0Samples(page)

    await panEmptyCanvas(page, { x: 60, y: 520 }, { x: 140, y: 580 })
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.getByTestId('btn-stop')).toHaveCount(0)
    const afterPan = await readActor0Samples(page)
    expect(afterPan!.samples).toEqual(before!.samples)

    // Actor drag still has priority and can continue the path.
    await clickContinuePath(page)
    await dragActor(page, { x: 4, y: 2 }, { x: 60, y: -30 })
    await waitForSaved(page)
    const continued = await readActor0Samples(page)
    expect(continued!.sampleCount).toBeGreaterThan(before!.sampleCount)
  })

  test('recording and Continue path work while zoomed and panned', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Camera record')
    await page.getByTestId('btn-zoom-in').click()
    await page.getByTestId('btn-zoom-in').click()
    await panEmptyCanvas(page, { x: 70, y: 480 }, { x: 130, y: 420 })

    await recordSimplePath(page)
    await waitForSaved(page)
    const recorded = await readActor0Samples(page)
    expect(recorded!.sampleCount).toBeGreaterThan(2)
    for (const s of recorded!.samples) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(1)
    }

    await clickContinuePath(page)
    await dragActor(page, { x: 4, y: 2 }, { x: 70, y: -40 })
    await waitForSaved(page)
    const continued = await readActor0Samples(page)
    expect(continued!.sampleCount).toBeGreaterThan(recorded!.sampleCount)
    const end = continued!.end!
    const prev = recorded!.end!
    expect(Math.hypot(end.x - prev.x, end.y - prev.y)).toBeGreaterThan(0.02)
  })

  test('Space pans temporarily over actors without a Hand toggle', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const beforeSamples = await readActor0Samples(page)
    await closeOpenChromePanels(page)
    await page.getByTestId('stage').focus()
    await expect(page.getByTestId('btn-hand-tool')).toHaveCount(0)
    const before = await readCamera(page)

    await page.keyboard.down(' ')
    // Drag starting over the actor — Space overrides actor interaction.
    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 70, box!.y + 50, { steps: 6 })
    await page.mouse.up()
    const mid = await readCamera(page)
    expect(
      Math.hypot(mid.panX - before.panX, mid.panY - before.panY),
    ).toBeGreaterThan(5)
    await page.keyboard.up(' ')

    const afterSamples = await readActor0Samples(page)
    expect(afterSamples!.samples).toEqual(beforeSamples!.samples)

    // Typing in a form control must not arm Space-pan-over-actors.
    await page.getByTestId('btn-rename-project').click()
    const name = page.getByTestId('header-project-name-input')
    await expect(name).toBeFocused()
    const typedBefore = await readCamera(page)
    await page.keyboard.down(' ')
    // Drag starting on the actor: without Space override this must not pan
    // (actor hit wins; empty-canvas pan would still work elsewhere).
    const actorBox = await page.getByTestId('actor').boundingBox()
    expect(actorBox).toBeTruthy()
    await page.mouse.move(
      actorBox!.x + actorBox!.width / 2,
      actorBox!.y + actorBox!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(actorBox!.x + 60, actorBox!.y + 40, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up(' ')
    const typedAfter = await readCamera(page)
    expect(typedAfter.panX).toBeCloseTo(typedBefore.panX, 0)
    expect(typedAfter.panY).toBeCloseTo(typedBefore.panY, 0)
  })

  test('Edit points and snap stay aligned under zoom; handle drag beats pan', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await ensureRefineMotionOpen(page)
    const snap = page.getByTestId('snap-to-grid-toggle')
    if ((await snap.getAttribute('aria-pressed')) !== 'true') {
      await snap.click()
    }
    await page.getByTestId('btn-zoom-in').click()
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('dock-status')).toBeVisible()
    const handle = page.locator('[data-testid^="path-handle-"]').first()
    await expect(handle).toBeVisible()
    const camBefore = await readCamera(page)
    await handle.dragTo(handle, {
      targetPosition: { x: 30, y: 20 },
      force: true,
    })
    const camAfter = await readCamera(page)
    // Handle drag must not pan the camera.
    expect(camAfter.panX).toBeCloseTo(camBefore.panX, 0)
    expect(camAfter.panY).toBeCloseTo(camBefore.panY, 0)
    await page.getByTestId('btn-done-edit').click()
    await waitForSaved(page)
    const samples = await readActor0Samples(page)
    expect(samples!.sampleCount).toBeGreaterThan(2)
    for (const s of samples!.samples) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1)
    }
  })

  test('export HTML aspect ignores the editor camera', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-zoom-in').click()
    await panEmptyCanvas(page, { x: 70, y: 500 }, { x: 150, y: 560 })

    const before = await readActor0Samples(page)
    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const fs = await import('node:fs')
    const html = fs.readFileSync((await download.path())!, 'utf8')
    expect(html).toMatch(/aspect-ratio/)
    expect(html).not.toContain('workspace-world')
    expect(html).not.toContain('btn-hand-tool')

    await loadHtmlDocument(page, html)
    await expect(page.getByTestId('demo-stage')).toBeVisible()
    const aspect = await page.evaluate(() => {
      const stage = document.querySelector(
        '[data-testid="demo-stage"]',
      ) as HTMLElement
      const r = stage.getBoundingClientRect()
      return r.width / r.height
    })
    expect(aspect).toBeCloseTo(before!.stageAspect, 1)
  })

  test('camera bar sits below the measured header without overlap', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await closeOpenChromePanels(page)
    const clear = await page.evaluate(() => {
      const bar = document.querySelector(
        '[data-testid="workspace-camera-bar"]',
      ) as HTMLElement | null
      const header = document.querySelector('header')
      if (!bar || !header) return { ok: false, reason: 'missing' }
      const br = bar.getBoundingClientRect()
      const hr = header.getBoundingClientRect()
      if (br.top < hr.bottom - 1) {
        return { ok: false, reason: 'overlap-header', barTop: br.top, headerBottom: hr.bottom }
      }
      return { ok: true, reason: 'ok' }
    })
    expect(clear).toEqual({ ok: true, reason: 'ok' })
  })
})

test.describe('workspace camera mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  })

  test('390×844: empty pan, camera bar reachability, no Hand toggle', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)

    await expect(page.getByTestId('workspace-camera-bar')).toBeVisible()
    await expect(page.getByTestId('stage-frame')).toBeVisible()
    await expect(page.getByTestId('btn-hand-tool')).toHaveCount(0)
    await expect(page.getByTestId('btn-fit-stage')).toBeVisible()

    const fit = await page.evaluate(() => {
      const ids = [
        'workspace-camera-bar',
        'btn-zoom-in',
        'btn-fit-stage',
        'stage-frame',
        'playback-dock',
      ]
      const clipped: string[] = []
      for (const id of ids) {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!(el instanceof HTMLElement)) {
          clipped.push(`${id}:missing`)
          continue
        }
        const r = el.getBoundingClientRect()
        if (
          r.left < -1 ||
          r.right > window.innerWidth + 1 ||
          r.top < -1 ||
          r.bottom > window.innerHeight + 1
        ) {
          clipped.push(id)
        }
      }
      const bar = document.querySelector(
        '[data-testid="workspace-camera-bar"]',
      ) as HTMLElement
      const header = document.querySelector('header') as HTMLElement
      const br = bar.getBoundingClientRect()
      const hr = header.getBoundingClientRect()
      const root = document.documentElement
      return {
        clipped,
        overflowX: root.scrollWidth > root.clientWidth + 1,
        barBelowHeader: br.top >= hr.bottom - 1,
        zoomBtnHeight: document
          .querySelector('[data-testid="btn-zoom-in"]')
          ?.getBoundingClientRect().height,
      }
    })
    expect(fit.clipped).toEqual([])
    expect(fit.overflowX).toBe(false)
    expect(fit.barBelowHeader).toBe(true)
    expect(fit.zoomBtnHeight).toBeGreaterThanOrEqual(32)

    const before = await readCamera(page)
    // One-finger empty-canvas pan (touch-capable context).
    await page.touchscreen.tap(40, 520)
    await panEmptyCanvas(page, { x: 40, y: 520 }, { x: 110, y: 580 })
    const after = await readCamera(page)
    expect(
      Math.hypot(after.panX - before.panX, after.panY - before.panY),
    ).toBeGreaterThan(5)
  })
})
