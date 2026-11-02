/**
 * Production verify after PR #3 merge: format chooser, above-fold download,
 * success banner, and non-default aspect ZIP CSS/README match.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const PROD = process.env.PROD_URL || 'https://motionsketch.vercel.app'
const out = join(process.cwd(), 'tmp/prod-export-handoff-verify')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const vite = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
})
const { createSceneActor } = await vite.ssrLoadModule('/src/core/sceneActor.ts')
const { makeProject, makeRecording } = await vite.ssrLoadModule(
  '/tests/unit/helpers/project.ts',
)
const { buildSnapshot, serializeSnapshot } = await vite.ssrLoadModule(
  '/src/core/persist/document.ts',
)
const { formatCssAspectRatio } = await vite.ssrLoadModule('/src/core/stageAspect.ts')
await vite.close()

const stageAspect = 16 / 9
const expectedAspect = formatCssAspectRatio(stageAspect)
const project = makeProject({
  name: 'Prod handoff 169',
  stageAspect,
  actors: [
    createSceneActor({
      id: 'prod-actor',
      name: 'Actor 1',
      recording: makeRecording(12),
      appearance: {
        kind: 'shape',
        width: 0.1,
        height: 0.1,
        borderRadius: 0.2,
        color: '#0f766e',
        image: null,
        text: null,
      },
    }),
  ],
  playback: {
    durationMs: 1200,
    loop: false,
    loopMode: 'repeat',
    trigger: 'page-load',
  },
})
const fixture = serializeSnapshot(buildSnapshot(project, null, '2026-10-29T00:00:00.000Z'))
const report = { prod: PROD, expectedAspect, merge: process.env.MERGE_SHA || null }

const browser = await chromium.launch()

async function seedAndOpen(page) {
  await page.goto(PROD, { waitUntil: 'networkidle' })
  await page.evaluate((raw) => {
    localStorage.setItem('motionsketch.project.v1', raw)
  }, fixture)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-export').click()
  await page.getByTestId('export-primary').waitFor()
}

async function assertChooser(page, path) {
  await page.getByTestId(`btn-export-path-${path}`).click()
  await page.getByTestId(`export-guide-${path}`).waitFor()
  for (const id of ['html', 'react', 'files']) {
    const selected = id === path
    const tab = page.getByTestId(`btn-export-path-${id}`)
    const aria = await tab.getAttribute('aria-selected')
    const data = await tab.getAttribute('data-selected')
    const paint = await tab.evaluate((el) => ({
      bgWhite: el.classList.contains('bg-white'),
      ring: el.classList.contains('ring-1'),
    }))
    if (aria !== (selected ? 'true' : 'false')) {
      throw new Error(`${path}: ${id} aria-selected=${aria}`)
    }
    if (data !== (selected ? 'true' : 'false')) {
      throw new Error(`${path}: ${id} data-selected=${data}`)
    }
    if (paint.bgWhite !== selected || paint.ring !== selected) {
      throw new Error(`${path}: ${id} paint mismatch ${JSON.stringify(paint)}`)
    }
  }
  const guides = {
    html: await page.getByTestId('export-guide-html').count(),
    react: await page.getByTestId('export-guide-react').count(),
    files: await page.getByTestId('export-guide-files').count(),
  }
  if (guides[path] !== 1) throw new Error(`guide missing for ${path}`)
  if (Object.entries(guides).some(([k, v]) => k !== path && v !== 0)) {
    throw new Error(`extra guides visible for ${path}: ${JSON.stringify(guides)}`)
  }
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await seedAndOpen(page)
  await assertChooser(page, 'html')
  await assertChooser(page, 'react')
  await assertChooser(page, 'files')
  await assertChooser(page, 'html')
  await page.getByTestId('btn-export-path-html').click()
  const htmlInView = await page.getByTestId('btn-download-web-package').isVisible()
  const scrolled = await page.getByTestId('export-panel').evaluate((el) => {
    const scroller = el.closest('.overflow-y-auto')
    return scroller?.scrollTop ?? 0
  })
  if (!htmlInView || scrolled !== 0) {
    throw new Error(`desktop HTML download not above fold: visible=${htmlInView} scroll=${scrolled}`)
  }
  await page.getByTestId('btn-export-path-react').click()
  const reactInView = await page.getByTestId('btn-download-react-package').isVisible()
  const scrolledR = await page.getByTestId('export-panel').evaluate((el) => {
    const scroller = el.closest('.overflow-y-auto')
    return scroller?.scrollTop ?? 0
  })
  if (!reactInView || scrolledR !== 0) {
    throw new Error(`desktop React download not above fold: visible=${reactInView} scroll=${scrolledR}`)
  }
  await page.screenshot({ path: join(out, 'desktop-react.png') })
  await page.getByTestId('btn-export-path-html').click()
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByTestId('btn-download-web-package').click(),
  ])
  await page.getByTestId('export-download-success').waitFor({ timeout: 10000 })
  await page.getByTestId('export-download-success-title').waitFor()
  const title = await page.getByTestId('export-download-success-title').textContent()
  const hint = await page.getByTestId('export-download-success-hint').textContent()
  if (title?.trim() !== 'Website package download started.') {
    throw new Error(`bad success title: ${title}`)
  }
  if (hint?.trim() !== 'Unzip the folder and open index.html to preview.') {
    throw new Error(`bad success hint: ${hint}`)
  }
  await page.screenshot({ path: join(out, 'desktop-success.png') })

  const zipPath = join(out, 'prod-web.zip')
  await download.saveAs(zipPath)
  const zip = unzipSync(readFileSync(zipPath))
  const css = strFromU8(zip['animation.css'])
  const readme = strFromU8(zip['README.txt'])
  const cssAspect = css.match(/aspect-ratio:\s*([^;]+);/)?.[1]?.trim()
  const readmeHas = readme.includes(`aspect-ratio: ${expectedAspect}`)
  const readmeBadDefault = readme.includes('aspect-ratio: 16 / 10')
  report.zip = {
    files: Object.keys(zip).sort(),
    cssAspect,
    expectedAspect,
    readmeHas,
    readmeBadDefault,
    cssMatches: cssAspect === expectedAspect,
  }
  if (cssAspect !== expectedAspect) {
    throw new Error(`CSS aspect ${cssAspect} != ${expectedAspect}`)
  }
  if (!readmeHas || readmeBadDefault) {
    throw new Error(`README aspect mismatch (has=${readmeHas} still16/10=${readmeBadDefault})`)
  }
  writeFileSync(join(out, 'animation.css'), css)
  writeFileSync(join(out, 'README.txt'), readme)
  await page.close()
}

{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await seedAndOpen(page)
  const list = page.getByTestId('btn-toggle-actor-list')
  if ((await list.count()) && (await list.getAttribute('aria-expanded')) === 'true') {
    await list.click()
  }
  await page.getByTestId('btn-export-path-html').click()
  if (!(await page.getByTestId('btn-download-web-package').isVisible())) {
    throw new Error('mobile HTML download not visible')
  }
  const scrolled = await page.getByTestId('export-panel').evaluate((el) => {
    const scroller = el.closest('.overflow-y-auto')
    return scroller?.scrollTop ?? 0
  })
  if (scrolled !== 0) throw new Error(`mobile scrollTop=${scrolled}`)
  await page.getByTestId('btn-export-path-react').click()
  if (!(await page.getByTestId('btn-download-react-package').isVisible())) {
    throw new Error('mobile React download not visible')
  }
  await page.screenshot({ path: join(out, 'mobile-react.png') })
  await assertChooser(page, 'files')
  await page.screenshot({ path: join(out, 'mobile-files.png') })
  await page.close()
}

report.ok = true
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
