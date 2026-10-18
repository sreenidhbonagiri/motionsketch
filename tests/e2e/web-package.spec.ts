import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import {
  clickRecord,
  dragActor,
  ensureEditor,
  openPanel,
  recordSimplePath,
  respondToConfirm,
  selectActorByIndex,
} from './helpers'

async function makePngBytes(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
  color: string,
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ width: w, height: h, color: c }) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, w, h)
      return canvas.toDataURL('image/png')
    },
    { width, height, color },
  )
  return Buffer.from(dataUrl.split(',')[1]!, 'base64')
}

function extractZipToDir(zipPath: string): string {
  const bytes = new Uint8Array(readFileSync(zipPath))
  const files = unzipSync(bytes)
  const root = mkdtempSync(join(tmpdir(), 'ms-web-pkg-'))
  for (const [name, data] of Object.entries(files)) {
    const target = join(root, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
  }
  return root
}

/** Pull the scene root + stage block from a packaged index.html (depth-aware). */
function extractDemoSceneMarkup(html: string): string {
  const marker = 'data-testid="demo-scene"'
  const markerAt = html.indexOf(marker)
  expect(markerAt).toBeGreaterThan(-1)
  const start = html.lastIndexOf('<div', markerAt)
  expect(start).toBeGreaterThan(-1)
  let i = start
  let depth = 0
  while (i < html.length) {
    if (html.startsWith('<div', i)) {
      depth += 1
      i = html.indexOf('>', i) + 1
      continue
    }
    if (html.startsWith('</div>', i)) {
      depth -= 1
      i += '</div>'.length
      if (depth === 0) return html.slice(start, i)
      continue
    }
    i += 1
  }
  throw new Error('Could not extract demo scene markup')
}

test.describe('web package export', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('ZIP deduplicates shared image assets', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page, 'Web pack')
    await recordSimplePath(page)

    // Actor 0 stays a shape; actor 1 and 2 share one PNG; actor 3 is SVG.
    await page.getByTestId('btn-add-actor').click()
    await page.getByTestId('btn-add-actor').click()
    await page.getByTestId('btn-add-actor').click()

    const png = await makePngBytes(page, 48, 32, '#0f766e')
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#c2410c"/></svg>`,
      'utf8',
    )

    await selectActorByIndex(page, 1)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'shared.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')

    await selectActorByIndex(page, 2)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'shared-copy.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')

    await selectActorByIndex(page, 3)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'mark.svg',
      mimeType: 'image/svg+xml',
      buffer: svg,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')

    // Record short takes on the image actors so export includes them.
    for (const index of [1, 2, 3]) {
      await selectActorByIndex(page, index)
      await clickRecord(page)
      await dragActor(
        page,
        { x: 20 + index * 4, y: -10 },
        { x: 80 + index * 10, y: 30 },
      )
      await expect(page.getByTestId('btn-play')).toBeEnabled()
    }

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-web-package').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/web-pack-web-.*\.zip/)
    await expect(page.getByTestId('export-action-status')).toHaveText(
      'Web package download started.',
    )
    await expect(page.getByTestId('btn-download-web-package')).toBeEnabled()
    await expect(page.getByTestId('btn-download-web-package')).toHaveAttribute(
      'aria-busy',
      'false',
    )

    const zipPath = await download.path()
    expect(zipPath).toBeTruthy()
    const dir = extractZipToDir(zipPath!)

    const html = readFileSync(join(dir, 'index.html'), 'utf8')
    const css = readFileSync(join(dir, 'animation.css'), 'utf8')
    const readme = readFileSync(join(dir, 'README.txt'), 'utf8')
    expect(html).toContain('href="animation.css"')
    expect(html).toContain('src="assets/asset-01.png"')
    expect(html).toContain('src="assets/asset-02.svg"')
    expect(html.match(/src="assets\/asset-01\.png"/g)?.length).toBe(2)
    expect(html).not.toContain('data:image/')
    expect(html).not.toMatch(/https?:\/\//i)
    expect(css).toContain('@keyframes')
    expect(readme).toContain('assets/asset-01.png')
    expect(readme).toContain('MotionSketchTrigger.init')
    expect(readme).toContain('ms-trigger.js')

    const unzipped = unzipSync(new Uint8Array(readFileSync(zipPath!)))
    const assetNames = Object.keys(unzipped).filter((k) =>
      k.startsWith('assets/'),
    )
    expect(assetNames.sort()).toEqual([
      'assets/asset-01.png',
      'assets/asset-02.svg',
    ])
  })

  test('packaged preview plays offline without network', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page, 'Offline pack')
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    const png = await makePngBytes(page, 32, 24, '#0f766e')
    await selectActorByIndex(page, 1)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'one.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')
    await page.getByTestId('btn-close-appearance').click()
    await clickRecord(page)
    await dragActor(page, { x: 20, y: -10 }, { x: 90, y: 25 })

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-web-package').click()
    const zipPath = await (await downloadPromise).path()
    expect(zipPath).toBeTruthy()
    const dir = extractZipToDir(zipPath!)

    const requests: string[] = []
    page.on('request', (req) => requests.push(req.url()))

    await page.goto(pathToFileURL(join(dir, 'index.html')).href)
    await expect(page.getByTestId('demo-stage')).toBeVisible()
    await expect(page.getByTestId('demo-actor')).toBeVisible()
    await expect(page.getByTestId('demo-replay')).toBeVisible()

    const pngImg = page.locator('img[src="assets/asset-01.png"]').first()
    await expect(pngImg).toBeVisible()
    await expect
      .poll(async () =>
        pngImg.evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBeGreaterThan(0)

    const actor = page.getByTestId('demo-actor')
    const animBefore = await actor.evaluate((el) =>
      getComputedStyle(el).animationName,
    )
    expect(animBefore).not.toBe('none')

    await page.getByTestId('demo-replay').click()
    const animAfter = await actor.evaluate((el) =>
      getComputedStyle(el).animationName,
    )
    expect(animAfter).not.toBe('none')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByTestId('demo-replay')).toHaveText('Play animation')
    await page.getByTestId('demo-replay').click()
    await expect(page.getByTestId('demo-replay')).toHaveText('Replay')
    const root = page.getByTestId('demo-scene')
    await expect(root).toHaveClass(/ms-motion-ok/)

    const external = requests.filter(
      (u) => /^https?:/i.test(u) && !u.startsWith('file:'),
    )
    expect(external).toEqual([])
  })

  test('opening packaged project.json restores image actors', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Web pack')
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    const png = await makePngBytes(page, 32, 24, '#0f766e')
    await selectActorByIndex(page, 1)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'one.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')
    await page.getByTestId('btn-close-appearance').click()
    await clickRecord(page)
    await dragActor(page, { x: 20, y: -10 }, { x: 90, y: 25 })

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-web-package').click()
    const zipPath = await (await downloadPromise).path()
    expect(zipPath).toBeTruthy()
    const dir = extractZipToDir(zipPath!)
    const projectJson = readFileSync(join(dir, 'project.json'), 'utf8')

    await page.goto('/')
    await ensureEditor(page)
    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(projectJson, 'utf8'),
    })
    await respondToConfirm(page, {
      dialogTestId: 'open-project-confirm',
      confirmTestId: 'btn-open-project-confirm',
      cancelTestId: 'btn-open-project-cancel',
    })
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Web pack')
    const items = page.locator('[data-testid^="actor-list-item-"]')
    await expect(items).toHaveCount(2)
    await selectActorByIndex(page, 1)
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
  })

  test('two packaged scenes stay isolated in one host page', async ({
    page,
  }) => {
    // Build package A
    await page.goto('/')
    await ensureEditor(page, 'Scene A')
    await recordSimplePath(page)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color').fill('#0f766e')
    await openPanel(page, 'export')
    const dlA = page.waitForEvent('download')
    await page.getByTestId('btn-download-web-package').click()
    const zipA = await (await dlA).path()
    expect(zipA).toBeTruthy()
    const dirA = extractZipToDir(zipA!)

    // Build package B (different motion / color → different scene id)
    await page.goto('/')
    await ensureEditor(page, 'Scene B')
    await clickRecord(page)
    await dragActor(page, { x: 10, y: 10 }, { x: 200, y: 120 })
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color').fill('#c2410c')
    await page.getByTestId('btn-close-appearance').click()
    await openPanel(page, 'export')
    const dlB = page.waitForEvent('download')
    await page.getByTestId('btn-download-web-package').click()
    const zipB = await (await dlB).path()
    expect(zipB).toBeTruthy()
    const dirB = extractZipToDir(zipB!)

    const host = mkdtempSync(join(tmpdir(), 'ms-host-'))
    const cssA = readFileSync(join(dirA, 'animation.css'), 'utf8')
    const cssB = readFileSync(join(dirB, 'animation.css'), 'utf8')
    const htmlA = readFileSync(join(dirA, 'index.html'), 'utf8')
    const htmlB = readFileSync(join(dirB, 'index.html'), 'utf8')
    const sceneA = extractDemoSceneMarkup(htmlA)
    const sceneB = extractDemoSceneMarkup(htmlB)

    writeFileSync(join(host, 'a.css'), cssA)
    writeFileSync(join(host, 'b.css'), cssB)
    writeFileSync(
      join(host, 'host.html'),
      `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="a.css">
<link rel="stylesheet" href="b.css">
<style>
  body { font-family: system-ui; padding: 1rem; }
  .row { display: flex; gap: 1rem; }
  .cell { width: 320px; }
  .cell .ms-stage { width: 100%; aspect-ratio: 16 / 10; }
</style></head><body>
<div class="row">
  <div class="cell" data-testid="host-a">${sceneA}</div>
  <div class="cell" data-testid="host-b">${sceneB}</div>
</div>
</body></html>`,
    )

    await page.goto(pathToFileURL(join(host, 'host.html')).href)
    const rootA = page.getByTestId('host-a').getByTestId('demo-scene')
    const rootB = page.getByTestId('host-b').getByTestId('demo-scene')
    await expect(rootA).toBeVisible()
    await expect(rootB).toBeVisible()
    await expect(page.getByTestId('demo-scene')).toHaveCount(2)
    const idA = await rootA.getAttribute('data-ms-scene')
    const idB = await rootB.getAttribute('data-ms-scene')
    expect(idA).toBeTruthy()
    expect(idB).toBeTruthy()
    expect(idA).not.toBe(idB)

    const colorA = await rootA
      .locator('[class^="ms-actor"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    const colorB = await rootB
      .locator('[class^="ms-actor"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(colorA).not.toBe(colorB)
  })
})
