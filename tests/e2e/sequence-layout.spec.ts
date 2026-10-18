import { expect, test, type Page } from '@playwright/test'
import {
  buildClipsTimingFixtureJson,
  buildSequenceCrowdFixtureJson,
} from '../fixtures/clipsTimingProject'
import {
  applyClipSeconds,
  ensureEditor,
  loadProjectSnapshot,
} from './helpers'

async function openSequence(page: Page) {
  const toggle = page.getByTestId('btn-toggle-clip-timeline')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(page.getByTestId('sequence-panel-body')).toBeVisible()
  await expect(page.getByTestId('sequence-collapse-label')).toBeVisible()
}

async function assertInViewport(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox()
  expect(box).toBeTruthy()
  const vp = page.viewportSize()
  expect(vp).toBeTruthy()
  expect(box!.y).toBeGreaterThanOrEqual(-1)
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp!.height + 1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp!.width + 1)
}

test.describe('Sequence panel layout and timing inputs', () => {
  for (const viewport of [
    { width: 1280, height: 800, label: 'desktop' },
    { width: 1280, height: 720, label: '1280x720' },
    { width: 390, height: 844, label: 'mobile' },
    { width: 390, height: 560, label: 'short mobile' },
  ]) {
    test(`${viewport.label}: expanded Sequence keeps header, Collapse, and dock reachable (8 actors)`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await loadProjectSnapshot(page, buildSequenceCrowdFixtureJson())
      await ensureEditor(page, 'Sequence crowd fixture')
      await openSequence(page)

      await assertInViewport(page, 'sequence-header')
      await assertInViewport(page, 'btn-toggle-clip-timeline')
      await assertInViewport(page, 'sequence-collapse-label')
      await assertInViewport(page, 'playback-dock')
      await assertInViewport(page, 'btn-play')

      const panel = page.getByTestId('clip-timeline')
      const panelBox = await panel.boundingBox()
      const vp = page.viewportSize()!
      expect(panelBox).toBeTruthy()
      expect(panelBox!.height).toBeLessThanOrEqual(vp.height - 8)
      await expect(panel).toHaveAttribute('data-sequence-open', 'true')

      // Bottom controls reachable via internal scroll (not clipped away).
      await page.getByTestId('clip-visibility-options').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('clip-start-input')).toBeVisible()
      await assertInViewport(page, 'sequence-header')
      await assertInViewport(page, 'playback-dock')

      await page.getByTestId('btn-toggle-clip-timeline').click()
      await expect(page.getByTestId('sequence-panel-body')).toHaveCount(0)
      await assertInViewport(page, 'playback-dock')
    })
  }

  test('high zoom density (640×360 ≈ 200% of 1280×720): Collapse and dock stay reachable', async ({
    page,
  }) => {
    // Approximate browser 200% zoom via a half-size viewport so layout
    // constraints (dvh / safe-area) are exercised portably.
    await page.setViewportSize({ width: 640, height: 360 })
    await loadProjectSnapshot(page, buildSequenceCrowdFixtureJson())
    await ensureEditor(page)
    await openSequence(page)
    await assertInViewport(page, 'sequence-header')
    await assertInViewport(page, 'sequence-collapse-label')
    await assertInViewport(page, 'playback-dock')
    await assertInViewport(page, 'btn-play')
    await page.getByTestId('clip-start-input').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('clip-start-input')).toBeVisible()
    await assertInViewport(page, 'sequence-collapse-label')
    await page.getByTestId('btn-toggle-clip-timeline').click()
    await expect(page.getByTestId('sequence-panel-body')).toHaveCount(0)
  })

  test('Start at 0.97 applies; step matches hundredths; invalid uses inline error', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureEditor(page)
    await openSequence(page)
    await selectActorByIndex(page, 0)

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
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.97')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('0.80')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.77')

    // Native validity must accept the displayed hundredth (no step mismatch).
    const valid = await page.getByTestId('clip-start-input').evaluate((el) => {
      const input = el as HTMLInputElement
      return input.checkValidity()
    })
    expect(valid).toBe(true)

    await page.getByTestId('clip-start-input').fill('1.50')
    await page.getByTestId('clip-move-for-input').fill('0.02')
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('clip-times-error')).toBeVisible()
    await expect(page.getByTestId('clip-times-error')).toContainText(
      /Move for must|at least/i,
    )
    await page.getByTestId('clip-start-input').press('Escape')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.97')

    await applyClipSeconds(page, '0.00', '2.00')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
  })

  test('two-actor Sequence scrolls fields without covering the dock', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureEditor(page)
    await openSequence(page)
    // Prefer Sequence rows on short mobile — actor list may be collapsed.
    const lateRow = page.getByTestId('clip-row-clip-late')
    await lateRow.scrollIntoViewIfNeeded()
    await lateRow.click()
    await expect(lateRow).toHaveAttribute('data-selected', 'true')
    await page.getByTestId('clip-visibility-options').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('clip-hide-before')).toBeVisible()
    await assertInViewport(page, 'playback-dock')
    await assertInViewport(page, 'sequence-collapse-label')
  })
})
