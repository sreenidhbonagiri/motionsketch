import { chromium } from '@playwright/test'
import { mkdir, writeFile, cp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const outDir = 'tmp/walkthrough'
await mkdir(outDir, { recursive: true })

function projectFrom(raw) {
  if (!raw) return null
  const snap = JSON.parse(raw)
  return snap.project
}

function summarize(project) {
  const actor = project?.actors?.[0]
  const samples = actor?.recording?.samples ?? []
  const first = samples[0]
  const last = samples[samples.length - 1]
  return {
    name: project?.name ?? null,
    samples: samples.length,
    durationMs: project?.playback?.durationMs ?? null,
    first: first ? [first.x, first.y] : null,
    last: last ? [last.x, last.y] : null,
    geometry: actor?.geometryEdit ? 'edited' : 'recorded',
  }
}

const browser = await chromium.launch()
const report = []

async function shot(page, name) {
  await page.screenshot({ path: `${outDir}/${name}.png` })
}

async function coach(page) {
  const card = page.getByTestId('tutorial-coach-card')
  if (!(await card.isVisible().catch(() => false))) return null
  return {
    step: (await page.getByTestId('tutorial-step-label').textContent())?.trim(),
    title: (await page.getByTestId('tutorial-coach-title').textContent())?.trim(),
    body: (await page.getByTestId('tutorial-coach-body').textContent())?.trim(),
  }
}

async function overlap(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    const card = document.querySelector('[data-testid="tutorial-coach-card"]')
    if (!(el instanceof HTMLElement)) return { missing: true }
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const hit = document.elementFromPoint(cx, cy)
    const owned = !!hit && (el === hit || el.contains(hit) || hit.contains(el))
    let cardCovers = false
    if (card instanceof HTMLElement) {
      const c = card.getBoundingClientRect()
      cardCovers = cx >= c.left && cx <= c.right && cy >= c.top && cy <= c.bottom
    }
    return {
      missing: false,
      inView: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
      owned,
      cardCovers,
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  }, testId)
}

async function savedRaw(page) {
  await page.getByTestId('header-save-status').filter({ hasText: 'Saved in this browser' }).waitFor({ timeout: 8000 })
  return page.evaluate(() => localStorage.getItem('motionsketch.project.v1'))
}

async function dragActor(page, dx, dy) {
  const box = await page.getByTestId('actor').boundingBox()
  if (!box) throw new Error('actor has no box')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.mouse.up()
}

