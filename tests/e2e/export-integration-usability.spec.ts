import { expect, test, type Page } from '@playwright/test'
import { ensureEditor, openPanel, recordSimplePath } from './helpers'

const FOLDER_LINES = [
  'index.html — optional preview (or use your own page)',
  'animation.css — required for the animation',
  'ms-trigger.js — required for Play, Replay, and reduced motion',
  'README.txt — instructions only, not required to run',
  'project.json — editable project data to reopen in MotionSketch, not required to run',
]

async function installCopyProbe(page: Page) {
  await page.evaluate(() => {
    const nav = navigator as Navigator & {
      clipboard?: { writeText: (text: string) => Promise<void> }
    }
    const clipboard = nav.clipboard
    const write = clipboard?.writeText?.bind(clipboard)
    ;(window as unknown as { __msCopied: string | null }).__msCopied = null
    if (!clipboard) return
    clipboard.writeText = async (text: string) => {
      ;(window as unknown as { __msCopied: string | null }).__msCopied = text
      if (!write) return
      try {
        await write(text)
      } catch {
        // The probe still recorded the payload when permission is denied.
      }
    }
  })
}

async function copiedText(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __msCopied: string | null }).__msCopied,
  )
}

async function integrationAlignedToScrollport(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="export-panel-root"]')
    const scroller = root?.querySelector('.overflow-y-auto')
    const target = document.querySelector('[data-testid="export-html-integration"]')
    if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return false
    }
    const sr = scroller.getBoundingClientRect()
    const tr = target.getBoundingClientRect()
    const steps = document.querySelector('[data-testid="export-html-steps"]')
    if (!(steps instanceof HTMLElement)) return false
    const stepsTop = steps.getBoundingClientRect().top
    return tr.top >= sr.top - 2 && tr.top <= sr.top + 8 && stepsTop < sr.bottom - 8
  })
}

