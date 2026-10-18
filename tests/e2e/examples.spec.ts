import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

async function openExamples(page: import('@playwright/test').Page) {
  await page.getByTestId('btn-examples').click()
  await expect(page.getByTestId('examples-gallery')).toBeVisible()
}

test.describe('starter examples', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('empty hint, preview isolation, load, export, and reload', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('examples-empty-hint')).toBeVisible()
    await page.getByTestId('btn-dismiss-examples-hint').click()
    await expect(page.getByTestId('examples-empty-hint')).toHaveCount(0)

    // Capture storage fingerprint before preview.
    const storageBefore = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    const actorBefore = await page.getByTestId('actor').boundingBox()

    await openExamples(page)
    await page.getByTestId('btn-preview-logo-entrance').click()
    await expect(page.getByTestId('example-preview-stage')).toBeVisible()
    await page.getByTestId('btn-example-preview-play').click()
    await page.waitForTimeout(200)
    await page.getByTestId('btn-example-preview-play').click()

    // Active project + storage unchanged by preview.
    const storageDuring = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(storageDuring).toBe(storageBefore)
    const actorDuring = await page.getByTestId('actor').boundingBox()
    expect(actorDuring).toBeTruthy()
    expect(Math.abs(actorDuring!.x - actorBefore!.x)).toBeLessThan(2)

    await page.getByTestId('btn-use-logo-entrance').click()
    await expect(page.getByTestId('examples-gallery')).toBeHidden()
    await expect(page.getByTestId('action-live-region')).toContainText(
      /Logo entrance/i,
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    // Editable: duration control still works.
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('1600')
    await page.keyboard.press('Escape')

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
    expect(css).toContain('cqw')

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toContain('demo-actor')
    expect(html).toContain('@keyframes')

    // Reload restores the loaded example from autosave.
    await page.reload()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
  })

  test('confirm replace; cancel leaves project untouched', async ({ page }) => {
    await page.goto('/')
    await recordSimplePath(page)
    const cssBefore = await readExportedCss(page)

    page.once('dialog', (dialog) => {
      void dialog.dismiss()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    // Cancel keeps the gallery open and the project unchanged.
    await expect(page.getByTestId('examples-gallery')).toBeVisible()
    await page.getByTestId('btn-close-examples').click()
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)

    const cssAfterCancel = await readExportedCss(page)
    expect(cssAfterCancel).toBe(cssBefore)

    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    await expect(page.getByTestId('action-live-region')).toContainText(/Orbit/i)

    // Orbit has a stationary center + satellite.
    await expect(page.getByTestId('actor-list')).toBeVisible()
    const items = page.locator('[data-testid^="actor-list-item-"]')
    await expect(items).toHaveCount(2)
  })

  test('follow-the-leader loads three actors; second load is a fresh copy', async ({
    page,
  }) => {
    await page.goto('/')
    await openExamples(page)
    await page.getByTestId('btn-use-follow-the-leader').click()
    await expect(page.locator('[data-testid^="actor-list-item-"]')).toHaveCount(
      3,
    )

    // Mutate a name, then reload the same example (fresh copy).
    await page.getByTestId('actor-name-input').fill('Changed')
    await page.getByTestId('actor-name-input').press('Enter')
    await expect(page.getByTestId('actor-name-input')).toHaveValue('Changed')

    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-follow-the-leader').click()
    await expect(page.getByTestId('actor-name-input')).not.toHaveValue(
      'Changed',
    )
  })

  test('gallery is keyboard accessible', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('btn-examples').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('examples-gallery')).toBeVisible()
    await expect(page.getByTestId('btn-close-examples')).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
  })
})

test.describe('starter examples mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('examples button and gallery scroll on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('btn-examples')).toBeVisible()
    await openExamples(page)
    const gallery = page.getByTestId('examples-gallery')
    await expect(gallery).toBeVisible()
    await page.getByTestId('btn-use-orbit').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('btn-use-orbit')).toBeVisible()
    await page.getByTestId('btn-close-examples').click()
    await expect(gallery).toHaveCount(0)
  })
})
