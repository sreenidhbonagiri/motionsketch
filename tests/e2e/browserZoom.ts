import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type BrowserContext, type Page } from '@playwright/test'

/** Unpacked MV3 extension that exposes chrome.tabs.setZoom to Playwright. */
export function browserZoomExtensionPath() {
  return path.resolve(
    process.cwd(),
    'tests/fixtures/browser-zoom-extension',
  )
}

export type BrowserZoomSession = {
  context: BrowserContext
  page: Page
  userDataDir: string
  setZoom: (factor: number) => Promise<{ ok: true; zoom: number }>
  readViewport: () => Promise<{
    innerWidth: number
    innerHeight: number
    clientWidth: number
    devicePixelRatio: number
    visualViewportWidth: number | null
    visualViewportScale: number | null
    layoutZoom: number | null
    matchMax767: boolean
  }>
  close: () => Promise<void>
}

/**
 * Launch headed Chromium with the zoom helper extension.
 * Real tab zoom (chrome.tabs.setZoom) — not CSS zoom, not viewport resize.
 * Headless Chromium does not load MV3 service workers for extensions.
 */
export async function openBrowserZoomSession(options?: {
  width?: number
  height?: number
}): Promise<BrowserZoomSession> {
  const width = options?.width ?? 1280
  const height = options?.height ?? 800
  const ext = browserZoomExtensionPath()
  if (!fs.existsSync(path.join(ext, 'manifest.json'))) {
    throw new Error(`missing browser zoom extension at ${ext}`)
  }
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'ms-browser-zoom-'),
  )
  const context = await chromium.launchPersistentContext(userDataDir, {
    viewport: { width, height },
    headless: false,
    args: [
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
    ],
  })
  const page = context.pages()[0] ?? (await context.newPage())

  let sw = context.serviceWorkers()[0]
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 10_000 })
  }

  const setZoom = async (factor: number) => {
    const result = await sw.evaluate(async (zoom) => {
      const tabs = await chrome.tabs.query({
        url: 'http://127.0.0.1:5173/*',
      })
      const tab =
        tabs.find((t) => t.active) ??
        tabs[0] ??
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
      if (!tab?.id) {
        return { ok: false as const, reason: 'no-tab' }
      }
      await chrome.tabs.setZoom(tab.id, zoom)
      const got = await chrome.tabs.getZoom(tab.id)
      return { ok: true as const, zoom: got }
    }, factor)
    if (!result.ok) {
      throw new Error(`setZoom(${factor}) failed: ${JSON.stringify(result)}`)
    }
    // Wait for HostZoomMap + layout viewport reflow (and React narrow matchMedia).
    await page.waitForFunction(
      (expected) => {
        const dprOk = Math.abs(window.devicePixelRatio - expected) < 0.05
        const widthOk =
          Math.abs(window.innerWidth - 1280 / expected) <= 2
        const narrowOk =
          expected < 2 || window.matchMedia('(max-width: 767px)').matches
        return dprOk && widthOk && narrowOk
      },
      factor,
      { timeout: 8000 },
    )
    return result
  }

  const readViewport = async () => {
    const cdp = await context.newCDPSession(page)
    const layout = await cdp.send('Page.getLayoutMetrics')
    const pageDims = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportWidth: window.visualViewport?.width ?? null,
      visualViewportScale: window.visualViewport?.scale ?? null,
      matchMax767: window.matchMedia('(max-width: 767px)').matches,
    }))
    await cdp.detach().catch(() => {})
    return {
      ...pageDims,
      layoutZoom:
        layout.cssVisualViewport?.zoom ?? layout.visualViewport?.zoom ?? null,
    }
  }

  const close = async () => {
    await context.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }

  return { context, page, userDataDir, setZoom, readViewport, close }
}