test.describe('export integration usability', () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`scroll, snippets, and format feedback at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.goto('/')
      await ensureEditor(page, 'Export help')
      await recordSimplePath(page)
      await page.setViewportSize(viewport)
      await installCopyProbe(page)
      await openPanel(page, 'export')

      const layout = await page
        .getByTestId('export-html-folder-layout')
        .evaluate((el) => el.textContent ?? '')
      const lines = layout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      expect(lines).toEqual(FOLDER_LINES)
      expect(lines.join('\n')).not.toMatch(/ {2,}/)

      const head = page.getByTestId('export-html-section-head-code')
      const headMetrics = await head.evaluate((el) => {
        const area = el as HTMLTextAreaElement
        return {
          wrap: area.getAttribute('wrap'),
          overflow: area.scrollWidth - area.clientWidth,
          value: area.value,
        }
      })
      expect(headMetrics.wrap).toBe('soft')
      expect(headMetrics.overflow).toBeLessThanOrEqual(1)
      expect(headMetrics.value.split('\n')[0]).toBe(
        '<link rel="stylesheet" href="animation.css">',
      )
      expect(headMetrics.value).toContain('\n')

      const downloadPromise = page.waitForEvent('download')
      await page.getByTestId('btn-download-web-package').click()
      await downloadPromise
      await expect(page.getByTestId('export-download-success-title')).toHaveText(
        'Website package download started.',
      )
      await expect(page.getByTestId('export-download-success-hint')).toHaveText(
        'Unzip the folder and open index.html to preview. Paste the three sections into an existing page.',
      )
      await expect(page.getByTestId('export-react-download-success')).toHaveCount(0)

      const webButton = await page.getByTestId('btn-download-web-package').boundingBox()
      const webNotice = await page.getByTestId('export-download-success').boundingBox()
      expect(webButton).toBeTruthy()
      expect(webNotice).toBeTruthy()
      expect(webNotice!.y).toBeGreaterThan(webButton!.y)
      expect(webNotice!.y - (webButton!.y + webButton!.height)).toBeLessThan(24)

      await page.getByTestId('btn-export-view-integration').click()
      await expect.poll(() => integrationAlignedToScrollport(page)).toBe(true)

      const headSection = page.getByTestId('export-html-section-head')
      await headSection.getByTestId('btn-copy-html-section-head').click()
      await expect(page.getByTestId('btn-copy-html-section-head')).toHaveText('Copied')
      const headLabel = await headSection.locator('p').boundingBox()
      const headCopy = await page.getByTestId('btn-copy-html-section-head').boundingBox()
      expect(headLabel).toBeTruthy()
      expect(headCopy).toBeTruthy()
      expect(Math.abs(headCopy!.y - headLabel!.y)).toBeLessThan(20)
      expect(headCopy!.x).toBeGreaterThan(headLabel!.x)
      expect(await copiedText(page)).toBe(headMetrics.value)

      await page.getByTestId('btn-export-path-react').click()
      await expect(page.getByTestId('export-download-success')).toHaveCount(0)
      await expect(page.getByTestId('export-react-download-success')).toHaveCount(0)
      await expect(page.getByTestId('export-react-steps')).toContainText(
        'top of an existing component file',
      )
      await expect(page.getByTestId('export-react-steps')).toContainText(
        'returned JSX',
      )
      await expect(page.getByTestId('export-react-steps')).toContainText(
        'adjusted relative path',
      )
      await expect(page.getByTestId('export-react-steps')).not.toContainText('main.tsx')

      const example = page.getByTestId('export-react-example-code')
      const exampleValue = await example.inputValue()
      expect(exampleValue).toContain(
        "import { MotionSketchScene } from './motionsketch/MotionSketchScene.tsx'",
      )
      expect(exampleValue).toContain('// At the top of an existing component file directly in src/.')
      expect(exampleValue).toContain("// Inside that component's returned JSX:")
      expect(exampleValue).toContain('// A file deeper than src/ needs an adjusted relative path.')
      expect(exampleValue).toContain('<MotionSketchScene />')
      expect(exampleValue).not.toMatch(/main\.tsx/)
      expect(exampleValue).not.toMatch(/replace/i)
      const exampleMetrics = await example.evaluate((el) => {
        const area = el as HTMLTextAreaElement
        return {
          wrap: area.getAttribute('wrap'),
          overflow: area.scrollWidth - area.clientWidth,
        }
      })
      expect(exampleMetrics.wrap).toBe('soft')
      expect(exampleMetrics.overflow).toBeLessThanOrEqual(1)

      const reactDownload = page.waitForEvent('download')
      await page.getByTestId('btn-download-react-package').click()
      await reactDownload
      await expect(page.getByTestId('export-react-download-success-title')).toHaveText(
        'React package download started.',
      )
      await expect(page.getByTestId('export-react-download-success-hint')).toHaveText(
        'Unzip all files into src/motionsketch/, then render MotionSketchScene inside an existing component.',
      )
      await expect(page.getByTestId('export-download-success')).toHaveCount(0)
      await expect(page.getByTestId('export-react-download-success-hint')).not.toContainText(
        'index.html',
      )

      const reactButton = await page
        .getByTestId('btn-download-react-package')
        .boundingBox()
      const reactNotice = await page
        .getByTestId('export-react-download-success')
        .boundingBox()
      expect(reactButton).toBeTruthy()
      expect(reactNotice).toBeTruthy()
      expect(reactNotice!.y).toBeGreaterThan(reactButton!.y)
      expect(reactNotice!.y - (reactButton!.y + reactButton!.height)).toBeLessThan(24)

      await page.getByTestId('btn-copy-react-example').click()
      await expect(page.getByTestId('btn-copy-react-example')).toHaveText('Copied')
      const exampleSection = page.getByTestId('export-react-example')
      const exampleLabel = await exampleSection.locator('p').boundingBox()
      const exampleCopy = await page.getByTestId('btn-copy-react-example').boundingBox()
      expect(exampleLabel).toBeTruthy()
      expect(exampleCopy).toBeTruthy()
      expect(exampleCopy!.x).toBeGreaterThan(exampleLabel!.x)
      expect(Math.abs(exampleCopy!.y - exampleLabel!.y)).toBeLessThan(20)
      expect(await copiedText(page)).toBe(exampleValue)

      await page.getByTestId('btn-export-path-html').click()
      await expect(page.getByTestId('export-react-download-success')).toHaveCount(0)
      await expect(page.getByTestId('export-download-success-hint')).toContainText(
        'index.html',
      )
      await expect(page.getByTestId('export-download-success-hint')).toContainText(
        'existing page',
      )
    })
  }
})
