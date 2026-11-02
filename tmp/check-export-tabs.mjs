import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const vite = await createServer({
  root: process.cwd(),
  server: { host: '127.0.0.1', port: 5201, strictPort: true },
})
await vite.listen()
const { buildHtmlDemoExportFixtureJson } = await vite.ssrLoadModule(
  '/tests/fixtures/htmlDemoExportProject.ts',
)
const fixture = buildHtmlDemoExportFixtureJson()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:5201', { waitUntil: 'networkidle' })
await page.evaluate((raw) => localStorage.setItem('motionsketch.project.v1', raw), fixture)
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('btn-export').click()
await page.getByTestId('export-primary').waitFor()

async function dump(label) {
  const info = await page.evaluate(() => {
    const ids = ['html', 'react', 'files']
    return ids.map((id) => {
      const el = document.querySelector(`[data-testid="btn-export-path-${id}"]`)
      const cs = getComputedStyle(el)
      return {
        id,
        ariaSelected: el.getAttribute('aria-selected'),
        className: el.className,
        bg: cs.backgroundColor,
        color: cs.color,
        boxShadow: cs.boxShadow,
        fontWeight: cs.fontWeight,
        guideHtml: Boolean(document.querySelector('[data-testid="export-guide-html"]')),
        guideReact: Boolean(document.querySelector('[data-testid="export-guide-react"]')),
        guideFiles: Boolean(document.querySelector('[data-testid="export-guide-files"]')),
      }
    })
  })
  console.log(label, JSON.stringify(info, null, 2))
}

await dump('initial-html')
await page.getByTestId('btn-export-path-react').click()
await page.getByTestId('export-guide-react').waitFor()
await dump('after-react')
await page.screenshot({ path: 'tmp/export-handoff-ui/diag-react-selected.png' })
await page.getByTestId('btn-export-path-files').click()
await page.getByTestId('export-guide-files').waitFor()
await dump('after-files')
await page.getByTestId('btn-export-path-html').click()
await page.getByTestId('export-guide-html').waitFor()
await dump('back-html')
await browser.close()
await vite.close()
