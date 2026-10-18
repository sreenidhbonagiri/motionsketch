import { expect, test } from '@playwright/test'
import {
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
    await recordSimplePath(page)
    await closeChromePanels(page)

    // Transform edit first.
    await page.getByTestId('playback-scrubber').fill('0.5')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('45')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)
    await closeChromePanels(page)

    // Clip edit second (most recent).
    await ensureClipTimelineOpen(page)
    await page.getByTestId('clip-start-input').fill('0.20')
    await page.getByTestId('clip-start-input').press('Enter')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')

    // Dock undoes clip first (chronological), not the older transform.
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)

    // Redo clip, then keyboard undo still targets clip (top of stack).
    await page.getByTestId('btn-redo-transform').click()
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.locator('body').click({ position: { x: 8, y: 8 } })
    await page.keyboard.press(`${mod}+z`)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')

    // Next undo removes the transform track entry.
    await page.keyboard.press(`${mod}+z`)
    await expect(page.locator('[data-transform-marker]')).toHaveCount(0)

    // Clip-only keyboard undo when that is the sole pending edit.
    await page.getByTestId('clip-start-input').fill('0.30')
    await page.getByTestId('clip-start-input').press('Enter')
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.30')
    await page.locator('body').click({ position: { x: 8, y: 8 } })
    await page.keyboard.press(`${mod}+z`)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')

    // Focused text inputs keep native undo; editor shortcut must not fire.
    const name = page.getByTestId('actor-name-input')
    await name.click()
    await name.fill('TypedName')
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
    await name.press(`${mod}+z`)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
  })

  test('actor switch clears unified undo history', async ({ page }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    await selectActorByIndex(page, 0)

    await ensureClipTimelineOpen(page)
    await page.getByTestId('clip-end-input').fill('0.70')
    await page.getByTestId('clip-end-input').press('Enter')
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()

    await selectActorByIndex(page, 1)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
  })
})
