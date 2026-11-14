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

/** Pan by dragging empty canvas inside the stage viewport (not the actor). */
async function panEmptyCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const stage = await page.getByTestId('stage-viewport').boundingBox()
  expect(stage).toBeTruthy()
  // Legacy absolute coords assumed a full-bleed stage; map into the docked cell.
  const map = (p: { x: number; y: number }) => ({
    x: stage!.x + Math.min(stage!.width - 8, Math.max(8, p.x * (stage!.width / 1280))),
    y: stage!.y + Math.min(stage!.height - 8, Math.max(8, p.y * (stage!.height / 800))),
  })
  const a = map(from)
  const b = map(to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
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

  test('H pans temporarily over actors without a Hand toggle', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const beforeSamples = await readActor0Samples(page)
    await closeOpenChromePanels(page)
    // waitForSaved opens Project then closes it; FloatingPanel may briefly
    // return focus to the opener. Take the stage afterward and assert it
    // before H — H on a focused button is intentionally ignored.
    await page.getByTestId('stage').focus()
    await expect(page.getByTestId('stage')).toBeFocused()
    await expect(page.getByTestId('btn-hand-tool')).toHaveCount(0)
    const before = await readCamera(page)

    await expect(page.getByTestId('stage')).toBeFocused()
    await page.keyboard.down('h')
    // Drag starting over the actor — H overrides actor interaction.
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
    await page.keyboard.up('h')

    const afterSamples = await readActor0Samples(page)
    expect(afterSamples!.samples).toEqual(beforeSamples!.samples)

    // Typing in a form control must not arm H-pan-over-actors.
    await page.getByTestId('btn-rename-project').click()
    const name = page.getByTestId('header-project-name-input')
    await expect(name).toBeFocused()
    const typedBefore = await readCamera(page)
    await page.keyboard.down('h')
    // Drag starting on the actor: without H override this must not pan
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
    await page.keyboard.up('h')
    const typedAfter = await readCamera(page)
    // Allow a couple CSS px of camera noise from header reflow when renaming.
    expect(Math.abs(typedAfter.panX - typedBefore.panX)).toBeLessThan(5)
    expect(Math.abs(typedAfter.panY - typedBefore.panY)).toBeLessThan(5)
  })

  test('Space plays and pauses from the stage without panning', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)
    await page.getByTestId('stage').focus()
    await expect(page.getByTestId('stage')).toBeFocused()
    const before = await readCamera(page)
    await page.keyboard.press(' ')
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.keyboard.press(' ')
    await expect(page.getByTestId('btn-play')).toBeVisible()
    const after = await readCamera(page)
    expect(after.panX).toBeCloseTo(before.panX, 0)
    expect(after.panY).toBeCloseTo(before.panY, 0)
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
    await expect(page.getByTestId('dock-status')).toBeAttached()
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

  test('typed zoom percent applies, rejects invalid, Escape/blur, then +/−/Fit', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)

    const zoomBtn = page.getByTestId('zoom-percent')
    await expect(zoomBtn).toHaveText('100%')
    await expect(zoomBtn).toHaveAttribute('aria-labelledby', /.+/)

    await zoomBtn.click()
    const input = page.getByTestId('zoom-percent-input')
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('aria-labelledby', /.+/)
    await input.fill('75')
    await input.press('Enter')
    await expect(page.getByTestId('zoom-percent')).toHaveText('75%')
    let cam = await readCamera(page)
    expect(cam.zoom).toBeCloseTo(0.75, 3)
    expect(cam.zoomLabel).toBe('75%')

    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-percent-input').fill('150%')
    await page.getByTestId('zoom-percent-input').press('Enter')
    await expect(page.getByTestId('zoom-percent')).toHaveText('150%')
    cam = await readCamera(page)
    expect(cam.zoom).toBeCloseTo(1.5, 3)

    // Invalid — Enter keeps editing; camera unchanged.
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-percent-input').fill('999')
    await page.getByTestId('zoom-percent-input').press('Enter')
    await expect(page.getByTestId('zoom-percent-input')).toBeVisible()
    await expect(page.getByTestId('zoom-percent-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    cam = await readCamera(page)
    expect(cam.zoom).toBeCloseTo(1.5, 3)

    // Escape restores live value.
    await page.getByTestId('zoom-percent-input').press('Escape')
    await expect(page.getByTestId('zoom-percent')).toHaveText('150%')
    cam = await readCamera(page)
    expect(cam.zoom).toBeCloseTo(1.5, 3)

    // Blur with valid value applies.
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-percent-input').fill('100')
    await page.getByTestId('btn-zoom-in').click() // blur via other control
    await expect(page.getByTestId('zoom-percent')).toHaveText('125%')
    cam = await readCamera(page)
    // Blur applied 100%, then zoom-in stepped to 125%.
    expect(cam.zoom).toBeCloseTo(1.25, 3)

    // Limits: below min rejected on blur.
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-percent-input').fill('10')
    await page.getByTestId('zoom-percent-input').blur()
    await expect(page.getByTestId('zoom-percent')).toHaveText('125%')
    expect((await readCamera(page)).zoom).toBeCloseTo(1.25, 3)

    await page.getByTestId('btn-fit-stage').click()
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')

    // Pointer mapping after typed zoom still lands on the actor in-frame.
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-percent-input').fill('150')
    await page.getByTestId('zoom-percent-input').press('Enter')
    const mapped = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="stage-frame"]')
      const actor = document.querySelector('[data-testid="actor"]')
      if (!(frame instanceof HTMLElement) || !(actor instanceof HTMLElement)) {
        return null
      }
      const fr = frame.getBoundingClientRect()
      const ar = actor.getBoundingClientRect()
      const cx = ar.left + ar.width / 2
      const cy = ar.top + ar.height / 2
      return {
        nx: (cx - fr.left) / fr.width,
        ny: (cy - fr.top) / fr.height,
      }
    })
    expect(mapped).toBeTruthy()
    expect(mapped!.nx).toBeGreaterThan(0)
    expect(mapped!.nx).toBeLessThan(1)
    expect(mapped!.ny).toBeGreaterThan(0)
    expect(mapped!.ny).toBeLessThan(1)
  })

  test('panels closed: Fit matches default size; repeated Fit stable; pointer maps', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await closeOpenChromePanels(page)
    for (const id of [
      'btn-toggle-elements-pane',
      'btn-toggle-inspector-pane',
    ] as const) {
      const toggle = page.getByTestId(id)
      if (
        (await toggle.isVisible().catch(() => false)) &&
        (await toggle.getAttribute('aria-pressed')) === 'true'
      ) {
        await toggle.click()
      }
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    }

    const readFrame = () =>
      page.evaluate(() => {
        const frame = document.querySelector('[data-testid="stage-frame"]')
        const world = document.querySelector(
          '[data-testid="workspace-world"]',
        ) as HTMLElement | null
        const zoom = document.querySelector('[data-testid="zoom-percent"]')
        if (!(frame instanceof HTMLElement)) return null
        const r = frame.getBoundingClientRect()
        return {
          w: r.width,
          h: r.height,
          top: r.top,
          left: r.left,
          transform: world?.style.transform ?? '',
          zoom: zoom?.textContent?.trim() ?? '',
        }
      })

    const before = await readFrame()
    expect(before).toBeTruthy()
    expect(before!.zoom).toBe('100%')
    const obstructedBefore = await page.evaluate(() => {
      const fr = document
        .querySelector('[data-testid="stage-frame"]')
        ?.getBoundingClientRect()
      const br = document
        .querySelector('[data-testid="workspace-camera-bar"]')
        ?.getBoundingClientRect()
      if (!fr || !br) return null
      return !(
        fr.right <= br.left ||
        fr.left >= br.right ||
        fr.bottom <= br.top ||
        fr.top >= br.bottom
      )
    })

    await page.getByTestId('btn-fit-stage').click()
    await page.waitForTimeout(80)
    const after1 = await readFrame()
    expect(after1).toBeTruthy()
    expect(after1!.zoom).toBe('100%')
    const obstructedAfter = await page.evaluate(() => {
      const fr = document
        .querySelector('[data-testid="stage-frame"]')
        ?.getBoundingClientRect()
      const br = document
        .querySelector('[data-testid="workspace-camera-bar"]')
        ?.getBoundingClientRect()
      if (!fr || !br) return null
      return !(
        fr.right <= br.left ||
        fr.left >= br.right ||
        fr.bottom <= br.top ||
        fr.top >= br.bottom
      )
    })
    expect(obstructedAfter).toBe(false)
    if (!obstructedBefore) {
      // Already clear of the camera bar — Fit must match default layout.
      expect(Math.abs(after1!.w - before!.w)).toBeLessThan(2)
      expect(Math.abs(after1!.h - before!.h)).toBeLessThan(2)
      expect(Math.abs(after1!.top - before!.top)).toBeLessThan(2)
      expect(Math.abs(after1!.left - before!.left)).toBeLessThan(2)
    }

    await page.getByTestId('btn-fit-stage').click()
    await page.waitForTimeout(80)
    const after2 = await readFrame()
    expect(after2).toBeTruthy()
    expect(after2!.zoom).toBe('100%')
    expect(after2!.transform).toBe(after1!.transform)
    expect(Math.abs(after2!.w - after1!.w)).toBeLessThan(2)
    expect(Math.abs(after2!.h - after1!.h)).toBeLessThan(2)

    // Pointer mapping: stage-frame client → normalized stays in range after Fit.
    await recordSimplePath(page)
    const mapped = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="stage-frame"]')
      const actor = document.querySelector('[data-testid="actor"]')
      if (!(frame instanceof HTMLElement) || !(actor instanceof HTMLElement)) {
        return null
      }
      const fr = frame.getBoundingClientRect()
      const ar = actor.getBoundingClientRect()
      const cx = ar.left + ar.width / 2
      const cy = ar.top + ar.height / 2
      return {
        nx: (cx - fr.left) / fr.width,
        ny: (cy - fr.top) / fr.height,
      }
    })
    expect(mapped).toBeTruthy()
    expect(mapped!.nx).toBeGreaterThan(0)
    expect(mapped!.nx).toBeLessThan(1)
    expect(mapped!.ny).toBeGreaterThan(0)
    expect(mapped!.ny).toBeLessThan(1)
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
