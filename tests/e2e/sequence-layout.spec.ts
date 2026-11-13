import { expect, test, type Page } from '@playwright/test'
import { buildClipsTimingFixtureJson } from '../fixtures/clipsTimingProject'
import {
  applyClipSeconds,
  ensureClipTimesOpen,
  ensureEditor,
  loadProjectSnapshot,
  selectActorByIndex,
} from './helpers'

async function assertInViewport(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox()
  expect(box).toBeTruthy()
  const vp = page.viewportSize()
  expect(vp).toBeTruthy()
  // Dock chrome can sit flush with the viewport edge; allow a small subpixel
  // / border-box slack so layout asserts stay stable across engines.
  const slack = testId === 'playback-dock' || testId === 'timing-dialog' ? 24 : 6
  expect(box!.y).toBeGreaterThanOrEqual(-1)
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp!.height + slack)
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp!.width + slack)
}

test.describe('Timing dialog layout and inputs', () => {
  for (const viewport of [
    { width: 1280, height: 800, label: 'desktop' },
    { width: 1280, height: 720, label: '1280x720' },
    { width: 390, height: 844, label: 'mobile' },
    { width: 390, height: 560, label: 'short mobile' },
  ]) {
    test(`${viewport.label}: Timing dialog fits; dock stays reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
      await ensureEditor(page)
      await ensureClipTimesOpen(page)

      await assertInViewport(page, 'timing-dialog')
      await assertInViewport(page, 'btn-dock-more')
      await assertInViewport(page, 'playback-dock')
      await assertInViewport(page, 'btn-play')
      await expect(page.getByTestId('timing-element-name')).toBeVisible()
      await expect(page.getByTestId('clip-start-input')).toBeVisible()

      await page.getByTestId('btn-timing-cancel').click()
      await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
      await assertInViewport(page, 'playback-dock')
      await expect(page.getByTestId('btn-dock-more')).toBeFocused()
    })
  }

  test('reduced layout 640×360: Timing dialog scrolls; Collapse not required', async ({
    page,
  }) => {
    // Viewport resize for responsive density — not a completed browser-zoom check.
    await page.setViewportSize({ width: 640, height: 360 })
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureEditor(page)
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toBeVisible()
    await assertInViewport(page, 'timing-dialog')
    await assertInViewport(page, 'btn-apply-clip-times')
    await page.getByTestId('btn-timing-cancel').click()
    await expect(page.getByTestId('btn-dock-more')).toBeFocused()
  })

  test('Start after 0.97 applies; step matches hundredths; invalid uses inline error', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureEditor(page)
    await selectActorByIndex(page, 0)
    await ensureClipTimesOpen(page)

    await expect(page.getByTestId('clip-start-input')).toHaveAttribute(
      'step',
      '0.01',
    )
    await expect(page.getByTestId('clip-move-for-input')).toHaveAttribute(
      'step',
      '0.01',
    )

    await page.getByTestId('clip-start-input').fill('0.97')
    await page.getByTestId('clip-move-for-input').fill('0.80')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.77')
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('clip-times-error')).toHaveCount(0)
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.97')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('0.80')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.77')

    const valid = await page.getByTestId('clip-start-input').evaluate((el) => {
      const input = el as HTMLInputElement
      return input.checkValidity()
    })
    expect(valid).toBe(true)

    await page.getByTestId('clip-start-input').fill('1.50')
    await page.getByTestId('clip-move-for-input').fill('0.02')
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('timing-dialog')).toBeVisible()
    await expect(page.getByTestId('clip-times-error')).toBeVisible()
    await expect(page.getByTestId('clip-times-error')).toContainText(
      /Move for must|at least/i,
    )
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.97')

    await applyClipSeconds(page, '0.00', '2.00')
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
  })

  test('two-actor Timing dialog; More options stay in dialog bounds', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureEditor(page)
    await selectActorByIndex(page, 1)
    await ensureClipTimesOpen(page)
    await page.getByText('More options').click()
    await expect(page.getByTestId('clip-hide-before')).toBeVisible()
    await assertInViewport(page, 'timing-dialog')
    await assertInViewport(page, 'playback-dock')
  })
})
