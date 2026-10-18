import { expect, test } from '@playwright/test'
import { ensureEditor, openPanel } from './helpers'

test.describe('named project entry', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('first visit shows welcome; create validates and enters editor', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('welcome-screen')).toBeVisible()
    await expect(page.getByTestId('app-shell')).toHaveCount(0)

    // Storage must stay empty until create succeeds.
    const before = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(before).toBeNull()

    await page.getByTestId('btn-welcome-create').click()
    await page.getByTestId('btn-confirm-project-name').click()
    await expect(page.getByTestId('project-name-error')).toBeVisible()

    await page.getByTestId('btn-project-name-cancel').click()
    await expect(page.getByTestId('welcome-screen')).toBeVisible()
    const stillEmpty = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(stillEmpty).toBeNull()

    await page.getByTestId('btn-welcome-create').click()
    await page.getByTestId('project-name-input').fill('  Sky Path  ')
    await page.getByTestId('btn-confirm-project-name').click()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Sky Path')
    await expect(page.getByTestId('header-save-status')).toContainText(
      'Saved in this browser',
    )
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
    await page.reload()
    await expect(page.getByTestId('welcome-screen')).toHaveCount(0)
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Return trip',
    )
  })

  test('New project name cancel preserves current project', async ({
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
    await page.getByTestId('btn-new-project-confirm').click()
    await expect(page.getByTestId('project-name-dialog')).toBeVisible()
    await page.getByTestId('btn-project-name-cancel').click()
    await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toHaveText('Keep me')
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-color-value')).toHaveValue('#112233')
  })
})
