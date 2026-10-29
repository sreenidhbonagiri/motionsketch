import { expect, test, type Page } from '@playwright/test'
import {
  dragActor,
  ensureEditor,
  openPanel,
  recordSimplePath,
} from './helpers'

async function readCamera(page: Page) {
  return page.evaluate(() => {
    const world = document.querySelector(
      '[data-testid="workspace-world"]',
    ) as HTMLElement | null
    const transform = world?.style.transform ?? ''
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(
      transform,
    )
    return {
      panX: m ? Number(m[1]) : NaN,
      panY: m ? Number(m[2]) : NaN,
      zoom: m ? Number(m[3]) : NaN,
    }
  })
}

async function panEmptyCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

async function assertPlayCenteredInDock(page: Page, tolerancePx = 6) {
  const play = page.getByTestId('btn-play').or(page.getByTestId('btn-pause'))
  await expect(play).toBeVisible()
  const centered = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="playback-dock"]')
    const control =
      document.querySelector('[data-testid="btn-play"]') ??
      document.querySelector('[data-testid="btn-pause"]')
    if (!(dock instanceof HTMLElement) || !(control instanceof HTMLElement)) {
      return { ok: false, delta: Infinity }
    }
    const dr = dock.getBoundingClientRect()
    const cr = control.getBoundingClientRect()
    return {
      ok: true,
      delta: Math.abs(dr.left + dr.width / 2 - (cr.left + cr.width / 2)),
    }
  })
  expect(centered.ok).toBe(true)
  expect(centered.delta).toBeLessThanOrEqual(tolerancePx)
}

async function dockBox(page: Page) {
  const box = await page.getByTestId('playback-dock').boundingBox()
  expect(box).toBeTruthy()
  return box!
}

