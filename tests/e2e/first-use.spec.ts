import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  expandExportOtherWays,
  openPanel,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

test.describe('first-use guidance and export wording', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('empty export points to website package and Other ways', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)

    await openPanel(page, 'export')
    await expect(page.getByTestId('export-empty')).toContainText(
      /Create a path \(Record, Import SVG, or a Motion preset\)/i,
    )
    await expect(page.getByTestId('export-empty')).toContainText(
      /download a website package/i,
    )
    await expect(page.getByTestId('export-empty')).toContainText(
      /Other ways/i,
    )
  })

  test('empty hint clears after recording; Export primary is website package', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()

    await recordSimplePath(page)
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)
    await expect(page.getByTestId('edit-mode-hint')).toHaveCount(0)

    await openPanel(page, 'export')
    await expect(page.getByTestId('export-trigger-select')).toBeVisible()
    await expect(page.getByTestId('btn-preview-trigger')).toBeVisible()

    await expect(page.getByTestId('export-primary')).toContainText(
      'Download for your website',
    )
    await expect(page.getByTestId('btn-download-web-package')).toHaveText(
      'Download for your website',
    )
    const websiteHelp = page.getByTestId('export-web-package-help')
    await expect(websiteHelp).toHaveText(
      'ZIP with a working index.html preview and files to add the animation to your site. Downloading does not publish anything.',
    )
    await expect(page.getByTestId('btn-download-web-package')).toHaveAttribute(
      'aria-describedby',
      /.+/,
    )
    const websiteDescribedBy = await page
      .getByTestId('btn-download-web-package')
      .getAttribute('aria-describedby')
    expect(websiteDescribedBy).toBeTruthy()
    for (const id of websiteDescribedBy!.split(/\s+/)) {
      const text = await page.evaluate(
        (helpId) => document.getElementById(helpId)?.textContent ?? '',
        id,
      )
      expect(text.length, `empty describedby target ${id}`).toBeGreaterThan(0)
    }

    const otherWays = page.getByTestId('export-other-ways')
    await expect(otherWays).toBeVisible()
    await expect(page.getByTestId('export-other-ways-summary')).toHaveText(
      'Other ways',
    )
    await expect
      .poll(() => otherWays.evaluate((el) => (el as HTMLDetailsElement).open))
      .toBe(false)
    await expect(page.getByTestId('btn-download-react-package')).toBeHidden()
    await expect(page.getByTestId('btn-download-css')).toBeHidden()
    await expect(page.getByTestId('btn-download-html-demo')).toBeHidden()
    await expect(page.getByTestId('export-own-element')).toBeHidden()
    await expect(page.getByTestId('btn-export-download-project')).toBeHidden()

    const primaryBox = await page.getByTestId('export-primary').boundingBox()
    const otherBox = await otherWays.boundingBox()
    expect(primaryBox).toBeTruthy()
    expect(otherBox).toBeTruthy()
    expect(primaryBox!.y).toBeLessThan(otherBox!.y)
  })

  test('Other ways expands to React, CSS, own-element, and project file', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'export')

    await expandExportOtherWays(page)
    await expect(page.getByTestId('btn-download-react-package')).toBeVisible()
    await expect(page.getByTestId('export-react-package-help')).toContainText(
      /MotionSketchScene\.tsx/i,
    )
    await expect(page.getByTestId('export-embed-advanced')).toContainText(
      'CSS and offline preview',
    )
    await expect(page.getByTestId('export-html-help')).toContainText(
      /not for embedding in your site/i,
    )
    await expect(page.getByTestId('export-css-help')).toContainText(
      'Image assets are separate',
    )
    await expect(page.getByTestId('export-own-element')).toContainText(
      'Animate your own element',
    )
    await expect(page.getByTestId('export-own-element-setup')).toContainText(
      /complete host page/i,
    )
    await expect(page.getByTestId('export-own-element-setup')).toContainText(
      /save motion-wrapper\.css beside the example component/i,
    )
    await expect(page.getByTestId('export-goal-project')).toContainText(
      'Continue editing elsewhere',
    )
    await expect(page.getByTestId('btn-export-download-project')).toHaveText(
      'Download project file',
    )

    const webBox = await page.getByTestId('btn-download-web-package').boundingBox()
    const reactBox = await page
      .getByTestId('btn-download-react-package')
      .boundingBox()
    const cssBox = await page.getByTestId('btn-download-css').boundingBox()
    const htmlBox = await page.getByTestId('btn-download-html-demo').boundingBox()
    const ownBox = await page.getByTestId('export-own-element').boundingBox()
    const projectBox = await page.getByTestId('export-goal-project').boundingBox()
    expect(webBox!.y).toBeLessThan(reactBox!.y)
    expect(reactBox!.y).toBeLessThan(cssBox!.y)
    expect(cssBox!.y).toBeLessThan(htmlBox!.y)
    expect(htmlBox!.y).toBeLessThan(ownBox!.y)
    expect(ownBox!.y).toBeLessThan(projectBox!.y)
  })

  test('export: keyboard reaches primary then Other ways before Close; help is associated', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'export')

    await expect(page.getByTestId('export-panel-root')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('export-trigger-select')).toBeFocused()

    const tabOrder: string[] = ['export-trigger-select']
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const testId = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return el?.getAttribute('data-testid') ?? el?.tagName ?? ''
      })
      tabOrder.push(testId)
      if (testId === 'btn-close-export') break
    }
    expect(tabOrder.at(-1)).toBe('btn-close-export')
    const webIdx = tabOrder.indexOf('btn-download-web-package')
    const otherIdx = tabOrder.indexOf('export-other-ways-summary')
    const closeIdx = tabOrder.indexOf('btn-close-export')
    expect(webIdx).toBeGreaterThanOrEqual(0)
    expect(otherIdx).toBeGreaterThan(webIdx)
    expect(closeIdx).toBeGreaterThan(otherIdx)
    // Collapsed: secondary actions are not in the tab order yet.
    expect(tabOrder.indexOf('btn-download-react-package')).toBe(-1)
    expect(tabOrder.indexOf('btn-copy-own-element-css')).toBe(-1)

    await expandExportOtherWays(page)
    await expect(page.getByTestId('btn-download-web-package')).toHaveAttribute(
      'aria-describedby',
      /.+/,
    )
    await expect(page.getByTestId('btn-download-css')).toHaveAttribute(
      'aria-describedby',
      /.+/,
    )
    await expect(page.getByTestId('btn-export-download-project')).toHaveAttribute(
      'aria-describedby',
      /.+/,
    )
    const webDescribedBy = await page
      .getByTestId('btn-download-web-package')
      .getAttribute('aria-describedby')
    expect(webDescribedBy).toBeTruthy()
    for (const id of webDescribedBy!.split(/\s+/)) {
      const found = await page.evaluate(
        (helpId) => Boolean(document.getElementById(helpId)),
        id,
      )
      expect(found, `missing describedby target ${id}`).toBe(true)
    }
  })

  test('own-element actions stay discoverable when selected actor has no path', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    await selectActorByIndex(page, 1)
    await openPanel(page, 'export')
    await expandExportOtherWays(page)

    await expect(page.getByTestId('export-own-element-help')).toContainText(
      /has no exportable path/i,
    )
    const wrap = page.getByTestId('btn-copy-own-element-css')
    await expect(wrap).toBeDisabled()
    await expect(wrap).toHaveAttribute('aria-describedby', /.+/)
    const describedBy = await wrap.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const helpText = await page.evaluate(
      (helpId) => document.getElementById(helpId)?.textContent ?? '',
      describedBy!,
    )
    expect(helpText).toMatch(/no exportable path/i)
    await expect(page.getByTestId('btn-copy-own-element-html')).toBeDisabled()
    await expect(page.getByTestId('btn-copy-own-element-react')).toBeDisabled()
  })

  test('narrow viewport: primary and Other ways stay reachable by scroll', async ({
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
    await recordSimplePath(page)
    await openPanel(page, 'export')

    for (const testId of [
      'export-primary',
      'btn-download-web-package',
      'export-other-ways',
    ]) {
      const el = page.getByTestId(testId)
      await el.evaluate((node) => {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await expect(el).toBeInViewport()
    }

    await expandExportOtherWays(page)
    for (const testId of [
      'export-own-element',
      'export-goal-project',
      'btn-export-download-project',
    ]) {
      const el = page.getByTestId(testId)
      await el.evaluate((node) => {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await expect(el).toBeInViewport()
    }
  })

})
