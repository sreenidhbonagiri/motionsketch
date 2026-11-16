import { expect, test, type Page } from '@playwright/test'
import {
  assertUnclippedClickable,
  ensureEditor,
  openPanel,
  recordSimplePath,
} from './helpers'

const EASING_OPTION_IDS = [
  'easing-option-linear',
  'easing-option-easeOut',
  'easing-option-easeInOut',
  'easing-option-spring',
  'easing-option-bounce',
] as const

/**
 * Reveal a control below sticky Inspector chrome via scrollIntoView (respects
 * measured scroll-padding-top). Nudge with the measured chrome bottom if still
 * overlapped — no force-clicks.
 */
async function scrollMotionControlIntoBand(page: Page, testId: string) {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!(el instanceof HTMLElement)) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const chrome = document.querySelector(
      '[data-testid="inspector-sticky-chrome"]',
    )
    const scroller =
      (el.closest('[data-testid="inspector-panel"]') as HTMLElement | null) ??
      (el.closest('.overflow-y-auto, .overflow-auto') as HTMLElement | null)
    if (!(chrome instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
      return
    }
    const er = el.getBoundingClientRect()
    const cr = chrome.getBoundingClientRect()
    const tool = document.querySelector('[data-testid="toolbar-slot"]')
    const toolTop =
      tool instanceof HTMLElement
        ? tool.getBoundingClientRect().top
        : window.innerHeight
    if (er.top < cr.bottom + 1) {
      scroller.scrollTop -= cr.bottom + 2 - er.top
    }
    const er2 = el.getBoundingClientRect()
    if (er2.bottom > toolTop - 1) {
      scroller.scrollTop += er2.bottom - (toolTop - 2)
    }
  }, testId)
}

/** Assert control is fully below sticky chrome, above transport, and hittable. */
async function assertClearOfInspectorChrome(page: Page, testId: string) {
  await scrollMotionControlIntoBand(page, testId)
  const result = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    const chrome = document.querySelector(
      '[data-testid="inspector-sticky-chrome"]',
    )
    const tool = document.querySelector('[data-testid="toolbar-slot"]')
    const stage = document.querySelector('[data-testid="stage-viewport"]')
    const back = document.querySelector(
      '[data-testid="btn-inspector-back-to-stage"]',
    )
    const tabs = document.querySelector(
      '[role="tablist"][aria-label="Inspector"]',
    )
    if (!(el instanceof HTMLElement) || !(chrome instanceof HTMLElement)) {
      return { ok: false, reason: 'missing' as const }
    }
    const er = el.getBoundingClientRect()
    const cr = chrome.getBoundingClientRect()
    const toolTop =
      tool instanceof HTMLElement
        ? tool.getBoundingClientRect().top
        : window.innerHeight
    const slack = 1
    const clearOfChrome = er.top >= cr.bottom - slack
    const clearOfTransport = er.bottom <= toolTop + slack
    const cx = er.left + er.width / 2
    const cy = er.top + er.height / 2
    const top = document.elementFromPoint(cx, cy)
    const hit =
      top === el ||
      !!top?.closest?.(`[data-testid="${id}"]`) ||
      (top instanceof Element && el.contains(top))
    const stageVisible =
      stage instanceof HTMLElement &&
      getComputedStyle(stage).display !== 'none' &&
      stage.getBoundingClientRect().height > 40
    return {
      ok: clearOfChrome && clearOfTransport && hit && stageVisible,
      reason: !clearOfChrome
        ? 'under-chrome'
        : !clearOfTransport
          ? 'under-transport'
          : !hit
            ? 'covered'
            : !stageVisible
              ? 'stage-hidden'
              : 'ok',
      gapBelowChrome: Math.round(er.top - cr.bottom),
      top: Math.round(er.top),
      bottom: Math.round(er.bottom),
      chromeBottom: Math.round(cr.bottom),
      toolTop: Math.round(toolTop),
      pad: document.querySelector('[data-testid="inspector-panel"]')
        instanceof HTMLElement
        ? (
            document.querySelector(
              '[data-testid="inspector-panel"]',
            ) as HTMLElement
          ).dataset.inspectorScrollPadTop ?? null
        : null,
      backVisible: back instanceof HTMLElement,
      tabsVisible: tabs instanceof HTMLElement,
      hit,
    }
  }, testId)
  expect(result, `${testId}: ${JSON.stringify(result)}`).toMatchObject({
    ok: true,
  })
  expect(result.backVisible).toBe(true)
  expect(result.tabsVisible).toBe(true)
}

