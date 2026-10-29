import { expect, test } from '@playwright/test'
import { ensureEditor, openPanel } from './helpers'

test.describe('named project entry', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('first visit opens untitled canvas with no modal', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('welcome-screen')).toHaveCount(0)
    await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Untitled project',
    )
    await expect(page.getByTestId('first-use-headline')).toHaveText(
      'Draw motion. Ship it to your website.',
    )
    await expect(page.getByTestId('first-use-next-step')).toContainText(
      /drag the actor/i,
    )
    await expect(page.getByTestId('btn-try-example')).toBeVisible()
    await expect(page.getByTestId('header-save-status')).toHaveCount(0)

    const storage = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(storage).toBeNull()

    // UI-only actions must not create a stored project.
    await openPanel(page, 'project')
    await page.getByTestId('btn-close-project').click()
    await openPanel(page, 'adjust')
    await page.keyboard.press('Escape')
    const stillEmpty = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(stillEmpty).toBeNull()
  })

  test('rename draft cancels with Escape; empty commit restores', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Rename me')
    await page.getByTestId('btn-rename-project').click()
    const input = page.getByTestId('header-project-name-input')
    await expect(input).toBeFocused()
    await input.fill('Temporary')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Rename me')

    await page.getByTestId('btn-rename-project').click()
    await page.getByTestId('header-project-name-input').fill('')
    await page.getByTestId('header-project-name-input').press('Enter')
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Rename me')

    await page.getByTestId('btn-rename-project').click()
    await page.getByTestId('header-project-name-input').fill('Final name')
    await page.getByTestId('header-project-name-input').press('Enter')
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Final name')
  })

  test('returning user restores named project directly into editor', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Return trip')
    // Rename alone is meaningful — wait for autosave.
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
    )
    await page.reload()
    await expect(page.getByTestId('welcome-screen')).toHaveCount(0)
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Return trip',
    )
  })

  test('New project confirm cancel preserves current project', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Keep me')
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color-value').fill('#112233')
    await page.keyboard.press('Escape')

    await openPanel(page, 'project')
    await page.getByTestId('btn-new-project').click()
    await expect(page.getByTestId('new-project-confirm')).toBeVisible()
    await page.getByTestId('btn-new-project-cancel').click()
    await expect(page.getByTestId('new-project-confirm')).toBeHidden()
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Keep me')
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-color-value')).toHaveValue('#112233')
  })
})
