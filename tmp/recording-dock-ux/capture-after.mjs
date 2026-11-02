import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)))
mkdirSync(outDir, { recursive: true })
const base = process.env.MS_BASE || 'http://127.0.0.1:4178'

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
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 2, sy + 1, { steps: 2 })
  await page.mouse.move(sx + from.x, sy + from.y, { steps: 6 })
  await page.mouse.move(sx + to.x, sy + to.y, { steps: 10 })
  await page.waitForTimeout(60)
  await page.mouse.up()
}

const browser = await chromium.launch()

async function run(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(base)
  await page.getByTestId('app-shell').waitFor()
  await dismissHints(page)
  await page.screenshot({ path: join(outDir, `${name}-idle.png`) })

  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor()
  await page.screenshot({ path: join(outDir, `${name}-armed.png`) })

  const stage = await page.getByTestId('stage').boundingBox()
  await page.mouse.move(stage.x + 40, stage.y + stage.height * 0.78)
  await page.mouse.down()
  await page.mouse.move(stage.x + 110, stage.y + stage.height * 0.78 + 30, {
    steps: 8,
  })
  await page.mouse.up()
  await page.waitForTimeout(80)
  await page.screenshot({ path: join(outDir, `${name}-armed-miss.png`) })

  await dragActor(page, { x: 20, y: -10 }, { x: 140, y: 50 })
  // still recording mid-drag screenshot: re-arm
  await page.getByTestId('btn-record').click()
  const confirm = page.getByTestId('btn-rerecord-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 50, y - 20, { steps: 6 })
  await page.screenshot({ path: join(outDir, `${name}-recording.png`) })
  await page.mouse.up()
  await dismissHints(page)
  await page.screenshot({ path: join(outDir, `${name}-recorded.png`) })

  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor()
  await page.screenshot({ path: join(outDir, `${name}-playing.png`) })
  await ctx.close()
}

await run('desktop', { width: 1280, height: 800 })
await run('mobile', { width: 390, height: 844 })
console.log('wrote after screenshots to', outDir)
await browser.close()
