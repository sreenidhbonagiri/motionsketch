import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const CONTROLS = [
  'btn-toggle-actor-list',
  'btn-toggle-clip-timeline',
  'btn-record',
  'btn-play',
  'playback-scrubber',
  'btn-zoom-out',
  'btn-zoom-in',
  'btn-fit-stage',
]

function slim(doc) {
  if (!doc) return null
  const project = doc.project ?? doc
  return {
    name: project.name,
    playback: project.playback,
    stageWidth: project.stageWidth,
    stageHeight: project.stageHeight,
    stageAspect: project.stageAspect,
    actors: (project.actors ?? []).map((a) => ({
      name: a.name,
      rest: a.restPosition,
      smoothing: a.smoothing,
      steadySpeed: a.steadySpeed,
      glide: a.glide,
      clip: a.clip,
      samples: a.recording?.samples?.length ?? 0,
      geometry: a.geometryEdit,
      keys: a.transform?.keyframes?.length ?? 0,
      kind: a.appearance?.kind,
      size: a.appearance?.size,
      color: a.appearance?.color,
      radius: a.appearance?.cornerRadius ?? a.appearance?.radius,
    })),
  }
}

async function fingerprint(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('motionsketch.project.v1')
    return {
      raw,
      prefs: {
        actors: sessionStorage.getItem('motionsketch.actorsPanelOpen'),
        sequence: sessionStorage.getItem('motionsketch.sequencePanelOpen'),
      },
      inner: [window.innerWidth, window.innerHeight],
    }
  })
}

function sameState(a, b) {
  const left = slim(a.raw ? JSON.parse(a.raw) : null)
  const right = slim(b.raw ? JSON.parse(b.raw) : null)
  return {
    project: JSON.stringify(left) === JSON.stringify(right),
    prefs: JSON.stringify(a.prefs) === JSON.stringify(b.prefs),
    left,
    right,
    prefsLeft: a.prefs,
    prefsRight: b.prefs,
  }
}

async function hit(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!(el instanceof HTMLElement)) return { owned: false, hit: 'missing' }
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return { owned: false, hit: 'zero-size' }
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    if (!(top instanceof Element)) return { owned: false, hit: 'none' }
    const label = el.closest('label')
    const owned =
      el.contains(top) ||
      top.contains(el) ||
      (label instanceof HTMLElement && label.contains(top))
    return {
      owned,
      hit: top.closest('[data-testid]')?.getAttribute('data-testid') ?? top.tagName.toLowerCase(),
    }
  }, testId)
}

async function clickOwned(page, testId) {
  const target = await hit(page, testId)
  if (!target.owned) {
    return { clicked: false, ...target }
  }
  await page.getByTestId(testId).click({ timeout: 4000 })
  return { clicked: true, ...target }
}

async function wheelPanel(page, id) {
  const metrics = await page.evaluate((panelId) => {
    const root = document.querySelector(`[data-testid="${panelId}-panel-root"]`)
    const scroller = root?.querySelector('.overflow-y-auto')
    if (!(scroller instanceof HTMLElement)) return { ok: false, reason: 'no scroller' }
    const rect = scroller.getBoundingClientRect()
    return {
      ok: true,
      overflow: Math.round(scroller.scrollHeight - scroller.clientHeight),
      x: rect.left + rect.width / 2,
      y: Math.min(rect.bottom - 12, Math.max(rect.top + 12, rect.top + rect.height / 2)),
      top: scroller.scrollTop,
      clientHeight: Math.round(rect.height),
    }
  }, id)
  if (!metrics.ok || metrics.overflow <= 2) {
    return { ...metrics, scrolled: false, reason: metrics.ok ? 'content fits' : metrics.reason }
  }
  await page.mouse.move(metrics.x, metrics.y)
  await page.mouse.wheel(0, 280)
  await page.waitForTimeout(80)
  const after = await page.evaluate((panelId) => {
    const root = document.querySelector(`[data-testid="${panelId}-panel-root"]`)
    const scroller = root?.querySelector('.overflow-y-auto')
    return scroller instanceof HTMLElement ? scroller.scrollTop : -1
  }, id)
  await page.mouse.wheel(0, -400)
  return {
    overflow: metrics.overflow,
    clientHeight: metrics.clientHeight,
    scrolled: after > metrics.top + 2,
    from: metrics.top,
    to: after,
  }
}

async function uncoveredBlocked(page, id) {
  return page.evaluate(({ panelId, controls }) => {
    const panel = document.querySelector(`[data-testid="${panelId}-panel-root"]`)
    if (!(panel instanceof HTMLElement)) return ['panel missing']
    const pr = panel.getBoundingClientRect()
    const problems = []
    for (const controlId of controls) {
      const el = document.querySelector(`[data-testid="${controlId}"]`)
      if (!(el instanceof HTMLElement)) continue
      const rect = el.getBoundingClientRect()
      for (let x = rect.left + 4; x <= rect.right - 4; x += 14) {
        for (let y = rect.top + 4; y <= rect.bottom - 4; y += 12) {
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
          const inside =
            x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom
          if (inside) continue
          const top = document.elementFromPoint(x, y)
          if (!(top instanceof Element)) {
            problems.push(`${controlId} @${Math.round(x)},${Math.round(y)} hit none`)
            continue
          }
          if (el.contains(top) || top.contains(el)) continue
          if (panel.contains(top)) continue
          const hit = top.closest('[data-testid]')?.getAttribute('data-testid') ?? top.tagName
          problems.push(`${controlId} visible @${Math.round(x)},${Math.round(y)} hit ${hit}`)
        }
      }
    }
    return problems.slice(0, 8)
  }, { panelId: id, controls: CONTROLS })
}

