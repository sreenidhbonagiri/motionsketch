import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  buildPathMoveFixtureJson,
  buildPathMoveFixtureSamples,
  PATH_MOVE_HANDLE_INDICES,
} from '../fixtures/pathMoveProject'
import {
  ensureEditor,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
  respondToConfirm,
  selectActorByIndex,
} from './helpers'

test.describe('move entire path', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('drag translates the path; undo/redo and restore keep recording', async ({
    page,
  }) => {
    const baseline = buildPathMoveFixtureSamples()
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await ensureEditor(page, 'Path move fixture')

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await page.getByTestId('btn-path-tool-move').click()
    await expect(page.getByTestId('path-move-overlay')).toBeVisible()
    await expect(page.getByTestId('path-handles')).toHaveCount(0)
    await expect(page.getByTestId('stage-frame')).toHaveAttribute(
      'data-path-tool',
      'move-path',
    )
    await expect(page.getByTestId('dock-status')).toContainText('Move path')

    const overlay = page.getByTestId('path-move-overlay')
    await expect(overlay).toBeFocused()
    const box = await overlay.boundingBox()
    expect(box).toBeTruthy()
    const mid = baseline[Math.floor(baseline.length / 2)]!
    const startX = box!.x + mid.x * box!.width
    const startY = box!.y + mid.y * box!.height
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 48, startY - 36, { steps: 10 })
    await page.mouse.up()

    await expect(page.getByTestId('btn-undo-edit')).toBeEnabled()
    await page.getByTestId('btn-path-tool-points').click()
    const handle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[2]}`,
    )
    await expect(handle).toBeVisible()
    const afterDrag = Number(await handle.getAttribute('data-sample-x'))
    expect(afterDrag).toBeGreaterThan(
      baseline[PATH_MOVE_HANDLE_INDICES[2]]!.x,
    )

    await page.getByTestId('btn-undo-edit').click()
    await expect(handle).toHaveAttribute(
      'data-sample-x',
      String(baseline[PATH_MOVE_HANDLE_INDICES[2]]!.x),
    )
    await page.getByTestId('btn-redo-edit').click()
    expect(Number(await handle.getAttribute('data-sample-x'))).toBeGreaterThan(
      baseline[PATH_MOVE_HANDLE_INDICES[2]]!.x,
    )

    await page.getByTestId('btn-restore-path').click()
    await respondToConfirm(page, {
      dialogTestId: 'restore-path-confirm',
      confirmTestId: 'btn-restore-path-confirm',
      cancelTestId: 'btn-app-confirm-cancel',
    })
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await page.getByTestId('btn-done-edit').click()

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
    expect(css).toMatch(/rotate\(/i)
  })

  test('keyboard nudge requires path focus; Escape cancels in-progress move', async ({
    page,
  }) => {
    const baseline = buildPathMoveFixtureSamples()
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    await expect(overlay).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await page.getByTestId('btn-path-tool-points').click()
    const handle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    const nudgedX = Number(await handle.getAttribute('data-sample-x'))
    expect(nudgedX).toBeCloseTo(baseline[0]!.x + 0.005, 5)

    await page.getByTestId('btn-path-tool-move').click()
    await expect(overlay).toBeFocused()
    // Blur the path — arrows must not move it without focus.
    await page.getByTestId('btn-done-edit').focus()
    await page.keyboard.press('ArrowRight')
    await page.getByTestId('btn-path-tool-points').click()
    expect(Number(await handle.getAttribute('data-sample-x'))).toBeCloseTo(
      nudgedX,
      5,
    )

    await page.getByTestId('btn-path-tool-move').click()
    await expect(overlay).toBeFocused()
    const box = await overlay.boundingBox()
    expect(box).toBeTruthy()
    const mid = baseline[Math.floor(baseline.length / 2)]!
    const startX = box!.x + mid.x * box!.width
    const startY = box!.y + mid.y * box!.height
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 60, startY, { steps: 6 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.getByTestId('btn-path-tool-points').click()
    expect(Number(await handle.getAttribute('data-sample-x'))).toBeCloseTo(
      nudgedX,
      5,
    )
  })

  test('move path stays on the selected actor; save/open keeps geometry', async ({
    page,
  }) => {
    await loadProjectSnapshot(
      page,
      buildPathMoveFixtureJson('2026-01-01T00:00:00.000Z', {
        secondActor: true,
      }),
    )
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    await overlay.focus()
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.up('Shift')
    await page.getByTestId('btn-done-edit').click()

    await selectActorByIndex(page, 1)
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-points').click()
    const otherHandle = page.locator('[data-testid^="path-handle-"]').first()
    const otherY = Number(await otherHandle.getAttribute('data-sample-y'))
    await page.getByTestId('btn-done-edit').click()

    await selectActorByIndex(page, 0)
    await page.getByTestId('btn-edit-path').click()
    const leadHandle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    const leadY = Number(await leadHandle.getAttribute('data-sample-y'))
    const baselineY = buildPathMoveFixtureSamples()[0]!.y
    expect(leadY).toBeCloseTo(baselineY + 0.02, 5)
    expect(otherY).toBeCloseTo(baselineY + 0.08, 5)

    await page.getByTestId('btn-done-edit').click()
    await openPanel(page, 'project')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const zipPath = await (await downloadPromise).path()
    expect(zipPath).toBeTruthy()
    const json = readFileSync(zipPath!, 'utf8')

    await page.goto('/')
    await ensureEditor(page)
    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'path-move.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json, 'utf8'),
    })
    await respondToConfirm(page, {
      dialogTestId: 'open-project-confirm',
      confirmTestId: 'btn-open-project-confirm',
      cancelTestId: 'btn-open-project-cancel',
    })
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Path move fixture',
    )
    await page.getByTestId('btn-edit-path').click()
    const restored = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    expect(Number(await restored.getAttribute('data-sample-y'))).toBeCloseTo(
      baselineY + 0.02,
      5,
    )
  })

  test('zero-distance gesture does not create an undo entry', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    const box = await overlay.boundingBox()
    expect(box).toBeTruthy()
    const samples = buildPathMoveFixtureSamples()
    const mid = samples[Math.floor(samples.length / 2)]!
    const x = box!.x + mid.x * box!.width
    const y = box!.y + mid.y * box!.height
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 2, y + 1, { steps: 2 })
    await page.mouse.up()
    await expect(page.getByTestId('btn-undo-edit')).toBeDisabled()
  })

  test('edge nudge keeps samples on stage; Escape cancels an in-progress drag', async ({
    page,
  }) => {
    const baseline = buildPathMoveFixtureSamples()
    const endIdx =
      PATH_MOVE_HANDLE_INDICES[PATH_MOVE_HANDLE_INDICES.length - 1]!
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await page.getByTestId('btn-edit-path').click()

    await page.getByTestId('btn-path-tool-move').click()
    const overlay = page.getByTestId('path-move-overlay')
    await expect(overlay).toBeFocused()

    // Same clamp helper as pointer: Shift+ArrowRight until the path is against
    // the right edge (room ≈ 1 - maxX).
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }
    await page.getByTestId('btn-path-tool-points').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    const endHandle = page.getByTestId(`path-handle-${endIdx}`)
    const startHandle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    expect(Number(await endHandle.getAttribute('data-sample-x'))).toBeCloseTo(
      1,
      5,
    )
    expect(Number(await startHandle.getAttribute('data-sample-x'))).toBeCloseTo(
      baseline[PATH_MOVE_HANDLE_INDICES[0]]!.x + (1 - baseline[endIdx]!.x),
      4,
    )

    // Return to the fixture pose via Restore (clears nudge history).
    await page.getByTestId('btn-restore-path').click()
    await respondToConfirm(page, {
      dialogTestId: 'restore-path-confirm',
      confirmTestId: 'btn-restore-path-confirm',
      cancelTestId: 'btn-app-confirm-cancel',
    })
    await expect(startHandle).toHaveAttribute(
      'data-sample-x',
      String(baseline[PATH_MOVE_HANDLE_INDICES[0]]!.x),
    )

    await page.getByTestId('btn-path-tool-move').click()
    await expect(overlay).toBeFocused()
    const box = await overlay.boundingBox()
    expect(box).toBeTruthy()
    const mid = baseline[Math.floor(baseline.length / 2)]!
    const x = box!.x + mid.x * box!.width
    const y = box!.y + mid.y * box!.height
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 70, y - 40, { steps: 8 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.getByTestId('btn-path-tool-points').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    expect(Number(await startHandle.getAttribute('data-sample-x'))).toBeCloseTo(
      baseline[PATH_MOVE_HANDLE_INDICES[0]]!.x,
      5,
    )
    await expect(page.getByTestId('btn-undo-edit')).toBeDisabled()
  })
})
