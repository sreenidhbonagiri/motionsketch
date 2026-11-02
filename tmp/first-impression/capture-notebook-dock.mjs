/**
 * Capture notebook plane (editor + HTML) and paused/playing dock states.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'notebook-dock')
mkdirSync(outDir, { recursive: true })
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173'

async function shot(page, name, clip) {
  const path = join(outDir, `${name}.png`)
  if (clip) await page.screenshot({ path, clip })
  else await page.screenshot({ path, fullPage: false })
  console.log('wrote', path)
}

async function generateHtml() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const load = await server.ssrLoadModule('/src/examples/load.ts')
    const htmlDemo = await server.ssrLoadModule('/src/core/export/htmlDemo.ts')
    const loaded = load.loadExampleSnapshot('paper-plane')
    if (!loaded.ok) throw new Error(loaded.error)
    const html = htmlDemo.buildHtmlDemoFromProject(loaded.snapshot.project)
    writeFileSync(join(outDir, 'paper-plane.html'), html)
    return html
  } finally {
    await server.close()
  }
}

async function seekPlane(page, tNorm) {
  await page.evaluate((t) => {
    const stage = document.querySelector('[data-testid="demo-stage"]')
    if (!stage) return
    for (const el of stage.querySelectorAll('img, div')) {
      if (!(el instanceof HTMLElement)) continue
      for (const anim of el.getAnimations()) {
        const name = /** @type {Animation & { animationName?: string }} */ (anim)
          .animationName
        if (!name || name === 'none') continue
        anim.pause()
        const dur =
          Number(anim.effect?.getTiming().duration) ||
          parseFloat(getComputedStyle(el).animationDuration) * 1000 ||
          2400
        anim.currentTime = Math.min(dur, Math.max(0, t * dur))
      }
      void el.offsetWidth
    }
  }, tNorm)
}

const html = await generateHtml()
const browser = await chromium.launch()

// Editor: notebook plane start/mid/end + dock paused/playing
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('btn-examples').click()
  await page.getByTestId('examples-gallery').waitFor()
  await page.getByTestId('example-card-paper-plane').scrollIntoViewIfNeeded()
  await shot(page, 'gallery-thumbnail')
  await page.getByTestId('btn-use-paper-plane').click()
  await page.getByTestId('btn-play').waitFor()
  await page.getByTestId('btn-dismiss-after-path-toast').click().catch(() => {})
  await page.waitForTimeout(200)
  await shot(page, 'editor-start')
  await page.getByTestId('playback-scrubber').fill('0.5')
  await page.waitForTimeout(120)
  await shot(page, 'editor-mid')
  await page.getByTestId('playback-scrubber').fill('1')
  await page.waitForTimeout(120)
  await shot(page, 'editor-end')
  await page.getByTestId('playback-scrubber').fill('0')
  await page.waitForTimeout(80)

  const dock = page.getByTestId('playback-dock')
  const dockBox = await dock.boundingBox()
  await shot(page, 'dock-paused', {
    x: Math.max(0, dockBox.x - 8),
    y: Math.max(0, dockBox.y - 8),
    width: dockBox.width + 16,
    height: dockBox.height + 16,
  })
  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor()
  await page.waitForTimeout(80)
  const dockBox2 = await dock.boundingBox()
  await shot(page, 'dock-playing', {
    x: Math.max(0, dockBox2.x - 8),
    y: Math.max(0, dockBox2.y - 8),
    width: dockBox2.width + 16,
    height: dockBox2.height + 16,
  })
  writeFileSync(
    join(outDir, 'dock-bounds.json'),
    JSON.stringify(
      {
        paused: dockBox,
        playing: dockBox2,
        heightDelta: Math.abs(dockBox2.height - dockBox.height),
        yDelta: Math.abs(dockBox2.y - dockBox.y),
      },
      null,
      2,
    ),
  )
  await context.close()
}

// Mobile dock paused/playing
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('btn-examples').click()
  await page.getByTestId('btn-use-paper-plane').click()
  await page.getByTestId('btn-play').waitFor()
  await page.getByTestId('btn-dismiss-after-path-toast').click().catch(() => {})
  const dock = page.getByTestId('playback-dock')
  let box = await dock.boundingBox()
  await shot(page, 'mobile-dock-paused', {
    x: Math.max(0, box.x - 4),
    y: Math.max(0, box.y - 4),
    width: Math.min(390, box.width + 8),
    height: box.height + 8,
  })
  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor()
  box = await dock.boundingBox()
  await shot(page, 'mobile-dock-playing', {
    x: Math.max(0, box.x - 4),
    y: Math.max(0, box.y - 4),
    width: Math.min(390, box.width + 8),
    height: box.height + 8,
  })
  await context.close()
}

// HTML export frames
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('demo-stage').waitFor()
  for (const [name, t] of [
    ['html-start', 0],
    ['html-mid', 0.5],
    ['html-end', 1],
  ]) {
    await seekPlane(page, t)
    await page.getByTestId('demo-stage').screenshot({
      path: join(outDir, `${name}.png`),
    })
    console.log('wrote', `${name}.png`)
  }
  await context.close()
}

await browser.close()
console.log('done notebook-dock')
