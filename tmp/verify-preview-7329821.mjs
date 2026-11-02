/**
 * Hosted preview verification for commit 7329821.
 * Run: node tmp/verify-preview-7329821.mjs [url]
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'

const PREVIEW =
  process.argv[2] || 'https://spry-zircon-egrg2oh.tmp.now'
const OUT = '/tmp/ms-preview-verify-7329821'
mkdirSync(OUT, { recursive: true })

const results = []
function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`FAIL  ${name} — ${detail}`)
}

async function dragActor(page, from, to) {
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  if (!box) throw new Error('actor missing')
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 2, sy + 1, { steps: 2 })
  await page.mouse.move(sx + from.x, sy + from.y, { steps: 8 })
  await page.mouse.move(sx + to.x, sy + to.y, { steps: 12 })
  await page.waitForTimeout(60)
  await page.mouse.up()
}

async function panEmpty(page, a, b) {
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
}

async function readCamera(page) {
  return page.evaluate(() => {
    const world = document.querySelector('[data-testid="workspace-world"]')
    const transform = world?.style?.transform ?? ''
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(
      transform,
    )
    return {
      panX: m ? Number(m[1]) : NaN,
      panY: m ? Number(m[2]) : NaN,
      zoom: m ? Number(m[3]) : NaN,
      zoomLabel:
        document.querySelector('[data-testid="zoom-percent"]')?.textContent?.trim() ??
        '',
    }
  })
}

async function readStageMeta(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('motionsketch.project.v1')
    if (!raw) return null
    const doc = JSON.parse(raw)
    const p = doc.project
    const actor = p.actors?.[0]
    return {
      stageWidth: p.stageWidth,
      stageHeight: p.stageHeight,
      stageAspect: p.stageAspect,
      sampleCount: actor?.recording?.samples?.length ?? 0,
      first: actor?.recording?.samples?.[0] ?? null,
    }
  })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.setDefaultTimeout(20000)

try {
  await page.goto(PREVIEW, { waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  pass('load', PREVIEW)

  // Dismiss example hint if present
  const dismissHint = page.getByTestId('btn-dismiss-examples-hint')
  if (await dismissHint.isVisible().catch(() => false)) {
    await dismissHint.click()
  }

  // --- Record → Continue path → Play ---
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  await dragActor(page, { x: 30, y: -20 }, { x: 160, y: 50 })
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  pass('record path')

  await page.getByTestId('btn-continue-path').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  await dragActor(page, { x: 4, y: 2 }, { x: 80, y: -40 })
  await page.getByTestId('btn-record').waitFor({ state: 'visible' })
  const samplesAfterContinue = await readStageMeta(page)
  if ((samplesAfterContinue?.sampleCount ?? 0) < 10) {
    fail('continue path', `sampleCount=${samplesAfterContinue?.sampleCount}`)
  } else {
    pass('continue path', `${samplesAfterContinue.sampleCount} samples`)
  }

  await page.getByTestId('btn-play').click()
  await page.getByTestId('btn-pause').waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  await page.getByTestId('btn-pause').click()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  pass('play / pause')

  // --- Pan / zoom / Fit ---
  const beforeZoom = await readCamera(page)
  await page.getByTestId('btn-zoom-in').click()
  await page.getByTestId('btn-zoom-in').click()
  const zoomed = await readCamera(page)
  if (!(zoomed.zoom > beforeZoom.zoom)) {
    fail('zoom in', JSON.stringify({ beforeZoom, zoomed }))
  } else {
    pass('zoom in', `${beforeZoom.zoomLabel} → ${zoomed.zoomLabel}`)
  }

  const beforePan = await readCamera(page)
  await panEmpty(page, { x: 80, y: 520 }, { x: 180, y: 580 })
  const afterPan = await readCamera(page)
  const panDelta = Math.hypot(
    afterPan.panX - beforePan.panX,
    afterPan.panY - beforePan.panY,
  )
  if (!(panDelta > 5)) {
    fail('pan', `delta=${panDelta}`)
  } else {
    pass('pan', `delta=${panDelta.toFixed(1)}`)
  }

  await page.getByTestId('btn-fit-stage').click()
  await page.getByTestId('zoom-percent').waitFor()
  const fit = await readCamera(page)
  if (fit.zoomLabel !== '100%') {
    fail('fit stage', fit.zoomLabel)
  } else {
    pass('fit stage', '100%')
  }

  // --- Resize stage → reload preserves ---
  await page.getByTestId('btn-project').click()
  await page.getByTestId('project-panel-root').waitFor({ state: 'visible' })
  const section = page.getByTestId('stage-size-section')
  await section.scrollIntoViewIfNeeded()
  await page.getByTestId('stage-size-width').fill('2000')
  await page.getByTestId('stage-size-height').fill('1250')
  await page.getByTestId('stage-size-anchor-center').click()
  await page.getByTestId('btn-stage-resize').click()
  await page.getByTestId('stage-size-error').waitFor({ state: 'detached' }).catch(() => {})
  await page.getByTestId('save-status').filter({ hasText: 'Saved' }).waitFor({
    timeout: 10000,
  })
  // Close project panel so chrome does not cover later dock actions
  const closeProject = page.getByTestId('btn-close-project')
  if (await closeProject.isVisible().catch(() => false)) {
    await closeProject.click()
  }
  const beforeReload = await readStageMeta(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  const afterReload = await readStageMeta(page)
  if (
    afterReload?.stageWidth === 2000 &&
    afterReload?.stageHeight === 1250 &&
    afterReload?.sampleCount === beforeReload?.sampleCount &&
    afterReload?.sampleCount > 0
  ) {
    pass(
      'resize + reload',
      `${afterReload.stageWidth}×${afterReload.stageHeight}, ${afterReload.sampleCount} samples`,
    )
  } else {
    fail(
      'resize + reload',
      JSON.stringify({ beforeReload, afterReload }),
    )
  }

  // --- Reset motion confirm / cancel ---
  await page.getByTestId('btn-reset').click()
  await page.getByTestId('btn-reset-actor-cancel').waitFor({ state: 'visible' })
  await page.getByTestId('btn-reset-actor-cancel').click()
  await page.getByTestId('btn-reset-actor-cancel').waitFor({ state: 'hidden' })
  const afterCancel = await readStageMeta(page)
  if (afterCancel?.sampleCount === afterReload?.sampleCount) {
    pass('reset cancel preserves motion', `${afterCancel.sampleCount} samples`)
  } else {
    fail('reset cancel', JSON.stringify(afterCancel))
  }

  await page.getByTestId('btn-reset').click()
  await page.getByTestId('btn-reset-actor-confirm').click()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  // Play should be disabled without a path
  const playDisabled = await page.getByTestId('btn-play').isDisabled()
  const afterConfirm = await readStageMeta(page)
  if (playDisabled && (afterConfirm?.sampleCount ?? 0) === 0) {
    pass('reset confirm clears motion')
  } else {
    fail(
      'reset confirm',
      JSON.stringify({ playDisabled, afterConfirm }),
    )
  }

  // Re-record for website package download
  await page.getByTestId('btn-record').click()
  await page.getByTestId('btn-stop').waitFor({ state: 'visible' })
  await dragActor(page, { x: 20, y: -10 }, { x: 140, y: 40 })
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })

  // --- Download website package ---
  await page.getByTestId('btn-export').click()
  await page.getByTestId('export-panel-root').waitFor({ state: 'visible' })
  const websiteBtn = page.getByTestId('btn-download-web-package')
  await websiteBtn.scrollIntoViewIfNeeded()
  const downloadPromise = page.waitForEvent('download')
  await websiteBtn.click()
  const download = await downloadPromise
  const zipPath = join(OUT, download.suggestedFilename() || 'website.zip')
  await download.saveAs(zipPath)
  const zipBytes = new Uint8Array(readFileSync(zipPath))
  const files = unzipSync(zipBytes)
  const names = Object.keys(files)
  const htmlName =
    names.find((n) => /(^|\/)index\.html$/i.test(n)) ||
    names.find((n) => n.endsWith('.html'))
  if (!htmlName) {
    fail('website package zip', `files=${names.join(',')}`)
  } else {
    pass('website package download', names.join(', '))
    // Preserve relative paths from the zip for linked CSS/JS.
    for (const [name, data] of Object.entries(files)) {
      const dest = join(OUT, name)
      mkdirSync(join(dest, '..'), { recursive: true })
      writeFileSync(dest, data)
    }

    // Open extracted HTML as file or via data — use a simple static server from OUT
    const { createServer } = await import('node:http')
    const { readFile } = await import('node:fs/promises')
    const server = createServer(async (req, res) => {
      const url = (req.url || '/').split('?')[0]
      const file = url === '/' ? 'index.html' : url.slice(1)
      try {
        const body = await readFile(join(OUT, file))
        const type = file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.js')
            ? 'text/javascript'
            : 'text/html'
        res.writeHead(200, { 'Content-Type': type })
        res.end(body)
      } catch {
        res.writeHead(404)
        res.end('missing')
      }
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const port = server.address().port
    const demo = await browser.newPage()
    const demoPath = htmlName.startsWith('/') ? htmlName : `/${htmlName}`
    await demo.goto(`http://127.0.0.1:${port}${demoPath === '/index.html' ? '/' : demoPath}`, {
      waitUntil: 'networkidle',
    })
    // Look for animated element / demo stage
    const animProbe = await demo.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 800))
      const stage =
        document.querySelector('[data-testid="demo-stage"]') ||
        document.querySelector('.ms-stage') ||
        document.querySelector('[class*="stage"]') ||
        document.body
      const animated = [...document.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el)
        return (
          (s.animationName && s.animationName !== 'none') ||
          (s.transitionProperty && s.transitionProperty !== 'all' && s.transitionDuration !== '0s')
        )
      })
      // Also check CSSOM for @keyframes
      let keyframes = 0
      for (const sheet of [...document.styleSheets]) {
        try {
          for (const rule of [...sheet.cssRules]) {
            if (rule.type === CSSRule.KEYFRAMES_RULE) keyframes++
          }
        } catch {
          // cross-origin
        }
      }
      return {
        title: document.title,
        hasStage: !!stage,
        animatedCount: animated.length,
        keyframes,
        bodyText: document.body?.innerText?.slice(0, 120) ?? '',
      }
    })
    if (animProbe.keyframes > 0 || animProbe.animatedCount > 0) {
      pass(
        'website package animation',
        `keyframes=${animProbe.keyframes}, animatedEls=${animProbe.animatedCount}`,
      )
    } else {
      fail('website package animation', JSON.stringify(animProbe))
    }
    await demo.close()
    server.close()
  }
} catch (err) {
  fail('uncaught', String(err?.stack || err))
} finally {
  await browser.close()
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ PREVIEW, results }, null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log('\n--- summary ---')
  console.log(`preview: ${PREVIEW}`)
  console.log(`passed: ${results.filter((r) => r.ok).length}/${results.length}`)
  if (failed.length) {
    console.log('failures:', failed)
    process.exitCode = 1
  }
}
