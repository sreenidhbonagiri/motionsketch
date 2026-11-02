/**
 * Production verify after PR #6 merge: premium palette + stable recording dock.
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { chromium } from '@playwright/test'

const PROD = process.env.PROD_URL || 'https://motionsketch.vercel.app'
const MERGE = process.env.MERGE_SHA || '9b05825497ad9d5d8b5e6e0842253a761ac9eb3f'
const out = join(process.cwd(), 'tmp/prod-pr6-verify')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

async function readCamera(page) {
  return page.evaluate(() => {
    const world = document.querySelector('[data-testid="workspace-world"]')
    const transform = world?.style.transform ?? ''
    const m =
      /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(
        transform,
      )
    return {
      panX: m ? Number(m[1]) : NaN,
      panY: m ? Number(m[2]) : NaN,
      zoom: m ? Number(m[3]) : NaN,
    }
  })
}

async function dockBox(page) {
  const box = await page.getByTestId('playback-dock').boundingBox()
  if (!box) throw new Error('missing playback-dock')
  return box
}

async function cssVar(page, name) {
  return page.evaluate((n) => {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim()
  }, name)
}

async function dragActor(page, from, to) {
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  if (!box) throw new Error('missing actor')
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

async function ensureEditor(page) {
  await page.getByTestId('app-shell').waitFor({ state: 'visible' })
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
}

function lin(c) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function L(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = lin((n >> 16) & 255)
  const g = lin((n >> 8) & 255)
  const b = lin(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const L1 = L(a)
  const L2 = L(b)
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (hi + 0.05) / (lo + 0.05)
}

const report = {
  prod: PROD,
  merge: MERGE,
  palette: {},
  armedNoPan: false,
  dockStable: false,
  projectNotRecording: false,
  presetContrast: null,
  ok: false,
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

try {
  await page.goto(PROD, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await ensureEditor(page)

  const expected = {
    '--ms-primary': '#3048b8',
    '--ms-selected': '#ebefff',
    '--ms-ink': '#17213a',
    '--ms-muted': '#647089',
    '--ms-danger': '#d93645',
    '--ms-canvas': '#f8f9fc',
  }
  for (const [name, want] of Object.entries(expected)) {
    const got = (await cssVar(page, name)).toLowerCase()
    report.palette[name] = got
    if (got !== want) throw new Error(`${name}=${got} want ${want}`)
  }

  // Selected preset description should use darker slate-600 pairing.
  await page.getByTestId('btn-adjust').click()
  await page.getByTestId('motion-presets').waitFor({ state: 'visible' })
  const first = page.getByTestId(/motion-preset-/).first()
  await first.click()
  await page.getByTestId('preset-panel').waitFor({ state: 'visible' })
  // Re-open Adjust if the preset session hid it; selection styles live on the list.
  if (!(await page.getByTestId('motion-presets').isVisible().catch(() => false))) {
    await page.getByTestId('btn-adjust').click()
    await page.getByTestId('motion-presets').waitFor({ state: 'visible' })
  }
  const selected = page.locator('[data-testid^="motion-preset-"][aria-pressed="true"]')
  await selected.waitFor({ state: 'visible' })
  const descColor = await selected.locator('span').nth(1).evaluate((el) => {
    return getComputedStyle(el).color
  })
  const bg = await selected.evaluate((el) => getComputedStyle(el).backgroundColor)
  report.presetDescColor = descColor
  report.presetBg = bg
  // rgb(79, 92, 117) = #4F5C75; rgb(235, 239, 255) = #EBEFFF
  const parseRgb = (s) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s)
    if (!m) return null
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((x) => Number(x).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    )
  }
  const fgHex = parseRgb(descColor)
  const bgHex = parseRgb(bg)
  report.presetFgHex = fgHex
  report.presetBgHex = bgHex
  if (fgHex !== '#4F5C75') throw new Error(`preset desc color ${fgHex}`)
  if (bgHex !== '#EBEFFF') throw new Error(`preset bg ${bgHex}`)
  report.presetContrast = Number(contrast(fgHex, bgHex).toFixed(2))
  if (report.presetContrast < 4.5) {
    throw new Error(`preset contrast ${report.presetContrast}`)
  }
  await page.screenshot({ path: join(out, 'desktop-presets-selected.png') })
  // Cancel preset session and close Adjust so recording checks start clean.
  const cancel = page.getByTestId('btn-preset-cancel')
  if (await cancel.isVisible().catch(() => false)) await cancel.click()
  await page.getByTestId('btn-close-adjust').click().catch(async () => {
    await page.keyboard.press('Escape')
  })

  // Armed empty-canvas drag does not pan
  await page.getByTestId('btn-record').click()
  await page.getByTestId('dock-status').waitFor({ state: 'visible' })
  const before = await readCamera(page)
  const stage = await page.getByTestId('stage').boundingBox()
  await page.mouse.move(stage.x + 36, stage.y + stage.height * 0.78)
  await page.mouse.down()
  await page.mouse.move(stage.x + 120, stage.y + stage.height * 0.78 + 40, {
    steps: 10,
  })
  await page.mouse.up()
  const after = await readCamera(page)
  report.camera = {
    before,
    after,
    panDx: Math.abs(after.panX - before.panX),
    panDy: Math.abs(after.panY - before.panY),
  }
  if (report.camera.panDx >= 1 || report.camera.panDy >= 1) {
    throw new Error('armed empty drag panned')
  }
  if (
    (await page.getByTestId('dock-status').getAttribute('data-mode-status')) !==
    'armed'
  ) {
    throw new Error('lost armed after miss')
  }
  await page.screenshot({
    path: join(out, 'desktop-armed-after-empty-drag.png'),
  })
  await page.getByTestId('btn-stop').click()
  report.armedNoPan = true

  // Dock stable + Project not Recording after take+Play
  await page.getByTestId('btn-record').click()
  await dragActor(page, { x: 30, y: -20 }, { x: 160, y: 50 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  const idle = await dockBox(page)

  await page.getByTestId('btn-record').click()
  const confirm = page.getByTestId('btn-rerecord-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  const armed = await dockBox(page)

  const actor = page.getByTestId('actor')
  const ab = await actor.boundingBox()
  const ax = ab.x + ab.width / 2
  const ay = ab.y + ab.height / 2
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  await page.mouse.move(ax + 40, ay + 20, { steps: 8 })
  const recording = await dockBox(page)
  await page.mouse.move(ax + 120, ay + 40, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
  const paused = await dockBox(page)

  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor({ state: 'visible' })
  const playing = await dockBox(page)
  report.dockDeltas = {
    armedH: Math.abs(armed.height - idle.height),
    armedY: Math.abs(armed.y - idle.y),
    recordingH: Math.abs(recording.height - idle.height),
    pausedH: Math.abs(paused.height - idle.height),
    playingH: Math.abs(playing.height - idle.height),
  }
  for (const [k, v] of Object.entries(report.dockDeltas)) {
    if (v > 2) throw new Error(`dock unstable ${k}=${v}`)
  }
  await page.screenshot({ path: join(out, 'desktop-playing.png') })
  await page.getByTestId('btn-play').waitFor({ state: 'visible', timeout: 20000 })
  report.dockStable = true

  await page.getByTestId('btn-project').click()
  await page.getByTestId('project-panel').waitFor({ state: 'visible' })
  const panelText = (await page.getByTestId('project-panel').textContent()) || ''
  report.projectActionStatusCount = await page
    .getByTestId('project-action-status')
    .count()
  report.projectContainsRecording = /Recording/.test(panelText)
  if (report.projectActionStatusCount !== 0) {
    throw new Error('stale project-action-status')
  }
  if (report.projectContainsRecording) {
    throw new Error('Project still shows Recording')
  }
  await page.screenshot({ path: join(out, 'desktop-project-after-play.png') })
  report.projectNotRecording = true

  report.ok = true
} catch (err) {
  report.error = String(err?.stack || err)
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {})
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
  throw err
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
await browser.close()
console.log(JSON.stringify(report, null, 2))
