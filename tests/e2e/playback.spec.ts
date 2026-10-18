import { expect, test } from '@playwright/test'
import { openPanel, readExportedCss, recordSimplePath } from './helpers'

test.describe('playback inspection', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('pause/resume keeps continuity; scrub seeks; restart returns to start', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await expect(page.getByTestId('playback-timeline')).toBeVisible()
    await expect(page.getByTestId('playback-total')).toHaveText('2.00 s')

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.waitForTimeout(350)
    await page.getByTestId('btn-pause').click()

    const pausedHead = Number(
      await page.getByTestId('playback-scrubber').inputValue(),
    )
    expect(pausedHead).toBeGreaterThan(0.05)
    expect(pausedHead).toBeLessThan(0.95)

    const actor = page.getByTestId('actor')
    const pausedBox = await actor.boundingBox()
    expect(pausedBox).toBeTruthy()

    // Resume from the same head — button flips back to Pause without jumping to 0.
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    const resumedHead = Number(
      await page.getByTestId('playback-scrubber').inputValue(),
    )
    expect(Math.abs(resumedHead - pausedHead)).toBeLessThan(0.12)
    await page.getByTestId('btn-pause').click()

    await page.getByTestId('playback-scrubber').fill('0.5')
    await expect(page.getByTestId('btn-play')).toBeVisible()
    await expect(page.getByTestId('playback-elapsed')).toHaveText('1.00 s')
    const midBox = await actor.boundingBox()
    expect(midBox).toBeTruthy()
    expect(
      Math.abs(midBox!.x - pausedBox!.x) > 1 ||
        Math.abs(midBox!.y - pausedBox!.y) > 1,
    ).toBeTruthy()

    await page.getByTestId('btn-restart').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect
      .poll(async () =>
        Number(await page.getByTestId('playback-scrubber').inputValue()),
      )
      .toBeLessThan(0.15)
  })

  test('at end of non-looping playback, Play starts from the beginning', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('400')
    await page.getByTestId('btn-play').click()
    await expect
      .poll(
        async () =>
          Number(await page.getByTestId('playback-scrubber').inputValue()),
        { timeout: 3000 },
      )
      .toBeGreaterThan(0.98)
    await expect(page.getByTestId('btn-play')).toBeVisible()

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect
      .poll(async () =>
        Number(await page.getByTestId('playback-scrubber').inputValue()),
      )
      .toBeLessThan(0.5)
  })

  test('looping playback continues past the end without stopping', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('400')
    await page.getByTestId('loop-toggle').check()
    await expect(page.getByTestId('loop-mode-repeat')).toBeChecked()
    await page.getByTestId('btn-play').click()
    await page.waitForTimeout(700)
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    const head = Number(await page.getByTestId('playback-scrubber').inputValue())
    expect(head).toBeGreaterThanOrEqual(0)
    expect(head).toBeLessThan(1)
  })

  test('back-and-forth reverses, supports pause/resume, and exports alternate', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('600')
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('loop-mode-alternate').check()
    await expect(page.getByTestId('loop-mode-alternate')).toBeChecked()

    // Transform track so pause/resume also holds rotation/scale.
    await openPanel(page, 'appearance')
    await page.getByTestId('playback-scrubber').fill('0')
    await page.getByTestId('transform-rotation-input').fill('0')
    await page.getByTestId('transform-scale-slider').fill('1')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await page.getByTestId('playback-scrubber').fill('1')
    await page.getByTestId('transform-rotation-input').fill('360')
    await page.getByTestId('transform-scale-slider').fill('2')
    await page.getByTestId('btn-set-transform-keyframe').click()
    // Return to start so the clock run measures from t=0 forward→reverse.
    await page.getByTestId('playback-scrubber').fill('0')

    // Deterministic clock: wall-clock waits were racy under load (a delayed
    // RAF after resume could advance ~200ms+ and fail a 0.25 head delta).
    // pauseAt must be strictly after install time (install can tick past `time`).
    await page.clock.install({ time: new Date('2030-01-15T12:00:00.000Z') })
    await page.clock.pauseAt(new Date('2030-01-15T12:00:01.000Z'))

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    // One-way duration 600ms → at 800ms we are on the backward pass (~t=0.667).
    await page.clock.runFor(800)
    await expect(page.getByTestId('playback-elapsed')).toContainText('←')

    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('btn-play')).toBeVisible()

    const paused = await page.evaluate(() => {
      const head = Number(
        (document.querySelector(
          '[data-testid="playback-scrubber"]',
        ) as HTMLInputElement).value,
      )
      const actor = document.querySelector('[data-testid="actor"]') as HTMLElement
      const style = getComputedStyle(actor)
      return {
        head,
        transform: style.transform,
        left: actor.style.left,
        top: actor.style.top,
      }
    })
    expect(paused.head).toBeGreaterThan(0.5)
    expect(paused.head).toBeLessThan(0.85)
    expect(paused.transform).not.toBe('none')

    // Hold while paused (clock can advance; playback must not).
    await page.clock.runFor(200)
    const held = await page.evaluate(() => {
      const head = Number(
        (document.querySelector(
          '[data-testid="playback-scrubber"]',
        ) as HTMLInputElement).value,
      )
      const actor = document.querySelector('[data-testid="actor"]') as HTMLElement
      return { head, transform: getComputedStyle(actor).transform }
    })
    expect(held.head).toBeCloseTo(paused.head, 3)
    expect(held.transform).toBe(paused.transform)

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    // Continue backward ~100ms → head decreases by ~0.167, no jump/restart.
    await page.clock.runFor(100)
    await expect(page.getByTestId('playback-elapsed')).toContainText('←')

    const resumed = await page.evaluate(() => {
      const head = Number(
        (document.querySelector(
          '[data-testid="playback-scrubber"]',
        ) as HTMLInputElement).value,
      )
      const actor = document.querySelector('[data-testid="actor"]') as HTMLElement
      return {
        head,
        transform: getComputedStyle(actor).transform,
        left: actor.style.left,
        top: actor.style.top,
      }
    })
    expect(resumed.head).toBeLessThan(paused.head)
    expect(paused.head - resumed.head).toBeGreaterThan(0.08)
    expect(paused.head - resumed.head).toBeLessThan(0.22)
    // Still reverse-progressing along the same path (no teleport to start).
    expect(resumed.head).toBeGreaterThan(0.3)
    // Transform continues along the track (not frozen at pause, not reset).
    expect(resumed.transform).not.toBe(paused.transform)

    await page.getByTestId('btn-pause').click()
    const css = await readExportedCss(page)
    expect(css).toContain('linear infinite alternate')
    expect(css).toContain('full cycle is 2×')
  })

  test('playback controls disable during recording and hide while editing', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)

    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('btn-play')).toBeDisabled()
    await expect(page.getByTestId('btn-restart')).toBeDisabled()
    await expect(page.getByTestId('playback-scrubber')).toBeDisabled()
    await page.getByTestId('btn-stop').click()

    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('btn-play')).toHaveCount(0)
    await expect(page.getByTestId('playback-timeline')).toHaveCount(0)
    await page.getByTestId('btn-done-edit').click()
    await expect(page.getByTestId('playback-timeline')).toBeVisible()
  })
})
