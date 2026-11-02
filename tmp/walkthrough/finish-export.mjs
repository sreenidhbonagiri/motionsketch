import { chromium } from '@playwright/test'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = 'tmp/walkthrough'

function section(readme, start, end) {
  const at = readme.indexOf(start)
  if (at < 0) throw new Error(`missing section ${start}`)
  const rule = readme.indexOf('-----', at)
  const from = readme.indexOf('\n', rule) + 1
  const to = readme.indexOf(end, from)
  if (to < 0) throw new Error(`missing end ${end}`)
  return readme.slice(from, to).trim()
}

async function buildHost(tag) {
  const dir = path.resolve(`${root}/${tag}-page`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const unzipped = path.resolve(`${root}/${tag}-unzip-web`)
  const readme = await readFile(path.join(unzipped, 'README.txt'), 'utf8')
  const head = section(readme, 'In <head>', 'Where you want the animation')
  const body = section(readme, 'Where you want the animation', 'Before </body>')
  const scripts = section(readme, 'Before </body>', 'Reduced motion')
  await writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Existing page</title>
${head}
</head>
<body>
  <header>
    <h1>Existing page</h1>
    <p>This paragraph was already on the page.</p>
  </header>
  ${body}
  ${scripts}
</body>
</html>
`,
  )
  await cp(path.join(unzipped, 'animation.css'), path.join(dir, 'animation.css'))
  await cp(path.join(unzipped, 'ms-trigger.js'), path.join(dir, 'ms-trigger.js'))
  return dir
}

async function watchMotion(page) {
  await page.getByRole('heading', { name: 'Existing page' }).waitFor()
  return page.evaluate(async () => {
    const el = document.querySelector('.ms-actor')
    const heading = document.querySelector('h1')?.textContent ?? ''
    if (!(el instanceof HTMLElement)) return { heading, missing: true }
    const box = () => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const start = box()
    const began = performance.now()
    let moved = false
    let end = start
    while (performance.now() - began < 1800) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      end = box()
      if (Math.hypot(end.x - start.x, end.y - start.y) > 2) {
        moved = true
        break
      }
    }
    const button = document.querySelector('[data-ms-play]')
    return {
      heading,
      missing: false,
      moved,
      start,
      end,
      anims: el.getAnimations().map((animation) => animation.playState),
      button: button?.textContent?.trim() ?? null,
    }
  })
}

async function revealReactTab(page) {
  const tab = page.getByRole('tab', { name: 'React' })
  const scroller = page.locator('[data-testid="export-panel-root"] .overflow-y-auto')
  await scroller.hover()
  let wheels = 0
  for (; wheels < 50; wheels += 1) {
    const placed = await tab.evaluate((el) => {
      const scroller = el.closest('.overflow-y-auto')
      if (!(el instanceof HTMLElement) || !(scroller instanceof HTMLElement)) return false
      const er = el.getBoundingClientRect()
      const sr = scroller.getBoundingClientRect()
      return er.top >= sr.top + 1 && er.bottom <= sr.bottom - 1 && er.height > 0
    })
    if (placed) break
    await page.mouse.wheel(0, -48)
  }
  return wheels
}

const browser = await chromium.launch()
const hosts = {}
for (const tag of ['1280x720', '390x844']) {
  const dir = await buildHost(tag)
  const page = await browser.newPage({
    viewport: tag === '1280x720' ? { width: 1280, height: 720 } : { width: 390, height: 844 },
  })
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href)
  hosts[tag] = await watchMotion(page)
  await page.screenshot({ path: `${root}/${tag}-existing-html.png` })
  const replay = page.getByRole('button', { name: /Play animation|Replay/ })
  if (await replay.count()) {
    await replay.click()
    hosts[tag].afterReplay = await watchMotion(page)
  }
  await page.close()
}

const react = {}
for (const tag of ['1280x720', '390x844']) {
  const viewport = tag === '1280x720' ? { width: 1280, height: 720 } : { width: 390, height: 844 }
  const page = await browser.newPage({ viewport, acceptDownloads: true })
  page.setDefaultTimeout(15000)
  await page.goto('http://localhost:5173/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('app-shell').waitFor()
  await page.getByRole('button', { name: 'Skip tutorial' }).click()
  await page.getByTestId('tutorial-coach').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Project', exact: true }).click()
  await page.getByTestId('project-file-input').setInputFiles(path.resolve(`${root}/${tag}-unzip-web/project.json`))
  const confirm = page.getByTestId('btn-open-project-confirm')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await page.getByTestId('header-save-status').filter({ hasText: 'Saved in this browser' }).waitFor()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByTestId('export-panel-root').waitFor()
  await page.getByRole('button', { name: 'Download for your website' }).click()
  await page.getByRole('button', { name: 'View integration instructions' }).click()
  await page.getByTestId('export-html-integration').waitFor()
  const wheels = await revealReactTab(page)
  const tab = page.getByRole('tab', { name: 'React' })
  const tabBox = await tab.boundingBox()
  await tab.click()
  await page.getByTestId('export-guide-react').waitFor()
  const example = await page.getByTestId('export-react-example-code').inputValue()
  const steps = (await page.getByTestId('export-react-steps').innerText()).replace(/\s+/g, ' ')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download React package' }).click()
  const download = await downloadPromise
  const zipPath = path.resolve(`${root}/${tag}-react.zip`)
  await download.saveAs(zipPath)
  await page.getByTestId('export-react-download-success').waitFor()
  const success = (await page.getByTestId('export-react-download-success').innerText()).replace(/\s+/g, ' ')
  const htmlSuccess = await page.getByTestId('export-download-success').count()
  await page.screenshot({ path: `${root}/${tag}-react-downloaded.png` })
  react[tag] = { wheels, tabBox, example, steps, success, htmlSuccess, zipPath }
  await page.close()
}

await browser.close()
await writeFile(`${root}/finish-export.json`, JSON.stringify({ hosts, react }, null, 2))
console.log(JSON.stringify({ hosts, react }, null, 2))
