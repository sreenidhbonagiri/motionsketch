/**
 * Fresh external host from describeWebPackageIntegration + buildWebPackage
 * for a 16:9 project with an image actor.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const hostDir = '/Users/sreenidhbonagiri/Desktop/ms-export-handoff-verify'
rmSync(hostDir, { recursive: true, force: true })
mkdirSync(hostDir, { recursive: true })

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
})
const { buildWebPackage, describeWebPackageIntegration } =
  await server.ssrLoadModule('/src/core/export/webPackage.ts')
const { createPaperPlaneImage } = await server.ssrLoadModule(
  '/src/examples/assets.ts',
)
const { createSceneActor } = await server.ssrLoadModule(
  '/src/core/sceneActor.ts',
)
const { makeProject, makeRecording } = await server.ssrLoadModule(
  '/tests/unit/helpers/project.ts',
)

const stageAspect = 16 / 9
const project = makeProject({
  name: 'Wide handoff',
  stageAspect,
  actors: [
    createSceneActor({
      id: 'plane',
      name: 'Plane',
      appearance: {
        kind: 'image',
        width: 0.16,
        height: 0.16,
        borderRadius: 0,
        color: '#0f766e',
        image: createPaperPlaneImage(),
      },
      recording: makeRecording(16),
      faceAlongPath: true,
      directionOffsetDeg: 43,
    }),
  ],
  playback: {
    durationMs: 2400,
    loop: false,
    loopMode: 'repeat',
    trigger: 'page-load',
  },
})

const guide = describeWebPackageIntegration(project)
if (!guide.ok) throw new Error(guide.error)
const packed = buildWebPackage(project)
if (!packed.ok) throw new Error(packed.error)

const files = unzipSync(packed.zip)
for (const [path, bytes] of Object.entries(files)) {
  const dest = join(hostDir, path)
  mkdirSync(join(dest, '..'), { recursive: true })
  writeFileSync(dest, bytes)
}
const readme = strFromU8(files['README.txt'])
if (!readme.includes(`aspect-ratio: ${guide.aspectCss}`)) {
  throw new Error(`README missing aspect ${guide.aspectCss}`)
}
if (readme.includes('aspect-ratio: 16 / 10')) {
  throw new Error('README still hardcodes 16 / 10')
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Export handoff verify</title>
${guide.completeExample}
</head>
<body style="margin:0;padding:1.5rem;font-family:system-ui;background:#eef2f6">
</body>
</html>`
// completeExample already includes link/style/markup/scripts — wrap minimally
writeFileSync(
  join(hostDir, 'host.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Export handoff verify</title>
</head>
<body style="margin:0;padding:1.5rem;font-family:system-ui;background:#eef2f6">
${guide.completeExample}
</body>
</html>`,
)

await server.close()

const http = await import('node:http')
const { createReadStream, statSync, existsSync } = await import('node:fs')
const { extname } = await import('node:path')
const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.json': 'application/json',
}
const port = 8788
const srv = http.createServer((req, res) => {
  const url = req.url === '/' ? '/host.html' : req.url.split('?')[0]
  const file = join(hostDir, decodeURIComponent(url))
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404)
    res.end('missing')
    return
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((resolve) => srv.listen(port, '127.0.0.1', resolve))

const out = join(hostDir, 'verify')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const report = { aspectCss: guide.aspectCss, sceneId: guide.scope.sceneId }

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${port}/host.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((el) => {
      for (const a of el.getAnimations?.() || []) {
        const dur = a.effect?.getTiming?.().duration
        a.pause()
        a.currentTime = 0.5 * (typeof dur === 'number' ? dur : 2400)
      }
    })
  })
  report.desktop = await page.evaluate(() => {
    const stage = document.querySelector('.ms-stage')
    const img = document.querySelector('[class^="ms-actor"]')
    const r = stage.getBoundingClientRect()
    return {
      aspect: r.width / r.height,
      imgOk: Boolean(img?.complete && img.naturalWidth > 0),
      src: img?.getAttribute('src'),
      actorClass: img?.className,
      playLabel: document.querySelector('[data-ms-play]')?.textContent,
    }
  })
  await page.screenshot({ path: join(out, 'desktop.png') })
  await page.getByRole('button', { name: /Replay|Play animation/ }).click()
  await page.waitForTimeout(200)
  report.replay = await page.evaluate(() => {
    const img = document.querySelector('[class^="ms-actor"]')
    if (!img) return { state: null, t: null, missing: true }
    const a = img.getAnimations?.()[0]
    return { state: a?.playState ?? null, t: a?.currentTime ?? null, missing: false }
  })
  await ctx.close()
}

{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${port}/host.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(150)
  report.mobile = await page.evaluate(() => {
    const stage = document.querySelector('.ms-stage').getBoundingClientRect()
    return {
      aspect: stage.width / stage.height,
      width: stage.width,
      inViewport: stage.right <= window.innerWidth + 1,
    }
  })
  await page.screenshot({ path: join(out, 'mobile.png') })
  await ctx.close()
}

{
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${port}/host.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => {
    const img = document.querySelector('[class^="ms-actor"]')
    return {
      motionOk: document
        .querySelector('[data-ms-scene]')
        ?.classList.contains('ms-motion-ok'),
      anims: (img?.getAnimations?.() || []).length,
    }
  })
  await page.screenshot({ path: join(out, 'reduced-before.png') })
  await page.getByRole('button', { name: 'Play animation' }).click()
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => {
    const img = document.querySelector('[class^="ms-actor"]')
    return {
      motionOk: document
        .querySelector('[data-ms-scene]')
        ?.classList.contains('ms-motion-ok'),
      anims: (img?.getAnimations?.() || []).map((a) => a.playState),
    }
  })
  await page.screenshot({ path: join(out, 'reduced-after.png') })
  report.reduced = { before, after }
  await ctx.close()
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
srv.close()
