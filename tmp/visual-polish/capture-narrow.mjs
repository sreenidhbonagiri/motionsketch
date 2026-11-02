import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'tmp/visual-polish/after')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const base = 'http://127.0.0.1:5173'
const vp = { width: 390, height: 844 }

async function dragActor(page) {
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 2, y + 1, { steps: 2 })
  await page.mouse.move(x + 40, y - 20, { steps: 8 })
  await page.mouse.move(x + 140, y + 30, { steps: 12 })
  await page.waitForTimeout(60)
  await page.mouse.up()
}

async function dismiss(page) {
  for (const id of [
    'btn-dismiss-examples-hint',
    'btn-dismiss-after-path-toast',
    'btn-dismiss-sequence-hint',
  ]) {
    const btn = page.getByTestId(id)
    if (await btn.isVisible().catch(() => false)) await btn.click()
  }
}

async function closeChrome(page) {
  for (const id of ['project', 'adjust', 'appearance', 'export']) {
    const close = page.getByTestId(`btn-close-${id}`)
    if (await close.isVisible().catch(() => false)) await close.click()
  }
}

const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 })
const page = await ctx.newPage()

// 1) Fresh workspace, panels closed
await page.goto(base)
await page.getByTestId('app-shell').waitFor()
await dismiss(page)
await closeChrome(page)
await page.screenshot({
  path: join(outDir, 'narrow-fresh-closed.png'),
  fullPage: false,
})

// 2) Record path, panels closed
await page.getByTestId('btn-record').click()
await page.getByTestId('btn-stop').waitFor()
await dragActor(page)
await page.getByTestId('btn-play').waitFor()
await page.waitForTimeout(350)
await dismiss(page)
await closeChrome(page)
const scrubber = page.getByTestId('playback-scrubber')
if (await scrubber.isVisible()) await scrubber.fill('0')
// Collapse Actors/Sequence if open
for (const id of ['btn-toggle-actor-list', 'btn-toggle-clip-timeline']) {
  const t = page.getByTestId(id)
  if ((await t.getAttribute('aria-expanded')) === 'true') await t.click()
}
const refine = page.getByTestId('refine-motion')
if (await refine.evaluate((el) => el.open).catch(() => false)) {
  await page.getByTestId('refine-motion-summary').click()
}
await page.screenshot({
  path: join(outDir, 'narrow-recorded-closed.png'),
  fullPage: false,
})

const snapshot = await page.evaluate(() =>
  localStorage.getItem('motionsketch.project.v1'),
)

// 3) Adjust open
await page.getByTestId('btn-adjust').click()
await page.getByTestId('adjust-panel-root').waitFor()
await page.screenshot({
  path: join(outDir, 'narrow-adjust-open.png'),
  fullPage: false,
})
await page.getByTestId('btn-close-adjust').click()

// 4) Actors + Sequence expanded
await page.getByTestId('btn-toggle-actor-list').click()
await page.getByTestId('actor-list-body').waitFor()
await page.getByTestId('btn-toggle-clip-timeline').click()
await page.getByTestId('sequence-panel-body').waitFor()
await dismiss(page)
await page.screenshot({
  path: join(outDir, 'narrow-actors-sequence-open.png'),
  fullPage: false,
})

console.log({
  snapshot: !!snapshot,
  sizes: vp,
  files: [
    'narrow-fresh-closed.png',
    'narrow-recorded-closed.png',
    'narrow-adjust-open.png',
    'narrow-actors-sequence-open.png',
  ],
})
await ctx.close()
await browser.close()
