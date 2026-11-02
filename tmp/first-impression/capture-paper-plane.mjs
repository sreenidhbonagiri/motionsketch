/**
 * Capture Paper plane presentation: start / mid / end, gallery thumb, mobile.
 * Usage: node tmp/first-impression/capture-paper-plane.mjs [baseUrl]
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173'
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'paper-plane')
mkdirSync(outDir, { recursive: true })

async function shot(page, name) {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log('wrote', path)
}

const browser = await chromium.launch()

{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  await page.getByTestId('btn-examples').click()
  await page.getByTestId('examples-gallery').waitFor()
  await page.getByTestId('example-card-paper-plane').scrollIntoViewIfNeeded()
  await shot(page, 'gallery-thumbnail')
  await page.getByTestId('btn-use-paper-plane').click()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-dismiss-after-path-toast').click().catch(() => {})
  await page.waitForTimeout(200)
  await shot(page, 'desktop-start')
  await page.getByTestId('playback-scrubber').fill('0.5')
  await page.waitForTimeout(150)
  await shot(page, 'desktop-mid')
  await page.getByTestId('playback-scrubber').fill('1')
  await page.waitForTimeout(150)
  await shot(page, 'desktop-end')
  await context.close()
}

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  await page.getByTestId('btn-examples').click()
  await page.getByTestId('examples-gallery').waitFor()
  await page.getByTestId('btn-use-paper-plane').click()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-dismiss-after-path-toast').click().catch(() => {})
  await page.waitForTimeout(200)
  await shot(page, 'mobile-start')
  await page.getByTestId('playback-scrubber').fill('0.5')
  await page.waitForTimeout(150)
  await shot(page, 'mobile-mid')
  await context.close()
}

await browser.close()
console.log('done paper-plane')
