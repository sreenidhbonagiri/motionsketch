import { expect, test } from '@playwright/test'
import { buildPathMoveFixtureJson } from '../fixtures/pathMoveProject'
import {
  clickRecord,
  ensureEditor,
  loadProjectSnapshot,
  recordSimplePath,
} from './helpers'

test.describe('mode and path-tool status', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('dock status tracks edit tools, add point, and recording chrome', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await ensureEditor(page, 'Path move fixture')

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'edit-points',
    )
    await expect(page.getByTestId('mode-status-label')).toHaveText('Edit points')
    await expect(page.getByTestId('mode-status-instruction')).toContainText(
      'Drag a point to reshape the path.',
    )
    await expect(page.getByTestId('action-live-region')).toHaveText('Edit points')
    await expect(page.getByTestId('handle-selection-status')).toContainText(
      /Point \d+ of \d+/,
    )

    await page.getByTestId('btn-path-tool-move').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'move-path',
    )
    await expect(page.getByTestId('mode-status-label')).toHaveText('Move path')
    await expect(page.getByTestId('mode-status-instruction')).toContainText(
      'Drag the path to reposition it.',
    )
    await expect(page.getByTestId('action-live-region')).toHaveText('Move path')

    // Active gesture: keep the label, clear the idle placement instruction.
    const overlay = page.getByTestId('path-move-overlay')
    await overlay.focus()
    await page.keyboard.down('ArrowRight')
    await expect(page.getByTestId('stage')).toHaveAttribute(
      'data-path-gesture',
      'true',
    )
    await expect(page.getByTestId('mode-status-label')).toHaveText('Move path')
    await expect(page.getByTestId('mode-status-instruction')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.keyboard.up('ArrowRight')
    await expect(page.getByTestId('stage')).toHaveAttribute(
      'data-path-gesture',
      'false',
    )
    await expect(page.getByTestId('mode-status-instruction')).toContainText(
      'Drag the path to reposition it.',
    )

    await page.getByTestId('btn-path-tool-points').click()
    await page.getByTestId('btn-path-add-mode').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'add-point',
    )
    await expect(page.getByTestId('mode-status-label')).toHaveText('Add point')
    await expect(page.getByTestId('mode-status-instruction')).toContainText(
      /ghost sits on the sample/i,
    )
    await expect(page.getByTestId('mode-status-instruction')).not.toContainText(
      /reshape the path/i,
    )
    await expect(page.getByTestId('action-live-region')).toHaveText('Add point')

    await page.getByTestId('btn-done-edit').click()
    await clickRecord(page, { replaceExisting: true })
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('dock-status')).toContainText(
      'Ready — Drag the actor to draw its path.',
    )
    await expect(page.getByTestId('btn-stop')).toHaveAccessibleName(
      'Cancel record',
    )
    await expect(page.getByTestId('btn-stop')).toHaveAttribute(
      'aria-describedby',
      'dock-status',
    )

    const actor = page.getByTestId('actor')
    const actorBox = await actor.boundingBox()
    expect(actorBox).toBeTruthy()
    await page.mouse.move(
      actorBox!.x + actorBox!.width / 2,
      actorBox!.y + actorBox!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      actorBox!.x + actorBox!.width / 2 + 12,
      actorBox!.y + actorBox!.height / 2 + 8,
      { steps: 4 },
    )
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'recording',
    )
    await expect(page.getByTestId('mode-status-label')).toHaveText('Recording')
    await expect(page.getByTestId('btn-stop')).toHaveAccessibleName(
      'Stop recording',
    )
    await expect(page.getByTestId('btn-stop')).toBeVisible()
    await page.getByTestId('btn-stop').click()
  })

  test('short viewport keeps dock status readable without edit-mode-hint', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 700 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('edit-mode-hint')).toHaveCount(0)
    const dock = page.getByTestId('playback-dock')
    const status = page.getByTestId('dock-status')
    await expect(status).toBeVisible()
    const dockBox = await dock.boundingBox()
    const statusBox = await status.boundingBox()
    expect(dockBox).toBeTruthy()
    expect(statusBox).toBeTruthy()
    expect(statusBox!.y).toBeGreaterThanOrEqual(dockBox!.y - 1)
    expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(
      dockBox!.y + dockBox!.height + 1,
    )
  })
})
