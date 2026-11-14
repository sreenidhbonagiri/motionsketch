import { expect, test, type Page } from '@playwright/test'
import {
  applyClipSeconds,
  assertUnclippedClickable,
  clickPolishMotion,
  closeOpenChromePanels,
  dismissTimingDialogIfOpen,
  ensureClipTimesOpen,
  ensureEditor,
  ensureTimingMoreOptionsOpen,
  openPanel,
  recordSimplePath,
} from './helpers'

/**
 * Settled bounds vs overflow ancestors — before any scrollIntoView / click that
 * would programmatically reveal a clipped control.
 */
async function assertSettledInsideClip(
  page: Page,
  controlTestId: string,
  clipTestId: string,
) {
  const result = await page.evaluate(
    ({ controlId, clipId }) => {
      const control = document.querySelector(`[data-testid="${controlId}"]`)
      const clip = document.querySelector(`[data-testid="${clipId}"]`)
      if (!(control instanceof HTMLElement) || !(clip instanceof HTMLElement)) {
        return { ok: false, reason: 'missing' }
      }
      const cr = control.getBoundingClientRect()
      const pr = clip.getBoundingClientRect()
      if (cr.width <= 0 || cr.height <= 0) {
        return { ok: false, reason: 'zero-size' }
      }
      const slack = 1.5
      const inside =
        cr.top >= pr.top - slack &&
        cr.bottom <= pr.bottom + slack &&
        cr.left >= pr.left - slack &&
        cr.right <= pr.right + slack
      return {
        ok: inside,
        reason: inside ? 'ok' : 'clipped',
        control: {
          top: cr.top,
          bottom: cr.bottom,
          left: cr.left,
          right: cr.right,
        },
        clip: {
          top: pr.top,
          bottom: pr.bottom,
          left: pr.left,
          right: pr.right,
        },
      }
    },
    { controlId: controlTestId, clipId: clipTestId },
  )
  expect(result, `${controlTestId} inside ${clipTestId}`).toMatchObject({
    ok: true,
  })
}

async function scrollToolbarToBottom(page: Page) {
  await page.getByTestId('toolbar-slot').evaluate((el) => {
    if (el instanceof HTMLElement) el.scrollTop = el.scrollHeight
  })
}

