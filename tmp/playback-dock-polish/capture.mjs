import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'tmp/playback-dock-polish')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const base = 'http://127.0.0.1:5173'

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

async function ensureIdleDock(page) {
  await dismissHints(page)
  const seq = page.getByTestId('btn-toggle-clip-timeline')
  if (
    (await seq.isVisible().catch(() => false)) &&
    (await seq.getAttribute('aria-expanded')) === 'true'
  ) {
    await seq.click()
  }
}

async function captureViewport(name, viewport, setup) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await page.goto(base)
  await page.getByTestId('app-shell').waitFor({ state: 'visible' })
  await dismissHints(page)
  await setup(page)
  await page.waitForTimeout(200)
  await page.screenshot({
    path: join(outDir, `${name}.png`),
    fullPage: false,
  })
  await context.close()
}

// Seed a short recording once, reuse via localStorage snapshot.
const seed = await browser.newContext({
  viewport: { width: 1280, height: 800 },
})
const seedPage = await seed.newPage()
await seedPage.goto(base)
await seedPage.getByTestId('app-shell').waitFor({ state: 'visible' })
await dismissHints(seedPage)
await seedPage.getByTestId('btn-record').click()
await seedPage.getByTestId('btn-stop').waitFor({ state: 'visible' })
await dragActor(seedPage, { x: 40, y: -30 }, { x: 180, y: 40 })
await seedPage.getByTestId('btn-play').waitFor({ state: 'visible' })
await seedPage.waitForTimeout(300)
const snapshot = await seedPage.evaluate(() => {
  const keys = Object.keys(localStorage)
  const out = {}
  for (const k of keys) out[k] = localStorage.getItem(k)
  return out
})
await seed.close()

async function loadSnapshot(page) {
  await page.goto(base)
  await page.evaluate((data) => {
    localStorage.clear()
    for (const [k, v] of Object.entries(data)) {
      if (v != null) localStorage.setItem(k, v)
    }
  }, snapshot)
  await page.reload()
  await page.getByTestId('app-shell').waitFor({ state: 'visible' })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await ensureIdleDock(page)
}

const desktop = { width: 1280, height: 800 }
const mobile = { width: 390, height: 844 }

await captureViewport('desktop-refine-closed', desktop, async (page) => {
  await loadSnapshot(page)
})

await captureViewport('desktop-refine-open', desktop, async (page) => {
  await loadSnapshot(page)
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('refine-motion-tools').waitFor({ state: 'visible' })
})

async function armAndStartRecording(page) {
  await page.getByTestId('btn-record').click()
  const confirm = page.getByTestId('btn-rerecord-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  // Enter active recording (not just armed) so Stop + square is visible.
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  if (!box) throw new Error('actor missing')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y - 20, { steps: 6 })
  await page.getByTestId('dock-status').waitFor({ state: 'visible' })
  await expect(page.getByTestId('mode-status-label')).toContainText(/Recording/i)
}

await captureViewport('desktop-recording', desktop, async (page) => {
  await loadSnapshot(page)
  await armAndStartRecording(page)
})

await captureViewport('mobile-refine-closed', mobile, async (page) => {
  await loadSnapshot(page)
})

await captureViewport('mobile-refine-open', mobile, async (page) => {
  await loadSnapshot(page)
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('refine-motion-tools').waitFor({ state: 'visible' })
})

await captureViewport('mobile-recording', mobile, async (page) => {
  await loadSnapshot(page)
  await armAndStartRecording(page)
})

await captureViewport('desktop-refine-restore', desktop, async (page) => {
  await loadSnapshot(page)
  await page.getByTestId('btn-continue-path').click()
  await page.getByTestId('dock-status').waitFor({ state: 'visible' })
  await dragActor(page, { x: 4, y: 2 }, { x: 50, y: -20 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('btn-restore-path').waitFor({ state: 'visible' })
  await page.getByTestId('snap-to-grid-toggle').click()
})

await captureViewport('mobile-refine-open-actors', mobile, async (page) => {
  await loadSnapshot(page)
  const listToggle = page.getByTestId('btn-toggle-actor-list')
  if ((await listToggle.getAttribute('aria-expanded')) !== 'true') {
    await listToggle.click()
  }
  await page.getByTestId('actor-list-body').waitFor({ state: 'visible' })
  await page.getByTestId('btn-refine-motion').click()
  await page.getByTestId('refine-motion-tools').waitFor({ state: 'visible' })
})

await browser.close()
console.log('Wrote screenshots to', outDir)
