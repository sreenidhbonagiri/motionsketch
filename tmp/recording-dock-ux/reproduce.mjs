/**
 * Reproduce recording-dock behaviors on the current build (before fixes).
 * Usage: MS_BASE=http://127.0.0.1:4177 node tmp/recording-dock-ux/reproduce.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'tmp/recording-dock-ux')
mkdirSync(outDir, { recursive: true })
const base = process.env.MS_BASE || 'http://127.0.0.1:4177'

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

async function dockSnapshot(page, label) {
  return page.evaluate((label) => {
    const dock = document.querySelector('[data-testid="playback-dock"]')
    const play = document.querySelector(
      '[data-testid="btn-play"],[data-testid="btn-pause"]',
    )
    const record = document.querySelector(
      '[data-testid="btn-record"],[data-testid="btn-stop"]',
    )
    const status = document.querySelector('[data-testid="dock-status"]')
    const editing = document.querySelector('[data-testid="dock-editing"]')
    const timeline = document.querySelector('[data-testid="playback-timeline"]')
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        x: +b.x.toFixed(1),
        y: +b.y.toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        top: +b.top.toFixed(1),
        bottom: +b.bottom.toFixed(1),
      }
    }
    const btn = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      return {
        disabled: el.disabled,
        title: el.getAttribute('title'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedBy: el.getAttribute('aria-describedby'),
        text: (el.textContent || '').trim().replace(/\s+/g, ' '),
      }
    }
    return {
      label,
      mode: window.__MS_MODE__ ?? null,
      dock: r(dock),
      play: r(play),
      record: r(record),
      status: status
        ? {
            box: r(status),
            kind: status.getAttribute('data-mode-status'),
            text: (status.textContent || '').trim().replace(/\s+/g, ' '),
          }
        : null,
      hasEditing: !!editing,
      hasTimeline: !!timeline,
      restart: btn('[data-testid="btn-restart"]'),
      undo: btn('[data-testid="btn-undo-transform"]'),
      redo: btn('[data-testid="btn-redo-transform"]'),
      reset: btn('[data-testid="btn-reset"]'),
      camera: (() => {
        try {
          return JSON.parse(localStorage.getItem('motionsketch.camera.v1') || 'null')
        } catch {
          return null
        }
      })(),
    }
  }, label)
}

const browser = await chromium.launch()
const findings = []

async function runViewport(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    const tick = () => {
      try {
        const raw = localStorage.getItem('motionsketch.project.v1')
        // mode lives in zustand memory; expose via data attr if present
        const shell = document.querySelector('[data-testid="app-shell"]')
        window.__MS_MODE__ =
          document.querySelector('[data-testid="dock-status"]')?.getAttribute(
            'data-mode-status',
          ) ??
          (document.querySelector('[data-testid="btn-stop"]')
            ? 'armed-or-recording'
            : document.querySelector('[data-testid="btn-pause"]')
              ? 'playing'
              : 'idle')
        void raw
        void shell
      } catch {
        /* ignore */
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto(base)
  await page.getByTestId('app-shell').waitFor()
  await dismissHints(page)

  const shots = []
  const snap = async (label) => {
    await page.screenshot({
      path: join(outDir, `${name}-${label}.png`),
      fullPage: false,
    })
    const s = await dockSnapshot(page, label)
    shots.push(s)
    return s
  }

  // Idle empty
  await snap('idle-empty')

  // Arm
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor()
  const armed = await snap('armed')

  // Empty-canvas drag while armed
  const camBefore = await page
    .getByTestId('workspace-world')
    .evaluate((el) => el.style.transform)
  const viewportEl = page.getByTestId('stage')
  const vbox = await viewportEl.boundingBox()
  // Drag empty area near bottom-left of canvas (avoid centered actor)
  const sx = vbox.x + 40
  const sy = vbox.y + vbox.height * 0.78
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 90, sy + 40, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  const stillArmed = await page.getByTestId('btn-stop').isVisible()
  const modeAfterMiss = await page
    .getByTestId('dock-status')
    .getAttribute('data-mode-status')
    .catch(() => null)
  const camAfter = await page
    .getByTestId('workspace-world')
    .evaluate((el) => el.style.transform)
  const miss = {
    stillArmed,
    modeAfterMiss,
    camBefore,
    camAfter,
    cameraChanged: camBefore !== camAfter,
    statusText: await page
      .getByTestId('dock-status')
      .innerText()
      .catch(() => null),
  }
  await snap('armed-after-empty-drag')
  findings.push({ viewport: name, phase: 'armed-empty-drag', miss, armed })

  // Cancel
  await page.getByTestId('btn-stop').click()
  await page.getByTestId('btn-record').waitFor()
  await snap('idle-after-cancel')

  // Record a path
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor()
  await dragActor(page, { x: 20, y: -10 }, { x: 140, y: 50 })
  await page.getByTestId('btn-play').waitFor()
  await dismissHints(page)
  const recorded = await snap('recorded-idle')

  // Undo state after first recording
  const undoAfterFirst = await page.evaluate(() => {
    // Probe via button disabled state
    const undo = document.querySelector('[data-testid="btn-undo-transform"]')
    return {
      undoDisabled: undo?.disabled ?? null,
      title: undo?.getAttribute('title'),
      ariaLabel: undo?.getAttribute('aria-label'),
    }
  })
  findings.push({ viewport: name, phase: 'undo-after-first-recording', undoAfterFirst })

  // Reset confirmation
  await page.getByTestId('btn-reset').click()
  const resetDialog = page.getByTestId('reset-actor-confirm')
  const resetVisible = await resetDialog.isVisible().catch(() => false)
  await snap('reset-confirm')
  if (resetVisible) {
    await page.getByTestId('btn-reset-actor-cancel').click()
  }
  findings.push({ viewport: name, phase: 'reset-confirm', resetVisible })

  // Re-record replace
  await page.getByTestId('btn-record').click()
  const confirm = page.getByTestId('btn-rerecord-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await page.getByTestId('btn-stop').waitFor()
  await snap('armed-rerecord')
  await dragActor(page, { x: 10, y: 10 }, { x: -80, y: -40 })
  await page.getByTestId('btn-play').waitFor()
  await dismissHints(page)
  const undoAfterReplace = await page.evaluate(() => {
    const undo = document.querySelector('[data-testid="btn-undo-transform"]')
    return {
      undoDisabled: undo?.disabled ?? null,
      title: undo?.getAttribute('title'),
    }
  })
  await snap('after-replace')
  findings.push({
    viewport: name,
    phase: 'undo-after-replace',
    undoAfterReplace,
  })

  // Playing
  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor()
  await snap('playing')
  await page.getByTestId('btn-pause').click()

  // Dock movement summary
  const byLabel = Object.fromEntries(shots.map((s) => [s.label, s]))
  findings.push({
    viewport: name,
    phase: 'dock-movement',
    idleEmpty: byLabel['idle-empty']?.dock,
    armed: byLabel['armed']?.dock,
    recorded: byLabel['recorded-idle']?.dock,
    playing: byLabel['playing']?.dock,
    playX: {
      idle: byLabel['idle-empty']?.play?.x,
      armed: byLabel['armed']?.play?.x,
      recorded: byLabel['recorded-idle']?.play?.x,
      playing: byLabel['playing']?.play?.x,
    },
    dockHeight: {
      idle: byLabel['idle-empty']?.dock?.h,
      armed: byLabel['armed']?.dock?.h,
      recorded: byLabel['recorded-idle']?.dock?.h,
      playing: byLabel['playing']?.dock?.h,
    },
    iconTooltips: {
      restart: byLabel['recorded-idle']?.restart,
      undo: byLabel['recorded-idle']?.undo,
      redo: byLabel['recorded-idle']?.redo,
    },
  })

  await ctx.close()
  return shots
}

await runViewport('desktop', { width: 1280, height: 800 })
await runViewport('mobile', { width: 390, height: 844 })
writeFileSync(join(outDir, 'repro-findings.json'), JSON.stringify(findings, null, 2))
console.log(JSON.stringify(findings, null, 2))
await browser.close()
