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
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()

    await page.getByTestId('clip-hide-before').check()
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('clip-hide-before')).toBeChecked()
    await dismissTimingDialogIfOpen(page)
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await page.getByTestId('btn-undo-transform').click()
    await ensureClipTimesOpen(page)
    await ensureTimingMoreOptionsOpen(page)
    await expect(page.getByTestId('clip-hide-before')).not.toBeChecked()
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
})
