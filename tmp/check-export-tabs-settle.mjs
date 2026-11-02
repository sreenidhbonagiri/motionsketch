import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const vite = await createServer({
  root: process.cwd(),
  server: { host: '127.0.0.1', port: 5202, strictPort: true },
})
await vite.listen()
const { buildHtmlDemoExportFixtureJson } = await vite.ssrLoadModule(
  '/tests/fixtures/htmlDemoExportProject.ts',
)
const fixture = buildHtmlDemoExportFixtureJson()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:5202', { waitUntil: 'networkidle' })
await page.evaluate((raw) => localStorage.setItem('motionsketch.project.v1', raw), fixture)
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('btn-export').click()
await page.getByTestId('btn-export-path-react').click()
await page.getByTestId('export-guide-react').waitFor()
await page.waitForTimeout(400)
const settled = await page.evaluate(() => {
  const ids = ['html', 'react', 'files']
  return ids.map((id) => {
    const el = document.querySelector(`[data-testid="btn-export-path-${id}"]`)
    const cs = getComputedStyle(el)
    return {
      id,
      ariaSelected: el.getAttribute('aria-selected'),
      bg: cs.backgroundColor,
      color: cs.color,
      classHasBgWhite: el.className.includes('bg-white'),
    }
  })
})
console.log(JSON.stringify(settled, null, 2))
await page.screenshot({ path: 'tmp/export-handoff-ui/diag-react-settled.png' })
await browser.close()
await vite.close()
