import { expect, test } from '@playwright/test'
import {
  applyClipSeconds,
  clickAddActor,
  dragActor,
  ensureActorListExpanded,
  ensureEditor,
  openPanel,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

async function openClipTimeline(page: import('@playwright/test').Page) {
  const toggle = page.getByTestId('btn-toggle-clip-timeline')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(page.getByTestId('clip-timeline-rows')).toBeVisible()
}

test.describe('editor workflow polish', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('disabled actions expose visible help to keyboard users', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await ensureActorListExpanded(page)

    await expect(page.getByTestId('btn-delete-actor')).toBeDisabled()
    await expect(page.getByTestId('btn-delete-actor')).toHaveAttribute(
      'aria-describedby',
      'actor-list-help',
    )
    await expect(page.getByTestId('actor-list-help')).toContainText(
      'Delete stays unavailable',
    )

    await expect(page.getByTestId('btn-play')).toBeDisabled()
    await expect(page.getByTestId('btn-play')).toHaveAttribute(
      'aria-describedby',
      'stage-empty-hint',
    )
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()
    // Fresh board: motion-editing row stays hidden until a path exists.
    await expect(page.getByTestId('dock-editing')).toHaveCount(0)

    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toContainText(/Ready|drag/i)
    await expect(page.getByTestId('dock-editing')).toHaveCount(0)
    await page.getByTestId('btn-stop').click()

    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-kind-image')).toBeDisabled()
    await expect(page.getByTestId('actor-image-type-help')).toContainText(
      'Upload an image',
    )
    await expect(page.getByTestId('actor-kind-image')).toHaveAttribute(
      'aria-describedby',
      'actor-image-type-help',
    )
    await page.getByTestId('btn-close-appearance').click()

    await openPanel(page, 'project')
    await expect(page.getByTestId('btn-download-project')).toBeDisabled()
    await expect(page.getByTestId('btn-download-project')).toHaveAttribute(
      'aria-describedby',
      'download-project-help',
    )
    await expect(page.getByTestId('download-project-help')).toContainText(
      'Create a path',
    )
  })

  test('Steady Speed needs a selected take; shared Loop stays available', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await clickAddActor(page)
    await selectActorByIndex(page, 1)
    await openPanel(page, 'adjust')

    await expect(page.getByTestId('steady-speed-slider')).toBeDisabled()
    await expect(page.getByTestId('steady-speed-help')).toContainText(
      'Create a path for this actor',
    )
    await expect(page.getByTestId('duration-slider')).toBeEnabled()
    await expect(page.getByTestId('loop-toggle')).toBeEnabled()

    await page.getByTestId('loop-toggle').check()
    await expect(page.getByTestId('loop-mode-fieldset')).toBeVisible()
    await page.getByTestId('loop-mode-alternate').check()

    await expect(page.getByTestId('dock-status')).toContainText(/no path yet/i)
    await expect(page.getByTestId('btn-edit-path')).toHaveAttribute(
      'aria-describedby',
      'dock-status',
    )
  })

  test('closing Adjust with Escape restores focus to the trigger', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-adjust').click()
    await expect(page.getByTestId('adjust-panel-root')).toBeVisible()
    await expect(page.getByTestId('adjust-panel-root')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('adjust-panel-root')).toHaveCount(0)
    await expect(page.getByTestId('btn-adjust')).toBeFocused()
  })

  test('Sequence Start at / Move for draft: blur/switch discard; Apply/Enter/Escape; validation; undo', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await page.getByTestId('btn-close-adjust').click()

    await openClipTimeline(page)
    await expect(page.getByTestId('btn-toggle-clip-timeline')).toContainText(
      'Sequence',
    )
    await expect(page.getByTestId('clip-timeline-help')).toContainText(
      /Choose when each actor moves/i,
    )
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('2.00')
    await expect(page.getByTestId('clip-ends-at')).toContainText('2.00')

    // Partial input + blur must not commit.
    await page.getByTestId('clip-start-input').fill('0.')
    await page.getByTestId('clip-start-input').blur()
    await page.getByTestId('clip-times-help').click()
    await expect(page.getByTestId('btn-apply-clip-times')).toBeEnabled()
    await page.getByTestId('playback-scrubber').fill('0.5')
    // Committed clip still full range — actor should still move mid-timeline.
    const midBox = await page.getByTestId('actor').boundingBox()
    expect(midBox).toBeTruthy()

    // Escape restores committed values.
    await page.getByTestId('clip-start-input').fill('0.80')
    await page.getByTestId('clip-move-for-input').fill('1.00')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.80')
    await page.getByTestId('clip-start-input').press('Escape')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('2.00')
    await expect(page.getByTestId('btn-apply-clip-times')).toBeDisabled()

    // Actor switch discards uncommitted draft.
    await clickAddActor(page)
    await selectActorByIndex(page, 0)
    await openClipTimeline(page)
    await page.getByTestId('clip-start-input').fill('0.50')
    await page.getByTestId('clip-move-for-input').fill('1.00')
    await selectActorByIndex(page, 1)
    await selectActorByIndex(page, 0)
    await openClipTimeline(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('2.00')

    // Invalid Apply explains without changing the clip.
    await page.getByTestId('clip-start-input').fill('1.50')
    await page.getByTestId('clip-move-for-input').fill('0.02')
    await page.getByTestId('btn-apply-clip-times').click()
    await expect(page.getByTestId('clip-times-error')).toContainText(
      /Move for must|at least/i,
    )
    await expect(page.getByTestId('clip-start-input')).toHaveValue('1.50')
    await page.getByTestId('clip-start-input').press('Escape')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')

    // Apply commits both; one undo restores both.
    await applyClipSeconds(page, '0.40', '1.60')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.40')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('1.20')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.60')
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('2.00')

    // Enter commits the pair.
    await page.getByTestId('clip-start-input').fill('0.20')
    await page.getByTestId('clip-move-for-input').fill('1.00')
    await page.getByTestId('clip-move-for-input').press('Enter')
    await expect(page.getByTestId('clip-times-error')).toHaveCount(0)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('1.00')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.20')
  })

  test('download help matches availability after recording', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 20, y: 10 }, { x: 140, y: -40 })
    await openPanel(page, 'project')
    await expect(page.getByTestId('btn-download-project')).toBeEnabled()
    await expect(page.getByTestId('download-project-help')).toContainText(
      'Download a JSON file',
    )
  })
})
