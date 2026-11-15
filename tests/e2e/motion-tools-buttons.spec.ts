import { expect, test, type Page } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  recordSimplePath,
} from './helpers'

type ButtonProbe = {
  ok: boolean
  reason?: string
  height: number
  paddingTop: number
  paddingBottom: number
  gapToNext: number | null
  labelBottom: number
  descBottom: number
  btnBottom: number
  descFullyInside: boolean
  fontSizePx: number
  descFontSizePx: number
}

async function probePolishGlide(page: Page): Promise<{
  polish: ButtonProbe
  glide: ButtonProbe
  headingNeutral: boolean
}> {
  return page.evaluate(() => {
    const polish = document.querySelector('[data-testid="btn-polish-motion"]')
    const glide = document.querySelector('[data-testid="btn-glide"]')
    const polishDesc = document.querySelector('[data-testid="polish-tool-desc"]')
    const glideDesc = document.querySelector('[data-testid="glide-tool-desc"]')
    const heading = document.querySelector(
      '[data-testid="motion-tools-section-chrome"] h3',
    )
    const read = (
      btn: Element | null,
      desc: Element | null,
      next: Element | null,
    ): ButtonProbe => {
      if (!(btn instanceof HTMLElement) || !(desc instanceof HTMLElement)) {
        return {
          ok: false,
          reason: 'missing',
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          gapToNext: null,
          labelBottom: 0,
          descBottom: 0,
          btnBottom: 0,
          descFullyInside: false,
          fontSizePx: 0,
          descFontSizePx: 0,
        }
      }
      const cs = getComputedStyle(btn)
      const br = btn.getBoundingClientRect()
      const dr = desc.getBoundingClientRect()
      const label = btn.querySelector('span > span:first-child')
      const lr =
        label instanceof HTMLElement
          ? label.getBoundingClientRect()
          : { bottom: br.top }
      const padTop = Number.parseFloat(cs.paddingTop) || 0
      const padBottom = Number.parseFloat(cs.paddingBottom) || 0
      const gapToNext =
        next instanceof HTMLElement
          ? Math.round(
              next.getBoundingClientRect().top - br.bottom,
            )
          : null
      const descFullyInside =
        dr.top >= br.top - 0.5 &&
        dr.bottom <= br.bottom + 0.5 &&
        dr.left >= br.left - 0.5 &&
        dr.right <= br.right + 0.5
      const fontSizePx = Number.parseFloat(cs.fontSize) || 0
      const descFontSizePx =
        Number.parseFloat(getComputedStyle(desc).fontSize) || 0
      // Fixed h-8 (32px) clipped two-line copy; content-sized buttons grow.
      const notClippedToSingleLine = br.height > 36
      return {
        ok:
          notClippedToSingleLine &&
          padTop >= 7.5 &&
          padBottom >= 7.5 &&
          descFullyInside &&
          lr.bottom <= dr.top + 1 &&
          fontSizePx >= 11.5 &&
          descFontSizePx >= 10.5 &&
          (gapToNext === null || gapToNext >= 7.5),
        height: Math.round(br.height),
        paddingTop: padTop,
        paddingBottom: padBottom,
        gapToNext,
        labelBottom: Math.round(lr.bottom),
        descBottom: Math.round(dr.bottom),
        btnBottom: Math.round(br.bottom),
        descFullyInside,
        fontSizePx,
        descFontSizePx,
      }
    }
    let headingNeutral = false
    if (heading instanceof HTMLElement) {
      const c = getComputedStyle(heading).color
      // slate-800 ≈ rgb(36, 48, 73) — not purple ms-motion rgb(124, 58, 237)
      headingNeutral = c !== 'rgb(124, 58, 237)' && !c.includes('124, 58, 237')
    }
    return {
      polish: read(polish, polishDesc, glide),
      glide: read(glide, glideDesc, null),
      headingNeutral,
    }
  })
}

async function openMotionTools(page: Page) {
  await openPanel(page, 'adjust')
  await expect(page.getByTestId('refine-motion-tools')).toBeVisible()
  await page.getByTestId('btn-polish-motion').evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
}

test.describe('motion tools button sizing', () => {
  test('narrow desktop Inspector: content-sized Polish/Glide', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openMotionTools(page)

    const probe = await probePolishGlide(page)
    expect(probe.headingNeutral, JSON.stringify(probe)).toBe(true)
    expect(probe.polish.ok, JSON.stringify(probe.polish)).toBe(true)
    expect(probe.glide.ok, JSON.stringify(probe.glide)).toBe(true)
    expect(probe.polish.gapToNext ?? 0).toBeGreaterThanOrEqual(8)
    expect(probe.polish.height).toBeGreaterThan(36)
    expect(probe.glide.height).toBeGreaterThan(36)

    await expect(page.getByTestId('btn-polish-motion')).toBeEnabled()
    await expect(page.getByTestId('btn-glide')).toBeEnabled()
    // Accessible name still includes the label.
    await expect(
      page.getByRole('button', { name: /Polish motion/i }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^Glide/i })).toBeVisible()

    await page.screenshot({
      path: 'tmp/motion-tools-buttons/1280-narrow-inspector.png',
      fullPage: false,
    })
  })

  test('tablet split Inspector: Polish/Glide fit with wrap room', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    // Crowded both-open → focused split.
    await page.getByTestId('btn-toggle-elements-pane').click()
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('editor-workspace')).toHaveAttribute(
      'data-inspector-split',
      'true',
    )
    await page.getByTestId('btn-inspector-motion').click()
    await expect(page.getByTestId('refine-motion-tools')).toBeVisible()
    await page.getByTestId('btn-polish-motion').evaluate((el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    })

    const probe = await probePolishGlide(page)
    expect(probe.polish.ok, JSON.stringify(probe.polish)).toBe(true)
    expect(probe.glide.ok, JSON.stringify(probe.glide)).toBe(true)
    expect(probe.polish.gapToNext ?? 0).toBeGreaterThanOrEqual(8)

    await page.screenshot({
      path: 'tmp/motion-tools-buttons/900-split-inspector.png',
      fullPage: false,
    })
  })

  test('phone + forced wrap: description stays inside button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openMotionTools(page)

    // Force a long wrapping description without changing product copy permanently.
    await page.evaluate(() => {
      const desc = document.querySelector('[data-testid="polish-tool-desc"]')
      if (desc) {
        desc.textContent =
          'Gentler path; pauses and corners stay, even when this description wraps onto several lines in a narrow inspector'
      }
    })

    const probe = await probePolishGlide(page)
    expect(probe.polish.descFullyInside, JSON.stringify(probe.polish)).toBe(
      true,
    )
    expect(probe.polish.paddingTop).toBeGreaterThanOrEqual(8)
    expect(probe.polish.paddingBottom).toBeGreaterThanOrEqual(8)
    expect(probe.polish.height).toBeGreaterThan(48)
    expect(probe.polish.descFontSizePx).toBeGreaterThanOrEqual(10.5)
    expect(probe.glide.ok, JSON.stringify(probe.glide)).toBe(true)

    await page.screenshot({
      path: 'tmp/motion-tools-buttons/390-phone-wrapped.png',
      fullPage: false,
    })
  })
})
