/**
 * Capture first-impression screenshots (before/after) at key viewports.
 * Usage: node tmp/first-impression/capture.mjs <before|after> [baseUrl]
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const label = process.argv[2] === 'after' ? 'after' : 'before'
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4173'
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  label,
)
mkdirSync(outDir, { recursive: true })

async function recordPath(page) {
  const actor = page.getByTestId('actor')
  await page.getByTestId('btn-record').click()
  const box = await actor.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 80, y - 40, { steps: 8 })
  await page.mouse.up()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log('wrote', path)
}

async function freshPage(browser, size) {
  const context = await browser.newContext({ viewport: size })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  return { context, page }
}

const browser = await chromium.launch()

{
  const { context, page } = await freshPage(browser, {
    width: 1280,
    height: 800,
  })
  await shot(page, 'desktop-empty')
  // Paper plane example (after only — before had no example)
  if (label === 'after') {
    await page.getByTestId('btn-try-example').click()
    await page.getByTestId('examples-gallery').waitFor()
    await page.getByTestId('btn-use-paper-plane').click()
    await page.getByTestId('btn-play').waitFor({ state: 'visible' })
    await page.waitForTimeout(400)
    await shot(page, 'desktop-paper-plane')
  }
  await context.close()
}

{
  const { context, page } = await freshPage(browser, {
    width: 500,
    height: 700,
  })
  await shot(page, '500-empty')
  await recordPath(page)
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('refine-motion-tools').waitFor()
  await shot(page, '500-refine')
  await context.close()
}

{
  const { context, page } = await freshPage(browser, {
    width: 390,
    height: 844,
  })
  await shot(page, '390-empty')
  await recordPath(page)
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('refine-motion-tools').waitFor()
  await shot(page, '390-refine')
  await context.close()
}

{
  const { context, page } = await freshPage(browser, {
    width: 320,
    height: 720,
  })
  await shot(page, '320-empty')
  await recordPath(page)
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('refine-motion-tools').waitFor()
  await shot(page, '320-refine')
  await context.close()
}

await browser.close()
console.log('done', label)
