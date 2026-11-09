import { expect, test } from '@playwright/test'
import {
  closeOpenChromePanels,
  ensureEditor,
  recordSimplePath,
} from './helpers'

test.describe('editor shortcuts', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('? and Help open the shortcut sheet; Q arms Record with confirm', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await closeOpenChromePanels(page)
    await page.getByTestId('stage').focus()

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcut-sheet')).toBeVisible()
    await expect(page.getByTestId('shortcut-row-play-pause')).toBeVisible()
    await expect(page.getByTestId('shortcut-row-record')).toBeVisible()
    await expect(page.getByTestId('shortcut-row-pan-hand')).toBeVisible()
    await page.getByTestId('btn-close-shortcuts').click()
    await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0)

    await page.getByTestId('btn-help').click()
    await expect(page.getByTestId('help-panel')).toBeVisible()
    await expect(page.getByTestId('help-camera-blurb')).toContainText(
      'Hold H or middle-drag',
    )
    await page.getByTestId('btn-open-shortcuts').click()
    await expect(page.getByTestId('shortcut-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0)

    await recordSimplePath(page)
    await closeOpenChromePanels(page)
    await page.getByTestId('stage').focus()
    await page.keyboard.press('q')
    await expect(page.getByTestId('rerecord-confirm')).toBeVisible()
    await page.getByTestId('btn-rerecord-cancel').click()
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.getByTestId('btn-stop')).toHaveCount(0)

    await page.keyboard.press('q')
    await page.getByTestId('btn-rerecord-confirm').click()
    await expect(page.getByTestId('btn-stop')).toBeVisible()
  })

  test('Space on a focused button keeps native behavior', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await closeOpenChromePanels(page)
    const play = page.getByTestId('btn-play')
    await play.focus()
    await expect(play).toBeFocused()
    await page.keyboard.press(' ')
    await expect(page.getByTestId('btn-pause')).toBeVisible()
  })
})
