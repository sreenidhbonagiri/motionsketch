import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  ensureEditor,
  loadHtmlDocument,
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

async function readDownloadText(download: import('@playwright/test').Download) {
  const path = await download.path()
  expect(path).toBeTruthy()
  return readFileSync(path!, 'utf8')
}

test.describe('downloadable exports', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Download CSS matches View CSS and announces start', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    const viewed = await readExportedCss(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-css').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/untitled-project-.*\.css/)
    const saved = await readDownloadText(download)
    expect(saved).toBe(viewed)
    await expect(page.getByTestId('export-action-status')).toHaveText(
      'CSS download started.',
    )
    await expect(page.getByTestId('action-live-region')).toHaveText(
      'CSS download started.',
    )
  })

  test('HTML demo downloads, opens locally, animates, and replays', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('800')
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('loop-mode-alternate').check()
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color').fill('#0f766e')
    await openPanel(page, 'export')

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/untitled-project-demo-.*\.html/)
    await expect(page.getByTestId('export-action-status')).toHaveText(
      'HTML demo download started.',
    )

    const html = await readDownloadText(download)
    expect(html).toContain('linear infinite alternate')
    expect(html).toContain('background: #0f766e')
    expect(html).not.toMatch(/https?:\/\//i)

    const requests: string[] = []
    page.on('request', (req) => requests.push(req.url()))

    // Open as a local document (no server).
    await loadHtmlDocument(page, html)

    await expect(page.getByTestId('demo-stage')).toBeVisible()
    await expect(page.getByTestId('demo-actor')).toBeVisible()
    await expect(page.getByTestId('demo-replay')).toBeVisible()

    const actor = page.getByTestId('demo-actor')
    const animBefore = await actor.evaluate((el) =>
      getComputedStyle(el).animationName,
    )
    expect(animBefore).toMatch(/ms-[a-f0-9]{8}/)

    // Landscape fit: stage near 16/10 and fully inside viewport.
    await page.setViewportSize({ width: 1280, height: 720 })
    const landscape = await page.getByTestId('demo-stage').boundingBox()
    expect(landscape).toBeTruthy()
    expect(landscape!.width / landscape!.height).toBeCloseTo(1.6, 1)
    expect(landscape!.width).toBeLessThanOrEqual(1280)
    expect(landscape!.height).toBeLessThanOrEqual(720)

    // Portrait fit: still 16/10, not cropped past viewport.
    await page.setViewportSize({ width: 390, height: 844 })
    const portrait = await page.getByTestId('demo-stage').boundingBox()
    expect(portrait).toBeTruthy()
    expect(portrait!.width / portrait!.height).toBeCloseTo(1.6, 1)
    expect(portrait!.x + portrait!.width).toBeLessThanOrEqual(390 + 1)
    expect(portrait!.y + portrait!.height).toBeLessThanOrEqual(844 + 1)

    await page.getByTestId('demo-replay').click()
    const animAfter = await actor.evaluate((el) =>
      getComputedStyle(el).animationName,
    )
    expect(animAfter).toMatch(/ms-[a-f0-9]{8}/)

    const external = requests.filter((u) => /^https?:/i.test(u))
    expect(external).toEqual([])
  })

  test('export download buttons are absent without an animation', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toHaveCount(0)
    await expect(page.getByTestId('btn-download-css')).toHaveCount(0)
    await expect(page.getByTestId('btn-download-html-demo')).toHaveCount(0)
    await expect(page.getByTestId('btn-download-web-package')).toHaveCount(0)
  })
})
