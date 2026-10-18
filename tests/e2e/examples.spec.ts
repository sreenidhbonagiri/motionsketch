import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  ensureEditor,
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

async function openExamples(page: import('@playwright/test').Page) {
  await page.getByTestId('btn-examples').click()
  await expect(page.getByTestId('examples-gallery')).toBeVisible()
}

async function confirmExampleName(
  page: import('@playwright/test').Page,
  name?: string,
) {
  await expect(page.getByTestId('project-name-dialog')).toBeVisible()
  if (name !== undefined) {
    await page.getByTestId('project-name-input').fill(name)
  }
  await page.getByTestId('btn-confirm-project-name').click()
}

test.describe('starter examples', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('empty hint, preview isolation, load, export, and reload', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('examples-empty-hint')).toBeVisible()
    await page.getByTestId('btn-dismiss-examples-hint').click()
    await expect(page.getByTestId('examples-empty-hint')).toHaveCount(0)

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

    const storageDuring = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(storageDuring).toBe(storageBefore)
    const actorDuring = await page.getByTestId('actor').boundingBox()
    expect(actorDuring).toBeTruthy()
    expect(Math.abs(actorDuring!.x - actorBefore!.x)).toBeLessThan(2)

    await page.getByTestId('btn-use-logo-entrance').click()
    await confirmExampleName(page, 'My logo')
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toContainText('My logo')
    await expect(page.getByTestId('action-live-region')).toContainText(
      /Logo entrance/i,
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()

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
    expect(html).toContain('<title>My logo</title>')
    expect(html).toContain('@keyframes')

    await page.reload()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.getByTestId('btn-rename-project')).toContainText('My logo')
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
  })

  test('confirm replace; cancel name leaves project untouched', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    const cssBefore = await readExportedCss(page)

    page.once('dialog', (dialog) => {
      void dialog.dismiss()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    await expect(page.getByTestId('examples-gallery')).toBeVisible()
    await page.getByTestId('btn-close-examples').click()

    const cssAfterCancel = await readExportedCss(page)
    expect(cssAfterCancel).toBe(cssBefore)

    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    // Cancel naming after confirm — must not replace.
    await expect(page.getByTestId('project-name-dialog')).toBeVisible()
    await page.getByTestId('btn-project-name-cancel').click()
    await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
    await page.getByTestId('btn-close-examples').click()
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    const cssAfterNameCancel = await readExportedCss(page)
    expect(cssAfterNameCancel).toBe(cssBefore)

    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    await confirmExampleName(page)
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    await expect(page.getByTestId('action-live-region')).toContainText(/Orbit/i)
    await expect(page.locator('[data-testid^="actor-list-item-"]')).toHaveCount(
      2,
    )
  })

  test('follow-the-leader loads three actors; second load is a fresh copy', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await openExamples(page)
    await page.getByTestId('btn-use-follow-the-leader').click()
    await confirmExampleName(page, 'Leaders')
    await expect(page.locator('[data-testid^="actor-list-item-"]')).toHaveCount(
      3,
    )

    await page.getByTestId('actor-name-input').fill('Changed')
    await page.getByTestId('actor-name-input').press('Enter')
    await expect(page.getByTestId('actor-name-input')).toHaveValue('Changed')

    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await openExamples(page)
    await page.getByTestId('btn-use-follow-the-leader').click()
    await confirmExampleName(page, 'Leaders again')
    await expect(page.getByTestId('actor-name-input')).not.toHaveValue(
      'Changed',
    )
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Leaders again',
    )
  })

  test('gallery is keyboard accessible', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
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
    await ensureEditor(page)
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
