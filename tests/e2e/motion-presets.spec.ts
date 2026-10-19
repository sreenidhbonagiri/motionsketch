import { expect, test, type Page } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

/** Adjust panel scrolls on short Linux WebKit viewports — stabilize before click. */
async function pickMotionPreset(page: Page, id: string) {
  const btn = page.getByTestId(`motion-preset-${id}`)
  await expect(btn).toBeVisible()
  await btn.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
}

test.describe('motion presets', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Timing: preview Slide In, apply, undo restores, re-apply exports motion', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    // Toast above the stage can keep Adjust content unstable on Linux WebKit.
    const toastDismiss = page.getByTestId('btn-dismiss-after-path-toast')
    if (await toastDismiss.isVisible().catch(() => false)) {
      await toastDismiss.click()
      await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
    }

    // Timing = Adjust chrome (Duration / Loop / Motion presets).
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')

    const cssBefore = await readExportedCss(page)
    expect(cssBefore).toContain('@keyframes')
    expect(cssBefore).not.toContain('scale(0.78)')

    await openPanel(page, 'adjust')
    await pickMotionPreset(page, 'slide-in')
    await expect(page.getByTestId('preset-panel')).toBeVisible()
    await expect(page.getByTestId('preset-panel')).toContainText(
      'Preview: Slide In',
    )
    // Close Timing so the dock preset bar is not covered by the floating panel.
    await page.getByTestId('btn-close-adjust').click()
    await expect(page.getByTestId('adjust-panel-root')).toHaveCount(0)
    await expect(page.getByTestId('preset-panel-hint')).toContainText(
      /temporary preview/i,
    )
    await expect(page.getByTestId('preset-compare-preset')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Deterministic Start at / Move for → hide-before visibility stops in CSS.
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

    // Original compare, then Duration change must return to Preset preview.
    // (Duration is project-level — restore 2s afterward so undo CSS matches.)
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

    // Preview playback updates the dock every frame; pause so Apply’s box is stable.
    const pauseBtn = page.getByTestId('btn-pause')
    if (await pauseBtn.isVisible().catch(() => false)) {
      await pauseBtn.click()
      await expect(page.getByTestId('btn-play')).toBeVisible()
    }
    const applyBtn = page.getByTestId('btn-preset-apply')
    await applyBtn.evaluate((el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await applyBtn.scrollIntoViewIfNeeded()
    await expect(applyBtn).toBeVisible()
    await applyBtn.click()
    await expect(page.getByTestId('preset-panel')).toHaveCount(0)
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

    await openPanel(page, 'adjust')
    await pickMotionPreset(page, 'slide-in')
    await expect(page.getByTestId('preset-panel')).toBeVisible()
    await page.getByTestId('btn-close-adjust').click()
    await expect(page.getByTestId('adjust-panel-root')).toHaveCount(0)
    await page.getByTestId('preset-delay').fill('400')
    await page.getByTestId('preset-duration').fill('1000')
    const pauseAgain = page.getByTestId('btn-pause')
    if (await pauseAgain.isVisible().catch(() => false)) {
      await pauseAgain.click()
      await expect(page.getByTestId('btn-play')).toBeVisible()
    }
    const applyAgain = page.getByTestId('btn-preset-apply')
    await applyAgain.evaluate((el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await applyAgain.scrollIntoViewIfNeeded()
    await expect(applyAgain).toBeVisible()
    await applyAgain.click()
    await expect(page.getByTestId('preset-panel')).toHaveCount(0)

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
