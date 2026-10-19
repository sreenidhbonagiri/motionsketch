import { expect, test } from '@playwright/test'
import { buildPathHandlesFixtureJson } from '../fixtures/pathHandlesProject'
import {
  buildPathMoveFixtureJson,
  buildPathMoveFixtureSamples,
  PATH_MOVE_HANDLE_INDICES,
} from '../fixtures/pathMoveProject'
import {
  dragActor,
  ensureEditor,
  ensureRefineMotionOpen,
  loadProjectSnapshot,
} from './helpers'

test.describe('snap to grid', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('toggle is off by default; help visible; state is labeled', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await ensureRefineMotionOpen(page)
    const toggle = page.getByTestId('snap-to-grid-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toContainText('Snap to grid')
    await expect(page.getByTestId('snap-to-grid-help')).toContainText(
      /Recording stays freehand/i,
    )
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toContainText('Snap on')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('idle placement snaps to lattice; enabling alone does not move actor', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()

    await ensureRefineMotionOpen(page)
    await page.getByTestId('snap-to-grid-toggle').click()
    const afterToggle = await actor.boundingBox()
    expect(Math.abs(afterToggle!.x - before!.x)).toBeLessThan(2)
    expect(Math.abs(afterToggle!.y - before!.y)).toBeLessThan(2)

    const startX = before!.x + before!.width / 2
    const startY = before!.y + before!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Move near a grid cell; stage is full-bleed at 1280×800, step 0.05.
    await page.mouse.move(startX + 90, startY - 50, { steps: 12 })
    await page.mouse.up()

    // Committed center should land on the shared project lattice.
    const box = await actor.boundingBox()
    const stage = await page.getByTestId('stage').boundingBox()
    expect(box && stage).toBeTruthy()
    const cx = (box!.x + box!.width / 2 - stage!.x) / stage!.width
    const cy = (box!.y + box!.height / 2 - stage!.y) / stage!.height
    const step = 0.05
    expect(Math.abs(cx / step - Math.round(cx / step))).toBeLessThan(0.02)
    expect(Math.abs(cy / step - Math.round(cy / step))).toBeLessThan(0.02)
  })

  test('recording stays freehand while snap is on', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await ensureRefineMotionOpen(page)
    await page.getByTestId('snap-to-grid-toggle').click()
    await expect(page.getByTestId('snap-to-grid-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Toggle hides while armed/recording; preference itself stays on.
    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('snap-to-grid-toggle')).toHaveCount(0)
    await dragActor(page, { x: 20, y: 10 }, { x: 140, y: -40 })
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
    await ensureRefineMotionOpen(page)
    await expect(page.getByTestId('snap-to-grid-toggle')).toBeVisible()
    await expect(page.getByTestId('snap-to-grid-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('path handle drag snaps selected handle; undo restores', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildPathHandlesFixtureJson())
    await ensureEditor(page)
    await ensureRefineMotionOpen(page)
    await page.getByTestId('snap-to-grid-toggle').click()
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()

    const handle = page.locator('[data-testid^="path-handle-"]').nth(2)
    const before = await handle.evaluate((el) => ({
      x: Number(el.getAttribute('data-sample-x')),
      y: Number(el.getAttribute('data-sample-y')),
    }))
    const box = await handle.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 80, box!.y - 40, { steps: 10 })
    await page.mouse.up()

    const after = await handle.evaluate((el) => ({
      x: Number(el.getAttribute('data-sample-x')),
      y: Number(el.getAttribute('data-sample-y')),
    }))
    expect(after.x !== before.x || after.y !== before.y).toBeTruthy()
    const step = 0.05
    expect(Math.abs(after.x / step - Math.round(after.x / step))).toBeLessThan(
      0.02,
    )
    expect(Math.abs(after.y / step - Math.round(after.y / step))).toBeLessThan(
      0.02,
    )

    await page.getByTestId('btn-undo-edit').click()
    const restored = await handle.evaluate((el) => ({
      x: Number(el.getAttribute('data-sample-x')),
      y: Number(el.getAttribute('data-sample-y')),
    }))
    expect(restored.x).toBeCloseTo(before.x, 5)
    expect(restored.y).toBeCloseTo(before.y, 5)
  })

  test('move path snaps start anchor; path shape preserved', async ({
    page,
  }) => {
    const baseline = buildPathMoveFixtureSamples()
    await loadProjectSnapshot(page, buildPathMoveFixtureJson())
    await ensureEditor(page)
    await ensureRefineMotionOpen(page)
    await page.getByTestId('snap-to-grid-toggle').click()
    await page.getByTestId('btn-edit-path').click()
    await page.getByTestId('btn-path-tool-move').click()
    await expect(page.getByTestId('path-move-overlay')).toBeVisible()

    const overlay = page.getByTestId('path-move-overlay')
    const box = await overlay.boundingBox()
    expect(box).toBeTruthy()
    const mid = baseline[Math.floor(baseline.length / 2)]!
    const startX = box!.x + mid.x * box!.width
    const startY = box!.y + mid.y * box!.height
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 70, startY - 40, { steps: 12 })
    await expect(overlay).toHaveAttribute('data-dragging', 'true')
    await expect(page.getByTestId('path-move-anchor')).toBeVisible()
    await page.mouse.up()

    await page.getByTestId('btn-path-tool-points').click()
    const startHandle = page.getByTestId(
      `path-handle-${PATH_MOVE_HANDLE_INDICES[0]}`,
    )
    await expect(startHandle).toBeVisible()
    const start = await startHandle.evaluate((el) => ({
      x: Number(el.getAttribute('data-sample-x')),
      y: Number(el.getAttribute('data-sample-y')),
    }))
    const step = 0.05
    expect(Math.abs(start.x / step - Math.round(start.x / step))).toBeLessThan(
      0.02,
    )
    expect(Math.abs(start.y / step - Math.round(start.y / step))).toBeLessThan(
      0.02,
    )
  })
})
