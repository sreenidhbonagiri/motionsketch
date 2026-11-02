/**
 * Production verify after PR #7 merge:
 * armed empty-canvas drag does not pan; dock stays stable;
 * Project does not retain "Recording" after take + Play.
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { chromium } from '@playwright/test'

const PROD = process.env.PROD_URL || 'https://motionsketch.vercel.app'
const MERGE = process.env.MERGE_SHA || '55f3b88344f612a161248f20abeb31acf5b11e0a'
const out = join(process.cwd(), 'tmp/prod-pr7-verify')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

async function readCamera(page) {
  return page.evaluate(() => {
    const world = document.querySelector(
      '[data-testid="workspace-world"]',
    )
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

async function assertPlayCentered(page, tolerancePx = 6) {
  const centered = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="playback-dock"]')
    const control =
      document.querySelector('[data-testid="btn-play"]') ??
      document.querySelector('[data-testid="btn-pause"]')
    if (!(dock instanceof HTMLElement) || !(control instanceof HTMLElement)) {
      return { ok: false, delta: Infinity }
    }
    const dr = dock.getBoundingClientRect()
    const cr = control.getBoundingClientRect()
    return {
      ok: true,
      delta: Math.abs(dr.left + dr.width / 2 - (cr.left + cr.width / 2)),
    }
  })
  if (!centered.ok) throw new Error('play control missing for dock center check')
  if (centered.delta > tolerancePx) {
    throw new Error(`Play not centered in dock: delta=${centered.delta}`)
  }
  return centered.delta
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
  await page.getByTestId('welcome-screen').waitFor({ state: 'detached' }).catch(() => {})
  // Fresh visit may show name dialog — dismiss if present
  const dialog = page.getByTestId('project-name-dialog')
  if (await dialog.isVisible().catch(() => false)) {
    const input = page.getByTestId('project-name-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('Prod PR7')
      await page.getByTestId('btn-confirm-project-name').click()
    }
  }
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
}

const report = {
  prod: PROD,
  merge: MERGE,
  armedNoPan: false,
  dockStable: false,
  projectNotRecording: false,
  dockDeltas: {},
  playCenterDeltas: {},
  ok: false,
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

try {
  await page.goto(PROD, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await ensureEditor(page)

  // --- 1) Armed empty-canvas drag does not pan ---
  await page.getByTestId('btn-record').click()
  await page.getByTestId('dock-status').waitFor({ state: 'visible' })
  const mode = await page.getByTestId('dock-status').getAttribute('data-mode-status')
  if (mode !== 'armed') throw new Error(`expected armed, got ${mode}`)
  const instruction = (
    await page.getByTestId('mode-status-instruction').textContent()
  )?.trim()
  if (instruction !== 'Drag the element to record.') {
    throw new Error(`armed instruction: ${instruction}`)
  }
  const before = await readCamera(page)
  const stage = await page.getByTestId('stage').boundingBox()
  if (!stage) throw new Error('missing stage')
  await page.mouse.move(stage.x + 36, stage.y + stage.height * 0.78)
  await page.mouse.down()
  await page.mouse.move(stage.x + 120, stage.y + stage.height * 0.78 + 40, {
    steps: 10,
  })
  await page.mouse.up()
  const after = await readCamera(page)
  const panDx = Math.abs(after.panX - before.panX)
  const panDy = Math.abs(after.panY - before.panY)
  report.camera = { before, after, panDx, panDy }
  if (panDx >= 1 || panDy >= 1) {
    throw new Error(`armed empty drag panned: dx=${panDx} dy=${panDy}`)
  }
  const stillArmed = await page
    .getByTestId('dock-status')
    .getAttribute('data-mode-status')
  if (stillArmed !== 'armed') throw new Error(`lost armed after miss: ${stillArmed}`)
  const live = (await page.getByTestId('action-live-region').textContent())?.trim()
  if (live !== 'Drag the element to record.') {
    throw new Error(`miss live region: ${live}`)
  }
  await page.screenshot({
    path: join(out, 'desktop-armed-after-empty-drag.png'),
  })
  await page.getByTestId('btn-stop').click()
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
  report.armedNoPan = true

  // --- 2) Dock stays stable across idle / armed / recording / playing ---
  await page.getByTestId('btn-record').click()
  await dragActor(page, { x: 30, y: -20 }, { x: 160, y: 50 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })

  const idle = await dockBox(page)
  report.playCenterDeltas.idle = await assertPlayCentered(page)

  await page.getByTestId('btn-record').click()
  const confirm = page.getByTestId('btn-rerecord-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  const armed = await dockBox(page)
  report.dockDeltas.armedH = Math.abs(armed.height - idle.height)
  report.dockDeltas.armedY = Math.abs(armed.y - idle.y)
  report.playCenterDeltas.armed = await assertPlayCentered(page)

  const actor = page.getByTestId('actor')
  const ab = await actor.boundingBox()
  if (!ab) throw new Error('missing actor for recording')
  const ax = ab.x + ab.width / 2
  const ay = ab.y + ab.height / 2
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  await page.mouse.move(ax + 28, ay - 14, { steps: 5 })
  await page.getByTestId('mode-status-label').waitFor({ state: 'visible' })
  const label = (await page.getByTestId('mode-status-label').textContent()) || ''
  if (!/Recording/i.test(label)) throw new Error(`expected Recording label: ${label}`)
  const recording = await dockBox(page)
  report.dockDeltas.recordingH = Math.abs(recording.height - idle.height)
  report.playCenterDeltas.recording = await assertPlayCentered(page)
  await page.mouse.move(ax + 120, ay + 40, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
  await page.getByTestId('playback-timeline').waitFor({ state: 'visible' })

  const paused = await dockBox(page)
  report.dockDeltas.pausedH = Math.abs(paused.height - idle.height)
  report.playCenterDeltas.paused = await assertPlayCentered(page)

  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor({ state: 'visible' })
  const playing = await dockBox(page)
  report.dockDeltas.playingH = Math.abs(playing.height - idle.height)
  report.playCenterDeltas.playing = await assertPlayCentered(page)
  await page.screenshot({ path: join(out, 'desktop-playing.png') })
  // Wait for play completion (loop off)
  await page.getByTestId('btn-play').waitFor({ state: 'visible', timeout: 20000 })

  for (const [k, v] of Object.entries(report.dockDeltas)) {
    if (v > 2) throw new Error(`dock unstable ${k}=${v}`)
  }
  report.dockStable = true

  // --- 3) Project must not retain Recording ---
  // Live region should already be clear after finish
  const liveAfter = (
    await page.getByTestId('action-live-region').textContent()
  )?.trim()
  if (liveAfter === 'Recording') {
    throw new Error('live region still Recording after take+play')
  }

  await page.getByTestId('btn-project').click()
  await page.getByTestId('project-panel').waitFor({ state: 'visible' })
  await page.getByTestId('save-status').waitFor({ state: 'visible' })
  const save = (await page.getByTestId('save-status').textContent())?.trim()
  report.saveStatus = save
  const actionStatusCount = await page.getByTestId('project-action-status').count()
  report.projectActionStatusCount = actionStatusCount
  const panelText = (await page.getByTestId('project-panel').textContent()) || ''
  report.projectContainsRecording = /Recording/.test(panelText)
  if (actionStatusCount !== 0) {
    throw new Error(`project-action-status still present (${actionStatusCount})`)
  }
  if (/Recording/.test(panelText)) {
    throw new Error('Project panel still contains Recording')
  }
  await page.screenshot({ path: join(out, 'desktop-project-after-play.png') })
  report.projectNotRecording = true

  report.ok = true
} catch (err) {
  report.error = String(err?.stack || err)
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {})
  throw err
} finally {
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

console.log(JSON.stringify(report, null, 2))
