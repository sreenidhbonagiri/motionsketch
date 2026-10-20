import { expect, test } from '@playwright/test'
import { buildGlideFixtureJson } from '../fixtures/glideProject'
import {
  clickGlide,
  ensureEditor,
  loadProjectSnapshot,
  readExportedCss,
} from './helpers'

test.describe('glide timing', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('preview cancel apply undo and export stay consistent', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildGlideFixtureJson())
    await ensureEditor(page, 'Glide fixture')

    await clickGlide(page)
    await expect(page.getByTestId('glide-panel')).toBeVisible()
    await expect(page.getByTestId('glide-help')).toContainText(
      /Softens starts and stops/i,
    )
    await expect(page.getByTestId('glide-strength-help')).toContainText(
      /Transform keyframes/i,
    )
    await expect(page.getByTestId('glide-compare-glide')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Actor motion preview — path overlay alone is not the compare surface.
    await expect(page.getByTestId('actor')).toBeVisible()
    await page.getByTestId('glide-compare-original').click()
    await expect(page.getByTestId('glide-compare-original')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByTestId('glide-compare-glide').click()

    await page.getByTestId('btn-glide-cancel').click()
    await expect(page.getByTestId('glide-panel')).toHaveCount(0)

    await clickGlide(page)
    await expect(page.getByTestId('btn-glide-apply')).toBeEnabled()
    await page.getByTestId('btn-glide-apply').click()
    await expect(page.getByTestId('glide-panel')).toHaveCount(0)

    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('btn-redo-transform')).toBeEnabled()
    await page.getByTestId('btn-redo-transform').click()

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
    expect(css).toMatch(/scale\(\s*1\.25/)
  })

  test('Escape cancels without applying', async ({ page }) => {
    await loadProjectSnapshot(page, buildGlideFixtureJson())
    await ensureEditor(page, 'Glide fixture')
    await clickGlide(page)
    await expect(page.getByTestId('glide-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('glide-panel')).toHaveCount(0)
  })
})
