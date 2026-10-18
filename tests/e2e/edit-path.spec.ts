import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  readExportedCss,
  recordSimplePath,
} from './helpers'

test.describe('path editing', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('edit mode shows handles, supports drag undo and restore', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await expect(page.getByTestId('btn-done-edit')).toBeVisible()
    await expect(page.getByTestId('edit-mode-hint')).toBeVisible()

    // Play should not start while editing.
    await expect(page.getByTestId('btn-play')).toHaveCount(0)

    const handle = page.locator('[data-testid^="path-handle-"]').nth(2)
    await expect(handle).toBeVisible()
    const before = await handle.boundingBox()
    expect(before).toBeTruthy()

    // Dense handles can overlap; drive the pointer by coordinates instead of hover hit-testing.
    const center = {
      x: before!.x + before!.width / 2,
      y: before!.y + before!.height / 2,
    }
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + 40, center.y - 30, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByTestId('btn-undo-edit')).toBeEnabled()
    const afterDrag = await handle.boundingBox()
    expect(afterDrag).toBeTruthy()
    const moved =
      Math.abs(afterDrag!.x - before!.x) > 2 ||
      Math.abs(afterDrag!.y - before!.y) > 2
    expect(moved).toBeTruthy()

    await page.getByTestId('btn-undo-edit').click()
    const afterUndo = await handle.boundingBox()
    expect(afterUndo).toBeTruthy()
    expect(Math.abs(afterUndo!.x - before!.x)).toBeLessThan(8)
    expect(Math.abs(afterUndo!.y - before!.y)).toBeLessThan(8)

    // Re-edit then restore recorded path.
    const again = await handle.boundingBox()
    expect(again).toBeTruthy()
    await page.mouse.move(
      again!.x + again!.width / 2,
      again!.y + again!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      again!.x + again!.width / 2 + 50,
      again!.y + again!.height / 2 + 20,
      { steps: 6 },
    )
    await page.mouse.up()
    await page.getByTestId('btn-restore-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()

    await page.getByTestId('btn-done-edit').click()
    await expect(page.getByTestId('btn-edit-path')).toBeVisible()
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
    expect(css).toContain('linear')
  })

  test('keyboard can nudge the selected handle', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-edit-path').click()

    const handle = page.locator('[data-testid^="path-handle-"]').nth(3)
    await handle.click()
    const before = await handle.boundingBox()
    expect(before).toBeTruthy()

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const after = await handle.boundingBox()
    expect(after).toBeTruthy()
    expect(after!.x).toBeGreaterThan(before!.x)
  })
})
