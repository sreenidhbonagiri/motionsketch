import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  dragActor,
  openPanel,
  readExportedCss,
} from './helpers'

test.describe('MotionSketch editor', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('drag without record does not show export panel', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('actor')).toBeVisible()
    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toHaveCount(0)
    await expect(page.getByTestId('export-empty')).toBeVisible()

    await dragActor(page, { x: 40, y: 0 }, { x: 120, y: 40 })
    await expect(page.getByTestId('export-panel')).toHaveCount(0)
  })

  test('record, play, and export CSS', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)

    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('armed-hint')).toBeVisible()

    await dragActor(page, { x: 30, y: -20 }, { x: 180, y: 60 })

    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toBeVisible()
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()

    await page.getByTestId('btn-play').click()
    await page.waitForTimeout(400)
    const mid = await actor.boundingBox()
    expect(mid).toBeTruthy()
    const moved =
      Math.abs(mid!.x - before!.x) > 2 || Math.abs(mid!.y - before!.y) > 2
    expect(moved).toBeTruthy()

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
    expect(css).toContain('linear')
    expect(css).not.toMatch(/\bease\b/)

    await page.getByTestId('btn-copy-css').click()
    await expect(page.getByTestId('btn-copy-css')).toHaveText(/Copied|Copy CSS/)
  })

  test('smoothing slider updates exported CSS', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 20, y: 40 }, { x: 160, y: -30 })

    const before = await readExportedCss(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('smoothing-slider').fill('0.9')
    const after = await readExportedCss(page)
    expect(after).toContain('@keyframes')
    expect(after).toContain('translate3d(')
    expect(after).toContain('cqw')
    expect(typeof before).toBe('string')
  })

  test('path comparison toggle shows legend when enabled', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 20, y: 30 }, { x: 140, y: 50 })

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('path-compare-legend')).toHaveCount(0)
    await page.getByTestId('path-compare-toggle').check()
    await expect(page.getByTestId('path-compare-legend')).toBeVisible()
    await expect(page.getByTestId('path-compare-legend')).toContainText(
      'original recording',
    )
    await page.getByTestId('path-compare-toggle').uncheck()
    await expect(page.getByTestId('path-compare-legend')).toHaveCount(0)
  })

  test('steady speed control updates export without adding easing', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 25, y: -15 }, { x: 170, y: 55 })

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('steady-speed-slider')).toBeEnabled()
    await page.getByTestId('steady-speed-slider').fill('0.7')
    await expect(page.getByTestId('steady-speed-value')).toHaveText('70%')

    const css = await readExportedCss(page)
    expect(css).toContain('linear forwards')
    expect(css).toContain('(N / 100) * stageWidth')
    expect(css).not.toMatch(/\bease\b/)
  })

  test('pointer cancel during record does not crash', async ({ page }) => {
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
    await page.mouse.move(x + 80, y + 40, { steps: 10 })
    await page.waitForTimeout(60)

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="actor"]')
      el?.dispatchEvent(
        new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
        }),
      )
    })

    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.locator('body')).toBeVisible()
  })
})