async function restored(page) {
  const out = {}
  for (const id of CONTROLS) {
    const el = page.getByTestId(id)
    if ((await el.count()) === 0) {
      out[id] = 'missing'
      continue
    }
    await el.evaluate((node) => {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    const result = await hit(page, id)
    out[id] = result.owned ? 'owned' : `blocked:${result.hit}`
  }
  return out
}

async function skipTutorial(page) {
  try {
    await page.getByTestId('tutorial-coach').waitFor({ state: 'visible', timeout: 2000 })
    await page.getByTestId('btn-tutorial-skip').click()
    const fresh = page.getByTestId('btn-tutorial-start-fresh')
    if (await fresh.isVisible().catch(() => false)) await fresh.click()
  } catch {
    // no coach
  }
}

async function boot(page) {
  page.setDefaultTimeout(8000)
  await page.goto('http://localhost:5173/')
  await page.getByTestId('app-shell').waitFor()
  await skipTutorial(page)
  await page.getByTestId('btn-record').click()
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 48, sy + 18, { steps: 6 })
  await page.mouse.up()
  await page.getByTestId('btn-play').waitFor()
  const list = page.getByTestId('btn-toggle-actor-list')
  if ((await list.getAttribute('aria-expanded')) !== 'true') await list.click()
  const timing = page.getByTestId('btn-toggle-clip-timeline')
  if ((await timing.getAttribute('aria-expanded')) !== 'true') await timing.click()
  await page.waitForTimeout(400)
}

async function projectPrimary(page) {
  await page.getByTestId('btn-download-project').evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const owned = await hit(page, 'btn-download-project')
  if (!owned.owned) return { action: 'download-project', ...owned, clicked: false }
  const download = page.waitForEvent('download', { timeout: 8000 })
  await page.getByTestId('btn-download-project').click()
  const file = await download
  const name = file.suggestedFilename()
  await file.cancel().catch(() => {})
  return { action: 'download-project', clicked: true, owned: true, filename: name }
}

async function adjustPrimary(page) {
  await page.getByTestId('loop-toggle').evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const owned = await hit(page, 'loop-toggle')
  if (!owned.owned) return { action: 'loop-toggle', ...owned, clicked: false }
  const before = await page.getByTestId('loop-toggle').isChecked()
  await page.getByTestId('loop-toggle').click()
  const mid = await page.getByTestId('loop-toggle').isChecked()
  await page.getByTestId('loop-toggle').click()
  const after = await page.getByTestId('loop-toggle').isChecked()
  return {
    action: 'loop-toggle',
    clicked: true,
    owned: true,
    before,
    mid,
    after,
    toggledAndRestored: mid !== before && after === before,
  }
}

async function appearancePrimary(page) {
  await page.getByTestId('actor-kind-shape').evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const owned = await hit(page, 'actor-kind-shape')
  if (!owned.owned) return { action: 'kind-shape', ...owned, clicked: false }
  await page.getByTestId('actor-kind-shape').click()
  const checked = await page.getByTestId('actor-kind-shape').isChecked()
  return { action: 'kind-shape', clicked: true, owned: true, checked }
}

async function exportPrimary(page) {
  await page.getByTestId('btn-download-web-package').evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const owned = await hit(page, 'btn-download-web-package')
  if (!owned.owned) return { action: 'download-website', ...owned, clicked: false }
  const download = page.waitForEvent('download', { timeout: 15000 })
  await page.getByTestId('btn-download-web-package').click()
  const file = await download
  const name = file.suggestedFilename()
  await file.cancel().catch(() => {})
  return { action: 'download-website', clicked: true, owned: true, filename: name }
}

async function auditPanel(page, id, primary) {
  const before = await fingerprint(page)
  const open = await clickOwned(page, `btn-${id}`)
  await page.getByTestId(`${id}-panel-root`).waitFor({ state: 'visible' })
  const scroll = await wheelPanel(page, id)
  const blocked = await uncoveredBlocked(page, id)
  let primaryResult
  try {
    primaryResult = await primary(page)
  } catch (error) {
    primaryResult = { clicked: false, error: String(error).split('\n')[0] }
  }
  const close = await clickOwned(page, `btn-close-${id}`)
  await page.getByTestId(`${id}-panel-root`).waitFor({ state: 'hidden' })
  await page.waitForTimeout(250)
  const after = await fingerprint(page)
  const compare = sameState(before, after)
  const access = await restored(page)
  return {
    open,
    scroll,
    blocked,
    primary: primaryResult,
    close,
    projectUnchanged: compare.project,
    prefsUnchanged: compare.prefs,
    prefs: compare.prefsRight,
    access,
  }
}

async function timingTask(page, elementsOpen) {
  const list = page.getByTestId('btn-toggle-actor-list')
  const timing = page.getByTestId('btn-toggle-clip-timeline')
  const listOpen = (await list.getAttribute('aria-expanded')) === 'true'
  if (elementsOpen && !listOpen) await list.click()
  if (!elementsOpen && listOpen) await list.click()
  if ((await timing.getAttribute('aria-expanded')) !== 'true') await timing.click()
  await page.waitForTimeout(500)
  const metrics = await page.evaluate(() => {
    const body = document.querySelector('[data-testid="sequence-panel-body"]')
    const panel = document.querySelector('[data-testid="clip-timeline"]')
    const br = body instanceof HTMLElement ? body.getBoundingClientRect() : null
    const pr = panel instanceof HTMLElement ? panel.getBoundingClientRect() : null
    return {
      bodyH: br ? Math.round(br.height) : 0,
      bodyScroll: body instanceof HTMLElement ? Math.round(body.scrollHeight - body.clientHeight) : 0,
      panelH: pr ? Math.round(pr.height) : 0,
    }
  })
  let reached = false
  let last = null
  const body = page.getByTestId('sequence-panel-body')
  for (let i = 0; i < 16; i++) {
    last = await hit(page, 'clip-start-input')
    const visible = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="clip-start-input"]')
      const scroller = document.querySelector('[data-testid="sequence-panel-body"]')
      if (!(input instanceof HTMLElement) || !(scroller instanceof HTMLElement)) return 0
      const ir = input.getBoundingClientRect()
      const sr = scroller.getBoundingClientRect()
      const top = Math.max(ir.top, sr.top)
      const bottom = Math.min(ir.bottom, sr.bottom)
      return Math.round(bottom - top)
    })
    if (last.owned && visible >= 28) {
      reached = true
      break
    }
    const box = await body.boundingBox()
    if (!box || box.height < 12) break
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, box.height - 4))
    await page.mouse.wheel(0, 140)
    await page.waitForTimeout(40)
  }
  const result = { elementsOpen, metrics, reached, lastHit: last }
  if (!reached) {
    result.usable = false
    return result
  }
  await page.getByTestId('clip-start-input').fill('0.20')
  await page.getByTestId('clip-move-for-input').evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const moveHit = await hit(page, 'clip-move-for-input')
  if (!moveHit.owned) {
    const box = await body.boundingBox()
    if (box && box.height >= 12) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, 160)
    }
  }
  await page.getByTestId('clip-move-for-input').fill('0.80')
  await page.getByTestId('btn-apply-clip-times').evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const apply = await clickOwned(page, 'btn-apply-clip-times')
  await page.waitForTimeout(200)
  const values = await page.evaluate(() => ({
    start: document.querySelector('[data-testid="clip-start-input"]')?.value ?? null,
    move: document.querySelector('[data-testid="clip-move-for-input"]')?.value ?? null,
  }))
  const collapse = await clickOwned(page, 'btn-toggle-clip-timeline')
  const expanded = await page.getByTestId('btn-toggle-clip-timeline').getAttribute('aria-expanded')
  result.apply = apply
  result.values = values
  result.collapse = collapse
  result.expandedAfter = expanded
  result.usable =
    apply.clicked &&
    values.start === '0.20' &&
    values.move === '0.80' &&
    expanded === 'false'
  return result
}

