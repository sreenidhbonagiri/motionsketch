import { expect, test } from '@playwright/test'
import {
  actorHasPointerCapture,
  dispatchActivePointerCancel,
  ensureEditor,
  ensureRefineMotionOpen,
  selectActorByIndex,
  touchPointerGesture,
} from './helpers'

test.describe('idle drag unrecorded actors', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('moves live before release, commits on up, isolates other actors', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-add-actor').click()
    await selectActorByIndex(page, 0)

    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()

    const startX = before!.x + before!.width / 2
    const startY = before!.y + before!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 120, startY - 80, { steps: 10 })

    // Visible movement before pointer release.
    const during = await actor.boundingBox()
    expect(during).toBeTruthy()
    expect(Math.abs(during!.x - before!.x)).toBeGreaterThan(20)

    await page.mouse.up()
    const after = await actor.boundingBox()
    expect(after).toBeTruthy()
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20)

    // Second actor stays put (not following the drag).
    const otherId = (await selectActorByIndex(page, 1))!
    await selectActorByIndex(page, 0)
    const otherBefore = await page.getByTestId(`actor-${otherId}`).boundingBox()
    await page.mouse.move(startX + 120, startY - 80)
    await page.mouse.down()
    await page.mouse.move(startX + 200, startY - 40, { steps: 8 })
    const otherDuring = await page.getByTestId(`actor-${otherId}`).boundingBox()
    expect(otherDuring).toBeTruthy()
    expect(Math.abs(otherDuring!.x - otherBefore!.x)).toBeLessThan(2)
    expect(Math.abs(otherDuring!.y - otherBefore!.y)).toBeLessThan(2)
    await page.mouse.up()
  })

  test('pointer cancel restores the prior rest position', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()
    const startX = before!.x + before!.width / 2
    const startY = before!.y + before!.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 100, startY + 60, { steps: 8 })
    const during = await actor.boundingBox()
    expect(Math.abs(during!.x - before!.x)).toBeGreaterThan(15)

    // Cancel is handled on the actor (pointer capture target).
    await dispatchActivePointerCancel(page, '[data-testid="actor"]')

    // Ensure mouse is released so Playwright state is clean.
    await page.mouse.up().catch(() => undefined)

    const restored = await actor.boundingBox()
    expect(restored).toBeTruthy()
    expect(Math.abs(restored!.x - before!.x)).toBeLessThan(8)
    expect(Math.abs(restored!.y - before!.y)).toBeLessThan(8)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
  })

  test('completed placement is undoable; Escape cancels without history', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()
    const startX = before!.x + before!.width / 2
    const startY = before!.y + before!.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 140, startY - 70, { steps: 10 })
    await page.mouse.up()
    const placed = await actor.boundingBox()
    expect(Math.abs(placed!.x - before!.x)).toBeGreaterThan(20)
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()

    await page.getByTestId('btn-undo-transform').click()
    const undone = await actor.boundingBox()
    expect(Math.abs(undone!.x - before!.x)).toBeLessThan(8)
    expect(Math.abs(undone!.y - before!.y)).toBeLessThan(8)

    await page.getByTestId('btn-redo-transform').click()
    const redone = await actor.boundingBox()
    expect(Math.abs(redone!.x - placed!.x)).toBeLessThan(8)
    expect(Math.abs(redone!.y - placed!.y)).toBeLessThan(8)

    // Escape during drag restores without adding another undo entry.
    await page.mouse.move(
      redone!.x + redone!.width / 2,
      redone!.y + redone!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(startX - 80, startY + 90, { steps: 8 })
    await page.keyboard.press('Escape')
    await page.mouse.up().catch(() => undefined)
    const afterEscape = await actor.boundingBox()
    expect(Math.abs(afterEscape!.x - redone!.x)).toBeLessThan(8)
    expect(Math.abs(afterEscape!.y - redone!.y)).toBeLessThan(8)
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await expect(page.getByTestId('btn-redo-transform')).toBeDisabled()
  })

  test('Escape mid-drag releases capture; orphaned up does not commit; next drag works', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()
    const startX = before!.x + before!.width / 2
    const startY = before!.y + before!.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 110, startY + 40, { steps: 8 })
    expect(await actorHasPointerCapture(page)).toBe(true)

    await page.keyboard.press('Escape')
    expect(await actorHasPointerCapture(page)).toBe(false)

    // Orphaned pointerup must not commit placement history.
    await page.mouse.up()
    const restored = await actor.boundingBox()
    expect(Math.abs(restored!.x - before!.x)).toBeLessThan(8)
    expect(Math.abs(restored!.y - before!.y)).toBeLessThan(8)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()

    // Immediate follow-up interaction must capture and commit normally.
    const mid = await actor.boundingBox()
    const mx = mid!.x + mid!.width / 2
    const my = mid!.y + mid!.height / 2
    await page.mouse.move(mx, my)
    await page.mouse.down()
    expect(await actorHasPointerCapture(page)).toBe(true)
    await page.mouse.move(mx + 130, my - 60, { steps: 10 })
    await page.mouse.up()
    expect(await actorHasPointerCapture(page)).toBe(false)
    const placed = await actor.boundingBox()
    expect(Math.abs(placed!.x - before!.x)).toBeGreaterThan(20)
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
  })

})

