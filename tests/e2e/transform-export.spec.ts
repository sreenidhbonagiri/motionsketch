import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  ensureEditor,
  loadHtmlDocument,
  openPanel,
  recordSimplePath,
} from './helpers'

async function makeWidePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(0, 0, 320, 80)
    ctx.fillStyle = '#0f766e'
    ctx.fillRect(20, 10, 80, 60)
    return canvas.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function actorSnapshot(page: Page, testId = 'actor') {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return {
      centerX: box.left + box.width / 2,
      centerY: box.top + box.height / 2,
      width: box.width,
      height: box.height,
      transform: style.transform,
    }
  }, testId)
}

/** Decompose a CSS matrix() / matrix3d() into rotation degrees and uniform scale. */
function decomposeMatrix(transform: string): { rotationDeg: number; scale: number } {
  if (!transform || transform === 'none') {
    return { rotationDeg: 0, scale: 1 }
  }
  const m2 = transform.match(/^matrix\((.+)\)$/)
  if (m2) {
    const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
    const scale = Math.hypot(a, b)
    const rotationDeg = (Math.atan2(b, a) * 180) / Math.PI
    return { rotationDeg, scale }
  }
  const m3 = transform.match(/^matrix3d\((.+)\)$/)
  if (m3) {
    const parts = m3[1].split(',').map((v) => Number(v.trim()))
    const a = parts[0]
    const b = parts[1]
    const scale = Math.hypot(a, b)
    const rotationDeg = (Math.atan2(b, a) * 180) / Math.PI
    return { rotationDeg, scale }
  }
  return { rotationDeg: 0, scale: 1 }
}

/** Smallest absolute degree delta on the circle (180 ≡ -180). */
function angleDeltaDeg(a: number, b: number): number {
  const d = ((((a - b) % 360) + 540) % 360) - 180
  return Math.abs(d)
}

test.describe('transform export browser parity', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('preview matches HTML demo for rectangular image spin+scale', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('1000')
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('loop-mode-alternate').check()

    await openPanel(page, 'appearance')
    const png = await makeWidePng(page)
    await page.getByTestId('actor-image-input').setInputFiles({
      name: 'wide.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'image',
    )

    // Identity at 0, full spin + 2× at 1.
    await page.getByTestId('playback-scrubber').fill('0')
    await page.getByTestId('transform-rotation-input').fill('0')
    await page.getByTestId('transform-scale-slider').fill('1')
    await page.getByTestId('btn-set-transform-keyframe').click()

    await page.getByTestId('playback-scrubber').fill('1')
    await page.getByTestId('transform-rotation-input').fill('360')
    await page.getByTestId('transform-scale-slider').fill('2')
    await page.getByTestId('btn-set-transform-keyframe').click()

    // Sample mid-animation in the editor preview.
    await page.getByTestId('playback-scrubber').fill('0.5')
    const previewMid = await actorSnapshot(page, 'actor')
    const previewMidXf = decomposeMatrix(previewMid.transform)
    expect(previewMid.width / previewMid.height).toBeGreaterThan(2.5)
    expect(previewMidXf.rotationDeg).toBeCloseTo(180, 0)
    expect(previewMidXf.scale).toBeCloseTo(1.5, 1)

    // Path center at mid should stay coherent (finite, on-stage).
    expect(previewMid.centerX).toBeGreaterThan(50)
    expect(previewMid.centerY).toBeGreaterThan(50)

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')

    // Match editor viewport aspect environment for the demo stage.
    await page.setViewportSize({ width: 1280, height: 800 })
    await loadHtmlDocument(page, html)

    const demoActor = page.getByTestId('demo-actor')
    await expect(demoActor).toBeVisible()

    // Drive CSS animation to the same normalized times.
    const samples = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as Animation & { animationName?: unknown }).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (!anim) throw new Error('missing animation')
      anim.pause()

      const read = (tNorm: number) => {
        // One-way duration from animation-duration.
        const dur =
          Number(anim.effect?.getTiming().duration) ||
          parseFloat(getComputedStyle(el).animationDuration) * 1000 ||
          1000
        anim.currentTime = tNorm * dur
        // Force style flush.
        void el.offsetWidth
        const box = el.getBoundingClientRect()
        return {
          centerX: box.left + box.width / 2,
          centerY: box.top + box.height / 2,
          width: box.width,
          height: box.height,
          transform: getComputedStyle(el).transform,
        }
      }

      const mid = read(0.5)
      const end = read(1)
      // Reverse half of alternate: progress 1.5 → visual tNorm 0.5 again.
      const reverseMid = read(1.5)
      return { mid, end, reverseMid, durationMs: parseFloat(getComputedStyle(el).animationDuration) * 1000 }
    })

    const demoMidXf = decomposeMatrix(samples.mid.transform)
    expect(angleDeltaDeg(demoMidXf.rotationDeg, previewMidXf.rotationDeg)).toBeLessThan(1)
    expect(demoMidXf.scale).toBeCloseTo(previewMidXf.scale, 1)
    expect(samples.mid.width / samples.mid.height).toBeGreaterThan(2.5)

    const demoEndXf = decomposeMatrix(samples.end.transform)
    // 360° ≈ 0° in matrix decomposition; scale should be ~2.
    expect(angleDeltaDeg(demoEndXf.rotationDeg, 0)).toBeLessThan(2)
    expect(demoEndXf.scale).toBeCloseTo(2, 1)

    const reverseXf = decomposeMatrix(samples.reverseMid.transform)
    expect(angleDeltaDeg(reverseXf.rotationDeg, 180)).toBeLessThan(1)
    expect(reverseXf.scale).toBeCloseTo(1.5, 1)
    // Also match mid preview angle on the reverse half.
    expect(angleDeltaDeg(reverseXf.rotationDeg, previewMidXf.rotationDeg)).toBeLessThan(1)

    // Demo stage aspect matches project (16/10 default for fresh session ≈ viewport).
    const stageBox = await page.getByTestId('demo-stage').boundingBox()
    expect(stageBox).toBeTruthy()
    expect(stageBox!.width / stageBox!.height).toBeCloseTo(1.6, 1)
  })
})