test.describe('recording dock UX', () => {
  test('armed empty-canvas drag does not pan; Cancel restores idle', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('mode-status-instruction')).toHaveText(
      'Drag the element to record.',
    )
    await expect(page.getByTestId('btn-stop')).toHaveAccessibleName(
      'Cancel record',
    )

    const before = await readCamera(page)
    const stage = await page.getByTestId('stage').boundingBox()
    expect(stage).toBeTruthy()
    await panEmptyCanvas(
      page,
      { x: stage!.x + 36, y: stage!.y + stage!.height * 0.78 },
      { x: stage!.x + 120, y: stage!.y + stage!.height * 0.78 + 40 },
    )

    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('btn-stop')).toBeVisible()
    await expect(page.getByTestId('action-live-region')).toHaveText(
      'Drag the element to record.',
    )
    const after = await readCamera(page)
    expect(Math.abs(after.panX - before.panX)).toBeLessThan(1)
    expect(Math.abs(after.panY - before.panY)).toBeLessThan(1)

    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.getByTestId('btn-stop')).toHaveCount(0)
    await expect(page.getByTestId('dock-status')).toHaveCount(0)
  })

  test('Stop ends an in-progress recording and restores idle chrome', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()
    const actor = page.getByTestId('actor')
    const box = await actor.boundingBox()
    expect(box).toBeTruthy()
    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 40, y - 20, { steps: 6 })
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'recording',
    )
    await expect(page.getByTestId('btn-stop')).toHaveAccessibleName(
      'Stop recording',
    )
    // DOM click: actor pointer-capture can swallow Playwright's mouse click.
    await page.getByTestId('btn-stop').evaluate((el) => {
      ;(el as HTMLButtonElement).click()
    })
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.getByTestId('btn-stop')).toHaveCount(0)
    await expect(page.getByTestId('mode-status-label')).toHaveCount(0)
  })

  test('dock bounds and Play stay stable across idle / armed / recording / playing', async ({
    page,
  }) => {
    for (const width of [1280, 390] as const) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)
      await recordSimplePath(page)

      const idle = await dockBox(page)
      await assertPlayCenteredInDock(page)

      await page.getByTestId('btn-record').click()
      const confirm = page.getByTestId('btn-rerecord-confirm')
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
      await expect(page.getByTestId('btn-stop')).toBeVisible()
      const armed = await dockBox(page)
      expect(Math.abs(armed.height - idle.height)).toBeLessThanOrEqual(2)
      expect(Math.abs(armed.y - idle.y)).toBeLessThanOrEqual(2)
      await assertPlayCenteredInDock(page)

      const actor = page.getByTestId('actor')
      const ab = await actor.boundingBox()
      expect(ab).toBeTruthy()
      const ax = ab!.x + ab!.width / 2
      const ay = ab!.y + ab!.height / 2
      await page.mouse.move(ax, ay)
      await page.mouse.down()
      await page.mouse.move(ax + 28, ay - 14, { steps: 5 })
      await expect(page.getByTestId('mode-status-label')).toContainText(
        /Recording/i,
      )
      const recording = await dockBox(page)
      expect(Math.abs(recording.height - idle.height)).toBeLessThanOrEqual(2)
      await assertPlayCenteredInDock(page)
      // Complete a real take so the timeline/editing rows stay mounted.
      await page.mouse.move(ax + 120, ay + 40, { steps: 12 })
      await page.waitForTimeout(80)
      await page.mouse.up()
      await expect(page.getByTestId('btn-record')).toBeVisible()
      await expect(page.getByTestId('playback-timeline')).toBeVisible()

      const paused = await dockBox(page)
      expect(Math.abs(paused.height - idle.height)).toBeLessThanOrEqual(2)
      await assertPlayCenteredInDock(page)

      await page.getByTestId('btn-play').click()
      await expect(page.getByTestId('btn-pause')).toBeVisible()
      const playing = await dockBox(page)
      expect(Math.abs(playing.height - idle.height)).toBeLessThanOrEqual(2)
      await assertPlayCenteredInDock(page)
      await page.getByTestId('btn-pause').click()
    }
  })

  test('Restart / Undo / Redo expose names and titles when disabled', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    const restart = page.getByTestId('btn-restart')
    const undo = page.getByTestId('btn-undo-transform')
    const redo = page.getByTestId('btn-redo-transform')
    await expect(restart).toHaveAccessibleName('Restart')
    await expect(undo).toHaveAccessibleName('Undo')
    await expect(redo).toHaveAccessibleName('Redo')
    await expect(restart).toHaveAttribute('title', /Restart/i)
    await expect(undo).toHaveAttribute('title', /Undo placement/i)
    await expect(redo).toHaveAttribute('title', /Redo placement/i)
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()

    await page.getByTestId('btn-record').click()
    const confirm = page.getByTestId('btn-rerecord-confirm')
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await expect(restart).toBeDisabled()
    await expect(restart).toHaveAccessibleName('Restart')
    await expect(restart).toHaveAttribute('title', /Restart/i)
    await page.getByTestId('btn-stop').click()
  })

  test('Reset motion still requires confirmation', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-reset').click()
    await expect(page.getByTestId('reset-actor-confirm')).toBeVisible()
    await page.getByTestId('btn-reset-actor-cancel').click()
    await expect(page.getByTestId('btn-play')).toBeEnabled()
  })

  test('Project status is not stuck on Recording after take + Play', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await expect(page.getByTestId('action-live-region')).not.toHaveText(
      'Recording',
    )

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    // Loop is off by default — wait until playback returns to idle Play.
    await expect(page.getByTestId('btn-play')).toBeVisible({ timeout: 15000 })

    await openPanel(page, 'project')
    await expect(page.getByTestId('project-panel')).toBeVisible()
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
    )
    await expect(page.getByTestId('project-action-status')).toHaveCount(0)
    await expect(page.getByTestId('project-panel')).not.toContainText(
      'Recording',
    )
    await expect(page.getByTestId('action-live-region')).not.toHaveText(
      'Recording',
    )
  })
})
