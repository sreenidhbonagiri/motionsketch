import { expect, test, type Page } from '@playwright/test'
import { buildMotionPresetsFixtureJson } from '../fixtures/motionPresetsProject'
import {
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
} from './helpers'

/** Adjust panel scrolls on short Linux WebKit viewports — stabilize before click. */
async function pickMotionPreset(page: Page, id: string) {
  const btn = page.getByTestId(`motion-preset-${id}`)
  await expect(btn).toBeVisible()
  await btn.evaluate((el) => {
    const scroller = el.closest('.overflow-y-auto') as HTMLElement | null
    if (scroller) {
      const elRect = el.getBoundingClientRect()
      const scRect = scroller.getBoundingClientRect()
      scroller.scrollTop +=
        elRect.top + elRect.height / 2 - (scRect.top + scRect.height / 2)
    } else {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  })
  await btn.click()
}

/** Open Adjust → Slide In preview, then close Timing so the dock bar is free. */
async function openSlideInPreview(page: Page) {
  await openPanel(page, 'adjust')
  await pickMotionPreset(page, 'slide-in')
  await expect(page.getByTestId('preset-panel')).toBeVisible()
  await expect(page.getByTestId('preset-panel')).toContainText(
    'Preview: Slide In',
  )
  await page.getByTestId('btn-close-adjust').click()
  await expect(page.getByTestId('adjust-panel-root')).toHaveCount(0)
}

async function setSlideInTiming(page: Page) {
  await page.getByTestId('preset-delay').fill('400')
  await expect(page.getByTestId('preset-delay-value')).toHaveText('0.40 s')
  await expect(page.getByTestId('preset-delay')).toHaveAttribute(
    'aria-valuetext',
    '0.40 s',
  )
  await page.getByTestId('preset-duration').fill('1000')
  await expect(page.getByTestId('preset-duration-value')).toHaveText('1.00 s')
  await expect(page.getByTestId('preset-duration')).toHaveAttribute(
    'aria-valuetext',
    '1.00 s',
  )
}

/** Preview playback updates the dock every frame; pause so Apply’s box is stable. */
async function pausePresetPreviewIfPlaying(page: Page) {
  const pauseBtn = page.getByTestId('btn-pause')
  if (await pauseBtn.isVisible().catch(() => false)) {
    await pauseBtn.click()
    await expect(page.getByTestId('btn-play')).toBeVisible()
  }
}

async function applySlideInPreset(page: Page) {
  await pausePresetPreviewIfPlaying(page)
  const applyBtn = page.getByTestId('btn-preset-apply')
  await applyBtn.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  await expect(applyBtn).toBeVisible()
  await applyBtn.click()
  await expect(page.getByTestId('preset-panel')).toHaveCount(0)
}

test.describe('motion presets', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('preview Slide In: timing controls and Original/Preset compare', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildMotionPresetsFixtureJson())

    await openSlideInPreview(page)
    await expect(page.getByTestId('preset-panel-hint')).toContainText(
      /temporary preview/i,
    )
    await expect(page.getByTestId('preset-compare-preset')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Deterministic Start at / Move for → hide-before visibility stops in CSS.
    await setSlideInTiming(page)

    // Original compare, then Duration change must return to Preset preview.
    // (Duration is project-level — restore 2s afterward so later tests stay aligned.)
    await page.getByTestId('preset-compare-original').click()
    await expect(page.getByTestId('preset-compare-original')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2500')
    await expect(page.getByTestId('duration-value')).toHaveText('2.50 s')
    await page.getByTestId('btn-close-adjust').click()
    await expect(page.getByTestId('preset-compare-preset')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')
    await page.getByTestId('btn-close-adjust').click()

    await page.getByTestId('btn-preset-cancel').click()
    await expect(page.getByTestId('preset-panel')).toHaveCount(0)
  })

  test('apply Slide In then undo restores original CSS', async ({ page }) => {
    await loadProjectSnapshot(page, buildMotionPresetsFixtureJson())

    const cssBefore = await readExportedCss(page)
    expect(cssBefore).toContain('@keyframes')
    expect(cssBefore).not.toContain('scale(0.78)')

    await openSlideInPreview(page)
    await setSlideInTiming(page)
    await applySlideInPreset(page)
    await expect(page.getByTestId('action-live-region')).toHaveText(
      /Applied .+Slide In/i,
    )

    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('action-live-region')).toHaveText(
      'Undo motion preset',
    )
    const cssRestored = await readExportedCss(page)
    expect(cssRestored).toBe(cssBefore)
    expect(cssRestored).not.toContain('scale(0.78)')
  })

  test('applied Slide In exports scale and delayed hide', async ({ page }) => {
    await loadProjectSnapshot(page, buildMotionPresetsFixtureJson())

    const cssBefore = await readExportedCss(page)
    expect(cssBefore).not.toContain('scale(0.78)')

    await openSlideInPreview(page)
    await setSlideInTiming(page)
    await applySlideInPreset(page)

    const cssApplied = await readExportedCss(page)
    expect(cssApplied).not.toBe(cssBefore)
    // Slide In: scales from 0.78 → 1; delayed entrance hides until Start at.
    expect(cssApplied).toContain('scale(0.78)')
    expect(cssApplied).toMatch(/scale\(\s*1\)/)
    expect(cssApplied).toContain('visibility')
    expect(cssApplied).toMatch(/20(\.0+)?%/)
    expect(cssApplied).toMatch(/70(\.0+)?%/)
  })
})
