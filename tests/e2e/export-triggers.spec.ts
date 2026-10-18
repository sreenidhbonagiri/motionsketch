import { expect, test, type Frame, type Page } from '@playwright/test'
import {
  ensureEditor,
  openPanel,
  recordSimplePath,
} from './helpers'

async function openExport(page: Page) {
  await openPanel(page, 'export')
  await expect(page.getByTestId('export-panel')).toBeVisible()
}

async function setDurationMs(page: Page, ms: number) {
  await openPanel(page, 'adjust')
  await page.getByTestId('duration-slider').fill(String(ms))
  await openExport(page)
}

async function previewFrame(page: Page): Promise<Frame> {
  await page.getByTestId('btn-preview-trigger').click()
  const handle = await page.getByTestId('trigger-preview-frame').elementHandle()
  expect(handle).toBeTruthy()
  const frame = await handle!.contentFrame()
  expect(frame).toBeTruthy()
  return frame!
}

async function installStartCounter(frame: Frame) {
  await frame.evaluate(() => {
    const w = window as unknown as { __msAnimStarts?: number }
    w.__msAnimStarts = 0
    const root = document.querySelector('[data-testid="demo-scene"]')
    if (!root) return
    root.querySelectorAll('[class^="ms-actor"]').forEach((el) => {
      el.addEventListener('animationstart', () => {
        w.__msAnimStarts = (w.__msAnimStarts ?? 0) + 1
      })
    })
  })
}

async function animStarts(frame: Frame): Promise<number> {
  return frame.evaluate(() => {
    const w = window as unknown as { __msAnimStarts?: number }
    return w.__msAnimStarts ?? 0
  })
}

