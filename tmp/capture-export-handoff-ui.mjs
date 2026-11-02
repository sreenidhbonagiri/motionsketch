/**
 * Desktop + mobile screenshots of Add to your website + download success.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const out = join(process.cwd(), 'tmp/export-handoff-ui')
mkdirSync(out, { recursive: true })

const vite = await createServer({
  root: process.cwd(),
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
})
await vite.listen()
const addr = vite.httpServer?.address()
const port = typeof addr === 'object' && addr ? addr.port : 5199
const base = `http://127.0.0.1:${port}`
const { buildHtmlDemoExportFixtureJson } = await vite.ssrLoadModule(
  '/tests/fixtures/htmlDemoExportProject.ts',
)
const fixture = buildHtmlDemoExportFixtureJson()
console.log('preview', base)

const browser = await chromium.launch()

async function openExport(page) {
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.evaluate((raw) => {
    localStorage.setItem('motionsketch.project.v1', raw)
  }, fixture)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByTestId('app-shell').waitFor()
  await page.getByTestId('btn-play').waitFor({ state: 'visible' })
  await page.getByTestId('btn-export').click()
  await page.getByTestId('export-primary').waitFor({ state: 'visible' })
}

async function capture(name, viewport) {
  const ctx = await browser.newContext({
    viewport,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
  })
  const page = await ctx.newPage()
  await openExport(page)

  async function selectPath(path) {
    await page.getByTestId(`btn-export-path-${path}`).click()
    await page.getByTestId(`export-guide-${path}`).waitFor()
    await expectSelected(path)
  }
  async function expectSelected(path) {
    for (const id of ['html', 'react', 'files']) {
      const selected = id === path
      await page.waitForFunction(
        ({ id, selected }) => {
          const el = document.querySelector(`[data-testid="btn-export-path-${id}"]`)
          if (!el) return false
          return (
            el.getAttribute('data-selected') === (selected ? 'true' : 'false') &&
            el.classList.contains('bg-white') === selected
          )
        },
        { id, selected },
      )
    }
  }

  await expectSelected('html')
  await page.screenshot({
    path: join(out, `${name}-html.png`),
    fullPage: false,
  })
  await selectPath('react')
  await page.screenshot({
    path: join(out, `${name}-react.png`),
    fullPage: false,
  })
  await selectPath('files')
  await page.screenshot({
    path: join(out, `${name}-files.png`),
    fullPage: false,
  })
  await selectPath('html')
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByTestId('btn-download-web-package').click(),
  ])
  await download.cancel().catch(() => {})
  await page.getByTestId('export-download-success').waitFor({ timeout: 10000 })
  await page.screenshot({
    path: join(out, `${name}-success.png`),
    fullPage: false,
  })
  await page.getByTestId('export-other-ways-summary').evaluate((el) => {
    el.scrollIntoView({ block: 'center' })
  })
  await page.getByTestId('export-other-ways-summary').click()
  await page.getByTestId('btn-download-css').waitFor({ state: 'visible' })
  await page.screenshot({
    path: join(out, `${name}-advanced.png`),
    fullPage: false,
  })
  await ctx.close()
  console.log('captured', name)
}

await capture('desktop', { width: 1280, height: 800 })
await capture('mobile', { width: 390, height: 844 })
writeFileSync(
  join(out, 'manifest.json'),
  JSON.stringify(
    {
      desktop: [
        'desktop-html.png',
        'desktop-react.png',
        'desktop-files.png',
        'desktop-success.png',
        'desktop-advanced.png',
      ],
      mobile: [
        'mobile-html.png',
        'mobile-react.png',
        'mobile-files.png',
        'mobile-success.png',
        'mobile-advanced.png',
      ],
      host: '/Users/sreenidhbonagiri/Desktop/ms-export-handoff-verify/verify',
    },
    null,
    2,
  ),
)
console.log('wrote', out)
await browser.close()
await vite.close()
