import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  readExportedCss,
  recordSimplePath,
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
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = c
      ctx.globalAlpha = 0.65
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#0f766e'
      ctx.fillRect(w * 0.1, h * 0.1, w * 0.3, h * 0.3)
      return canvas.toDataURL('image/png')
    },
    { width, height, color },
  )
  const b64 = dataUrl.split(',')[1]
  return Buffer.from(b64, 'base64')
}

test.describe('image actors', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('transparent wide PNG preserves aspect, center, and round-trips', async ({
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
    const png = await makePngBytes(page, 400, 100, '#94a3b8')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'wide-logo.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )

    const after = await page.getByTestId('actor').boundingBox()
    expect(after).toBeTruthy()
    expect(after!.width / after!.height).toBeCloseTo(4, 1)
    const afterCenter = {
      x: after!.x + after!.width / 2,
      y: after!.y + after!.height / 2,
    }
    expect(Math.abs(afterCenter.x - beforeCenter.x)).toBeLessThan(2)
    expect(Math.abs(afterCenter.y - beforeCenter.y)).toBeLessThan(2)

    await page.getByTestId('actor-size-slider').fill('0.28')
    const resized = await page.getByTestId('actor').boundingBox()
    expect(resized).toBeTruthy()
    const resizedCenter = {
      x: resized!.x + resized!.width / 2,
      y: resized!.y + resized!.height / 2,
    }
    expect(Math.abs(resizedCenter.x - beforeCenter.x)).toBeLessThan(2)
    expect(Math.abs(resizedCenter.y - beforeCenter.y)).toBeLessThan(2)
    expect(resized!.width).toBeGreaterThan(after!.width)

    // Shape settings survive: switch back keeps color controls.
    await page.getByTestId('actor-kind-shape').check()
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'shape',
    )
    await expect(page.getByTestId('actor-color')).toBeVisible()
    await page.getByTestId('actor-kind-image').check()
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )

    const css = await readExportedCss(page)
    expect(css).toMatch(/does NOT embed the image/i)
    expect(css).toContain('<img class="ms-actor"')

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).toBeTruthy()
    const html = await page.evaluate(async (p) => {
      // Playwright download path is local — read via Node in test instead.
      return p
    }, path)
    void html
    const fs = await import('node:fs')
    const demo = fs.readFileSync(path!, 'utf8')
    expect(demo).toContain('<img class="ms-actor"')
    expect(demo).toContain('data:image/png;base64,')
    expect(demo).not.toMatch(/https?:\/\//i)

    // Project download embeds the asset.
    await openPanel(page, 'project')
    const projDownload = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const proj = await projDownload
    const projPath = await proj.path()
    const projJson = fs.readFileSync(projPath!, 'utf8')
    const snap = JSON.parse(projJson)
    expect(snap.formatVersion).toBe(10)
    const appearance = snap.project.actors[0].appearance
    expect(appearance.kind).toBe('image')
    const assetId = appearance.image.assetId as string | undefined
    if (assetId && snap.assets?.[assetId]) {
      expect(snap.assets[assetId].dataUrl).toContain('data:image/png')
    } else {
      expect(appearance.image.dataUrl).toContain('data:image/png')
    }
  })

  test('tall image and safe SVG upload; unsafe SVG rejected', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await openPanel(page, 'appearance')

    const tall = await makePngBytes(page, 80, 320, '#cbd5e1')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'tall.png',
      mimeType: 'image/png',
      buffer: tall,
    })
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
    const box = await page.getByTestId('actor').boundingBox()
    expect(box).toBeTruthy()
    expect(box!.height / box!.width).toBeCloseTo(4, 1)

    const safeSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#0f766e"/></svg>`,
      'utf8',
    )
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'mark.svg',
      mimeType: 'image/svg+xml',
      buffer: safeSvg,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText('Loaded')
    await expect(page.getByTestId('actor-image-meta')).toContainText('svg')

    const evilSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
      'utf8',
    )
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'evil.svg',
      mimeType: 'image/svg+xml',
      buffer: evilSvg,
    })
    await expect(page.getByTestId('actor-image-status')).toContainText(
      /script|not allowed/i,
    )
    // Previous safe image remains.
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )
  })

  test('storage failure does not show Saved', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.evaluate(() => {
      const proto = Object.getPrototypeOf(localStorage)
      // Force quota-style failures on write.
      // @ts-expect-error test stub
      proto.setItem = () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }
    })
    await openPanel(page, 'appearance')
    const png = await makePngBytes(page, 64, 64, '#64748b')
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'icon.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await page.waitForTimeout(500)
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-error-banner')).toBeVisible()
    await expect(page.getByTestId('save-status')).toContainText(
      /Couldn't save|storage/i,
    )
    await expect(
      page.getByTestId('btn-download-project-save-error'),
    ).toBeVisible()
    await expect(page.getByTestId('header-save-status')).toContainText(
      /Couldn't save|storage/i,
    )
  })
})
