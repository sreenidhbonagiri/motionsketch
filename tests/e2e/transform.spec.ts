import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  clickRecord,
  dragActor,
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

test.describe('transform keyframes', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('add rotation/scale keyframe, markers, undo, and CSS export', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('playback-scrubber').fill('0.5')
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('transform-section')).toBeVisible()

    await page.getByTestId('transform-rotation-input').fill('360')
    await page.getByTestId('transform-scale-slider').fill('2')
    await page.getByTestId('btn-set-transform-keyframe').click()

    await expect(page.getByTestId('transform-markers')).toBeVisible()
    const markers = page.locator('[data-transform-marker]')
    await expect(markers).toHaveCount(2) // seeded t=0 + playhead

    const actor = page.getByTestId('actor')
    const transform = await actor.evaluate((el) => getComputedStyle(el).transform)
    // Matrix should reflect non-identity scale/rotation at mid playhead
    expect(transform).not.toBe('none')

    const css = await readExportedCss(page)
    expect(css).toMatch(/rotate\(360deg\)/)
    expect(css).toMatch(/scale\(2\)/)
    expect(css).toMatch(
      /translate3d\([^)]+\) translate\(-50%, -50%\) rotate\(/,
    )

    await page.getByTestId('btn-undo-transform').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(0)

    await page.getByTestId('btn-redo-transform').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)
  })

  test('selecting a marker pauses and seeks; path edit blocks transform', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('playback-scrubber').fill('0.75')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('90')
    await page.getByTestId('btn-set-transform-keyframe').click()

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()

    const marker = page.locator('[data-transform-marker]').last()
    await marker.click()
    await expect(page.getByTestId('btn-play')).toBeVisible()
    const head = Number(
      await page.getByTestId('playback-scrubber').inputValue(),
    )
    expect(head).toBeGreaterThan(0.7)

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('btn-done-edit')).toBeVisible()
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('transform-edit-path-hint')).toBeVisible()
    await expect(page.getByTestId('btn-set-transform-keyframe')).toBeDisabled()
  })

  test('new recording clears transform; duration keeps normalized times', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('playback-scrubber').fill('0.5')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('180')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)

    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('3000')
    // Markers stay at the same normalized positions (50%)
    const left = await page
      .locator('[data-transform-marker]')
      .last()
      .evaluate((el) => (el as HTMLElement).style.left)
    expect(left).toBe('50%')

    await clickRecord(page, { replaceExisting: true })
    await page.getByTestId('actor').click()
    // Cancel-ish: stop without a full drag still finishes via stop if recording
    // Prefer cancel from armed state if still armed
    const stop = page.getByTestId('btn-stop')
    if (await stop.isVisible()) {
      await stop.click()
    }
    // Fresh record
    await clickRecord(page, { replaceExisting: true })
    await dragActor(page, { x: 40, y: -10 }, { x: 120, y: 40 })
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(0)
  })
})
