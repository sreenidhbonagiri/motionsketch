import { expect, test } from '@playwright/test'
import { openCssDialog, recordSimplePath } from './helpers'

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
    test(`desktop ${viewport.width}x${viewport.height}: stage, toolbar, export reachable without page scroll`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await recordSimplePath(page)

      await page.getByTestId('path-compare-toggle').check()
      await expect(page.getByTestId('path-compare-legend')).toBeVisible()

      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('edit-mode-hint')).toBeVisible()

      const handle = page.locator('[data-testid^="path-handle-"]').nth(2)
      const box = await handle.boundingBox()
      expect(box).toBeTruthy()
      await handle.hover()
      await page.mouse.down()
      await page.mouse.move(box!.x + 36, box!.y - 24, { steps: 6 })
      await page.mouse.up()
      await expect(page.getByTestId('smoothing-help')).toContainText(
        'baked into your path edit',
      )

      const noPageScroll = await page.evaluate(() => {
        const root = document.documentElement
        return root.scrollHeight <= root.clientHeight + 2
      })
      expect(noPageScroll).toBeTruthy()

      await assertFullyInViewport(page, 'stage')
      await assertFullyInViewport(page, 'toolbar')

      // Export controls must be reachable via sidebar scroll if needed.
      await page.getByTestId('btn-view-css').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('btn-view-css')).toBeVisible()
      await expect(page.getByTestId('btn-copy-css')).toBeVisible()

      // Toolbar must not overlap the stage.
      const overlap = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="stage"]')
        const toolbar = document.querySelector('[data-testid="toolbar"]')
        if (!stage || !toolbar) return true
        const a = stage.getBoundingClientRect()
        const b = toolbar.getBoundingClientRect()
        return !(
          b.top >= a.bottom - 1 ||
          b.bottom <= a.top + 1 ||
          b.left >= a.right - 1 ||
          b.right <= a.left + 1
        )
      })
      expect(overlap).toBeFalsy()

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

  test('mobile 390x844: stacked layout remains reachable with page scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await recordSimplePath(page)

    await expect(page.getByTestId('stage')).toBeVisible()
    await expect(page.getByTestId('toolbar')).toBeVisible()

    await page.getByTestId('btn-view-css').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('btn-view-css')).toBeVisible()
    await expect(page.getByTestId('duration-help')).toBeVisible()

    await openCssDialog(page)
    await expect(page.getByTestId('css-dialog')).toBeVisible()
    await page.getByTestId('btn-close-css-dialog').click()
    await expect(page.getByTestId('css-dialog')).toBeHidden()
  })
})