const viewports = [
  [1280, 720],
  [850, 650],
  [390, 844],
  [390, 560],
]
const primaries = [
  ['project', projectPrimary],
  ['adjust', adjustPrimary],
  ['appearance', appearancePrimary],
  ['export', exportPrimary],
]

await mkdir('tmp/layout-audit', { recursive: true })
const browser = await chromium.launch()
const report = { viewports: [], timing: [] }
for (const [w, h] of viewports) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const entry = { viewport: [w, h], panels: {} }
  try {
    await boot(page)
    entry.inner = await page.evaluate(() => [window.innerWidth, window.innerHeight])
    for (const [id, primary] of primaries) {
      try {
        entry.panels[id] = await auditPanel(page, id, primary)
      } catch (error) {
        entry.panels[id] = { error: String(error).split('\n')[0] }
      }
    }
  } catch (error) {
    entry.error = String(error).split('\n')[0]
  }
  report.viewports.push(entry)
  await page.close()
}

const short = await browser.newPage({ viewport: { width: 390, height: 560 }, deviceScaleFactor: 1 })
try {
  await boot(short)
  report.timing.push(await timingTask(short, true))
  report.timing.push(await timingTask(short, false))
} catch (error) {
  report.timing.push({ error: String(error).split('\n')[0] })
}
await short.close()
await browser.close()
await writeFile('tmp/layout-audit/report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
