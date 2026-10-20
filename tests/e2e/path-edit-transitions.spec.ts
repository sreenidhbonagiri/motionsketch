import { expect, test } from '@playwright/test'
import {
  buildPathMoveFixtureJson,
  buildPathMoveFixtureSamples,
  PATH_MOVE_HANDLE_INDICES,
} from '../fixtures/pathMoveProject'
import { loadProjectSnapshot, openPanel } from './helpers'

test.describe('path edit mode transitions', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('late keyup after Done cannot commit a second Move nudge', async ({
    page,
  }) => {
    const baseline = buildPathMoveFixtureSamples()
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    await expect(overlay).toBeFocused()

    await page.keyboard.down('ArrowRight')
    // Done focuses the dock control — blur may commit the open nudge once.
    await page.getByTestId('btn-done-edit').click()
    await expect(page.getByTestId('btn-edit-path')).toBeVisible()
    await page.keyboard.up('ArrowRight')

    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-points').click()
    const handle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    const x = Number(await handle.getAttribute('data-sample-x'))
    const expectedCommitted = baseline[PATH_MOVE_HANDLE_INDICES[0]]!.x + 0.005
    const expectedBaseline = baseline[PATH_MOVE_HANDLE_INDICES[0]]!.x
    // Either blur committed once, or Done discarded — never a double step.
    expect(
      Math.abs(x - expectedCommitted) < 1e-4 ||
        Math.abs(x - expectedBaseline) < 1e-4,
    ).toBe(true)
    if (Math.abs(x - expectedCommitted) < 1e-4) {
      await page.getByTestId('btn-undo-edit').click()
      expect(Number(await handle.getAttribute('data-sample-x'))).toBeCloseTo(
        expectedBaseline,
        5,
      )
      await expect(page.getByTestId('btn-undo-edit')).toBeDisabled()
    } else {
      await expect(page.getByTestId('btn-undo-edit')).toBeDisabled()
    }
  })

  test('switching tools clears Move path and shows Edit points chrome', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('stage-frame')).toHaveAttribute(
      'data-path-tool',
      'edit-points',
    )
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await expect(page.getByTestId('btn-path-tool-points')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByTestId('btn-path-tool-move').click()
    await expect(page.getByTestId('stage-frame')).toHaveAttribute(
      'data-path-tool',
      'move-path',
    )
    await expect(page.getByTestId('path-move-overlay')).toBeVisible()
    await expect(page.getByTestId('path-handles')).toHaveCount(0)
    await expect(page.getByTestId('btn-path-add-mode')).toBeDisabled()

    await page.getByTestId('btn-path-tool-points').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await expect(page.getByTestId('path-move-overlay')).toHaveCount(0)
  })

  /**
   * Regression: tall Adjust (Motion presets) used to paint over the path-edit
   * dock and intercept Move path. Keep Adjust open — dock must stay reachable.
   */
  test(
    'path tools stay clickable while Adjust is open',
    { tag: '@smoke' },
    async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('adjust-panel')).toBeVisible()
    await expect(page.getByTestId('motion-presets')).toBeVisible()

    const move = page.getByTestId('btn-path-tool-move')
    await expect(move).toBeVisible()
    const hitTestId = await move.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      )
      let node: Element | null = top
      while (node) {
        if (node instanceof HTMLElement && node.dataset.testid) {
          return node.dataset.testid
        }
        node = node.parentElement
      }
      return null
    })
    expect(hitTestId).toBe('btn-path-tool-move')

    await move.click()
    await expect(page.getByTestId('path-move-overlay')).toBeVisible()
    await expect(page.getByTestId('adjust-panel-root')).toBeVisible()
  })

  test('Escape cancels Move nudge before closing an open floating panel', async ({
    page,
  }) => {
    const baseline = buildPathMoveFixtureSamples()
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('adjust-panel')).toBeVisible()

    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    await overlay.focus()
    await expect(overlay).toBeFocused()
    await page.keyboard.down('ArrowRight')
    await expect(page.getByTestId('stage-frame')).toHaveAttribute(
      'data-path-gesture',
      'true',
    )
    await expect(page.getByTestId('adjust-panel-root')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.up('ArrowRight')

    // Gesture cancelled; Adjust stays open because Escape was consumed.
    await expect(page.getByTestId('adjust-panel-root')).toBeVisible()
    await expect(page.getByTestId('stage-frame')).toHaveAttribute(
      'data-path-gesture',
      'false',
    )
    await page.getByTestId('btn-path-tool-points').click()
    const handle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    expect(Number(await handle.getAttribute('data-sample-x'))).toBeCloseTo(
      baseline[PATH_MOVE_HANDLE_INDICES[0]]!.x,
      5,
    )
    await expect(page.getByTestId('btn-undo-edit')).toBeDisabled()
  })

  test('playback cannot start while editing; Edit path leaves playing', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('btn-done-edit')).toBeVisible()
    await expect(page.getByTestId('btn-play')).toHaveCount(0)
    await expect(page.getByTestId('btn-pause')).toHaveCount(0)
    await page.getByTestId('btn-done-edit').click()
    await expect(page.getByTestId('btn-play')).toBeVisible()
  })

  test('undo after Move path restores a valid selected handle', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    await overlay.focus()
    await page.keyboard.press('ArrowRight')
    await page.getByTestId('btn-path-tool-points').click()
    await page.getByTestId('btn-undo-edit').click()
    const selected = page.locator(
      '[data-testid^="path-handle-"][aria-pressed="true"]',
    )
    await expect(selected).toHaveCount(1)
    const idx = await selected.getAttribute('data-handle-index')
    expect(PATH_MOVE_HANDLE_INDICES.map(String)).toContain(idx)
  })
})
