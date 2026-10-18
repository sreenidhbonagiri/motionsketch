import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  selectActorByIndex,
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

    await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="stage"]')
      if (!stage) throw new Error('missing stage')
      stage.dispatchEvent(
        new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
        }),
      )
    })

    // Ensure mouse is released so Playwright state is clean.
    await page.mouse.up().catch(() => undefined)

    const restored = await actor.boundingBox()
    expect(restored).toBeTruthy()
    expect(Math.abs(restored!.x - before!.x)).toBeLessThan(8)
    expect(Math.abs(restored!.y - before!.y)).toBeLessThan(8)
  })
})
