import { expect, test } from '@playwright/test'
import { openBrowserZoomSession } from './browserZoom'
import { ensureEditor, openDockMore, recordSimplePath } from './helpers'

/**
 * Actual Chromium tab zoom via chrome.tabs.setZoom (extension helper).
 * CSS zoom and viewport resizing are covered separately in layout.spec.ts and
 * do not count as browser-zoom checks.
 *
 * Firefox/WebKit: Playwright has no public API for true browser zoom here;
 * those projects skip this file.
 */
test.describe('actual Chromium browser zoom', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chrome.tabs.setZoom is Chromium-only')

  for (const zoom of [1.5, 2] as const) {
    test(`browser zoom ${zoom * 100}% via tab zoom: layout reflows; controls stay in clips`, async ({
      browserName,
    }, testInfo) => {
      expect(browserName).toBe('chromium')

      const session = await openBrowserZoomSession({
        width: 1280,
        height: 800,
      })
      const { page, setZoom, readViewport, close } = session
      try {
        await page.goto('http://127.0.0.1:5173/')
        await ensureEditor(page)
        await recordSimplePath(page)

        await expect(page.getByTestId('btn-dock-more')).toBeVisible()

        const before = await readViewport()
        expect(before.layoutZoom ?? 1).toBeCloseTo(1, 1)
        expect(before.innerWidth).toBe(1280)
        expect(before.innerHeight).toBe(800)

        const zoomed = await setZoom(zoom)
        expect(zoomed.zoom).toBeCloseTo(zoom, 2)

        // At 200%, wait for focused-sheet chrome (React narrowViewport).
        if (zoom === 2) {
          await expect(page.getByTestId('btn-toggle-inspector-pane')).toBeVisible()
          await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
          await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
        }

        await expect(page.getByTestId('btn-dock-more')).toBeVisible()
        await expect(page.getByTestId('snap-to-grid-toggle')).toBeVisible()
        await expect(page.getByTestId('btn-edit-path')).toBeVisible()

        // Hit-test against real clipping containers (not document scrollWidth alone).
        await page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="btn-play"]')
          const clip = document.querySelector('[data-testid="toolbar-slot"]')
          if (!(el instanceof HTMLElement) || !(clip instanceof HTMLElement)) {
            return false
          }
          const er = el.getBoundingClientRect()
          const cr = clip.getBoundingClientRect()
          const cx = er.left + er.width / 2
          const cy = er.top + er.height / 2
          return (
            cx >= cr.left - 1 &&
            cx <= cr.right + 1 &&
            cy >= cr.top - 1 &&
            cy <= cr.bottom + 1
          )
        })

        for (const [id, clip] of [
          ['btn-play', 'toolbar-slot'],
          ['btn-record', 'toolbar-slot'],
          ['btn-export', 'editor-header'],
          ['btn-dock-more', 'toolbar-slot'],
          ['snap-to-grid-toggle', 'toolbar-slot'],
          ['btn-edit-path', 'toolbar-slot'],
        ] as const) {
          const hit = await page.evaluate(
            ({ id, clipId }) => {
              const el = document.querySelector(`[data-testid="${id}"]`)
              const clipEl = document.querySelector(`[data-testid="${clipId}"]`)
              if (!(el instanceof HTMLElement) || !(clipEl instanceof HTMLElement)) {
                return { ok: false, reason: 'missing' }
              }
              const er = el.getBoundingClientRect()
              const cr = clipEl.getBoundingClientRect()
              if (er.width < 4 || er.height < 4) {
                return { ok: false, reason: 'zero-size' }
              }
              const cx = er.left + er.width / 2
              const cy = er.top + er.height / 2
              const inside =
                cx >= cr.left - 1 &&
                cx <= cr.right + 1 &&
                cy >= cr.top - 1 &&
                cy <= cr.bottom + 1
              if (!inside) return { ok: false, reason: 'outside-clip' }
              const top = document.elementFromPoint(cx, cy)
              if (!(top instanceof Element)) return { ok: false, reason: 'no-hit' }
              const ok =
                el === top ||
                el.contains(top) ||
                top.closest(`[data-testid="${id}"]`) === el
              return { ok, reason: ok ? 'ok' : 'covered' }
            },
            { id, clipId: clip },
          )
          expect(hit, `${id} @${zoom * 100}%: ${hit.reason}`).toMatchObject({
            ok: true,
          })
        }

        const after = await readViewport()
        // Record actual viewport dimensions under real browser zoom.
        testInfo.annotations.push({
          type: 'browser-zoom-viewport',
          description: JSON.stringify({
            factor: zoom,
            reportedZoom: zoomed.zoom,
            ...after,
          }),
        })
        expect(after.layoutZoom).toBeCloseTo(zoom, 2)
        expect(after.devicePixelRatio).toBeCloseTo(zoom, 2)
        // Browser zoom shrinks the CSS layout viewport (unlike CSS zoom).
        expect(after.innerWidth).toBeCloseTo(1280 / zoom, 0)
        expect(after.innerHeight).toBeCloseTo(800 / zoom, 0)
        if (zoom === 2) {
          expect(after.matchMax767).toBe(true)
        }

        await openDockMore(page)
        await expect(page.getByTestId('btn-timing')).toBeVisible()
        await page.keyboard.press('Escape')

        const overflow = await page.evaluate(() => {
          const root = document.documentElement
          const shell = document.querySelector('[data-testid="app-shell"]')
          return {
            pageOverflowX: root.scrollWidth > root.clientWidth + 1,
            shellOverflowX:
              shell instanceof HTMLElement
                ? shell.scrollWidth > shell.clientWidth + 1
                : true,
          }
        })
        expect(overflow.pageOverflowX).toBe(false)
        expect(overflow.shellOverflowX).toBe(false)
      } finally {
        await setZoom(1).catch(() => {})
        await close()
      }
    })
  }
})
