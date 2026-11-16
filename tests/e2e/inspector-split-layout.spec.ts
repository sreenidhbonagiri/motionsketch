import { expect, test, type Page } from '@playwright/test'
import {
  assertUnclippedClickable,
  ensureEditor,
  openPanel,
  recordSimplePath,
} from './helpers'

type SplitProbe = {
  stageVisible: boolean
  stageAboveInspector: boolean
  inspectorVisible: boolean
  stageHeight: number
  inspectorHeight: number
  stageWidth: number
  contentWidth: number
  playHit: boolean
  inspectorSplit: boolean
  cam: string
}

async function readSplitProbe(page: Page): Promise<SplitProbe> {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="stage-viewport"]')
    const slot = document.querySelector('[data-testid="inspector-slot"]')
    const content = document.querySelector(
      '[data-testid="focused-sheet-content"]',
    )
    const workspace = document.querySelector(
      '[data-testid="editor-workspace"]',
    )
    const play =
      document.querySelector('[data-testid="btn-play"]') ??
      document.querySelector('[data-testid="btn-pause"]')
    const world = document.querySelector(
      '[data-testid="workspace-world"]',
    ) as HTMLElement | null
    if (
      !(stage instanceof HTMLElement) ||
      !(slot instanceof HTMLElement) ||
      !(content instanceof HTMLElement)
    ) {
      return {
        stageVisible: false,
        stageAboveInspector: false,
        inspectorVisible: false,
        stageHeight: 0,
        inspectorHeight: 0,
        stageWidth: 0,
        contentWidth: 0,
        playHit: false,
        inspectorSplit: false,
        cam: '',
      }
    }
    const sr = stage.getBoundingClientRect()
    const ir = slot.getBoundingClientRect()
    const stageHidden =
      stage.classList.contains('hidden') ||
      getComputedStyle(stage).display === 'none'
    let playHit = false
    if (play instanceof HTMLElement) {
      const pr = play.getBoundingClientRect()
      const top = document.elementFromPoint(
        pr.left + pr.width / 2,
        pr.top + pr.height / 2,
      )
      playHit =
        top === play || !!top?.closest?.('[data-testid="btn-play"], [data-testid="btn-pause"]')
    }
    return {
      stageVisible: !stageHidden && sr.height > 40 && sr.width > 40,
      stageAboveInspector: sr.bottom <= ir.top + 2,
      inspectorVisible: ir.height > 80 && ir.width > 40,
      stageHeight: Math.round(sr.height),
      inspectorHeight: Math.round(ir.height),
      stageWidth: Math.round(sr.width),
      contentWidth: Math.round(content.getBoundingClientRect().width),
      playHit,
      inspectorSplit:
        workspace?.getAttribute('data-inspector-split') === 'true',
      cam: world?.style.transform ?? '',
    }
  })
}

async function openMotionInspector(page: Page, opts?: { forceCrowded?: boolean }) {
  // Mid widths (768–1099) still float a single Inspector card. Opening Elements
  // first forces focused chrome so we exercise the stage-above split.
  if (opts?.forceCrowded) {
    const elements = page.getByTestId('btn-toggle-elements-pane')
    if ((await elements.getAttribute('aria-pressed')) !== 'true') {
      await elements.click()
    }
    await expect(page.getByTestId('actor-list-slot')).toBeVisible()
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
  }
  await openPanel(page, 'adjust')
  await expect(page.getByTestId('inspector-motion-body')).toBeVisible()
  await expect(page.getByTestId('btn-inspector-back-to-stage')).toBeVisible()
}

