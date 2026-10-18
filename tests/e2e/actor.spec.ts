import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

test.describe('actor customization', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('resizing keeps the actor center; export matches appearance', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('playback-scrubber').fill('0.4')
    const before = await page.getByTestId('actor').boundingBox()
    expect(before).toBeTruthy()
    const beforeCenter = {
      x: before!.x + before!.width / 2,
      y: before!.y + before!.height / 2,
    }

    await openPanel(page, 'appearance')
    await page.getByTestId('actor-size-slider').fill('0.28')
    await expect(page.getByTestId('actor-size-value')).toHaveText(
      '28% of stage',
    )

    const after = await page.getByTestId('actor').boundingBox()
    expect(after).toBeTruthy()
    expect(after!.width).toBeGreaterThan(before!.width)
    const afterCenter = {
      x: after!.x + after!.width / 2,
      y: after!.y + after!.height / 2,
    }
    expect(Math.abs(afterCenter.x - beforeCenter.x)).toBeLessThan(2)
    expect(Math.abs(afterCenter.y - beforeCenter.y)).toBeLessThan(2)

    await page.getByTestId('actor-color').fill('#c2410c')
    await page.getByTestId('actor-radius-slider').fill('1')
    await expect(page.getByTestId('actor-radius-value')).toHaveText('Circle')

    const css = await readExportedCss(page)
    expect(css).toContain('width: 28.00cqmin')
    expect(css).toContain('border-radius: 50.00%')
    expect(css).toContain('background: #c2410c')
  })

  test('actor settings survive reload via autosave', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-size-slider').fill('0.2')
    await page.getByTestId('actor-radius-slider').fill('0')
    await page.getByTestId('actor-color').fill('#0f766e')
    await page.waitForTimeout(400)
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
    )

    await page.reload()
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-size-value')).toHaveText(
      '20% of stage',
    )
    await expect(page.getByTestId('actor-radius-value')).toHaveText('Square')
    await expect(page.getByTestId('actor-color-value')).toHaveText('#0f766e')

    const css = await readExportedCss(page)
    expect(css).toContain('width: 20.00cqmin')
    expect(css).toContain('border-radius: 0.00%')
    expect(css).toContain('background: #0f766e')
  })
})