test.describe('touch-emulated idle placement', () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } })

  test('snaps on commit and cancels without history', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await ensureEditor(page)

    await ensureRefineMotionOpen(page)
    await page.getByTestId('snap-to-grid-toggle').click()
    await expect(page.getByTestId('snap-to-grid-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()
    const stage = await page.getByTestId('stage').boundingBox()
    expect(stage).toBeTruthy()
    const from = {
      x: before!.x + before!.width / 2,
      y: before!.y + before!.height / 2,
    }
    const to = { x: from.x + 90, y: from.y - 50 }

    // Chromium records real touch pointerType via CDP.
    if (browserName === 'chromium') {
      await page.evaluate(() => {
        ;(window as unknown as { __placementPointerTypes: string[] }).__placementPointerTypes =
          []
        document.addEventListener(
          'pointerdown',
          (event) => {
            ;(
              window as unknown as { __placementPointerTypes: string[] }
            ).__placementPointerTypes.push(event.pointerType)
          },
          true,
        )
      })
    }

    await touchPointerGesture(page, { from, to, end: 'up', browserName })
    const snapped = await actor.boundingBox()
    expect(snapped).toBeTruthy()
    expect(Math.abs(snapped!.x - before!.x)).toBeGreaterThan(15)

    if (browserName === 'chromium') {
      const types = await page.evaluate(
        () =>
          (window as unknown as { __placementPointerTypes: string[] })
            .__placementPointerTypes,
      )
      expect(types.some((t) => t === 'touch')).toBeTruthy()
    }

    const cx =
      (snapped!.x + snapped!.width / 2 - stage!.x) / stage!.width
    const cy =
      (snapped!.y + snapped!.height / 2 - stage!.y) / stage!.height
    const step = 0.05
    expect(Math.abs(cx / step - Math.round(cx / step))).toBeLessThan(0.02)
    expect(Math.abs(cy / step - Math.round(cy / step))).toBeLessThan(0.02)
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()

    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()

    const again = await actor.boundingBox()
    const from2 = {
      x: again!.x + again!.width / 2,
      y: again!.y + again!.height / 2,
    }
    await touchPointerGesture(page, {
      from: from2,
      to: { x: from2.x + 100, y: from2.y + 60 },
      end: 'cancel',
      browserName,
    })
    const afterCancel = await actor.boundingBox()
    expect(Math.abs(afterCancel!.x - again!.x)).toBeLessThan(8)
    expect(Math.abs(afterCancel!.y - again!.y)).toBeLessThan(8)
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
    expect(await actorHasPointerCapture(page)).toBe(false)
  })
})