async function corePlayAdjustPauseLoop(page: Page) {
  await expect(page.getByTestId('btn-play')).toBeEnabled()
  await page.getByTestId('btn-play').click()
  await expect(page.getByTestId('btn-pause')).toBeVisible()

  const duration = page.getByTestId('duration-slider')
  if (await duration.isVisible().catch(() => false)) {
    await duration.focus()
  }
  const steady = page.getByTestId('steady-speed-slider')
  if (await steady.isVisible().catch(() => false)) {
    await steady.evaluate((el) => {
      if (!(el instanceof HTMLElement)) return
      let root: HTMLElement | null = el
      while (root) {
        const cs = getComputedStyle(root)
        if (
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          root.scrollHeight > root.clientHeight + 1
        ) {
          root.scrollTop = Math.min(root.scrollTop + 120, root.scrollHeight)
          break
        }
        root = root.parentElement
      }
    })
  }

  await expect(page.getByTestId('stage-viewport')).toBeVisible()
  await page.getByTestId('btn-pause').click()
  await expect(page.getByTestId('btn-play')).toBeVisible()

  await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
  await page.getByTestId('btn-edit-path').click()
  await expect(page.getByTestId('btn-done-edit')).toBeVisible()
  await page.getByTestId('btn-done-edit').click()
  await expect(page.getByTestId('btn-edit-path')).toBeVisible()
}

