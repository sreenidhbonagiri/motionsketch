import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import path from 'path'

const root = '/Users/sreenidhbonagiri/Desktop/motionsketch'
const vite = await createServer({
  configFile: path.join(root, 'vite.config.ts'),
  server: { port: 5199, strictPort: true },
})
await vite.listen()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

// Instrument before navigation
await page.addInitScript(() => {
  window.__spacePanDiag = []
  const push = (row) => {
    window.__spacePanDiag.push({ t: performance.now(), ...row })
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return
    const ae = document.activeElement
    push({
      type: 'keydown-space',
      repeat: e.repeat,
      defaultPrevented: e.defaultPrevented,
      target: ae && (ae.getAttribute('data-testid') || ae.tagName + (ae.getAttribute('role') ? '[role='+ae.getAttribute('role')+']' : '')),
      targetTag: ae && ae.tagName,
      blockedClosest: !!(ae && ae.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"]')),
      blockedRoleButton: !!(ae && ae.closest('[role="button"]')),
      mode: document.querySelector('[data-testid="btn-stop"]') ? 'recording-or-armed' : (document.querySelector('[data-testid="btn-record"]') ? 'idle-ish' : 'unknown'),
      liveRegion: document.querySelector('[data-testid="action-live-region"]')?.textContent?.trim() || '',
      cursor: document.querySelector('[data-testid="stage"]')?.className || '',
    })
  }, true)
  window.addEventListener('pointerdown', (e) => {
    const t = e.target
    push({
      type: 'pointerdown',
      x: e.clientX, y: e.clientY,
      target: t && (t.getAttribute?.('data-testid') || t.tagName),
      path: (e.composedPath?.() || []).slice(0, 8).map((n) => n.getAttribute?.('data-testid') || n.tagName),
      stageCursor: document.querySelector('[data-testid="stage"]')?.className || '',
      actorPE: document.querySelector('[data-testid="actor"]') && getComputedStyle(document.querySelector('[data-testid="actor"]')).pointerEvents,
    })
  }, true)
})

await page.goto('http://127.0.0.1:5199/')
await page.getByTestId('app-shell').waitFor()

// mirror helpers lightly
async function ensureEditor() {
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
}
async function recordSimplePath() {
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  const sx = box.x + box.width/2, sy = box.y + box.height/2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx+2, sy+1, { steps: 2 })
  await page.mouse.move(sx+30, sy-20, { steps: 8 })
  await page.mouse.move(sx+160, sy+50, { steps: 12 })
  await page.waitForTimeout(60)
  await page.mouse.up()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
}
async function waitForSaved() {
  await page.getByTestId('btn-project').click()
  await page.getByTestId('save-status').waitFor({ state: 'visible' })
  await page.getByTestId('save-status').filter({ hasText: 'Saved in this browser' }).waitFor()
  await page.locator('[data-testid$="-panel-root"] >> [data-testid^="btn-close-"]').first().click()
}

await ensureEditor()
await recordSimplePath()
await waitForSaved()

const focusInfo = await page.evaluate(() => {
  const ae = document.activeElement
  return {
    active: ae && (ae.getAttribute('data-testid') || ae.tagName + (ae.getAttribute('role')||'')),
    modeStop: !!document.querySelector('[data-testid="btn-stop"]'),
    modeRecord: !!document.querySelector('[data-testid="btn-record"]'),
    live: document.querySelector('[data-testid="action-live-region"]')?.textContent?.trim(),
  }
})
console.log('after waitForSaved', focusInfo)

await page.getByTestId('stage').focus()
const afterFocus = await page.evaluate(() => {
  const ae = document.activeElement
  return ae && (ae.getAttribute('data-testid') || ae.tagName)
})
console.log('after stage.focus', afterFocus)

const before = await page.evaluate(() => {
  const world = document.querySelector('[data-testid="workspace-world"]')
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(world?.style.transform||'')
  return { panX: m?+m[1]:NaN, panY: m?+m[2]:NaN }
})

await page.keyboard.down(' ')
// yield a microtask to let React flush spaceHeld state — NOT a sleep for the product, just for diag comparison
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

const midState = await page.evaluate(() => {
  const stage = document.querySelector('[data-testid="stage"]')
  const actor = document.querySelector('[data-testid="actor"]')
  return {
    stageClass: stage?.className,
    actorPE: actor && getComputedStyle(actor).pointerEvents,
    active: document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName,
  }
})
console.log('after Space+rAF', midState)

const actor = page.getByTestId('actor')
const box = await actor.boundingBox()
await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
await page.mouse.down()
await page.mouse.move(box.x + 70, box.y + 50, { steps: 6 })
await page.mouse.up()

const after = await page.evaluate(() => {
  const world = document.querySelector('[data-testid="workspace-world"]')
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(world?.style.transform||'')
  return { panX: m?+m[1]:NaN, panY: m?+m[2]:NaN }
})
await page.keyboard.up(' ')

const diag = await page.evaluate(() => window.__spacePanDiag)
console.log('before', before, 'after', after, 'delta', Math.hypot(after.panX-before.panX, after.panY-before.panY))
console.log(JSON.stringify(diag, null, 2))

await browser.close()
await vite.close()
