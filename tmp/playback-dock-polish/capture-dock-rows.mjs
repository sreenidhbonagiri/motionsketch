import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'tmp/playback-dock-polish')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const base = 'http://127.0.0.1:5173'

async function dismissHints(page) {
  for (const id of [
    'btn-dismiss-examples-hint',
    'btn-dismiss-after-path-toast',
    'btn-dismiss-sequence-hint',
  ]) {
    const btn = page.getByTestId(id)
    if (await btn.isVisible().catch(() => false)) await btn.click()
  }
}

async function dragActor(page, from, to) {
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  if (!box) throw new Error('actor missing')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 2, startY + 1, { steps: 2 })
  await page.mouse.move(startX + from.x, startY + from.y, { steps: 8 })
  await page.mouse.move(startX + to.x, startY + to.y, { steps: 12 })
  await page.waitForTimeout(60)
  await page.mouse.up()
}

async function capture(name, viewport, setup) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await page.goto(base)
  await page.getByTestId('app-shell').waitFor({ state: 'visible' })
  await dismissHints(page)
  await setup(page)
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false })
  await context.close()
}

const desktop = { width: 1280, height: 800 }

await capture('desktop-empty', desktop, async (_page) => {})

await capture('desktop-recorded', desktop, async (page) => {
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  await dragActor(page, { x: 40, y: -30 }, { x: 180, y: 40 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
})

await capture('desktop-recording', desktop, async (page) => {
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  await dragActor(page, { x: 40, y: -30 }, { x: 180, y: 40 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-record').click()
  const confirm = page.getByTestId('btn-rerecord-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y - 20, { steps: 6 })
  await expect(page.getByTestId('mode-status-label')).toContainText(/Recording/i)
})

for (const width of [390, 320]) {
  const vp = { width, height: 844 }
  await capture(`mobile-${width}-empty`, vp, async () => {})
  await capture(`mobile-${width}-recorded`, vp, async (page) => {
    await page.getByTestId('btn-record').click()
    await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
    await dragActor(page, { x: 30, y: -20 }, { x: 120, y: 40 })
    await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  })
}

await browser.close()
console.log('Wrote dock-row screenshots to', outDir)
