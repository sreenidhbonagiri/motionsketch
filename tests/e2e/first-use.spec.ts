import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  recordSimplePath,
} from './helpers'

test.describe('first-use guidance and export wording', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('empty hint clears after recording; export labels distinguish project files', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()
    await expect(page.getByTestId('stage-empty-hint')).toContainText(
      /drag the actor/i,
    )

    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toBeVisible()
    await expect(page.getByTestId('dock-status')).toContainText(/drag the actor/i)
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)

    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('stage-empty-hint')).toBeVisible()

    await recordSimplePath(page)
    await expect(page.getByTestId('stage-empty-hint')).toHaveCount(0)
    await expect(page.getByTestId('edit-mode-hint')).toHaveCount(0)

    await openPanel(page, 'export')
    await expect(page.getByTestId('export-html-help')).toHaveText(
      'Play in a browser without MotionSketch.',
    )
    await expect(page.getByTestId('export-css-help')).toContainText(
      'Image assets are separate',
    )
    await expect(page.getByTestId('export-css-code-help')).toContainText(
      'same scoped scene code',
    )
    await expect(page.getByTestId('btn-export-download-project')).toHaveText(
      'Download project file',
    )
    await expect(page.getByTestId('export-project-help')).toContainText(
      'Reopen and edit in MotionSketch',
    )
  })

  test('storage failure shows download recovery; failed download is not success', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.evaluate(() => {
      const proto = Object.getPrototypeOf(localStorage)
      // @ts-expect-error test stub
      proto.setItem = () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }
    })
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('1800')
    await page.waitForTimeout(400)

    await openPanel(page, 'project')
    await expect(page.getByTestId('save-error-banner')).toBeVisible()
    await expect(page.getByTestId('save-status')).toContainText(/Couldn't save/i)
    await expect(
      page.getByTestId('btn-download-project-save-error'),
    ).toBeVisible()

    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('blob unavailable')
      }
    })
    await page.getByTestId('btn-download-project-save-error').click()
    await expect(page.getByTestId('project-action-status')).toContainText(
      /Could not download/i,
    )
    await expect(page.getByTestId('project-action-status')).not.toHaveText(
      'Project download started.',
    )
    await expect(page.getByTestId('action-live-region')).not.toHaveText(
      'Project download started.',
    )
  })
})
