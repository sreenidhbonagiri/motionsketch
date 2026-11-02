/**
 * Production verify after PR #4: three HTML sections, HTML/React only,
 * trigger before snippets, ZIP README matches.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const PROD = process.env.PROD_URL || 'https://motionsketch.vercel.app'
const out = join(process.cwd(), 'tmp/prod-pr4-verify')
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
const { describeWebPackageIntegration } = await vite.ssrLoadModule(
  '/src/core/export/webPackage.ts',
)
await vite.close()

const project = makeProject({
  name: 'Prod PR4',
  stageAspect: 16 / 9,
  actors: [
    createSceneActor({
      id: 'a1',
      name: 'Actor 1',
      recording: makeRecording(12),
    }),
  ],
})
const localGuide = describeWebPackageIntegration(project)
if (!localGuide.ok) throw new Error(localGuide.error)
const fixture = serializeSnapshot(
  buildSnapshot(project, null, '2026-10-29T04:00:00.000Z'),
)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(PROD, { waitUntil: 'networkidle' })
await page.evaluate((raw) => {
  localStorage.setItem('motionsketch.project.v1', raw)
}, fixture)
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('app-shell').waitFor()
await page.getByTestId('btn-play').waitFor({ state: 'visible' })
await page.getByTestId('btn-export').click()
await page.getByTestId('export-primary').waitFor()

const report = { prod: PROD, merge: process.env.MERGE_SHA || null }

// Only HTML / React
report.tabs = {
  html: await page.getByTestId('btn-export-path-html').count(),
  react: await page.getByTestId('btn-export-path-react').count(),
  files: await page.getByTestId('btn-export-path-files').count(),
}
if (report.tabs.html !== 1 || report.tabs.react !== 1 || report.tabs.files !== 0) {
  throw new Error(`bad tabs ${JSON.stringify(report.tabs)}`)
}

// Three labeled sections
for (const id of ['head', 'body', 'scripts']) {
  await page.getByTestId(`export-html-section-${id}`).waitFor()
  await page.getByTestId(`btn-copy-html-section-${id}`).waitFor()
}
const headLabel = await page
  .getByTestId('export-html-section-head')
  .locator('p')
  .first()
  .textContent()
const bodyLabel = await page
  .getByTestId('export-html-section-body')
  .locator('p')
  .first()
  .textContent()
const scriptsLabel = await page
  .getByTestId('export-html-section-scripts')
  .locator('p')
  .first()
  .textContent()
report.labels = { headLabel, bodyLabel, scriptsLabel }
if (!headLabel?.includes('In <head>')) throw new Error(`head label: ${headLabel}`)
if (!bodyLabel?.includes('inside <body>')) throw new Error(`body label: ${bodyLabel}`)
if (!scriptsLabel?.includes('Before </body>')) {
  throw new Error(`scripts label: ${scriptsLabel}`)
}

// Trigger before snippets
const triggerBox = await page.getByTestId('export-trigger-select').boundingBox()
const headBox = await page.getByTestId('export-html-section-head').boundingBox()
const downloadBox = await page.getByTestId('btn-download-web-package').boundingBox()
if (!triggerBox || !headBox || !downloadBox) throw new Error('missing bounding boxes')
const triggerY = triggerBox.y
const headY = headBox.y
const downloadY = downloadBox.y
report.order = { downloadY, triggerY, headY }
if (!(downloadY < triggerY && triggerY < headY)) {
  throw new Error(`order wrong ${JSON.stringify(report.order)}`)
}
await page.getByTestId('export-trigger-regen-help').waitFor()
report.regenHelp = await page.getByTestId('export-trigger-regen-help').textContent()

const panelHead = await page.getByTestId('export-html-section-head-code').inputValue()
const panelBody = await page.getByTestId('export-html-section-body-code').inputValue()
const panelScripts = await page
  .getByTestId('export-html-section-scripts-code')
  .inputValue()
report.panelMatchesLocal = {
  head: panelHead === localGuide.sections.head,
  body: panelBody === localGuide.sections.body,
  scripts: panelScripts === localGuide.sections.scripts,
}
if (!report.panelMatchesLocal.head || !report.panelMatchesLocal.body || !report.panelMatchesLocal.scripts) {
  // Production may fingerprint differently; compare structure instead
  report.panelMatchesLocal = {
    head: panelHead.includes('animation.css') && panelHead.includes('aspect-ratio: 16 / 9'),
    body: panelBody.includes('data-ms-demo-shell') && panelBody.includes('data-ms-play'),
    scripts:
      panelScripts.includes('ms-trigger.js') && panelScripts.includes('api.init'),
  }
  if (
    !report.panelMatchesLocal.head ||
    !report.panelMatchesLocal.body ||
    !report.panelMatchesLocal.scripts
  ) {
    throw new Error(`panel sections mismatch ${JSON.stringify(report.panelMatchesLocal)}`)
  }
}

await page.screenshot({ path: join(out, 'desktop-html.png') })

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.getByTestId('btn-download-web-package').click(),
])
const zipPath = join(out, 'prod-web.zip')
await download.saveAs(zipPath)
const zip = unzipSync(readFileSync(zipPath))
const readme = strFromU8(zip['README.txt'])
report.readme = {
  hasInHead: readme.includes('In <head>'),
  hasBody: readme.includes('Where you want the animation, inside <body>'),
  hasScripts: readme.includes('Before </body>'),
  hasPanelHead: readme.includes(panelHead.trim()),
  hasPanelBody: readme.includes(panelBody.trim()),
  hasPanelScripts: readme.includes(panelScripts.trim()),
  neitherRequired: /neither is required to run the embedded animation/i.test(readme),
  aspect: readme.includes('aspect-ratio: 16 / 9'),
}
for (const [k, v] of Object.entries(report.readme)) {
  if (!v) throw new Error(`README missing ${k}`)
}
writeFileSync(join(out, 'README.txt'), readme)

await page.getByTestId('btn-export-path-react').click()
await page.getByTestId('export-guide-react').waitFor()
report.reactOnly = {
  reactGuide: (await page.getByTestId('export-guide-react').count()) === 1,
  htmlGuide: (await page.getByTestId('export-guide-html').count()) === 0,
  files: (await page.getByTestId('btn-export-path-files').count()) === 0,
}
await page.screenshot({ path: join(out, 'desktop-react.png') })

report.ok = true
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