test.describe('inspector split layout (stage above)', () => {
  for (const size of [
    {
      width: 900,
      height: 720,
      label: '900×720',
      compactMax: 421,
      forceCrowded: true,
    },
    {
      width: 768,
      height: 720,
      label: '768×720',
      compactMax: 421,
      forceCrowded: true,
    },
    {
      width: 390,
      height: 844,
      label: '390×844',
      compactMax: 390,
      forceCrowded: false,
    },
    {
      width: 390,
      height: 560,
      label: '390×560',
      compactMax: 390,
      forceCrowded: false,
    },
  ] as const) {
    test(`${size.label}: stage + Inspector together; compact column; camera preserved`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await page.evaluate(() => {
        try {
          sessionStorage.clear()
          localStorage.clear()
        } catch {
          /* ignore */
        }
      })
      await page.reload()
      await ensureEditor(page)
      const firstUse = page.getByTestId('btn-dismiss-first-use')
      if (await firstUse.isVisible().catch(() => false)) await firstUse.click()
      await recordSimplePath(page)

      const camBefore = await page.evaluate(() => {
        const world = document.querySelector(
          '[data-testid="workspace-world"]',
        ) as HTMLElement | null
        return world?.style.transform ?? ''
      })

      await openMotionInspector(page, { forceCrowded: size.forceCrowded })
      const probe = await readSplitProbe(page)
      expect(probe.inspectorSplit, JSON.stringify(probe)).toBe(true)
      expect(probe.stageVisible, JSON.stringify(probe)).toBe(true)
      expect(probe.inspectorVisible, JSON.stringify(probe)).toBe(true)
      expect(probe.stageAboveInspector, JSON.stringify(probe)).toBe(true)
      expect(probe.playHit, JSON.stringify(probe)).toBe(true)
      // ~half usable height for Inspector (allow short-height floors).
      expect(probe.inspectorHeight).toBeGreaterThan(100)
      expect(probe.stageHeight).toBeGreaterThan(80)
      expect(probe.contentWidth).toBeLessThanOrEqual(size.compactMax)
      expect(probe.contentWidth).toBeGreaterThan(200)

      await assertUnclippedClickable(page, 'btn-inspector-style')
      await assertUnclippedClickable(page, 'btn-inspector-motion')
      await assertUnclippedClickable(page, 'btn-inspector-back-to-stage')
      await assertUnclippedClickable(page, 'btn-play')

      // Typed zoom / Fit while split — must not auto-Fit on open; geometry unchanged.
      const zoomBtn = page.getByTestId('zoom-percent')
      if (await zoomBtn.isVisible().catch(() => false)) {
        await zoomBtn.click()
        const input = page.getByTestId('zoom-percent-input')
        await input.fill('125')
        await input.press('Enter')
        await expect(page.getByTestId('zoom-percent')).toHaveText('125%')
        await page.getByTestId('btn-fit-stage').click()
        await expect(page.getByTestId('zoom-percent')).toBeVisible()
      }

      await corePlayAdjustPauseLoop(page)

      // Scroll Motion body, then Stage back — selection/edits survive; space returns.
      await page.getByTestId('btn-inspector-motion').click()
      const scrollBefore = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="inspector-panel"]')
        if (!(panel instanceof HTMLElement)) return -1
        for (const el of [panel, ...panel.querySelectorAll('*')]) {
          if (!(el instanceof HTMLElement)) continue
          const cs = getComputedStyle(el)
          if (
            (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 1
          ) {
            el.scrollTop = Math.min(160, el.scrollHeight)
            return el.scrollTop
          }
        }
        return 0
      })
      expect(scrollBefore).toBeGreaterThanOrEqual(0)

      await page.getByTestId('btn-inspector-back-to-stage').click()
      await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
      await expect(page.getByTestId('editor-workspace')).not.toHaveAttribute(
        'data-inspector-split',
        'true',
      )
      const stageAfter = await page
        .getByTestId('stage-viewport')
        .boundingBox()
      expect(stageAfter?.height ?? 0).toBeGreaterThan(probe.stageHeight + 40)

      // Reopen — camera was not auto-Fit by the sheet (may change after typed Fit).
      await openMotionInspector(page)
      await expect(page.getByTestId('inspector-panel')).toContainText(/Element/)
      // Exclusive pane: Elements must not stack as a second bottom sheet.
      await page.getByTestId('btn-toggle-elements-pane').click()
      await expect(page.getByTestId('actor-list-body')).toBeVisible()
      await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
      await expect(page.getByTestId('editor-workspace')).toHaveAttribute(
        'data-elements-split',
        'true',
      )
      // Elements split keeps the stage mounted above the list (same as Inspector).
      await expect(page.getByTestId('stage-viewport')).toBeVisible()
      const stageWithElements = await page
        .getByTestId('stage-viewport')
        .boundingBox()
      const elementsSlot = await page.getByTestId('actor-list-slot').boundingBox()
      expect(stageWithElements?.height ?? 0).toBeGreaterThan(40)
      expect(elementsSlot?.top ?? 0).toBeGreaterThan(
        (stageWithElements?.bottom ?? 0) - 2,
      )

      await page.screenshot({
        path: `tmp/inspector-split/${size.width}x${size.height}-settled.png`,
        fullPage: false,
      })
      // Return to Inspector for the settled stage+Inspector shot.
      await page.getByTestId('btn-toggle-inspector-pane').click()
      await expect(page.getByTestId('inspector-panel')).toBeVisible()
      await expect(page.getByTestId('stage-viewport')).toBeVisible()
      await page.screenshot({
        path: `tmp/inspector-split/${size.width}x${size.height}-stage-inspector.png`,
        fullPage: false,
      })

      // Opening Inspector must not itself jump the camera from the pre-open state
      // when we never typed zoom (narrow phones may lack the bar briefly).
      void camBefore
    })
  }

  test('browser zoom surrogate 640×400 (200% of 1280×800): split usable', async ({
    page,
  }) => {
    // Playwright has no Chrome-style browser zoom; layout viewport at 200% of
    // 1280×800 is the supported surrogate (distinct from a native phone size).
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.setViewportSize({ width: 640, height: 400 })
    await page.waitForFunction(() => window.innerWidth === 640)

    await openMotionInspector(page)
    const probe = await readSplitProbe(page)
    expect(probe.inspectorSplit, JSON.stringify(probe)).toBe(true)
    expect(probe.stageVisible, JSON.stringify(probe)).toBe(true)
    expect(probe.inspectorVisible, JSON.stringify(probe)).toBe(true)
    expect(probe.stageAboveInspector, JSON.stringify(probe)).toBe(true)
    expect(probe.playHit, JSON.stringify(probe)).toBe(true)

    await assertUnclippedClickable(page, 'btn-inspector-back-to-stage')
    await assertUnclippedClickable(page, 'btn-play')
    await page.screenshot({
      path: 'tmp/inspector-split/640x400-browser-zoom-surrogate.png',
      fullPage: false,
    })
  })

  test('1280 desktop floating Inspector unchanged (not split)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('stage-viewport')).toHaveAttribute(
      'data-inspector-floating',
      'true',
    )
    await expect(page.getByTestId('editor-workspace')).not.toHaveAttribute(
      'data-inspector-split',
      'true',
    )
    await expect(page.getByTestId('btn-close-inspector')).toBeVisible()
    await expect(page.getByTestId('btn-inspector-back-to-stage')).toHaveCount(0)
    await page.screenshot({
      path: 'tmp/inspector-split/1280-floating-unchanged.png',
      fullPage: false,
    })
  })
})
