import { expect, test, type Page } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  readExportedCss,
  recordSimplePath,
  respondToConfirm,
} from './helpers'

async function waitForSaved(page: Page) {
  await openPanel(page, 'project')
  await expect(page.getByTestId('save-status')).toHaveText(
    'Saved in this browser',
  )
}

async function confirmNewProject(page: Page) {
  await openPanel(page, 'project')
  await page.getByTestId('btn-new-project').click()
  await expect(page.getByTestId('new-project-confirm')).toBeVisible()
  await expect(page.getByTestId('new-project-confirm-copy')).toContainText(
    'This replaces the current project',
  )
  await expect(page.getByTestId('btn-new-project-cancel')).toHaveText('Cancel')
  await expect(page.getByTestId('btn-new-project-confirm')).toHaveText(
    'Start new project',
  )
  await page.getByTestId('btn-new-project-confirm').click()
  await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
  await expect(page.getByTestId('btn-rename-project')).toHaveText(
    'Untitled project',
  )
}

test.describe('project persistence', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('restores recording after reload, paused and playable', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('duration-slider').fill('2400')
    await expect(page.getByTestId('duration-value')).toHaveText('2.40 s')
    await page.waitForTimeout(400)
    await waitForSaved(page)

    const cssBefore = await readExportedCss(page)

    await page.reload()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toBeVisible()
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('loop-toggle')).toBeChecked()
    await expect(page.getByTestId('duration-value')).toHaveText('2.40 s')

    const cssAfter = await readExportedCss(page)
    expect(cssAfter).toBe(cssBefore)

    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    await page.getByTestId('btn-play').click()
    await page.waitForTimeout(350)
    const mid = await actor.boundingBox()
    expect(before && mid).toBeTruthy()
    const moved =
      Math.abs(mid!.x - before!.x) > 2 || Math.abs(mid!.y - before!.y) > 2
    expect(moved).toBeTruthy()
  })

  test('restores committed path edits after reload', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('btn-edit-path').click()
    const handle = page.locator('[data-testid^="path-handle-"]').nth(2)
    const box = await handle.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 40, box!.y - 30, { steps: 8 })
    await page.mouse.up()
    await page.getByTestId('btn-done-edit').click()
    await waitForSaved(page)

    const cssBefore = await readExportedCss(page)
    await page.reload()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toBeVisible()
    const cssAfter = await readExportedCss(page)
    expect(cssAfter).toBe(cssBefore)
    await expect(page.getByTestId('btn-restore-path')).toBeVisible()
  })

  test('New project shows empty state, status, and stays empty after refresh', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)

    await confirmNewProject(page)

    await expect(page.getByTestId('export-panel')).toHaveCount(0)
    await expect(page.getByTestId('btn-play')).toBeDisabled()
    await expect(page.getByTestId('stage-empty-hint')).toHaveText(
      'Click Record, then drag the actor to capture its movement.',
    )
    await expect(page.getByTestId('btn-download-project')).toBeDisabled()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Untitled project',
    )
    // Untouched blank is not claimed as saved.
    await expect(page.getByTestId('header-save-status')).toHaveCount(0)
    const storageAfterNew = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(storageAfterNew).toBeNull()

    await page.reload()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Untitled project',
    )
    await expect(page.getByTestId('btn-play')).toBeDisabled()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toHaveCount(0)
    await openPanel(page, 'project')
    await expect(page.getByTestId('btn-download-project')).toBeDisabled()
    await expect(page.getByTestId('header-save-status')).toHaveCount(0)
  })

  test('New project confirm can be cancelled', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)

    await openPanel(page, 'project')
    await page.getByTestId('btn-new-project').click()
    await expect(page.getByTestId('new-project-confirm')).toBeVisible()
    await page.getByTestId('btn-new-project-cancel').click()
    await expect(page.getByTestId('new-project-confirm')).toBeHidden()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toBeVisible()
  })

  test('Reset remains separate from New project', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('3000')
    await expect(page.getByTestId('duration-value')).toHaveText('3.00 s')
    await page.getByTestId('loop-toggle').check()

    await page.getByTestId('btn-reset').click()
    await respondToConfirm(page, {
      dialogTestId: 'reset-actor-confirm',
      confirmTestId: 'btn-reset-actor-confirm',
      cancelTestId: 'btn-reset-actor-cancel',
    })
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toHaveCount(0)
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-value')).toHaveText('3.00 s')
    await expect(page.getByTestId('loop-toggle')).toBeChecked()

    // Playback settings still count as work — New project confirms, then names.
    await confirmNewProject(page)
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-value')).toHaveText('1.20 s')
    await expect(page.getByTestId('loop-toggle')).not.toBeChecked()
    await expect(page.getByTestId('stage-empty-hint')).toHaveText(
      'Click Record, then drag the actor to capture its movement.',
    )
  })

  test('Download project file announces start and stays scoped', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await openPanel(page, 'project')
    await expect(page.getByTestId('project-local-save-copy')).toContainText(
      'One project is saved in this browser',
    )
    await expect(page.getByTestId('btn-download-project')).toBeDisabled()
    await expect(page.getByTestId('btn-download-project')).toHaveText(
      'Download project file',
    )
    await expect(page.getByTestId('download-project-help')).toContainText(
      'Record a path',
    )
    await page.getByTestId('btn-close-project').click()

    await recordSimplePath(page)
    await waitForSaved(page)
    await expect(page.getByTestId('btn-download-project')).toBeEnabled()

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/untitled-project-.*\.json/)

    await expect(page.getByTestId('project-action-status')).toHaveText(
      'Project download started.',
    )
    await expect(page.getByTestId('action-live-region')).toHaveText(
      'Project download started.',
    )
  })

  test('Open project validates and can replace after confirm', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)
    const cssOriginal = await readExportedCss(page)

    const snapshotJson = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(snapshotJson).toBeTruthy()

    const mutated = JSON.parse(snapshotJson!)
    mutated.project.playback.durationMs = 4000
    mutated.savedAt = new Date().toISOString()

    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(mutated), 'utf-8'),
    })
    await respondToConfirm(page, {
      dialogTestId: 'open-project-confirm',
      confirmTestId: 'btn-open-project-confirm',
      cancelTestId: 'btn-open-project-cancel',
    })

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-value')).toHaveText('4.00 s')
    const cssImported = await readExportedCss(page)
    expect(cssImported).not.toBe(cssOriginal)
    expect(cssImported).toContain('4000ms')
  })

  test('rejects malformed project files without replacing', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await waitForSaved(page)

    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"formatVersion":99}', 'utf-8'),
    })

    await expect(page.getByTestId('import-error')).toBeVisible()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toBeVisible()
  })
})