/** Range inputs are labeled via <label htmlFor>; hit-test without requiring aria-label. */
async function assertSliderReachable(page: Page, testId: string) {
  await scrollMotionControlIntoBand(page, testId)
  const result = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!(el instanceof HTMLInputElement)) {
      return { ok: false, reason: 'missing' as const }
    }
    const er = el.getBoundingClientRect()
    if (er.width < 8 || er.height < 4) {
      return { ok: false, reason: 'zero-size' as const }
    }
    const toolbar = document.querySelector('[data-testid="toolbar-slot"]')
    const toolTop =
      toolbar instanceof HTMLElement
        ? toolbar.getBoundingClientRect().top
        : window.innerHeight
    if (er.bottom > toolTop - 1) {
      return {
        ok: false,
        reason: 'under-transport' as const,
        top: Math.round(er.top),
        bottom: Math.round(er.bottom),
        toolTop: Math.round(toolTop),
      }
    }
    const cx = er.left + er.width / 2
    const cy = er.top + er.height / 2
    const top = document.elementFromPoint(cx, cy)
    const hit =
      top === el ||
      !!top?.closest?.(`[data-testid="${id}"]`) ||
      (top instanceof Element && el.contains(top))
    const labeled =
      !!el.labels?.length ||
      !!el.getAttribute('aria-label') ||
      !!document.querySelector(`label[for="${el.id}"]`)
    return {
      ok: hit && labeled && !el.disabled,
      reason: !labeled
        ? 'unlabeled'
        : !hit
          ? 'covered'
          : el.disabled
            ? 'disabled'
            : 'ok',
      top: Math.round(er.top),
      bottom: Math.round(er.bottom),
    }
  }, testId)
  expect(result, `${testId}: ${JSON.stringify(result)}`).toMatchObject({
    ok: true,
  })
}

async function motionControlOrder(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="adjust-panel"]')
    if (!(root instanceof HTMLElement)) return null
    const ids = [
      'duration-slider',
      'easing-picker',
      'inspector-motion-help',
      'svg-path-import',
      'smoothing-slider',
      'steady-speed-slider',
      'motion-presets',
    ] as const
    const tops: Record<string, number> = {}
    for (const id of ids) {
      const el = root.querySelector(`[data-testid="${id}"]`)
      if (!(el instanceof HTMLElement)) return { ok: false, missing: id }
      tops[id] = el.getBoundingClientRect().top
    }
    const ordered =
      tops['duration-slider']! < tops['easing-picker']! &&
      tops['easing-picker']! < tops['inspector-motion-help']! &&
      tops['inspector-motion-help']! < tops['svg-path-import']! &&
      tops['svg-path-import']! < tops['smoothing-slider']! &&
      tops['smoothing-slider']! < tops['steady-speed-slider']! &&
      tops['steady-speed-slider']! < tops['motion-presets']!
    return { ok: ordered, tops }
  })
}

