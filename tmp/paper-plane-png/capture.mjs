/**
 * Capture Paper plane PNG facing at start/mid/end (editor + HTML export).
 * Usage: node tmp/paper-plane-png/capture.mjs [baseUrl]
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { readFileSync as readSync } from 'node:fs'

const outDir = dirname(fileURLToPath(import.meta.url))
mkdirSync(outDir, { recursive: true })
const baseUrlArg = process.argv[2]

async function ensureServer() {
  if (baseUrlArg) return { baseUrl: baseUrlArg, close: async () => {} }
  const server = await createServer({
    root: join(outDir, '../..'),
    server: { port: 5188, strictPort: true },
  })
  await server.listen()
  return {
    baseUrl: 'http://localhost:5188',
    close: () => server.close(),
  }
}

async function loadExample(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  const dismiss = page.getByTestId('btn-dismiss-examples-hint')
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
  await page.getByTestId('btn-examples').click()
  await page.getByTestId('btn-use-paper-plane').click()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
}

async function scrub(page, t) {
  await page.getByTestId('playback-scrubber').fill(String(t))
  await page.waitForTimeout(150)
}

function parseRotateDeg(transform) {
  if (!transform || transform === 'none') return 0
  const m = /rotate\(([-\d.]+)deg\)/.exec(transform)
  if (m) return Number(m[1])
  const matrix = /matrix\(([^)]+)\)/.exec(transform)
  if (matrix) {
    const [a, b] = matrix[1].split(',').map(Number)
    return (Math.atan2(b, a) * 180) / Math.PI
  }
  return NaN
}

async function actorMetrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="actor"]')
    if (!el) return null
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const img = el.querySelector('img')
    const stage = document.querySelector('[data-testid="stage"]')
    const stageRect = stage?.getBoundingClientRect()
    return {
      transform: el.style.transform || style.transform,
      bg: style.backgroundColor,
      boxShadow: style.boxShadow,
      overflow: style.overflow,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      clippedByStage: stageRect
        ? {
            left: rect.left >= stageRect.left - 1,
            right: rect.right <= stageRect.right + 1,
            top: rect.top >= stageRect.top - 1,
            bottom: rect.bottom <= stageRect.bottom + 1,
          }
        : null,
      img: img
        ? {
            srcPrefix: img.currentSrc.slice(0, 40),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            complete: img.complete,
            objectFit: getComputedStyle(img).objectFit,
          }
        : null,
    }
  })
}

async function captureViewport(browser, baseUrl, label, size) {
  const context = await browser.newContext({ viewport: size })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  await loadExample(page, baseUrl)

  const notes = {}
  for (const [name, t] of [
    ['start', 0],
    ['mid', 0.5],
    ['end', 1],
  ]) {
    await scrub(page, t)
    const metrics = await actorMetrics(page)
    notes[name] = {
      rotateDeg: parseRotateDeg(metrics?.transform ?? ''),
      ...metrics,
    }
    await page.getByTestId('stage').screenshot({
      path: join(outDir, `${label}-editor-${name}.png`),
    })
  }

  await page.getByTestId('btn-examples').click()
  await page.getByTestId('example-thumb-paper-plane').screenshot({
    path: join(outDir, `${label}-gallery-thumb.png`),
  })
  await page.keyboard.press('Escape')
  await page.screenshot({
    path: join(outDir, `${label}-full.png`),
    fullPage: false,
  })

  // Download HTML export once on desktop pass
  let html = null
  if (label === 'desktop') {
    await page.getByTestId('btn-export').click()
    const details = page.getByTestId('export-other-ways')
    await details.waitFor({ state: 'visible', timeout: 10000 })
    const open = await details.evaluate((el) => el.open)
    if (!open) await page.getByTestId('export-other-ways-summary').click()
    const downloadBtn = page.getByTestId('btn-download-html-demo')
    await downloadBtn.scrollIntoViewIfNeeded()
    await downloadBtn.waitFor({ state: 'visible', timeout: 10000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadBtn.click(),
    ])
    const htmlPath = join(outDir, 'paper-plane-export.html')
    await download.saveAs(htmlPath)
    html = readFileSync(htmlPath, 'utf8')
  }

  await context.close()
  return { notes, html }
}

async function captureExport(browser, html) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
  })
  const page = await context.newPage()
  const exportNotes = {}
  for (const [name, t] of [
    ['start', 0],
    ['mid', 0.5],
    ['end', 1],
  ]) {
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.evaluate((progress) => {
      document.getElementById('ms-freeze')?.remove()
      let duration = 2.4
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            const text = rule.cssText || ''
            const m = text.match(/animation-duration:\s*([\d.]+)s/)
            if (m) duration = parseFloat(m[1])
            const m2 = text.match(/animation:[^;]*?([\d.]+)s/)
            if (m2) duration = parseFloat(m2[1])
          }
        } catch {
          /* ignore */
        }
      }
      const style = document.createElement('style')
      style.id = 'ms-freeze'
      style.textContent = `*, *::before, *::after {
        animation-play-state: paused !important;
        animation-delay: -${progress * duration}s !important;
      }`
      document.head.appendChild(style)
      void document.body.offsetHeight
    }, t)
    await page.waitForTimeout(100)
    const metrics = await page.evaluate(() => {
      const img = document.querySelector('img')
      const actor = img?.parentElement
      const cs = actor ? getComputedStyle(actor) : null
      return {
        transform: actor?.style?.transform || cs?.transform || '',
        bg: cs?.backgroundColor,
        imgSrcPrefix: img?.currentSrc?.slice(0, 40),
        imgNatural: img
          ? { w: img.naturalWidth, h: img.naturalHeight }
          : null,
        transparentBg:
          !cs?.backgroundColor ||
          cs.backgroundColor === 'rgba(0, 0, 0, 0)' ||
          cs.backgroundColor === 'transparent',
      }
    })
    exportNotes[name] = {
      rotateDeg: parseRotateDeg(metrics.transform),
      ...metrics,
    }
    await page.screenshot({ path: join(outDir, `export-${name}.png`) })
  }
  await context.close()
  return exportNotes
}

const { baseUrl, close } = await ensureServer()
const browser = await chromium.launch()
const report = {}
try {
  const desk = await captureViewport(browser, baseUrl, 'desktop', {
    width: 1280,
    height: 800,
  })
  report.desktop = desk.notes
  const mob = await captureViewport(browser, baseUrl, 'mobile', {
    width: 390,
    height: 844,
  })
  report.mobile = mob.notes
  if (!desk.html) throw new Error('HTML export missing')
  report.htmlHasPng = /data:image\/png;base64,/.test(desk.html)
  report.htmlHasSvgPlane = /#f7f4ec/.test(desk.html)
  report.export = await captureExport(browser, desk.html)
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log('wrote captures to', outDir)
  console.log(
    JSON.stringify(
      {
        desktopMidRot: report.desktop.mid.rotateDeg,
        exportMidRot: report.export.mid.rotateDeg,
        png: report.htmlHasPng,
        oldSvgGone: !report.htmlHasSvgPlane,
        img: report.desktop.mid.img?.srcPrefix,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
  await close()
}
