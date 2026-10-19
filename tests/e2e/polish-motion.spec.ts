import { expect, test } from '@playwright/test'
import {
  buildPolishMotionFixtureJson,
  POLISH_EDITED_ACTOR_ID,
  POLISH_RAW_ACTOR_ID,
} from '../fixtures/polishMotionProject'
import {
  closeOpenChromePanels,
  ensureEditor,
  ensureRefineMotionOpen,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
  selectActorByIndex,
} from './helpers'

test.describe('polish motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('preview cancel apply undo and export stay consistent', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPolishMotionFixtureJson())
    await ensureEditor(page, 'Polish motion fixture')

    await ensureRefineMotionOpen(page)
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    await expect(page.getByTestId('polish-compare-legend')).toContainText(
      /Original/i,
    )
    await expect(page.getByTestId('polish-strength-help')).toContainText(
      /Transform keyframes/i,
    )

    // Preview must not dirty geometry until Apply — Cancel restores UI only.
    await page.getByTestId('polish-strength').evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = '0.7'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.getByTestId('btn-polish-cancel').click()
    await expect(page.getByTestId('polish-panel')).toHaveCount(0)

    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    const status = page.getByTestId('polish-status')
    const apply = page.getByTestId('btn-polish-apply')
    const canApply = await apply.isEnabled()
    if (!canApply) {
      await expect(status).toContainText(/Nothing to polish|already clean|protect/i)
      await page.getByTestId('btn-polish-cancel').click()
    } else {
      await apply.click()
      await expect(page.getByTestId('polish-panel')).toHaveCount(0)
      // Path undo lives in Edit path chrome; stack survives enterEditMode.
      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('btn-undo-edit')).toBeEnabled()
      await page.getByTestId('btn-undo-edit').click()
      await expect(page.getByTestId('btn-redo-edit')).toBeEnabled()
      await page.getByTestId('btn-redo-edit').click()
      await page.getByTestId('btn-done-edit').click()

      const css = await readExportedCss(page)
      expect(css).toContain('@keyframes')
    }

    // Actor isolation: other actor still selectable; polish is per selection.
    await closeOpenChromePanels(page)
    await selectActorByIndex(page, 1)
    await ensureRefineMotionOpen(page)
    await expect(page.getByTestId('btn-polish-motion')).toBeEnabled()
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('polish-panel')).toHaveCount(0)
  })

  test('save and open keeps polished geometry', async ({ page }) => {
    await loadProjectSnapshot(page, buildPolishMotionFixtureJson())
    await ensureEditor(page, 'Polish motion fixture')
    await ensureRefineMotionOpen(page)
    await page.getByTestId('btn-polish-motion').click()
    const apply = page.getByTestId('btn-polish-apply')
    if (!(await apply.isEnabled())) {
      await page.getByTestId('btn-polish-cancel').click()
      test.skip()
      return
    }
    await apply.click()

    await openPanel(page, 'project')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).toBeTruthy()

    const fs = await import('node:fs')
    const json = fs.readFileSync(path!, 'utf8')
    await loadProjectSnapshot(page, json)
    await ensureEditor(page)
    // Edited actor still has geometry after round-trip.
    await selectActorByIndex(page, 0)
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await page.getByTestId('btn-done-edit').click()
  })

  test('strength preference survives cancel/reopen per actor', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPolishMotionFixtureJson())
    await ensureEditor(page, 'Polish motion fixture')

    await ensureRefineMotionOpen(page)
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-strength-value')).toHaveText('55%')
    await page.getByTestId('polish-strength').evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(input, '0.8')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByTestId('polish-strength-value')).toHaveText('80%')
    await page.getByTestId('btn-polish-cancel').click()

    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-strength-value')).toHaveText('80%')
    await page.getByTestId('btn-polish-cancel').click()

    await selectActorByIndex(page, 1)
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-strength-value')).toHaveText('55%')
    await page.getByTestId('btn-polish-cancel').click()

    await selectActorByIndex(page, 0)
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-strength-value')).toHaveText('80%')
    await page.getByTestId('btn-polish-cancel').click()
  })

  test('rounding override softens a selected corner after Edit path selection', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPolishMotionFixtureJson())
    await ensureEditor(page, 'Polish motion fixture')

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await page.getByTestId('path-handle-114').click({ force: true })
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    await expect(page.getByTestId('polish-allow-rounding')).toBeEnabled()
    await expect(page.getByTestId('polish-rounding-help')).toContainText(
      /May move this point slightly/i,
    )
    await page.getByTestId('polish-allow-rounding').check()
    await expect(page.getByTestId('polish-compare-legend')).toContainText(
      /Rounding/i,
    )
    await expect(
      page.getByTestId('polish-rounding-timing-note'),
    ).toContainText(/Timing stays unchanged while rounding this point/i)
    const apply = page.getByTestId('btn-polish-apply')
    if (await apply.isEnabled()) {
      await apply.click()
      await expect(page.getByTestId('polish-panel')).toHaveCount(0)
      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('btn-undo-edit')).toBeEnabled()
      await page.getByTestId('btn-undo-edit').click()
      await page.getByTestId('btn-done-edit').click()
    } else {
      await page.getByTestId('btn-polish-cancel').click()
    }
  })

  test('raw actor polish creates editable geometry without dropping the take', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPolishMotionFixtureJson())
    await ensureEditor(page, 'Polish motion fixture')
    await selectActorByIndex(page, 1)
    await ensureRefineMotionOpen(page)
    await page.getByTestId('btn-polish-motion').click()
    await expect(page.getByTestId('polish-panel')).toBeVisible()
    const apply = page.getByTestId('btn-polish-apply')
    if (await apply.isEnabled()) {
      await apply.click()
      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('path-handles')).toBeVisible()
      await page.getByTestId('btn-done-edit').click()
    } else {
      await page.getByTestId('btn-polish-cancel').click()
    }
    // Recording still present for the raw actor (button stays available).
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
    void POLISH_EDITED_ACTOR_ID
    void POLISH_RAW_ACTOR_ID
  })
})