async function presetGridProbe(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-testid="motion-presets-grid"]')
    if (!(grid instanceof HTMLElement)) return { ok: false, reason: 'no-grid' }
    const cs = getComputedStyle(grid)
    const tiles = [
      ...grid.querySelectorAll('[data-testid^="motion-preset-"]'),
    ].filter(
      (el) =>
        el instanceof HTMLElement &&
        /^motion-preset-(slide-in|pop-in|float|attention-pulse)$/.test(
          el.getAttribute('data-testid') ?? '',
        ),
    ) as HTMLElement[]
    if (tiles.length !== 4) {
      return { ok: false, reason: 'count', count: tiles.length }
    }
    const rows = new Map<number, HTMLElement[]>()
    for (const tile of tiles) {
      const top = Math.round(tile.getBoundingClientRect().top)
      const bucket = [...rows.keys()].find((k) => Math.abs(k - top) <= 4) ?? top
      const list = rows.get(bucket) ?? []
      list.push(tile)
      rows.set(bucket, list)
    }
    const rowSizes = [...rows.values()].map((r) => r.length)
    const twoByTwo =
      rowSizes.length === 2 && rowSizes.every((n) => n === 2)
    const wrapsOk = tiles.every((tile) => {
      const label = tile.querySelector('span')
      const summary = tile.querySelector('[data-testid^="motion-preset-summary-"]')
      if (!(label instanceof HTMLElement) || !(summary instanceof HTMLElement)) {
        return false
      }
      const tr = tile.getBoundingClientRect()
      const lr = label.getBoundingClientRect()
      const sr = summary.getBoundingClientRect()
      const labelFs = Number.parseFloat(getComputedStyle(label).fontSize)
      const summaryFs = Number.parseFloat(getComputedStyle(summary).fontSize)
      const labelCs = getComputedStyle(label)
      const notEllipsisClipped =
        labelCs.textOverflow !== 'ellipsis' || labelCs.overflow === 'visible'
      return (
        lr.bottom <= tr.bottom + 0.5 &&
        sr.bottom <= tr.bottom + 0.5 &&
        lr.top >= tr.top - 0.5 &&
        sr.top >= lr.bottom - 1 &&
        labelFs >= 13.5 &&
        summaryFs >= 10.5 &&
        notEllipsisClipped
      )
    })
    // Long behavior lives in help, not on the tile face (short summaries OK).
    const longOnTile = tiles.some((t) =>
      /Hide before Start|scale overshoot|Drifts gently above|pulses scale/i.test(
        t.innerText,
      ),
    )
    const help = document.querySelector('[data-testid="motion-presets-help"]')
    return {
      ok:
        cs.display === 'grid' &&
        twoByTwo &&
        wrapsOk &&
        !longOnTile &&
        !!help,
      cols: cs.gridTemplateColumns,
      rowSizes,
      longOnTile,
      hasHelp: !!help,
    }
  })
}

async function openMotionAdjust(page: Page) {
  await openPanel(page, 'adjust')
  await expect(page.getByTestId('adjust-panel')).toBeVisible()
  await expect(page.getByTestId('motion-presets')).toBeVisible()
}

