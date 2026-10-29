import { expect, test } from '@playwright/test'
import {
  clickAddActor,
  clickRecord,
  ensureEditor,
  expandExportOtherWays,
  openPanel,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

test.describe('first-use guidance and export wording', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test(
    'Record arms with drag-to-draw guidance for sighted and assistive UI',
    { tag: '@smoke' },
    async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)

    const record = page.getByTestId('btn-record')
    await expect(page.getByTestId('first-use-headline')).toHaveText(
      'Draw motion. Ship it to your website.',
    )
    await expect(page.getByTestId('first-use-next-step')).toHaveText(
      'Click Record, then drag the actor.',
    )
    await expect(record).toHaveAttribute('aria-describedby', 'stage-empty-hint')
    await expect(page.getByTestId('btn-try-example')).toBeVisible()
    await expect(page.getByTestId('dock-editing')).toHaveCount(0)

    await record.click()
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('mode-status-label')).toHaveText('Ready')
    await expect(page.getByTestId('mode-status-instruction')).toHaveText(
      'Drag the actor to draw its path.',
    )
    await expect(page.getByTestId('action-live-region')).toHaveText(
      'Ready — Drag the actor to draw its path.',
    )
    await expect(page.getByTestId('btn-stop')).toHaveAccessibleName(
      'Cancel record',
    )
    await expect(page.getByTestId('btn-stop')).toHaveAttribute(
      'aria-describedby',
      'dock-status',
    )
    await expect(page.getByTestId('actor')).toHaveAccessibleName(
      /Drag to draw its path/i,
    )

    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()
    await expect(page.getByTestId('btn-record')).toBeVisible()
  })

  test('empty stage tip states CSS outcome; Adjust still has SVG import', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)

    await expect(page.getByTestId('first-use-headline')).toHaveText(
      'Draw motion. Ship it to your website.',
    )
    await expect(page.getByTestId('first-use-next-step')).toHaveText(
      'Click Record, then drag the actor.',
    )
    await expect(page.getByTestId('btn-try-example')).toBeVisible()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-empty')).toContainText(
      /Create a path \(Record, Import SVG, or a Motion preset\)/i,
    )
    await expect(page.getByTestId('export-empty')).toContainText(
      /add the animation to your website/i,
    )
    await expect(page.getByTestId('export-empty')).toContainText(
      /Advanced exports/i,
    )
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('svg-path-import-help')).toContainText(
      /Set the path for/i,
    )
    await expect(page.getByTestId('motion-presets')).toBeVisible()
  })

  test('after a path exists, website toast appears and hides in other modes', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()

    await recordSimplePath(page)
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)
    const toast = page.getByTestId('after-path-website-toast')
    await expect(toast).toHaveText(
      /Play to preview, then open Export → Download for your website/,
    )
    await expect(
      page.getByTestId('btn-dismiss-after-path-toast'),
    ).toHaveAccessibleName('Dismiss website export tip')
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    // Stays below header chrome (does not cover Export).
    const toastBox = await toast.boundingBox()
    const exportBtn = page.getByTestId('btn-export')
    const exportBox = await exportBtn.boundingBox()
    expect(toastBox).toBeTruthy()
    expect(exportBox).toBeTruthy()
    expect(toastBox!.y).toBeGreaterThan(exportBox!.y + exportBox!.height - 4)

    // Hides while armed / recording.
    await clickRecord(page, { replaceExisting: true })
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('after-path-website-toast')).toBeVisible()

    // Hides while editing; returns after Done.
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('btn-done-edit')).toBeVisible()
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
    await page.getByTestId('btn-done-edit').click()
    await expect(page.getByTestId('after-path-website-toast')).toBeVisible()

    // Hides while playing.
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('after-path-website-toast')).toBeVisible()

    await openPanel(page, 'export')
    await expect(page.getByTestId('btn-download-web-package')).toHaveText(
      'Download for your website',
    )
  })

  test('website toast dismissal lasts for this project in the browser session', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await expect(page.getByTestId('after-path-website-toast')).toBeVisible()

    await page.getByTestId('btn-dismiss-after-path-toast').click()
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)

    // Same project + same tab session: stays dismissed across reload.
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
      { timeout: 4000 },
    )
    await page.reload()
    await ensureEditor(page)
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)

    // New project (new actor id): toast can appear again after the first path.
    await openPanel(page, 'project')
    await page.getByTestId('btn-new-project').click()
    await expect(page.getByTestId('new-project-confirm')).toBeVisible()
    await page.getByTestId('btn-new-project-confirm').click()
    await ensureEditor(page)
    await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
    await recordSimplePath(page)
    await expect(page.getByTestId('after-path-website-toast')).toBeVisible()
  })

  test('mobile: website toast stays below header controls', async ({ page }) => {
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
    const toast = page.getByTestId('after-path-website-toast')
    await expect(toast).toBeVisible()
    const toastBox = await toast.boundingBox()
    const exportBox = await page.getByTestId('btn-export').boundingBox()
    expect(toastBox).toBeTruthy()
    expect(exportBox).toBeTruthy()
    expect(toastBox!.y).toBeGreaterThan(exportBox!.y + exportBox!.height - 4)
    // Fully on-screen horizontally.
    expect(toastBox!.x).toBeGreaterThanOrEqual(-1)
    expect(toastBox!.x + toastBox!.width).toBeLessThanOrEqual(390 + 1)
  })

  test('empty hint clears after recording; Export primary is website package', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('first-use-headline')).toHaveText(
      'Draw motion. Ship it to your website.',
    )
    await expect(page.getByTestId('first-use-next-step')).toHaveText(
      'Click Record, then drag the actor.',
    )

    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toBeVisible()
    await expect(page.getByTestId('dock-status')).toContainText(
      /Drag the actor to draw its path/i,
    )
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)

    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('first-use-headline')).toBeVisible()
    await expect(page.getByTestId('first-use-next-step')).toHaveText(
      'Click Record, then drag the actor.',
    )

    await recordSimplePath(page)
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)
    await expect(page.getByTestId('edit-mode-hint')).toHaveCount(0)
    await expect(page.getByTestId('after-path-website-toast')).toContainText(
      /Download for your website/,
    )

    await openPanel(page, 'export')
    await expect(page.getByTestId('export-primary')).toContainText(
      'Add to your website',
    )
    await expect(page.getByTestId('export-website-limits')).toContainText(
      /does not install into WordPress or Webflow/i,
    )
    await expect(page.getByTestId('btn-export-path-html')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('export-guide-html')).toBeVisible()
    await expect(page.getByTestId('export-html-host-example')).toBeVisible()
    await expect(page.getByTestId('btn-download-web-package')).toHaveText(
      'Download for your website',
    )
    const websiteHelp = page.getByTestId('export-web-package-help')
    await expect(websiteHelp).toContainText(
      /ZIP with a working index\.html preview/i,
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

    await page.getByTestId('btn-export-path-react').click()
    await expect(page.getByTestId('export-guide-react')).toBeVisible()
    await expect(page.getByTestId('btn-download-react-package')).toBeVisible()
    await expect(page.getByTestId('export-react-package-help')).toContainText(
      /MotionSketchScene\.tsx/i,
    )
    await page.getByTestId('btn-export-path-html').click()

    await expect(page.getByTestId('export-trigger-select')).toBeVisible()
    await expect(page.getByTestId('btn-preview-trigger')).toBeVisible()
    await expect(page.getByTestId('export-trigger-help')).toContainText(
      'Download CSS works alone for page-load',
    )
    await page.getByTestId('export-trigger-select').selectOption('click')
    await expect(page.getByTestId('export-trigger-help')).toContainText(
      /Download CSS is CSS-only[\s\S]*ms-trigger\.js/,
    )
    await page.getByTestId('export-trigger-select').selectOption('page-load')

    const otherWays = page.getByTestId('export-other-ways')
    await expect(otherWays).toBeVisible()
    await expect(page.getByTestId('export-other-ways-summary')).toHaveText(
      'Advanced exports',
    )
    await expect
      .poll(() => otherWays.evaluate((el) => (el as HTMLDetailsElement).open))
      .toBe(false)
    await expect(page.getByTestId('btn-download-css')).toBeHidden()
    await expect(page.getByTestId('btn-download-html-demo')).toBeHidden()
    await expect(page.getByTestId('export-own-element')).toBeHidden()
    await expect(page.getByTestId('btn-export-download-project')).toBeHidden()

    // Visual order: Add to your website → playback trigger → Advanced exports.
    const primaryBox = await page.getByTestId('export-primary').boundingBox()
    const triggerBox = await page.getByTestId('export-trigger-select').boundingBox()
    const otherBox = await otherWays.boundingBox()
    expect(primaryBox).toBeTruthy()
    expect(triggerBox).toBeTruthy()
    expect(otherBox).toBeTruthy()
    expect(primaryBox!.y).toBeLessThan(triggerBox!.y)
    expect(triggerBox!.y).toBeLessThan(otherBox!.y)
  })

  test('Advanced exports expands to CSS, own-element, and project file', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'export')

    await expect(page.getByTestId('btn-export-path-html')).toBeVisible()
    await expect(page.getByTestId('btn-export-path-react')).toBeVisible()
    await expect(page.getByTestId('btn-export-path-files')).toBeVisible()

    await expandExportOtherWays(page)
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
    const cssBox = await page.getByTestId('btn-download-css').boundingBox()
    const htmlBox = await page.getByTestId('btn-download-html-demo').boundingBox()
    const ownBox = await page.getByTestId('export-own-element').boundingBox()
    const projectBox = await page.getByTestId('export-goal-project').boundingBox()
    expect(webBox!.y).toBeLessThan(cssBox!.y)
    expect(cssBox!.y).toBeLessThan(htmlBox!.y)
    expect(htmlBox!.y).toBeLessThan(ownBox!.y)
    expect(ownBox!.y).toBeLessThan(projectBox!.y)
  })

  test(
    'export: keyboard reaches path tabs then download then trigger then Advanced before Close; help is associated',
    { tag: '@smoke' },
    async ({ page, browserName }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'export')

    // Playwright WebKit's Tab emulation skips <button> entirely (minimal repro:
    // button→select→button becomes button→select→body). Assert focusability and
    // DOM order there; full Tab sequence on Chromium/Firefox.
    if (browserName === 'webkit') {
      for (const id of [
        'btn-export-path-html',
        'btn-download-web-package',
        'export-trigger-select',
        'btn-preview-trigger',
        'export-other-ways-summary',
        'btn-close-export',
      ] as const) {
        await page.getByTestId(id).focus()
        await expect(page.getByTestId(id)).toBeFocused()
      }
      await expect(page.getByTestId('btn-download-css')).toBeHidden()
      await expect(page.getByTestId('btn-copy-own-element-css')).toBeHidden()
    } else {
      await expect(page.getByTestId('export-panel-root')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByTestId('btn-export-path-html')).toBeFocused()

      const tabOrder: string[] = ['btn-export-path-html']
      for (let i = 0; i < 50; i++) {
        await page.keyboard.press('Tab')
        const testId = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          return el?.getAttribute('data-testid') ?? el?.tagName ?? ''
        })
        tabOrder.push(testId)
        if (testId === 'btn-close-export') break
      }
      expect(tabOrder.at(-1)).toBe('btn-close-export')
      const htmlPathIdx = tabOrder.indexOf('btn-export-path-html')
      const reactPathIdx = tabOrder.indexOf('btn-export-path-react')
      const filesPathIdx = tabOrder.indexOf('btn-export-path-files')
      const webIdx = tabOrder.indexOf('btn-download-web-package')
      const triggerIdx = tabOrder.indexOf('export-trigger-select')
      const previewIdx = tabOrder.indexOf('btn-preview-trigger')
      const otherIdx = tabOrder.indexOf('export-other-ways-summary')
      const closeIdx = tabOrder.indexOf('btn-close-export')
      expect(htmlPathIdx).toBe(0)
      expect(reactPathIdx).toBeGreaterThan(htmlPathIdx)
      expect(filesPathIdx).toBeGreaterThan(reactPathIdx)
      expect(webIdx).toBeGreaterThan(filesPathIdx)
      expect(triggerIdx).toBeGreaterThan(webIdx)
      expect(previewIdx).toBeGreaterThan(triggerIdx)
      expect(otherIdx).toBeGreaterThan(previewIdx)
      expect(closeIdx).toBeGreaterThan(otherIdx)
      // Collapsed Advanced: CSS / own-element not in the tab order yet.
      // React download lives under the React path tab (not selected).
      expect(tabOrder.indexOf('btn-download-react-package')).toBe(-1)
      expect(tabOrder.indexOf('btn-copy-own-element-css')).toBe(-1)
    }

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
    await clickAddActor(page)
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

  test('narrow viewport: primary and Advanced exports stay reachable by scroll', async ({
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

    // Primary download should be above the fold on narrow viewports.
    await expect(page.getByTestId('btn-download-web-package')).toBeInViewport()
    const primaryBox = await page.getByTestId('export-primary').boundingBox()
    const triggerBox = await page.getByTestId('export-trigger-select').boundingBox()
    const otherBox = await page.getByTestId('export-other-ways').boundingBox()
    expect(primaryBox!.y).toBeLessThan(triggerBox!.y)
    expect(triggerBox!.y).toBeLessThan(otherBox!.y)

    for (const testId of [
      'export-primary',
      'btn-download-web-package',
      'export-trigger-select',
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

  for (const { width, height, label } of [
    { width: 1280, height: 800, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile' },
  ] as const) {
    test(`HTML and React primary downloads visible without scroll (${label} ${width}×${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await ensureEditor(page)
      if (width < 500) {
        const listExpanded = await page
          .getByTestId('btn-toggle-actor-list')
          .getAttribute('aria-expanded')
        if (listExpanded === 'true') {
          await page.getByTestId('btn-toggle-actor-list').click()
        }
      }
      await recordSimplePath(page)
      await openPanel(page, 'export')

      await expect(page.getByTestId('export-website-limits')).toBeInViewport()
      await expect(page.getByTestId('export-website-path-tabs')).toBeInViewport()

      const htmlDownload = page.getByTestId('btn-download-web-package')
      await expect(htmlDownload).toBeInViewport()
      const tabsBox = await page.getByTestId('export-website-path-tabs').boundingBox()
      const htmlBox = await htmlDownload.boundingBox()
      const htmlSteps = page.getByTestId('export-html-steps')
      const htmlStepsBox = await htmlSteps.boundingBox()
      expect(tabsBox!.y).toBeLessThan(htmlBox!.y)
      expect(htmlBox!.y).toBeLessThan(htmlStepsBox!.y)
      // Primary action above the fold — no export-panel scroll required.
      const scrolled = await page
        .getByTestId('export-panel')
        .evaluate((el) => {
          const scroller = el.closest('.overflow-y-auto') as HTMLElement | null
          return scroller?.scrollTop ?? 0
        })
      expect(scrolled).toBe(0)

      await page.getByTestId('btn-export-path-react').click()
      const reactDownload = page.getByTestId('btn-download-react-package')
      await expect(reactDownload).toBeInViewport()
      const reactBox = await reactDownload.boundingBox()
      const reactStepsBox = await page.getByTestId('export-react-steps').boundingBox()
      expect(tabsBox!.y).toBeLessThan(reactBox!.y)
      expect(reactBox!.y).toBeLessThan(reactStepsBox!.y)
      const scrolledReact = await page
        .getByTestId('export-panel')
        .evaluate((el) => {
          const scroller = el.closest('.overflow-y-auto') as HTMLElement | null
          return scroller?.scrollTop ?? 0
        })
      expect(scrolledReact).toBe(0)
    })
  }

  test('storage failure shows download recovery; failed download is not success', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.evaluate(() => {
      const proto = Object.getPrototypeOf(localStorage)
      // @ts-expect-error test stub
      proto.setItem = () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }
    })
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('1800')
    await page.waitForTimeout(400)

    await openPanel(page, 'project')
    await expect(page.getByTestId('save-error-banner')).toBeVisible()
    await expect(page.getByTestId('save-status')).toContainText(/Couldn't save/i)
    await expect(
      page.getByTestId('btn-download-project-save-error'),
    ).toBeVisible()

    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('blob unavailable')
      }
    })
    await page.getByTestId('btn-download-project-save-error').click()
    await expect(page.getByTestId('project-action-status')).toContainText(
      /Could not download/i,
    )
    await expect(page.getByTestId('project-action-status')).not.toHaveText(
      'Project download started.',
    )
    await expect(page.getByTestId('action-live-region')).not.toHaveText(
      'Project download started.',
    )
  })
})
