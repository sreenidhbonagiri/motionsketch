/**
 * Fresh plain HTML host from sectioned describeWebPackageIntegration:
 * non-default aspect + image actor; page-load, click, Replay, reduced-motion.
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { unzipSync } from 'fflate'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { createServer as createHttpServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'

const hostDir = '/Users/sreenidhbonagiri/Desktop/ms-html-export-sections-verify'
rmSync(hostDir, { recursive: true, force: true })
mkdirSync(hostDir, { recursive: true })

const vite = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
})
const { buildWebPackage, describeWebPackageIntegration } =
  await vite.ssrLoadModule('/src/core/export/webPackage.ts')
const { createPaperPlaneImage } = await vite.ssrLoadModule(
  '/src/examples/assets.ts',
)
const { createSceneActor } = await vite.ssrLoadModule('/src/core/sceneActor.ts')
const { makeProject, makeRecording } = await vite.ssrLoadModule(
  '/tests/unit/helpers/project.ts',
)

function makeWideProject(trigger) {
  return makeProject({
    name: 'Wide sections',
    stageAspect: 16 / 9,
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
      trigger,
    },
  })
}

async function writeHost(project, label) {
  const guide = describeWebPackageIntegration(project)
  if (!guide.ok) throw new Error(guide.error)
  const packed = buildWebPackage(project)
  if (!packed.ok) throw new Error(packed.error)
  const dir = join(hostDir, label)
  mkdirSync(dir, { recursive: true })
  const files = unzipSync(packed.zip)
  for (const [path, bytes] of Object.entries(files)) {
    const dest = join(dir, path)
    mkdirSync(join(dest, '..'), { recursive: true })
    writeFileSync(dest, bytes)
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label}</title>
${guide.sections.head}
</head>
<body style="margin:0;padding:1.5rem;font-family:system-ui;background:#eef2f6">
${guide.sections.body}
${guide.sections.scripts}
</body>
</html>`
  writeFileSync(join(dir, 'host.html'), html)
  if (!guide.sections.head.includes(`aspect-ratio: ${guide.aspectCss}`)) {
    throw new Error('head missing aspect')
  }
  if (guide.completeExample !== `${guide.sections.head}\n\n${guide.sections.body}\n\n${guide.sections.scripts}`) {
    throw new Error('completeExample != joined sections')
  }
  return { guide, dir }
}

const pageLoad = await writeHost(makeWideProject('page-load'), 'page-load')
const click = await writeHost(makeWideProject('click'), 'click')
await vite.close()

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.json': 'application/json',
}
const port = 8791
const srv = createHttpServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  const file = join(hostDir, url === '/' ? 'page-load/host.html' : url.slice(1))
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
const report = {
  aspectCss: pageLoad.guide.aspectCss,
  sceneId: pageLoad.guide.scope.sceneId,
}

{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await page.goto(`http://127.0.0.1:${port}/page-load/host.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  report.pageLoad = await page.evaluate(() => {
    const stage = document.querySelector('.ms-stage').getBoundingClientRect()
    const img = document.querySelector('[class^="ms-actor"]')
    return {
      aspect: stage.width / stage.height,
      imgOk: Boolean(img?.complete && img.naturalWidth > 0),
      playLabel: document.querySelector('[data-ms-play]')?.textContent,
    }
  })
  await page.locator('[data-ms-play]').click()
  await page.waitForTimeout(250)
  report.replay = await page.evaluate(() => {
    const img = document.querySelector('[class^="ms-actor"]')
    const a = img?.getAnimations?.()[0]
    return { state: a?.playState ?? null, t: a?.currentTime ?? null }
  })
  await page.screenshot({ path: join(out, 'page-load-desktop.png') })
  await page.context().close()
}

{
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage()
  await page.goto(`http://127.0.0.1:${port}/click/host.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(150)
  const before = await page.evaluate(() => ({
    waiting: document.querySelector('[data-ms-scene]')?.classList.contains('ms-waiting'),
    anims: (document.querySelector('[class^="ms-actor"]')?.getAnimations?.() || []).length,
  }))
  await page.locator('[data-ms-play]').click()
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => ({
    waiting: document.querySelector('[data-ms-scene]')?.classList.contains('ms-waiting'),
    anims: (document.querySelector('[class^="ms-actor"]')?.getAnimations?.() || []).map((a) => a.playState),
    playLabel: document.querySelector('[data-ms-play]')?.textContent,
  }))
  report.click = { before, after }
  await page.screenshot({ path: join(out, 'click-after.png') })
  await page.context().close()
}

{
  const page = await (
    await browser.newContext({
      viewport: { width: 1100, height: 720 },
      reducedMotion: 'reduce',
    })
  ).newPage()
  await page.goto(`http://127.0.0.1:${port}/page-load/host.html`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  const before = await page.evaluate(() => ({
    motionOk: document.querySelector('[data-ms-scene]')?.classList.contains('ms-motion-ok'),
    anims: (document.querySelector('[class^="ms-actor"]')?.getAnimations?.() || []).length,
  }))
  await page.locator('[data-ms-play]').click()
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => ({
    motionOk: document.querySelector('[data-ms-scene]')?.classList.contains('ms-motion-ok'),
    anims: (document.querySelector('[class^="ms-actor"]')?.getAnimations?.() || []).map((a) => a.playState),
  }))
  report.reduced = { before, after }
  await page.screenshot({ path: join(out, 'reduced-after.png') })
  await page.context().close()
}

if (Math.abs(report.pageLoad.aspect - 16 / 9) > 0.05) throw new Error(`bad aspect ${report.pageLoad.aspect}`)
if (!report.pageLoad.imgOk) throw new Error('image missing')
if (report.replay.state !== 'running') throw new Error(`replay ${report.replay.state}`)
if (!report.click.before.waiting) throw new Error('click should wait (ms-waiting)')
if (report.click.after.waiting) throw new Error('click should clear ms-waiting')
if (!report.click.after.anims.includes('running')) throw new Error('click did not play')
if (report.reduced.before.motionOk) throw new Error('reduced should start without ms-motion-ok')
if (!report.reduced.after.motionOk) throw new Error('reduced-motion Play failed')
if (!report.reduced.after.anims.includes('running')) {
  throw new Error('reduced-motion Play did not run animations')
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
srv.close()