async function walk(viewport) {
  const tag = `${viewport.width}x${viewport.height}`
  const notes = { hesitation: [], unclear: [], layout: [], failures: [] }
  const log = []
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const step = async (name, fn) => {
    try {
      const detail = await fn()
      log.push({ name, ok: true, detail: detail ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
      log.push({ name, ok: false, detail: message })
      notes.failures.push(`${name}: ${message}`)
      await shot(page, `${tag}-${name}-fail`).catch(() => {})
    }
  }

  await step('fresh-visit', async () => {
    await page.goto('http://localhost:5173/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByTestId('app-shell').waitFor()
    await page.getByTestId('tutorial-coach-title').waitFor()
    const text = await coach(page)
    const record = await overlap(page, 'btn-record')
    if (record.cardCovers || !record.owned) {
      notes.layout.push(`Draw step: Record control covered or not hit-testable (${JSON.stringify(record)})`)
    }
    await shot(page, `${tag}-tutorial-draw`)
    return { text, record }
  })

  await step('tutorial-draw', async () => {
    const before = await coach(page)
    if (!before?.body?.includes('Click Record')) {
      notes.unclear.push(`Expected record instruction, saw: ${before?.body}`)
    }
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await page.getByTestId('tutorial-coach-body').filter({ hasText: 'Drag the plane' }).waitFor()
    const drag = await coach(page)
    const plane = await overlap(page, 'actor')
    if (plane.cardCovers) notes.layout.push('Drag step: coach covers the plane')
    await dragActor(page, 90, -50)
    await page.getByTestId('tutorial-coach-title').filter({ hasText: 'Watch it move' }).waitFor()
    return { before, drag }
  })

  await step('tutorial-play', async () => {
    const idle = await coach(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).waitFor()
    const next = await coach(page)
    if (!next?.body?.toLowerCase().includes('next')) {
      notes.unclear.push(`After play, coach said: ${next?.body}`)
    }
    await shot(page, `${tag}-tutorial-play`)
    return { idle, next }
  })

  await step('tutorial-export-finish', async () => {
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const open = await coach(page)
    const exportBtn = await overlap(page, 'btn-export')
    if (exportBtn.cardCovers || !exportBtn.owned) {
      notes.layout.push(`Export step: Export button not cleanly clickable (${JSON.stringify(exportBtn)})`)
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByTestId('export-panel-root').waitFor()
    const inside = await coach(page)
    await shot(page, `${tag}-tutorial-export`)
    const finish = page.getByRole('button', { name: 'Finish tutorial' })
    const finishBox = await finish.boundingBox()
    if (!finishBox) notes.layout.push('Finish tutorial is not visible after opening Export')
    await finish.click()
    const dialog = page.getByTestId('tutorial-keep-confirm')
    await dialog.waitFor()
    const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ')
    await shot(page, `${tag}-tutorial-keep`)
    await page.getByRole('button', { name: 'Start fresh' }).click()
    await page.getByTestId('tutorial-coach').waitFor({ state: 'hidden' })
    return { open, inside, dialogText }
  })

  await step('record-outside-tutorial', async () => {
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    const hint = await page.getByTestId('mode-status-instruction').textContent().catch(() => null)
    await dragActor(page, 70, -40)
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor()
    await page.getByTestId('header-save-status').filter({ hasText: 'Saved in this browser' }).waitFor()
    return { hint }
  })

  await step('play-extend-edit', async () => {
    const before = summarize(projectFrom(await savedRaw(page)))
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor()
    const extend = page.getByRole('button', { name: 'Extend path' })
    if (!(await extend.isEnabled())) {
      const title = await extend.getAttribute('title')
      throw new Error(`Extend path disabled: ${title}`)
    }
    const extendBox = await extend.boundingBox()
    if (!extendBox || extendBox.y > viewport.height || extendBox.y < 0) {
      notes.layout.push('Extend path is outside the viewport before click')
    }
    await extend.click()
    const extendHint = await page.getByTestId('mode-status-instruction').textContent()
    await dragActor(page, 40, 35)
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor()
    const extended = summarize(projectFrom(await savedRaw(page)))
    if (extended.samples <= before.samples) {
      notes.failures.push(`Extend did not add samples (${before.samples} -> ${extended.samples})`)
    }
    await page.getByRole('button', { name: 'Edit path' }).click()
    await page.getByRole('button', { name: 'Edit points' }).waitFor()
    const handle = page.locator('[data-testid^="path-handle-"]').nth(1)
    const hb = await handle.boundingBox()
    if (!hb) throw new Error('no path handle to drag')
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + 36, hb.y - 24, { steps: 8 })
    await page.mouse.up()
    await page.getByRole('button', { name: 'Done' }).click()
    const edited = summarize(projectFrom(await savedRaw(page)))
    await shot(page, `${tag}-after-edit`)
    return { before, extendHint, extended, edited }
  })

  let snapshot = null
  await step('skip-restores-saved-project', async () => {
    snapshot = await savedRaw(page)
    const before = summarize(projectFrom(snapshot))
    await page.getByRole('button', { name: 'Help', exact: true }).click()
    await page.getByRole('button', { name: 'Restart tutorial' }).click()
    await page.getByTestId('tutorial-coach-title').waitFor()
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await dragActor(page, 60, -30)
    await page.getByTestId('tutorial-coach-title').filter({ hasText: 'Watch it move' }).waitFor()
    const during = await page.evaluate(() => localStorage.getItem('motionsketch.project.v1'))
    if (during !== snapshot) {
      notes.failures.push('Saved project changed while the tutorial practice was open')
    }
    await page.getByRole('button', { name: 'Skip tutorial' }).click()
    const dialog = page.getByTestId('tutorial-keep-confirm')
    await dialog.waitFor()
    const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ')
    await shot(page, `${tag}-skip-restore`)
    if (!dialogText.includes('Restore previous project')) {
      notes.unclear.push(`Skip dialog did not offer restore: ${dialogText}`)
    }
    await page.getByRole('button', { name: 'Restore previous project' }).click()
    await page.getByTestId('tutorial-coach').waitFor({ state: 'hidden' })
    const afterRaw = await savedRaw(page)
    const after = summarize(projectFrom(afterRaw))
    const same = JSON.stringify(projectFrom(snapshot)) === JSON.stringify(projectFrom(afterRaw))
    if (!same) notes.failures.push(`Restore changed project data. Before ${JSON.stringify(before)} after ${JSON.stringify(after)}`)
    return { before, after, same, dialogText, storageSame: during === snapshot }
  })

  await step('export-html-and-react', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByTestId('export-html-folder-layout').waitFor()
    const folder = (await page.getByTestId('export-html-folder-layout').innerText()).replace(/\s+/g, ' ')
    const head = await page.getByTestId('export-html-section-head-code').inputValue()
    const body = await page.getByTestId('export-html-section-body-code').inputValue()
    const scripts = await page.getByTestId('export-html-section-scripts-code').inputValue()
    const webDl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download for your website' }).click()
    const web = await webDl
    await web.saveAs(`${outDir}/${tag}-web.zip`)
    await page.getByRole('button', { name: 'View integration instructions' }).click()
    await page.getByTestId('export-html-steps').waitFor()
    await page.getByRole('button', { name: 'React', exact: true }).click()
    const example = await page.getByTestId('export-react-example-code').inputValue()
    const steps = (await page.getByTestId('export-react-steps').innerText()).replace(/\s+/g, ' ')
    const reactDl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download React package' }).click()
    const react = await reactDl
    await react.saveAs(`${outDir}/${tag}-react.zip`)
    const reactFeedback = await page.getByTestId('export-react-download-success').innerText()
    const htmlFeedbackVisible = await page.getByTestId('export-download-success').isVisible().catch(() => false)
    if (htmlFeedbackVisible) notes.failures.push('HTML success still visible on the React tab')
    await writeFile(`${outDir}/${tag}-head.html`, head)
    await writeFile(`${outDir}/${tag}-body.html`, body)
    await writeFile(`${outDir}/${tag}-scripts.html`, scripts)
    await writeFile(`${outDir}/${tag}-react-example.txt`, example)
    return {
      folder,
      steps,
      reactFeedback,
      exampleStart: example.split('\n')[0],
    }
  })

  await step('reload-survives', async () => {
    const before = summarize(projectFrom(await savedRaw(page)))
    await page.reload()
    await page.getByTestId('app-shell').waitFor()
    await page.getByTestId('tutorial-coach').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {})
    const coachVisible = await page.getByTestId('tutorial-coach').isVisible().catch(() => false)
    if (coachVisible) notes.failures.push('Tutorial restarted on reload of a saved project')
    const after = summarize(projectFrom(await page.evaluate(() => localStorage.getItem('motionsketch.project.v1'))))
    const nameOnScreen = (await page.getByTestId('btn-rename-project').textContent())?.trim()
    if (nameOnScreen !== before.name) notes.failures.push(`Reloaded name ${nameOnScreen} != ${before.name}`)
    if (after.samples !== before.samples) notes.failures.push(`Reloaded samples ${after.samples} != ${before.samples}`)
    await shot(page, `${tag}-reloaded`)
    return { before, after, nameOnScreen, coachVisible }
  })

  await context.close()
  report.push({ tag, notes, log })
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  await walk(viewport)
}

async function verifyConsumers(tag) {
  const hostDir = `${outDir}/${tag}-site`
  await rm(hostDir, { recursive: true, force: true })
  await mkdir(hostDir, { recursive: true })
  await rm(`${outDir}/${tag}-unzip-web`, { recursive: true, force: true })
  execFileSync('unzip', ['-qo', `${outDir}/${tag}-web.zip`, '-d', `${outDir}/${tag}-unzip-web`])
  await cp(`${outDir}/${tag}-unzip-web/animation.css`, `${hostDir}/animation.css`)
  await cp(`${outDir}/${tag}-unzip-web/ms-trigger.js`, `${hostDir}/ms-trigger.js`)
  const head = await (await import('node:fs/promises')).readFile(`${outDir}/${tag}-head.html`, 'utf8')
  const body = await (await import('node:fs/promises')).readFile(`${outDir}/${tag}-body.html`, 'utf8')
  const scripts = await (await import('node:fs/promises')).readFile(`${outDir}/${tag}-scripts.html`, 'utf8')
  await writeFile(`${hostDir}/about.html`, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Existing</title>${head}</head><body><h1>Existing page</h1>${body}${scripts}</body></html>`)
  const hostBrowser = await chromium.launch()
  const host = await hostBrowser.newPage()
  await host.goto(pathToFileURL(`${hostDir}/about.html`).href)
  await host.waitForTimeout(1400)
  const html = await host.evaluate(() => {
    const actor = document.querySelector('.ms-actor')
    const anim = actor?.getAnimations?.().find((item) => item.animationName)
    const stage = document.querySelector('.ms-stage')?.getBoundingClientRect()
    return {
      title: document.querySelector('h1')?.textContent ?? null,
      stage: stage ? Math.round(stage.width) : 0,
      state: anim?.playState ?? null,
      play: document.querySelector('[data-ms-play]')?.textContent ?? null,
    }
  })
  await hostBrowser.close()
  return { html }
}

const consumers = {}
for (const tag of ['1280x720', '390x844']) {
  try {
    consumers[tag] = await verifyConsumers(tag)
  } catch (error) {
    consumers[tag] = { error: error instanceof Error ? error.message.split('\n')[0] : String(error) }
  }
}
await writeFile(`${outDir}/report.json`, JSON.stringify({ report, consumers }, null, 2))
console.log(JSON.stringify({
  consumers,
  runs: report.map((item) => ({
    tag: item.tag,
    notes: item.notes,
    steps: item.log.map((entry) => ({ name: entry.name, ok: entry.ok, detail: entry.detail })),
  })),
}, null, 2))
await browser.close()