test.describe('motion inspector presets layout', () => {
  test('260px floating Inspector: order + 2-col tiles; playback can reach timing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openMotionAdjust(page)

    await expect(page.getByTestId('stage-viewport')).toHaveAttribute(
      'data-inspector-floating',
      'true',
    )
    const card = page.getByTestId('inspector-slot')
    const width = await card.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeLessThanOrEqual(280)
    expect(width).toBeGreaterThan(200)

    const order = await motionControlOrder(page)
    expect(order?.ok, JSON.stringify(order)).toBe(true)
    const grid = await presetGridProbe(page)
    expect(grid.ok, JSON.stringify(grid)).toBe(true)
    await expect(page.getByTestId('motion-preset-summary-slide-in')).toHaveText(
      'Slide upward',
    )
    await expect(page.getByTestId('motion-preset-summary-pop-in')).toHaveText(
      'Scale entrance',
    )
    await expect(page.getByTestId('motion-preset-summary-float')).toHaveText(
      /Gentle drift/,
    )
    await expect(
      page.getByTestId('motion-preset-summary-attention-pulse'),
    ).toHaveText(/Draw attention/)

    // Loop keeps Pause mounted while we reach Duration/Easing/Smoothing —
    // without it a ~1.2s take ends before the mid-play assertions (same setup
    // as the tablet split case below).
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect(page.getByTestId('stage-viewport')).toBeVisible()
    await assertSliderReachable(page, 'duration-slider')
    await assertUnclippedClickable(page, 'easing-option-linear')
    await assertSliderReachable(page, 'smoothing-slider')
    // Adjust while watching — duration stays interactive during play.
    const before = await page.getByTestId('duration-value').innerText()
    const nextMs = await page.getByTestId('duration-slider').evaluate((el) => {
      if (!(el instanceof HTMLInputElement)) return 1400
      return String(Math.min(3000, Number(el.value) + 200))
    })
    await page.getByTestId('duration-slider').fill(nextMs)
    await expect(page.getByTestId('duration-value')).not.toHaveText(before)
    await expect(page.getByTestId('btn-pause')).toBeVisible()

    await page
      .getByTestId('motion-presets')
      .evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.screenshot({
      path: 'tmp/motion-presets-layout/1280-floating-260-presets.png',
      fullPage: false,
    })
    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('btn-play')).toBeVisible()
  })

  test('tablet split: presets grid + timing above while playing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-toggle-elements-pane').click()
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('editor-workspace')).toHaveAttribute(
      'data-inspector-split',
      'true',
    )
    await page.getByTestId('btn-inspector-motion').click()
    await expect(page.getByTestId('adjust-panel')).toBeVisible()

    const order = await motionControlOrder(page)
    expect(order?.ok, JSON.stringify(order)).toBe(true)
    const grid = await presetGridProbe(page)
    expect(grid.ok, JSON.stringify(grid)).toBe(true)

    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect(page.getByTestId('stage-viewport')).toBeVisible()
    await assertSliderReachable(page, 'duration-slider')
    await assertSliderReachable(page, 'smoothing-slider')
    await scrollMotionControlIntoBand(page, 'easing-picker')
    await page.getByTestId('easing-option-easeOut').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Ease out')

    await page.screenshot({
      path: 'tmp/motion-presets-layout/900-split-playing.png',
      fullPage: false,
    })
    await page
      .getByTestId('btn-pause')
      .click({ timeout: 1500 })
      .catch(() => undefined)
  })

  for (const size of [
    { width: 390, height: 844, label: '390×844' },
    { width: 390, height: 560, label: '390×560' },
  ] as const) {
    test(`${size.label}: all five easing options clear sticky chrome + clicks`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)
      await openMotionAdjust(page)

      await expect(page.getByTestId('inspector-sticky-chrome')).toBeVisible()
      await expect(page.getByTestId('btn-inspector-back-to-stage')).toBeVisible()
      await expect(
        page.getByRole('tablist', { name: 'Inspector' }),
      ).toBeVisible()

      // Measured scroll-padding matches sticky chrome height.
      const pad = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="inspector-panel"]')
        const chrome = document.querySelector(
          '[data-testid="inspector-sticky-chrome"]',
        )
        if (!(panel instanceof HTMLElement) || !(chrome instanceof HTMLElement)) {
          return null
        }
        return {
          pad: Number(panel.dataset.inspectorScrollPadTop ?? 0),
          chromeH: Math.ceil(chrome.getBoundingClientRect().height),
          stylePad: panel.style.scrollPaddingTop,
        }
      })
      expect(pad).toBeTruthy()
      expect(pad!.pad).toBeGreaterThan(40)
      expect(pad!.pad).toBe(pad!.chromeH)

      await page.getByTestId('loop-toggle').check()
      await page.getByTestId('btn-play').click()
      await expect(page.getByTestId('btn-pause')).toBeVisible()
      await expect(page.getByTestId('stage-viewport')).toBeVisible()

      await assertSliderReachable(page, 'duration-slider')
      await assertSliderReachable(page, 'smoothing-slider')

      const labels = [
        'Linear',
        'Ease out',
        'Ease in-out',
        'Spring',
        'Bounce',
      ] as const
      for (let i = 0; i < EASING_OPTION_IDS.length; i++) {
        const id = EASING_OPTION_IDS[i]!
        await assertClearOfInspectorChrome(page, id)
        await assertUnclippedClickable(page, id)
        await page.getByTestId(id).click()
        await expect(page.getByTestId('easing-value')).toHaveText(labels[i]!)
        await expect(page.getByTestId(id)).toHaveAttribute(
          'aria-checked',
          'true',
        )
      }

      await assertUnclippedClickable(page, 'btn-pause')
      await expect(page.getByTestId('stage-viewport')).toBeVisible()

      // Settled shot with Linear fully exposed below sticky chrome.
      await assertClearOfInspectorChrome(page, 'easing-option-linear')
      await page.getByTestId('easing-option-linear').click()
      await expect(page.getByTestId('easing-value')).toHaveText('Linear')
      await page.screenshot({
        path: `tmp/motion-presets-layout/${size.width}x${size.height}-linear-exposed.png`,
        fullPage: false,
      })

      await page
        .getByTestId('btn-pause')
        .click({ timeout: 1500 })
        .catch(() => undefined)
    })
  }
})