test.describe('full-ui-review regressions', () => {
  test('desktop 1280×720: Polish Apply reachable via ordinary toolbar scroll', async ({
    page,
  }) => {
    // Viewport resize for density — not a completed browser-zoom check.
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await clickPolishMotion(page)
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    await expect(page.getByTestId('motion-preview-slot')).toBeVisible()
    await expect(page.getByTestId('stage-viewport')).toBeVisible()
    await expect
      .poll(async () => {
        const box = await page.getByTestId('stage-viewport').boundingBox()
        return box?.height ?? 0
      })
      .toBeGreaterThan(120)

    // Before scrolling: Apply may sit below the toolbar clip — that is OK if
    // ordinary overflow-y scrolling can reveal it (overflow-hidden cannot).
    const slot = page.getByTestId('toolbar-slot')
    const overflowY = await slot.evaluate((el) => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll', 'overlay']).toContain(overflowY)

    await scrollToolbarToBottom(page)
    await assertSettledInsideClip(page, 'btn-polish-apply', 'toolbar-slot')
    await assertUnclippedClickable(page, 'btn-polish-apply')
    await page.getByTestId('btn-polish-cancel').click()
    await expect(page.getByTestId('polish-panel')).toHaveCount(0)
  })

  test('phone 390×560: Polish shows stage and Apply after scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await clickPolishMotion(page)
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    // Preview leaves the focused inspector so the stage cell is measurable.
    const stage = await page.getByTestId('stage-viewport').boundingBox()
    expect(stage).toBeTruthy()
    expect(stage!.width).toBeGreaterThan(200)
    expect(stage!.height).toBeGreaterThan(80)

    const overflowY = await page
      .getByTestId('toolbar-slot')
      .evaluate((el) => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll', 'overlay']).toContain(overflowY)
    await scrollToolbarToBottom(page)
    await assertSettledInsideClip(page, 'btn-polish-apply', 'toolbar-slot')
    await page.getByTestId('btn-polish-apply').click({ trial: true })
    await page.getByTestId('btn-polish-cancel').click()
  })

  test('desktop 1280×720: preset Apply/Cancel reachable without dock scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    // Scrub away from 0 so Cancel/Escape can prove playhead restore.
    await page.getByTestId('playback-scrubber').fill('0.35')
    await expect(page.getByTestId('playback-scrubber')).toHaveValue('0.35')
    const elapsedBefore = await page
      .getByTestId('playback-elapsed')
      .textContent()
    await openPanel(page, 'adjust')
    await page.getByTestId('motion-preset-slide-in').click()
    await expect(page.getByTestId('preset-panel')).toBeVisible()
    await expect(page.getByTestId('preset-compare-legend')).toBeVisible()
    // Header actions — no toolbar scroll required.
    await expect
      .poll(async () => {
        return page.getByTestId('toolbar-slot').evaluate((el) =>
          el instanceof HTMLElement ? el.scrollTop : -1,
        )
      })
      .toBe(0)
    await assertSettledInsideClip(page, 'btn-preset-apply', 'toolbar-slot')
    await assertSettledInsideClip(page, 'btn-preset-cancel', 'toolbar-slot')
    await assertUnclippedClickable(page, 'btn-preset-apply')

    const undoBefore = await page.getByTestId('btn-undo-transform').isEnabled()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('preset-panel')).toHaveCount(0)
    await expect(page.getByTestId('playback-scrubber')).toHaveValue('0.35')
    await expect(page.getByTestId('playback-elapsed')).toHaveText(
      elapsedBefore!,
    )
    expect(await page.getByTestId('btn-undo-transform').isEnabled()).toBe(
      undoBefore,
    )
  })

  test('phone 390×560: preset Apply reachable without dock scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('motion-preset-slide-in').click()
    await expect(page.getByTestId('preset-panel')).toBeVisible()
    await expect(page.getByTestId('preset-compare-legend')).toBeVisible()
    await expect
      .poll(async () => {
        return page.getByTestId('toolbar-slot').evaluate((el) =>
          el instanceof HTMLElement ? el.scrollTop : -1,
        )
      })
      .toBe(0)
    await assertSettledInsideClip(page, 'btn-preset-apply', 'toolbar-slot')
    await page.getByTestId('btn-preset-apply').click({ trial: true })
    await page.getByTestId('btn-preset-cancel').click()
    await expect(page.getByTestId('preset-panel')).toHaveCount(0)
  })

  test('Timing visibility Cancel discards without undo; Apply commits', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await ensureClipTimesOpen(page)
    await applyClipSeconds(page, '0.00', '1.20')
    await ensureTimingMoreOptionsOpen(page)

    await page.getByTestId('clip-hide-before').click()
    await expect(page.getByTestId('btn-apply-clip-times')).toBeEnabled()
    // Visibility radios must not bounce focus back to Start after.
    const focusedId = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? null,
    )
    expect(focusedId).not.toBe('clip-start-input')
    expect(focusedId).not.toBe('clip-move-for-input')
    await page.getByTestId('btn-timing-cancel').click()
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()

    await ensureClipTimesOpen(page)
    await ensureTimingMoreOptionsOpen(page)
    await expect(page.getByTestId('clip-hide-before')).not.toBeChecked()
    // Recording is undoable; Cancel must not have added a Timing/clip entry.
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    await page.getByTestId('clip-hide-before').check()
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    await expect(page.getByTestId('btn-dock-more')).toBeFocused()
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    // Top of stack is the visibility Apply — not the recording.
    await page.getByTestId('btn-undo-transform').click()
    await ensureClipTimesOpen(page)
    await ensureTimingMoreOptionsOpen(page)
    await expect(page.getByTestId('clip-hide-before')).not.toBeChecked()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
  })

  test('Start after 1 preserves Move for by extending Duration; wording; focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)

    await ensureClipTimesOpen(page)
    const moveBefore = await page.getByTestId('clip-move-for-input').inputValue()
    expect(Number(moveBefore)).toBeGreaterThan(0.2)

    await page.getByTestId('clip-start-input').fill('1')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue(moveBefore)
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('clip-times-error')).toHaveCount(0)
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    await expect(page.getByTestId('btn-dock-more')).toBeFocused()

    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('1.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue(moveBefore)
    const ends = await page.getByTestId('clip-ends-at').innerText()
    expect(ends).toMatch(
      new RegExp((1 + Number(moveBefore)).toFixed(2).replace('.', '\\.')),
    )

    // One undo restores prior Timing + Duration.
    await page.getByTestId('btn-timing-cancel').click()
    await page.getByTestId('btn-undo-transform').click()
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue(moveBefore)

    // Invalid Apply keeps the dialog open with Start after wording.
    await page.getByTestId('clip-start-input').fill('7.5')
    await page.getByTestId('clip-move-for-input').fill('1')
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('timing-dialog')).toBeVisible()
    await expect(page.getByTestId('clip-times-error')).toContainText(
      /Start after|cannot exceed|not shortened/i,
    )
  })

  test('Export tab switch and reopen clear stale download announcements', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-web-package').click()
    await downloadPromise
    await expect(page.getByTestId('export-download-success')).toBeVisible()
    await expect(page.getByTestId('action-live-region')).toContainText(
      /Website package download started/i,
    )

    await page.getByTestId('btn-export-path-react').click()
    await expect(page.getByTestId('export-download-success')).toHaveCount(0)
    await expect(page.getByTestId('export-react-download-success')).toHaveCount(
      0,
    )
    await expect(page.getByTestId('action-live-region')).not.toContainText(
      /download started/i,
    )

    await page.getByTestId('btn-close-export').click()
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-download-success')).toHaveCount(0)
    await expect(page.getByTestId('action-live-region')).not.toContainText(
      /download started/i,
    )
  })

  test('Fit stage label is not text-clipped; Export clears the camera bar on desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const probe = await page.evaluate(() => {
      const fit = document.querySelector('[data-testid="btn-fit-stage"]')
      const bar = document.querySelector('[data-testid="workspace-camera-bar"]')
      const panel = document.querySelector('[data-testid="export-panel-root"]')
      if (
        !(fit instanceof HTMLElement) ||
        !(bar instanceof HTMLElement) ||
        !(panel instanceof HTMLElement)
      ) {
        return { ok: false, reason: 'missing' }
      }
      const fr = fit.getBoundingClientRect()
      const br = bar.getBoundingClientRect()
      const pr = panel.getBoundingClientRect()
      const textClipped = fit.scrollWidth > fit.clientWidth + 1
      const overlapsFit =
        fr.right > pr.left &&
        fr.left < pr.right &&
        fr.bottom > pr.top &&
        fr.top < pr.bottom
      const overlapsBar =
        br.right > pr.left &&
        br.left < pr.right &&
        br.bottom > pr.top &&
        br.top < pr.bottom
      return {
        ok: !textClipped && !overlapsFit && !overlapsBar,
        reason: textClipped
          ? 'text-overflow'
          : overlapsFit || overlapsBar
            ? 'covers-camera'
            : 'ok',
        aria: fit.getAttribute('aria-label'),
        text: fit.innerText.replace(/\s+/g, ' ').trim(),
        overlapsPanel: overlapsFit,
      }
    })
    expect(probe, probe.reason).toMatchObject({ ok: true })
    expect(probe.aria).toBe('Fit stage')
    expect(probe.overlapsPanel).toBe(false)
  })

  test('shortcut sheet traps Tab and restores opener focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await closeOpenChromePanels(page)
    await page.getByTestId('btn-help').click()
    await expect(page.getByTestId('help-panel')).toBeVisible()
    const opener = page.getByTestId('btn-open-shortcuts')
    await opener.click()
    await expect(page.getByTestId('shortcut-sheet')).toBeVisible()
    await expect(page.getByTestId('btn-close-shortcuts')).toBeFocused()

    // Tab cycles inside the modal — never to project rename / background.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const outside = await page.evaluate(() => {
        const sheet = document.querySelector('[data-testid="shortcut-sheet"]')
        const active = document.activeElement
        if (!(sheet instanceof HTMLElement) || !(active instanceof Node)) {
          return true
        }
        // Native dialog + our Tab trap keep focus in the sheet subtree.
        return !sheet.contains(active)
      })
      expect(outside, `tab step ${i}`).toBe(false)
    }

    await page.getByTestId('btn-close-shortcuts').click()
    await expect(page.getByTestId('shortcut-sheet')).not.toBeVisible()
    // Opener is still mounted inside Help — focus returns there.
    await expect(opener).toBeFocused()
    // Background rename control must not have become the active element.
    await expect(page.getByTestId('btn-rename-project')).not.toBeFocused()
  })

  test('Undo restores first recording and a replaced take', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)

    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('btn-play')).toBeDisabled()
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()

    await recordSimplePath(page)
    const firstEnd = await page.getByTestId('actor').boundingBox()
    expect(firstEnd).toBeTruthy()

    // Replace the take.
    await page.getByTestId('btn-record').click()
    await page.getByTestId('btn-rerecord-confirm').click()
    await expect(page.getByTestId('btn-stop')).toBeVisible()
    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y - 60, { steps: 10 })
    await page.mouse.move(x + 200, y + 40, { steps: 12 })
    await page.mouse.up()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()

    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    const afterUndo = await page.getByTestId('actor').boundingBox()
    expect(afterUndo).toBeTruthy()
    expect(Math.abs(afterUndo!.x - firstEnd!.x)).toBeLessThan(12)
    expect(Math.abs(afterUndo!.y - firstEnd!.y)).toBeLessThan(12)

    // Keyboard undo of the restored first take.
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.getByTestId('stage').focus()
    await page.keyboard.press(`${mod}+z`)
    await expect(page.getByTestId('btn-play')).toBeDisabled()
  })

  test('undo path edit clears Smoothing lock warning', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    const handle = page.getByTestId('path-handle-0')
    const before = await handle.boundingBox()
    expect(before).toBeTruthy()
    await page.mouse.move(
      before!.x + before!.width / 2,
      before!.y + before!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      before!.x + before!.width / 2 + 40,
      before!.y + before!.height / 2 - 25,
      { steps: 8 },
    )
    await page.mouse.up()

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('smoothing-help')).toContainText(
      /baked into your path edit/i,
    )
    await expect(page.getByTestId('smoothing-slider')).toBeDisabled()

    await page.getByTestId('btn-undo-edit').click()
    await expect(page.getByTestId('smoothing-slider')).toBeEnabled()
    await expect(page.getByTestId('smoothing-help')).toHaveCount(0)
  })
})
