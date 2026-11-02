import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'tmp/premium-palette')
mkdirSync(outDir, { recursive: true })

const base = process.env.MS_BASE || 'http://127.0.0.1:5173'
const browser = await chromium.launch()

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
  await page.waitForTimeout(80)
  await page.mouse.up()
}

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

async function shot(page, name) {
  await page.screenshot({ path: join(outDir, name), fullPage: false })
}

async function contrastSample(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="app-shell"]')
    const exportBtn = document.querySelector('[data-testid="btn-export"]')
    const dock = document.querySelector('[data-testid="playback-dock"]')
    const status = document.querySelector('[data-testid="dock-status"]')
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const shellCs = cs(shell)
    const exportCs = cs(exportBtn)
    const dockCs = cs(dock)
    return {
      canvasBg: shellCs?.backgroundColor,
      ink: shellCs?.color,
      exportBg: exportCs?.backgroundColor,
      exportColor: exportCs?.color,
      dockBg: dockCs?.backgroundColor,
      statusColor: status ? cs(status)?.color : null,
      focusOutline: (() => {
        const btn = document.querySelector('[data-testid="btn-record"]')
        if (!btn) return null
        btn.focus()
        const f = getComputedStyle(btn)
        return { outline: f.outline, outlineColor: f.outlineColor, outlineWidth: f.outlineWidth }
      })(),
    }
  })
}

async function runViewport(label, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(base)
  await page.getByTestId('app-shell').waitFor({ state: 'visible' })
  await dismissHints(page)

  await shot(page, `${label}-empty.png`)

  // Recording active
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  await page.waitForTimeout(120)
  await shot(page, `${label}-recording.png`)

  await dragActor(page, { x: 40, y: -30 }, { x: 180, y: 70 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await dismissHints(page)
  await page.getByTestId('playback-scrubber').fill('0.35')
  await page.waitForTimeout(200)
  await shot(page, `${label}-recorded.png`)

  // Refine open (popover button, not a native <details>)
  const refineTools = page.getByTestId('refine-motion-tools')
  if (!(await refineTools.isVisible().catch(() => false))) {
    await page.getByTestId('btn-refine-motion').click()
  }
  await refineTools.waitFor({ state: 'visible' })
  await dismissHints(page)
  await shot(page, `${label}-refine.png`)

  // Export panel
  await page.getByTestId('btn-export').click()
  await page.getByTestId('export-panel-root').waitFor({ state: 'visible' })
  await dismissHints(page)
  await shot(page, `${label}-export.png`)

  // Focus + contrast probe
  await page.keyboard.press('Escape')
  const metrics = await contrastSample(page)
  writeFileSync(join(outDir, `${label}-metrics.json`), JSON.stringify(metrics, null, 2))

  // Focus ring visible on Record
  await page.getByTestId('btn-record').focus()
  await shot(page, `${label}-focus-record.png`)

  await ctx.close()
  return metrics
}

const desktop = await runViewport('desktop', { width: 1280, height: 800 })
const mobile = await runViewport('mobile', { width: 390, height: 844 })
writeFileSync(
  join(outDir, 'summary.json'),
  JSON.stringify({ desktop, mobile, at: new Date().toISOString() }, null, 2),
)
console.log('wrote screenshots to', outDir)
console.log(JSON.stringify({ desktop, mobile }, null, 2))
await browser.close()
