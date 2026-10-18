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

/** Move the host pointer off the preview, then hover the scene (guarantees mouseenter). */
async function enterSceneWithPointer(
  page: Page,
  scene: ReturnType<Frame['getByTestId']>,
) {
  await page.mouse.move(4, 4)
  await scene.hover()
}

/** Motion animation currentTime (ms); ignores visibility (-vis) tracks. */
async function motionTime(frame: Frame): Promise<number> {
  return frame.evaluate(() => {
    const el = document.querySelector('[data-testid="demo-actor"]') as
      | HTMLElement
      | null
    if (!el || typeof el.getAnimations !== 'function') return -1
    const anim = el
      .getAnimations()
      .find(
        (a) =>
          'animationName' in a &&
          typeof (a as CSSAnimation).animationName === 'string' &&
          !(a as CSSAnimation).animationName.includes('-vis'),
      ) as CSSAnimation | undefined
    return anim && typeof anim.currentTime === 'number' ? anim.currentTime : -1
  })
}

/** Click the scene root and return motion currentTime in the same turn. */
async function clickSceneReadTime(frame: Frame): Promise<number> {
  return frame.evaluate(() => {
    const root = document.querySelector('[data-testid="demo-scene"]')
    if (!root) throw new Error('demo-scene missing')
    root.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    )
    const el = document.querySelector('[data-testid="demo-actor"]') as HTMLElement
    const anim = el
      ?.getAnimations()
      .find(
        (a) =>
          'animationName' in a &&
          typeof (a as CSSAnimation).animationName === 'string' &&
          !(a as CSSAnimation).animationName.includes('-vis'),
      ) as CSSAnimation | undefined
    return anim && typeof anim.currentTime === 'number' ? anim.currentTime : -1
  })
}

/** Focus scene root and press Enter; return motion currentTime in the same turn. */
async function enterSceneReadTime(frame: Frame): Promise<number> {
  return frame.evaluate(() => {
    const root = document.querySelector(
      '[data-testid="demo-scene"]',
    ) as HTMLElement | null
    if (!root) throw new Error('demo-scene missing')
    root.focus()
    root.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    )
    const el = document.querySelector('[data-testid="demo-actor"]') as HTMLElement
    const anim = el
      ?.getAnimations()
      .find(
        (a) =>
          'animationName' in a &&
          typeof (a as CSSAnimation).animationName === 'string' &&
          !(a as CSSAnimation).animationName.includes('-vis'),
      ) as CSSAnimation | undefined
    return anim && typeof anim.currentTime === 'number' ? anim.currentTime : -1
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
    // Keep the timeline in progress for currentTime-based restart checks.
    await setDurationMs(page, 8000)

    // Rapid deliberate clicks each restart the shared timeline.
    await page.getByTestId('export-trigger-select').selectOption('click')
    const clickFrame = await previewFrame(page)
    const scene = clickFrame.getByTestId('demo-scene')
    await expect(scene).toHaveClass(/ms-waiting/)
    expect(await clickSceneReadTime(clickFrame)).toBeLessThan(40)
    await expect(scene).not.toHaveClass(/ms-waiting/)
    await expect.poll(() => motionTime(clickFrame)).toBeGreaterThan(30)
    expect(await clickSceneReadTime(clickFrame)).toBeLessThan(40)
    await expect.poll(() => motionTime(clickFrame)).toBeGreaterThan(30)
    expect(await clickSceneReadTime(clickFrame)).toBeLessThan(40)

    // Keyboard-only activation (Enter) also restarts.
    await expect.poll(() => motionTime(clickFrame)).toBeGreaterThan(30)
    expect(await enterSceneReadTime(clickFrame)).toBeLessThan(40)
    await page.getByTestId('btn-close-trigger-preview').click()

    // Hover: pointer then focus must not restart; leave/re-enter rearms;
    // child focus moves stay in one session; tap control activates.
    await page.getByTestId('export-trigger-select').selectOption('hover')
    const hoverFrame = await previewFrame(page)
    const hoverScene = hoverFrame.getByTestId('demo-scene')
    await expect(hoverScene).toBeVisible()
    await hoverFrame.evaluate(() => {
      const root = document.querySelector('[data-testid="demo-scene"]')
      if (!root) throw new Error('demo-scene missing before focus fixtures')
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
    await expect(hoverFrame.getByTestId('demo-focus-a')).toBeVisible()
    await expect(hoverFrame.getByTestId('demo-focus-b')).toBeVisible()

    await enterSceneWithPointer(page, hoverScene)
    await expect(hoverScene).not.toHaveClass(/ms-waiting/)
    await expect.poll(() => motionTime(hoverFrame)).toBeGreaterThan(40)
    const afterHover = await motionTime(hoverFrame)

    // Product fix: focusout relatedTarget inside root must not re-arm / restart.
    await hoverFrame.getByTestId('demo-focus-a').focus()
    await hoverFrame.getByTestId('demo-focus-b').focus()
    const afterFocus = await motionTime(hoverFrame)
    expect(afterFocus).toBeGreaterThanOrEqual(afterHover - 5)
    expect(afterFocus).toBeGreaterThan(40)

    // Leave pointer and focus, then re-enter with pointer → restart.
    await page.mouse.move(8, 8)
    await hoverFrame.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null
      ae?.blur()
    })
    await enterSceneWithPointer(page, hoverScene)
    await expect.poll(() => motionTime(hoverFrame)).toBeLessThan(40)

    // Touch-style activation via explicit tap control after leave.
    await expect.poll(() => motionTime(hoverFrame)).toBeGreaterThan(20)
    await page.mouse.move(8, 8)
    await hoverFrame.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null
      ae?.blur()
    })
    await hoverFrame.getByTestId('demo-hover-tap').click()
    await expect.poll(() => motionTime(hoverFrame)).toBeLessThan(40)

    await page.getByTestId('btn-close-trigger-preview').click()
  })

  test('reduced-motion blocks hover/focus until explicit Play', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openExport(page)
    await page.getByTestId('export-trigger-select').selectOption('hover')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('btn-preview-trigger').click()

    const frame = page.frameLocator('[data-testid="trigger-preview-frame"]')
    const scene = frame.getByTestId('demo-scene')
    await expect(scene).toHaveClass(/ms-waiting/)
    await scene.hover()
    await expect(scene).toHaveClass(/ms-waiting/)
    await expect(scene).not.toHaveClass(/ms-motion-ok/)

    await scene.focus()
    await expect(scene).toHaveClass(/ms-waiting/)
    await expect(scene).not.toHaveClass(/ms-motion-ok/)

    // Pointer activation while the scene holds focus (WebKit historically
    // suppressed click after focus; controller also listens for pointerup).
    await frame.getByTestId('demo-replay').click()
    await expect(scene).toHaveClass(/ms-motion-ok/)
    await expect(scene).not.toHaveClass(/ms-waiting/)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect
      .poll(async () => scene.getAttribute('class'))
      .not.toContain('ms-motion-ok')

    // Keyboard path stays independent of pointer.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(scene).toHaveClass(/ms-waiting/)
    await scene.focus()
    await frame.getByTestId('demo-replay').press('Enter')
    await expect(scene).toHaveClass(/ms-motion-ok/)

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
