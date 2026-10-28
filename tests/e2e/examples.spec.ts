import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  ensureActorListExpanded,
  ensureEditor,
  openPanel,
  readExportedCss,
  recordSimplePath,
  respondToConfirm,
  expandExportOtherWays,
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
    await ensureEditor(page)
    await expect(page.getByTestId('first-use-headline')).toBeVisible()
    await page.getByTestId('btn-dismiss-examples-hint').click()
    await expect(page.getByTestId('first-use-headline')).toHaveCount(0)
    await expect(page.getByTestId('stage-empty-hint')).toHaveClass(/sr-only/)

    const storageBefore = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(storageBefore).toBeNull()
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
    expect(storageDuring).toBeNull()
    const actorDuring = await page.getByTestId('actor').boundingBox()
    expect(actorDuring).toBeTruthy()
    expect(Math.abs(actorDuring!.x - actorBefore!.x)).toBeLessThan(2)

    await page.getByTestId('btn-use-logo-entrance').click()
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Logo entrance',
    )
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
    await expandExportOtherWays(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toContain('<title>Logo entrance</title>')
    expect(html).toContain('@keyframes')

    await page.reload()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Logo entrance',
    )
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
  })

  test('confirm replace can be cancelled; accept loads immediately', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    const cssBefore = await readExportedCss(page)

    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    await respondToConfirm(page, {
      accept: false,
      dialogTestId: 'load-example-confirm',
      confirmTestId: 'btn-load-example-confirm',
      cancelTestId: 'btn-load-example-cancel',
    })
    await expect(page.getByTestId('examples-gallery')).toBeVisible()
    await page.getByTestId('btn-close-examples').click()

    const cssAfterCancel = await readExportedCss(page)
    expect(cssAfterCancel).toBe(cssBefore)

    await openExamples(page)
    await page.getByTestId('btn-use-orbit').click()
    await respondToConfirm(page, {
      dialogTestId: 'load-example-confirm',
      confirmTestId: 'btn-load-example-confirm',
      cancelTestId: 'btn-load-example-cancel',
    })
    await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    await expect(page.getByTestId('action-live-region')).toContainText(/Orbit/i)
    await expect(page.getByTestId('btn-rename-project')).toContainText('Orbit')
    await ensureActorListExpanded(page)
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
    await ensureActorListExpanded(page)
    await expect(page.locator('[data-testid^="actor-list-item-"]')).toHaveCount(
      3,
    )
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Follow the leader',
    )

    await page.getByTestId('actor-name-input').fill('Changed')
    await page.getByTestId('actor-name-input').press('Enter')
    await expect(page.getByTestId('actor-name-input')).toHaveValue('Changed')

    await openExamples(page)
    await page.getByTestId('btn-use-follow-the-leader').click()
    await respondToConfirm(page, {
      dialogTestId: 'load-example-confirm',
      confirmTestId: 'btn-load-example-confirm',
      cancelTestId: 'btn-load-example-cancel',
    })
    await expect(page.getByTestId('actor-name-input')).not.toHaveValue(
      'Changed',
    )
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Follow the leader',
    )
  })

  test('paper plane loads with face-along path and exports HTML', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await openExamples(page)
    await expect(page.getByTestId('example-thumb-paper-plane')).toBeVisible()
    await page.getByTestId('btn-use-paper-plane').click()
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Paper plane',
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    // Plane is first in the scene graph — selected on load for Record / Edit.
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
    await expect(page.getByTestId('actor')).toHaveAccessibleName(/Paper plane/i)
    await ensureActorListExpanded(page)
    await expect(page.locator('[data-testid^="actor-list-item-"]')).toHaveCount(
      2,
    )
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('face-along-path-toggle')).toBeChecked()
    await page.keyboard.press('Escape')

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toContain('<title>Paper plane</title>')
    expect(html).toContain('Ship the motion.')
    expect(html).toContain('@keyframes')
    expect(html).toMatch(/data:image\/svg\+xml/)
    const svgMatch = html.match(
      /data:image\/svg\+xml;charset=utf-8,([^"'\s]+)/,
    )
    expect(svgMatch).toBeTruthy()
    const svg = decodeURIComponent(svgMatch![1]!)
    expect(svg).toMatch(/<svg[\s>]/i)
    expect(svg).toMatch(/#f7f4ec/i)
    expect(svg).toMatch(/#9db7d4/i)
    expect(svg).toMatch(/#d97777/i)
    expect(svg).not.toMatch(/fill\s*=\s*["']#fff/i)
    expect(svg).not.toMatch(/fill\s*=\s*["']white/i)
    expect(svg).not.toMatch(/fill\s*=\s*["']#0f766e/i)
    expect(html).toMatch(/background:\s*transparent/)
  })

  test('gallery is keyboard accessible', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    // Target the control directly — page.keyboard after focus() is flaky on WebKit.
    await page.getByTestId('btn-examples').press('Enter')
    await expect(page.getByTestId('examples-gallery')).toBeVisible()
    await expect(page.getByTestId('btn-close-examples')).toBeFocused()

    await page.keyboard.press('Tab')
    // Focus stays inside the dialog (WebKit may not match a bare :focus locator).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const gallery = document.querySelector(
            '[data-testid="examples-gallery"]',
          )
          const active = document.activeElement
          return !!(gallery && active && gallery.contains(active))
        }),
      )
      .toBe(true)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('examples-gallery')).toHaveCount(0)
    await expect(page.getByTestId('btn-examples')).toBeFocused()
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