test.describe('export playback triggers', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('page-load default, click restart, hover no child double-fire', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openExport(page)

    await expect(page.getByTestId('export-trigger-select')).toHaveValue(
      'page-load',
    )
    await expect(page.getByTestId('export-trigger-help')).toContainText(
      'page loads',
    )

    // Preview page-load — scene should not use waiting class.
    await page.getByTestId('btn-preview-trigger').click()
    const frame = page.frameLocator('[data-testid="trigger-preview-frame"]')
    await expect(frame.getByTestId('demo-scene')).toBeVisible()
    await expect(frame.getByTestId('demo-scene')).not.toHaveClass(/ms-waiting/)
    await page.getByTestId('btn-close-trigger-preview').click()

    // Click trigger: waiting until activation; click restarts.
    await page.getByTestId('export-trigger-select').selectOption('click')
    await expect(page.getByTestId('export-css-help')).toContainText(
      'requires JavaScript',
    )
    await page.getByTestId('btn-preview-trigger').click()
    const clickFrame = page.frameLocator(
      '[data-testid="trigger-preview-frame"]',
    )
    const scene = clickFrame.getByTestId('demo-scene')
    await expect(scene).toHaveClass(/ms-waiting/)
    await scene.click()
    await expect(scene).not.toHaveClass(/ms-waiting/)
    await clickFrame.getByTestId('demo-replay').click()
    await expect(scene).not.toHaveClass(/ms-waiting/)
    await page.getByTestId('btn-close-trigger-preview').click()

    // Hover: moving among children must not re-add waiting.
    await page.getByTestId('export-trigger-select').selectOption('hover')
    await page.getByTestId('btn-preview-trigger').click()
    const hoverFrame = page.frameLocator(
      '[data-testid="trigger-preview-frame"]',
    )
    const hoverScene = hoverFrame.getByTestId('demo-scene')
    await expect(hoverScene).toHaveClass(/ms-waiting/)
    await hoverScene.hover()
    await expect(hoverScene).not.toHaveClass(/ms-waiting/)
    await hoverFrame.getByTestId('demo-actor').hover()
    await expect(hoverScene).not.toHaveClass(/ms-waiting/)
    await expect(hoverFrame.getByTestId('demo-hover-tap')).toBeVisible()
    await page.getByTestId('btn-close-trigger-preview').click()

    // Editor playhead unchanged by preview.
    await expect(page.getByTestId('playback-scrubber')).toHaveValue('0')
  })

  test('pause for long automatic and looping scenes', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await setDurationMs(page, 6000)

    // Long page-load → Pause after auto start.
    await page.getByTestId('export-trigger-select').selectOption('page-load')
    await page.getByTestId('btn-preview-trigger').click()
    const pageLoad = page.frameLocator(
      '[data-testid="trigger-preview-frame"]',
    )
    await expect(pageLoad.getByTestId('demo-pause')).toBeVisible()
    await pageLoad.getByTestId('demo-pause').click()
    await expect(pageLoad.getByTestId('demo-pause')).toHaveText('Resume')
    await expect(pageLoad.getByTestId('demo-pause')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await pageLoad.getByTestId('demo-pause').click()
    await expect(pageLoad.getByTestId('demo-pause')).toHaveText('Pause')
    await page.getByTestId('btn-close-trigger-preview').click()

    // Long viewport → Pause after IO start.
    await page.getByTestId('export-trigger-select').selectOption('viewport')
    await page.getByTestId('btn-preview-trigger').click()
    const viewport = page.frameLocator(
      '[data-testid="trigger-preview-frame"]',
    )
    await expect(viewport.getByTestId('demo-scene')).not.toHaveClass(
      /ms-waiting/,
      { timeout: 3000 },
    )
    await expect(viewport.getByTestId('demo-pause')).toBeVisible()
    await page.getByTestId('btn-close-trigger-preview').click()

    // Short click without loop → no pause control in markup.
    await setDurationMs(page, 2000)
    await page.getByTestId('export-trigger-select').selectOption('click')
    await page.getByTestId('btn-preview-trigger').click()
    const shortClick = page.frameLocator(
      '[data-testid="trigger-preview-frame"]',
    )
    await expect(shortClick.getByTestId('demo-pause')).toHaveCount(0)
    await page.getByTestId('btn-close-trigger-preview').click()

    // Looping click → Pause after activation.
    await openPanel(page, 'adjust')
    await page.getByTestId('loop-toggle').check()
    await openExport(page)
    await page.getByTestId('export-trigger-select').selectOption('click')
    await page.getByTestId('btn-preview-trigger').click()
    const loopClick = page.frameLocator(
      '[data-testid="trigger-preview-frame"]',
    )
    await loopClick.getByTestId('demo-scene').click()
    await expect(loopClick.getByTestId('demo-pause')).toBeVisible()
    await page.getByTestId('btn-close-trigger-preview').click()
  })

  test('click and hover interactions use pointer/focus state, not a timed mute', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openExport(page)

    // Rapid deliberate clicks each restart.
    await page.getByTestId('export-trigger-select').selectOption('click')
    const clickFrame = await previewFrame(page)
    await installStartCounter(clickFrame)
    const scene = clickFrame.getByTestId('demo-scene')
    await scene.click()
    await scene.click()
    await scene.click()
    await expect.poll(() => animStarts(clickFrame)).toBeGreaterThanOrEqual(3)

    // Keyboard-only activation (Enter) also restarts.
    await scene.focus()
    const beforeKey = await animStarts(clickFrame)
    await scene.press('Enter')
    await expect
      .poll(() => animStarts(clickFrame))
      .toBeGreaterThan(beforeKey)
    await page.getByTestId('btn-close-trigger-preview').click()

    // Hover: pointer then focus must not double-start; leave/re-enter rearms;
    // child focus moves stay in one session; tap control activates.
    await page.getByTestId('export-trigger-select').selectOption('hover')
    const hoverFrame = await previewFrame(page)
    await installStartCounter(hoverFrame)
    await hoverFrame.evaluate(() => {
      const root = document.querySelector('[data-testid="demo-scene"]')
      const actor = document.querySelector('[data-testid="demo-actor"]')
      if (!root || !actor) return
      const a = document.createElement('button')
      a.type = 'button'
      a.textContent = 'A'
      a.setAttribute('data-testid', 'demo-focus-a')
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = 'B'
      b.setAttribute('data-testid', 'demo-focus-b')
      root.appendChild(a)
      root.appendChild(b)
    })

    const hoverScene = hoverFrame.getByTestId('demo-scene')
    await hoverScene.hover()
    await expect.poll(() => animStarts(hoverFrame)).toBe(1)
    // Focus while pointer still inside — same session.
    await hoverFrame.getByTestId('demo-focus-a').focus()
    await hoverFrame.getByTestId('demo-focus-b').focus()
    await expect.poll(() => animStarts(hoverFrame)).toBe(1)

    // Leave pointer and focus, then re-enter with pointer.
    await page.mouse.move(8, 8)
    await hoverFrame.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null
      ae?.blur()
    })
    await hoverScene.hover()
    await expect.poll(() => animStarts(hoverFrame)).toBe(2)

    // Touch-style activation via explicit tap control after leave.
    await page.mouse.move(8, 8)
    await hoverFrame.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null
      ae?.blur()
    })
    await hoverFrame.getByTestId('demo-hover-tap').click()
    await expect.poll(() => animStarts(hoverFrame)).toBe(3)

    await page.getByTestId('btn-close-trigger-preview').click()
  })

  test('viewport plays once when visible', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openExport(page)
    await page.getByTestId('export-trigger-select').selectOption('viewport')
    await page.getByTestId('btn-preview-trigger').click()

    const frame = page.frameLocator('[data-testid="trigger-preview-frame"]')
    const scene = frame.getByTestId('demo-scene')
    await expect(scene).toBeVisible()
    await expect(scene).not.toHaveClass(/ms-waiting/, { timeout: 3000 })
    await page.getByTestId('btn-close-trigger-preview').click()
  })

  test('trigger persists across reload', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openExport(page)
    await page.getByTestId('export-trigger-select').selectOption('click')
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
      { timeout: 4000 },
    )
    await page.reload()
    await ensureEditor(page)
    await openExport(page)
    await expect(page.getByTestId('export-trigger-select')).toHaveValue('click')
  })
})
