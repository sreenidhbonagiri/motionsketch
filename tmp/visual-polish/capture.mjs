import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'tmp/visual-polish/after')
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

async function applyState(page) {
  await dismissHints(page)
  await page.getByTestId('playback-scrubber').fill('0')

  const listToggle = page.getByTestId('btn-toggle-actor-list')
  if ((await listToggle.getAttribute('aria-expanded')) !== 'true') {
    await listToggle.click()
  }
  await page.getByTestId('actor-list-body').waitFor({ state: 'visible' })

  // Sequence stays collapsed (toggle) so the stage remains canvas-first.
  const seq = page.getByTestId('btn-toggle-clip-timeline')
  if ((await seq.getAttribute('aria-expanded')) === 'true') {
    await seq.click()
  }

  const refine = page.getByTestId('refine-motion')
  if (!(await refine.evaluate((el) => el.open))) {
    await page.getByTestId('refine-motion-summary').click()
  }
  await page.getByTestId('refine-motion-tools').waitFor({ state: 'visible' })

  // Open Adjust to show the unified contextual panel treatment.
  await page.getByTestId('btn-adjust').click()
  await page.getByTestId('adjust-panel-root').waitFor({ state: 'visible' })
  await dismissHints(page)
}

const seed = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
})
const seedPage = await seed.newPage()
await seedPage.goto(base)
await seedPage.getByTestId('app-shell').waitFor({ state: 'visible' })
await dismissHints(seedPage)
await seedPage.getByTestId('btn-record').click()
await seedPage.getByTestId('btn-stop').waitFor({ state: 'visible' })
await dragActor(seedPage, { x: 30, y: -20 }, { x: 160, y: 50 })
await seedPage.getByTestId('btn-play').waitFor({ state: 'visible' })
await seedPage.waitForTimeout(400)
const snapshot = await seedPage.evaluate(() =>
  localStorage.getItem('motionsketch.project.v1'),
)
if (!snapshot) throw new Error('missing snapshot')
await applyState(seedPage)
await seedPage.screenshot({
  path: join(outDir, 'after-desktop.png'),
  fullPage: false,
})
await seed.close()

const narrow = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
})
const narrowPage = await narrow.newPage()
await narrowPage.goto(base)
await narrowPage.evaluate((raw) => {
  localStorage.setItem('motionsketch.project.v1', raw)
  sessionStorage.removeItem('motionsketch.actorsPanelOpen')
  sessionStorage.removeItem('motionsketch.sequencePanelOpen')
}, snapshot)
await narrowPage.reload()
await narrowPage.getByTestId('app-shell').waitFor({ state: 'visible' })
await narrowPage.getByTestId('btn-play').waitFor({ state: 'visible' })
await applyState(narrowPage)
await narrowPage.screenshot({
  path: join(outDir, 'after-narrow.png'),
  fullPage: false,
})
console.log(
  await narrowPage.evaluate(() => ({
    iw: innerWidth,
    ih: innerHeight,
    actors: document
      .querySelector('[data-testid="btn-toggle-actor-list"]')
      ?.getAttribute('aria-expanded'),
    sequence: document
      .querySelector('[data-testid="btn-toggle-clip-timeline"]')
      ?.getAttribute('aria-expanded'),
    refine: !!document.querySelector('[data-testid="refine-motion-tools"]'),
    adjust: !!document.querySelector('[data-testid="adjust-panel-root"]'),
  })),
)
await narrow.close()
await browser.close()
console.log('Wrote after-desktop.png + after-narrow.png')
