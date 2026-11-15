import { expect, test } from '@playwright/test'
import { buildEasingFixtureJson } from '../fixtures/easingProject'
import {
  ensureEditor,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
} from './helpers'

test.describe('easing picker', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('picker, undo/redo, reload, and export stay consistent', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildEasingFixtureJson())
    await ensureEditor(page, 'Easing fixture')

    await openPanel(page, 'adjust')
    const picker = page.getByTestId('easing-picker')
    await expect(picker).toBeVisible()
    await expect(page.getByTestId('easing-value')).toHaveText('Linear')
    await expect(page.getByTestId('easing-option-linear')).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await expect(page.getByTestId('polish-tool-desc')).toContainText(
      /Gentler path/i,
    )
    await expect(page.getByTestId('glide-tool-desc')).toContainText(
      /Softer starts\/stops/i,
    )

    await page.getByTestId('easing-option-spring').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Spring')
    await expect(page.getByTestId('easing-option-spring')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.getByTestId('easing-compose-help')).toContainText(
      /Steady Speed and Glide/i,
    )

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('actor')).toBeVisible()

    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Linear')
    await page.getByTestId('btn-redo-transform').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Spring')

    const readStoredEasing = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('motionsketch.project.v1')
        if (!raw) return null
        try {
          const snap = JSON.parse(raw) as {
            project?: { actors?: Array<{ easing?: string }> }
          }
          return snap.project?.actors?.[0]?.easing ?? null
        } catch {
          return null
        }
      })

    // Wait for redo to land in storage before export/reload (UI "Saved" can lag).
    await expect.poll(readStoredEasing, { timeout: 8000 }).toBe('spring')

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
    expect((css.match(/\{\s*transform:/g) ?? []).length).toBeGreaterThan(8)

    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
      { timeout: 8000 },
    )
    await expect.poll(readStoredEasing, { timeout: 8000 }).toBe('spring')
    await page.reload()
    await ensureEditor(page, 'Easing fixture')
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('easing-value')).toHaveText('Spring')

    // Keyboard on radiogroup moves selection and focus together.
    await page.getByTestId('easing-option-spring').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('easing-value')).toHaveText('Bounce')
    await expect(page.getByTestId('easing-option-bounce')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.getByTestId('easing-option-bounce')).toBeFocused()
  })
})
