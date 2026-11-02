/**
 * Production verify after PR #5: Test playback behavior + ZIP README paste order.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const PROD = process.env.PROD_URL || 'https://motionsketch.vercel.app'
const out = join(process.cwd(), 'tmp/prod-pr5-verify')
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
await vite.close()

const project = makeProject({
  name: 'Prod PR5',
  stageAspect: 16 / 9,
  actors: [
    createSceneActor({
      id: 'a1',
      name: 'Actor 1',
      recording: makeRecording(12),
    }),
  ],
})
const fixture = serializeSnapshot(
  buildSnapshot(project, null, '2026-10-29T05:50:00.000Z'),
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

const previewLabel = await page.getByTestId('btn-preview-trigger').textContent()
report.previewLabel = previewLabel?.trim()
if (report.previewLabel !== 'Test playback behavior') {
  throw new Error(`preview label: ${report.previewLabel}`)
}
const previewHelp = await page.getByTestId('export-preview-trigger-help').textContent()
report.previewHelp = previewHelp
if (!/isolated preview of the selected start setting/i.test(previewHelp || '')) {
  throw new Error(`preview help: ${previewHelp}`)
}
const pasteOrder = await page.getByTestId('export-html-paste-order').textContent()
report.pasteOrder = pasteOrder
if (!pasteOrder?.includes('Paste each section where its label indicates, in the order shown.')) {
  throw new Error(`paste order: ${pasteOrder}`)
}
if (!/after the scene markup/i.test(pasteOrder || '')) {
  throw new Error('paste order missing init clarification')
}
const scriptsLabel = await page
  .getByTestId('export-html-section-scripts')
  .locator('p')
  .first()
  .textContent()
report.scriptsLabel = scriptsLabel
if (!scriptsLabel?.includes('Before </body> (after the scene markup)')) {
  throw new Error(`scripts label: ${scriptsLabel}`)
}
const triggerHelp = await page.getByTestId('export-trigger-help').textContent()
report.triggerHelpHasCssAlone = /CSS alone can start the motion/i.test(triggerHelp || '')
report.triggerHelpHasMsTrigger = /ms-trigger\.js/i.test(triggerHelp || '')
if (!report.triggerHelpHasCssAlone || !report.triggerHelpHasMsTrigger) {
  throw new Error(`trigger help incomplete: ${triggerHelp}`)
}

await page.screenshot({ path: join(out, 'desktop-export.png') })

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.getByTestId('btn-download-web-package').click(),
])
const zipPath = join(out, 'prod-web.zip')
await download.saveAs(zipPath)
const readme = strFromU8(unzipSync(readFileSync(zipPath))['README.txt'])
writeFileSync(join(out, 'README.txt'), readme)
report.readme = {
  pasteOrder: readme.includes(
    'Paste each section where its label indicates, in the order shown.',
  ),
  initAfterMarkup: /Initialization goes after the scene markup, before <\/body>/.test(
    readme,
  ),
  scriptsHeading: readme.includes('Before </body> (after the scene markup)'),
  previewPage: /self-contained preview page/i.test(readme),
  cssAlone: /CSS alone can start the motion when prefers-reduced-motion is\s+off/i.test(
    readme,
  ),
  msTrigger: /still includes\s+ms-trigger\.js[\s\S]*Play\/Replay/i.test(readme),
}
for (const [k, v] of Object.entries(report.readme)) {
  if (!v) throw new Error(`README missing ${k}`)
}

report.ok = true
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
