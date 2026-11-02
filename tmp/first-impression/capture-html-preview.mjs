/**
 * Capture standalone HTML demo (no editor chrome) at desktop/mobile.
 * Seeks Web Animations for start/mid/end; records short playback video.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(root, 'html-preview/paper-plane.html')
const outDir = join(root, 'html-preview')
mkdirSync(outDir, { recursive: true })
const html = readFileSync(htmlPath, 'utf8')

async function seekAll(page, tNorm) {
  return page.evaluate((t) => {
    const actors = [
      ...document.querySelectorAll('[data-testid="demo-actor"], [class*="ms-actor"]'),
    ].filter((el, i, arr) => arr.indexOf(el) === i)
    // Prefer every animated element inside the stage.
    const stage = document.querySelector('[data-testid="demo-stage"]')
    const els = stage
      ? [...stage.querySelectorAll('[class*="ms-"], img, div')].filter((el) =>
          el.getAnimations().some((a) => {
            const name = /** @type {Animation & { animationName?: string }} */ (a)
              .animationName
            return typeof name === 'string' && name !== '' && name !== 'none'
          }),
        )
      : actors
    const unique = [...new Set(els.length ? els : actors)]
    const report = []
    for (const el of unique) {
      if (!(el instanceof HTMLElement)) continue
      const anims = el.getAnimations().filter((a) => {
        const name = /** @type {Animation & { animationName?: string }} */ (a)
          .animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      for (const anim of anims) {
        anim.pause()
        const dur =
          Number(anim.effect?.getTiming().duration) ||
          parseFloat(getComputedStyle(el).animationDuration) * 1000 ||
          2400
        anim.currentTime = Math.min(dur, Math.max(0, t * dur))
      }
      void el.offsetWidth
      const style = getComputedStyle(el)
      let rotationDeg = 0
      const m = style.transform
      if (m && m !== 'none') {
        const m2 = m.match(/^matrix\((.+)\)$/)
        const m3 = m.match(/^matrix3d\((.+)\)$/)
        if (m2) {
          const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
          rotationDeg = (Math.atan2(b, a) * 180) / Math.PI
        } else if (m3) {
          const parts = m3[1].split(',').map((v) => Number(v.trim()))
          rotationDeg = (Math.atan2(parts[1], parts[0]) * 180) / Math.PI
        }
      }
      const box = el.getBoundingClientRect()
      report.push({
        testId: el.getAttribute('data-testid'),
        tag: el.tagName,
        kind: el.tagName === 'IMG' ? 'image' : el.textContent?.trim()?.slice(0, 40),
        rotationDeg,
        box: { x: box.x, y: box.y, w: box.width, h: box.height },
      })
    }
    return report
  }, tNorm)
}

async function assertInStage(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="demo-stage"]')
    if (!(stage instanceof HTMLElement)) return { ok: false, reason: 'no-stage' }
    const sr = stage.getBoundingClientRect()
    const kids = [...stage.querySelectorAll('img, div')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 2 && r.height > 2
    })
    const clips = []
    for (const el of kids) {
      const r = el.getBoundingClientRect()
      const clipped =
        r.left < sr.left - 1 ||
        r.top < sr.top - 1 ||
        r.right > sr.right + 1 ||
        r.bottom > sr.bottom + 1
      if (clipped) {
        clips.push({
          tag: el.tagName,
          text: el.textContent?.trim()?.slice(0, 24) || el.getAttribute('alt'),
          overflow: {
            left: r.left - sr.left,
            top: r.top - sr.top,
            right: sr.right - r.right,
            bottom: sr.bottom - r.bottom,
          },
        })
      }
    }
    return { ok: clips.length === 0, clips, stage: { w: sr.width, h: sr.height } }
  })
}

async function captureViewport(browser, size, label) {
  const context = await browser.newContext({
    viewport: size,
    recordVideo: {
      dir: join(outDir, 'video-raw'),
      size,
    },
  })
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('demo-stage').waitFor({ state: 'visible' })
  // Let page-load animation arm, then we pause/seek.
  await page.waitForTimeout(200)

  const frames = [
    ['start', 0],
    ['mid', 0.5],
    ['end', 1],
  ]
  const metrics = {}
  for (const [name, t] of frames) {
    metrics[name] = await seekAll(page, t)
    const clip = await assertInStage(page)
    metrics[`${name}-clip`] = clip
    const stage = page.getByTestId('demo-stage')
    await stage.screenshot({
      path: join(outDir, `${label}-${name}.png`),
    })
    console.log('wrote', `${label}-${name}.png`)
  }

  // Short playback recording: restart from 0 and let it run ~1.4s
  await seekAll(page, 0)
  await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="demo-stage"]')
    if (!stage) return
    for (const el of stage.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement)) continue
      for (const anim of el.getAnimations()) {
        anim.cancel()
      }
    }
    // Replay button restarts CSS animations when present.
    const replay = document.querySelector('[data-testid="demo-replay"]')
    if (replay instanceof HTMLElement) replay.click()
  })
  await page.waitForTimeout(1400)
  await context.close()

  // Move the recorded webm next to stills
  const { readdirSync, renameSync, existsSync } = await import('node:fs')
  const rawDir = join(outDir, 'video-raw')
  if (existsSync(rawDir)) {
    const files = readdirSync(rawDir).filter((f) => f.endsWith('.webm'))
    if (files[0]) {
      const dest = join(outDir, `${label}-playback.webm`)
      renameSync(join(rawDir, files[0]), dest)
      console.log('wrote', `${label}-playback.webm`)
    }
  }

  writeFileSync(
    join(outDir, `${label}-metrics.json`),
    JSON.stringify(metrics, null, 2),
  )
  return metrics
}

const browser = await chromium.launch()
const desktop = await captureViewport(
  browser,
  { width: 1280, height: 800 },
  'desktop',
)
const mobile = await captureViewport(
  browser,
  { width: 390, height: 844 },
  'mobile',
)
await browser.close()

const summary = {
  desktopClipOk: ['start', 'mid', 'end'].every(
    (k) => desktop[`${k}-clip`]?.ok === true,
  ),
  mobileClipOk: ['start', 'mid', 'end'].every(
    (k) => mobile[`${k}-clip`]?.ok === true,
  ),
  desktopMidPlaneRotation: desktop.mid?.find((a) => a.tag === 'IMG')?.rotationDeg,
  desktopStartPlaneRotation: desktop.start?.find((a) => a.tag === 'IMG')
    ?.rotationDeg,
  desktopEndPlaneRotation: desktop.end?.find((a) => a.tag === 'IMG')?.rotationDeg,
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
console.log('done html-preview')
