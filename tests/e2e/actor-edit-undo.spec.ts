import { expect, test } from '@playwright/test'
import {
  clickAddActor,
  ensureActorListExpanded,
  ensureEditor,
  openPanel,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

async function closeChromePanels(page: import('@playwright/test').Page) {
  const open = page.locator('[data-testid$="-panel-root"]')
  if ((await open.count()) === 0) return
  const closeBtn = open.locator('[data-testid^="btn-close-"]').first()
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await expect(open).toHaveCount(0)
}

async function ensureClipTimelineOpen(page: import('@playwright/test').Page) {
  const toggle = page.getByTestId('btn-toggle-clip-timeline')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(page.getByTestId('clip-timeline-rows')).toBeVisible()
}

test.describe('unified actor edit undo', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('dock and keyboard undo clip after transform chronologically', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeChromePanels(page)

    // Transform edit first.
    await page.getByTestId('playback-scrubber').fill('0.5')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('45')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)
    await closeChromePanels(page)

    // Sequence edit second (most recent).
    await ensureClipTimelineOpen(page)
    await page.getByTestId('clip-start-input').fill('0.20')
    await page.getByTestId('clip-move-for-input').fill('1.00')
    await page.getByTestId('clip-start-input').press('Enter')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')

    // Dock undoes sequence first (chronological), not the older transform.
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)

    // Redo sequence, then keyboard undo still targets sequence (top of stack).
    await page.getByTestId('btn-redo-transform').click()
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    // Leave the sequence fields so the editor shortcut (not native input undo) runs.
    await page.getByTestId('stage').focus()
    await expect(page.getByTestId('stage')).toBeFocused()
    await page.keyboard.press(`${mod}+z`)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')

    // Next undo removes the transform track entry.
    await page.keyboard.press(`${mod}+z`)
    await expect(page.locator('[data-transform-marker]')).toHaveCount(0)

    // Sequence-only keyboard undo when that is the sole pending edit.
    await page.getByTestId('clip-start-input').fill('0.30')
    await page.getByTestId('clip-move-for-input').fill('0.90')
    await page.getByTestId('clip-start-input').press('Enter')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.30')
    await page.getByTestId('stage').focus()
    await expect(page.getByTestId('stage')).toBeFocused()
    await page.keyboard.press(`${mod}+z`)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')

    // Focused text inputs keep native undo; editor shortcut must not fire.
    await ensureActorListExpanded(page)
    const name = page.getByTestId('actor-name-input')
    await name.click()
    await name.fill('TypedName')
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
    await name.press(`${mod}+z`)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
  })

  test('actor switch clears unified undo history', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await clickAddActor(page)
    await selectActorByIndex(page, 0)

    await ensureClipTimelineOpen(page)
    await page.getByTestId('clip-move-for-input').fill('0.70')
    await page.getByTestId('clip-move-for-input').press('Enter')
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()

    await selectActorByIndex(page, 1)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
  })
})
