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

    await page.getByTestId('btn-play').click()
    // Past one traversal → should be on the backward pass.
    await page.waitForTimeout(800)
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect(page.getByTestId('playback-elapsed')).toContainText('←')

    await page.getByTestId('btn-pause').click()
    const pausedHead = Number(
      await page.getByTestId('playback-scrubber').inputValue(),
    )
    expect(pausedHead).toBeGreaterThan(0.05)
    expect(pausedHead).toBeLessThan(0.95)

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.waitForTimeout(80)
    // Still moving (resume from reverse), not stuck / restarted at 0.
    const resumed = Number(
      await page.getByTestId('playback-scrubber').inputValue(),
    )
    expect(Math.abs(resumed - pausedHead)).toBeLessThan(0.25)

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
