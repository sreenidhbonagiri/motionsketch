import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  openCssDialog,
  openPanel,
  recordSimplePath,
  expandExportOtherWays,
} from './helpers'

async function assertFullyInViewport(
  page: import('@playwright/test').Page,
  testId: string,
) {
  const visible = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return false
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    return r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1
  }, testId)
  expect(visible, `${testId} should be fully in the viewport`).toBeTruthy()
}

test.describe('workspace layout', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    test(`desktop ${viewport.width}x${viewport.height}: full-bleed stage + labeled chrome`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      await expect(page.getByTestId('app-shell')).toBeVisible()
      await expect(page.getByTestId('btn-project')).toBeVisible()
      await expect(page.getByTestId('btn-adjust')).toBeVisible()
      await expect(page.getByTestId('btn-appearance')).toBeVisible()
      await expect(page.getByTestId('btn-export')).toBeVisible()
      await expect(page.getByTestId('btn-settings')).toHaveCount(0)

      // Stage fills the viewport (no inset card).
      const stageFill = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="stage"]')
        if (!stage) return null
        const r = stage.getBoundingClientRect()
        return {
          top: r.top,
          left: r.left,
          right: window.innerWidth - r.right,
          bottom: window.innerHeight - r.bottom,
          width: r.width,
          height: r.height,
        }
      })
      expect(stageFill).toBeTruthy()
      expect(Math.abs(stageFill!.top)).toBeLessThan(2)
      expect(Math.abs(stageFill!.left)).toBeLessThan(2)
      expect(Math.abs(stageFill!.right)).toBeLessThan(2)
      expect(Math.abs(stageFill!.bottom)).toBeLessThan(2)
      expect(stageFill!.width).toBeGreaterThan(viewport.width * 0.95)
      expect(stageFill!.height).toBeGreaterThan(viewport.height * 0.95)

      await openPanel(page, 'adjust')
      await page.getByTestId('path-compare-toggle').check()
      await expect(page.getByTestId('path-compare-legend')).toBeVisible()

      await expect(page.getByTestId('playback-dock')).toBeVisible()
      await assertFullyInViewport(page, 'toolbar')
      await assertFullyInViewport(page, 'playback-timeline')

      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('dock-status')).toBeVisible()
      await expect(page.getByTestId('mode-status-label')).toHaveText('Edit points')

      const handle = page.locator('[data-testid^="path-handle-"]').first()
      await handle.click({ force: true })
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')

      await openPanel(page, 'adjust')
      await expect(page.getByTestId('smoothing-help')).toContainText(
        'baked into your path edit',
      )
      await page.getByTestId('btn-done-edit').click()

      const noPageScroll = await page.evaluate(() => {
        const root = document.documentElement
        return root.scrollHeight <= root.clientHeight + 2
      })
      expect(noPageScroll).toBeTruthy()

      await openPanel(page, 'export')
      await expandExportOtherWays(page)
      await page.getByTestId('btn-view-css').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('btn-view-css')).toBeVisible()
      await expect(page.getByTestId('btn-copy-css')).toBeVisible()

      await openCssDialog(page)
      await expect(page.getByTestId('css-output')).toBeVisible()
      const dialogBox = await page.getByTestId('css-dialog').boundingBox()
      expect(dialogBox).toBeTruthy()
      expect(dialogBox!.height).toBeGreaterThan(viewport.height * 0.55)
      expect(dialogBox!.width).toBeGreaterThan(viewport.width * 0.5)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('css-dialog')).toBeHidden()
      await expect(page.getByTestId('btn-view-css')).toBeFocused()
    })
  }

  test('mobile 390x844: labeled menus stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    // Keep the actor list collapsed so bottom chrome stays reachable.
    const listExpanded = await page
      .getByTestId('btn-toggle-actor-list')
      .getAttribute('aria-expanded')
    if (listExpanded === 'true') {
      await page.getByTestId('btn-toggle-actor-list').click()
    }
    await recordSimplePath(page)

    // Sequence mounts only after a recording; collapse it so it cannot cover
    // the Export panel’s scrollable actions (View CSS sits near the bottom).
    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if (await sequenceToggle.isVisible().catch(() => false)) {
      if ((await sequenceToggle.getAttribute('aria-expanded')) === 'true') {
        await sequenceToggle.click()
        await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'false')
      }
    }

    await expect(page.getByTestId('stage')).toBeVisible()
    await expect(page.getByTestId('toolbar')).toBeVisible()
    await assertFullyInViewport(page, 'toolbar')

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const viewCss = page.getByTestId('btn-view-css')
    await expect(viewCss).toBeVisible()
    await viewCss.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await expect(viewCss).toBeInViewport()

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-help')).toBeVisible()

    await openCssDialog(page)
    await expect(page.getByTestId('css-dialog')).toBeVisible()
    await page.getByTestId('btn-close-css-dialog').click()
    await expect(page.getByTestId('css-dialog')).toBeHidden()
  })

  /**
   * Regression: with Sequence expanded, the bottom dock used to paint over the
   * Export panel (header stacking at z-40). View CSS must remain clickable —
   * header rises to z-50 while a chrome panel is open.
   */
  test('mobile 390x844: View CSS opens over expanded Sequence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    const listExpanded = await page
      .getByTestId('btn-toggle-actor-list')
      .getAttribute('aria-expanded')
    if (listExpanded === 'true') {
      await page.getByTestId('btn-toggle-actor-list').click()
    }
    // Keep Export open so the panel stacks above the dock.
    await recordSimplePath(page)
    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    await expect(sequenceToggle).toBeVisible()
    // Toggle sits under the open Export panel; use the element click path so
    // Sequence can expand while Export stays open (the overlap under test).
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.evaluate((el) => {
        ;(el as HTMLButtonElement).click()
      })
    }
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const viewCss = page.getByTestId('btn-view-css')
    await expect(viewCss).toBeVisible()
    await viewCss.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await viewCss.scrollIntoViewIfNeeded()
    await viewCss.click()
    await expect(page.getByTestId('css-dialog')).toBeVisible()
  })
})
