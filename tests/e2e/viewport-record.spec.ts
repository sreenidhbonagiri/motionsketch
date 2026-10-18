import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  readExportedCss,
} from './helpers'

test.describe('full-viewport recording', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('records near all edges; resize keeps geometry; export uses stored aspect', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await page.getByTestId('btn-record').click()

    const actor = page.getByTestId('actor')
    const stage = page.getByTestId('stage')
    const stageBox = await stage.boundingBox()
    expect(stageBox).toBeTruthy()
    // Stage must own the viewport.
    expect(stageBox!.width).toBeGreaterThan(1200)
    expect(stageBox!.height).toBeGreaterThan(750)

    const start = await actor.boundingBox()
    expect(start).toBeTruthy()
    const sx = start!.x + start!.width / 2
    const sy = start!.y + start!.height / 2

    // Sweep through left, top, right, and bottom regions of the viewport.
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    const path = [
      { x: stageBox!.x + 40, y: stageBox!.y + stageBox!.height / 2 },
      { x: stageBox!.x + stageBox!.width / 2, y: stageBox!.y + 40 },
      {
        x: stageBox!.x + stageBox!.width - 40,
        y: stageBox!.y + stageBox!.height / 2,
      },
      {
        x: stageBox!.x + stageBox!.width / 2,
        y: stageBox!.y + stageBox!.height - 40,
      },
      {
        x: stageBox!.x + stageBox!.width * 0.65,
        y: stageBox!.y + stageBox!.height * 0.55,
      },
    ]
    for (const p of path) {
      await page.mouse.move(p.x, p.y, { steps: 10 })
      await page.waitForTimeout(30)
    }
    await page.mouse.up()

    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('motionsketch.project.v1')))
      .toBeTruthy()

    const samples = await page.evaluate(() => {
      const raw = localStorage.getItem('motionsketch.project.v1')
      if (!raw) return null
      const snap = JSON.parse(raw) as {
        project: {
          stageAspect: number
          actors: Array<{
            recording: { samples: Array<{ x: number; y: number }> } | null
          }>
        }
      }
      const recording = snap.project.actors[0]?.recording
      if (!recording) return null
      return {
        aspect: snap.project.stageAspect,
        samples: recording.samples,
      }
    })
    expect(samples).toBeTruthy()
    expect(samples!.aspect).toBeCloseTo(1280 / 800, 2)

    const xs = samples!.samples.map((s) => s.x)
    const ys = samples!.samples.map((s) => s.y)
    expect(Math.min(...xs)).toBeLessThan(0.15)
    expect(Math.max(...xs)).toBeGreaterThan(0.85)
    expect(Math.min(...ys)).toBeLessThan(0.2)
    expect(Math.max(...ys)).toBeGreaterThan(0.8)

    // Edit a handle near the path; dock remains usable.
    await page.getByTestId('btn-edit-path').click()
    const handle = page.locator('[data-testid^="path-handle-"]').first()
    await handle.click({ force: true })
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.getByTestId('btn-done-edit').click()

    const aspectLocked = samples!.aspect

    // Resize the window — stored aspect and sample endpoints must not rewrite.
    await page.setViewportSize({ width: 900, height: 900 })
    await page.waitForTimeout(200)

    const afterResize = await page.evaluate(() => {
      const raw = localStorage.getItem('motionsketch.project.v1')
      if (!raw) return null
      const snap = JSON.parse(raw) as {
        project: {
          stageAspect: number
          actors: Array<{
            recording: { samples: Array<{ x: number; y: number }> } | null
          }>
        }
      }
      const s = snap.project.actors[0]?.recording?.samples
      if (!s) return null
      return {
        aspect: snap.project.stageAspect,
        first: s[0],
        last: s[s.length - 1],
      }
    })
    expect(afterResize!.aspect).toBeCloseTo(aspectLocked, 5)

    // Pointer still maps into the full stage after resize.
    const stageAfter = await stage.boundingBox()
    expect(stageAfter).toBeTruthy()
    expect(stageAfter!.width).toBeGreaterThan(850)
    expect(stageAfter!.height).toBeGreaterThan(850)

    await page.setViewportSize({ width: 1280, height: 800 })
    const css = await readExportedCss(page)
    // 1280/800 = 1.6 → formatted as 16/10
    expect(css).toMatch(/aspect-ratio:\s*16\s*\/\s*10/)

    await openPanel(page, 'export')
    await expect(page.getByTestId('export-panel')).toBeVisible()
  })
})
