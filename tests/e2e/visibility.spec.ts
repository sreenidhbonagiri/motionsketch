import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { makeActor, makeProject, makeRecording } from '../unit/helpers/project'
import {
  editorVisibilityAt,
  FIREFOX_STEP_END_EXACT_BOUNDARY,
} from './animationHelpers'
import {
  applyClipSeconds,
  clickAddActor,
  ensureActorListExpanded,
  ensureEditor,
  expandExportOtherWays,
  loadHtmlDocument,
  openPanel,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

async function openClipTimeline(page: Page) {
  const options = page.getByTestId('clip-visibility-options')
  if (await options.isVisible().catch(() => false)) return
  await page.getByTestId('btn-toggle-clip-timeline').click()
  await expect(options).toBeVisible()
}

/** Pause every CSS animation on the demo actor and sample visibility at tNorm. */
async function htmlVisibilityAt(
  page: Page,
  tNorm: number,
  selector = '[data-testid="demo-actor"]',
): Promise<string> {
  return page.evaluate(
    ({ sel, t }) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) throw new Error('missing demo actor')
      if (typeof el.getAnimations !== 'function') {
        throw new Error('getAnimations unavailable')
      }
      const anims = el.getAnimations().filter((a) => {
        const name = (a as Animation & { animationName?: unknown }).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (anims.length === 0) throw new Error('missing animations')
      for (const anim of anims) {
        const dur = Number(anim.effect?.getTiming().duration ?? 0)
        if (!(dur > 0)) continue
        anim.pause()
        anim.currentTime = t * dur
      }
      void el.offsetWidth
      return getComputedStyle(el).visibility
    },
    { sel: selector, t: tNorm },
  )
}

async function editorHiddenAt(page: Page, tNorm: number): Promise<boolean> {
  await page.getByTestId('playback-scrubber').fill(String(tNorm))
  const attr = await page.getByTestId('actor').getAttribute('data-hidden')
  return attr === 'true'
}

test.describe('per-actor visibility timing', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('editor and HTML: nearby samples agree; exact step-end boundaries are engine-specific', async ({
    page,
    browserName,
  }) => {
    const clipStart = 0.2
    const clipEnd = 0.8

    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await page.getByTestId('btn-close-adjust').click()

    await openClipTimeline(page)
    // 0.4s–1.6s of a 2s timeline → 0.2–0.8 normalized.
    await applyClipSeconds(page, '0.40', '1.60')
    await page.getByTestId('clip-hide-before').check()
    await page.getByTestId('clip-hide-after').check()

    // Nearby samples (not exact keyframe times) — portable editor ↔ HTML.
    const nearby: Array<{ t: number; expectHidden: boolean }> = [
      { t: 0.199, expectHidden: true },
      { t: 0.201, expectHidden: false },
      { t: 0.5, expectHidden: false },
      { t: 0.799, expectHidden: false },
      { t: 0.801, expectHidden: true },
    ]

    for (const s of nearby) {
      expect(
        await editorHiddenAt(page, s.t),
        `editor at t=${s.t}`,
      ).toBe(s.expectHidden)
      expect(editorVisibilityAt(s.t, clipStart, clipEnd)).toBe(
        s.expectHidden ? 'hidden' : 'visible',
      )
    }

    // Exact boundaries — editor inclusive start / exclusive end.
    expect(await editorHiddenAt(page, clipStart)).toBe(false)
    expect(await editorHiddenAt(page, clipEnd)).toBe(true)

    await page.getByTestId('playback-scrubber').fill('0.1')
    await ensureActorListExpanded(page)
    await expect(page.getByTestId('actor-hidden-indicator')).toBeVisible()
    await page.getByTestId('btn-seek-clip-start').click()
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-hidden',
      'false',
    )
    await expect(page.getByTestId('actor-hidden-indicator')).toHaveCount(0)

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toContain('visibility: hidden')
    expect(html).toContain('step-end')
    expect(html).not.toContain('step-start')
    expect(html).not.toMatch(/opacity\s*:/)

    await loadHtmlDocument(page, html)

    for (const s of nearby) {
      const vis = await htmlVisibilityAt(page, s.t)
      expect(vis, `html nearby t=${s.t}`).toBe(
        s.expectHidden ? 'hidden' : 'visible',
      )
    }

    // Exact exported keyframe times — do not nudge. Firefox step-end lags one
    // sample vs editor; Chromium/WebKit match editor at the keyframe time.
    const htmlAtStart = await htmlVisibilityAt(page, clipStart)
    const htmlAtEnd = await htmlVisibilityAt(page, clipEnd)
    if (browserName === 'firefox') {
      expect(htmlAtStart, 'firefox exact start').toBe(
        FIREFOX_STEP_END_EXACT_BOUNDARY.atStart,
      )
      expect(htmlAtEnd, 'firefox exact end').toBe(
        FIREFOX_STEP_END_EXACT_BOUNDARY.atEnd,
      )
      expect(htmlAtStart).not.toBe(editorVisibilityAt(clipStart, clipStart, clipEnd))
      expect(htmlAtEnd).not.toBe(editorVisibilityAt(clipEnd, clipStart, clipEnd))
    } else {
      expect(htmlAtStart, `${browserName} exact start`).toBe('visible')
      expect(htmlAtEnd, `${browserName} exact end`).toBe('hidden')
    }

    await page.getByTestId('demo-replay').click()
    await expect.poll(async () => htmlVisibilityAt(page, 0.1)).toBe('hidden')
    expect(await htmlVisibilityAt(page, 0.201)).toBe('visible')
    expect(await htmlVisibilityAt(page, 0.801)).toBe('hidden')
  })

  test('start-at-0 / end-at-1, stationary actor, repeat and alternate', async ({
    page,
  }) => {
    const durationMs = 1000
    const actors = [
      makeActor({
        id: 'mover',
        name: 'Mover',
        recording: makeRecording(8),
        clip: {
          start: 0,
          end: 0.5,
          hideBeforeStart: true,
          hideAfterEnd: true,
        },
      }),
      makeActor({
        id: 'still',
        name: 'Still',
        recording: null,
        clip: {
          start: 0.5,
          end: 1,
          hideBeforeStart: true,
          hideAfterEnd: true,
        },
      }),
    ]

    // Non-looping + forwards fill: exact t=0 / t=1 are stable.
    const htmlOnce = buildHtmlDemoFromProject(
      makeProject({
        actors,
        playback: { durationMs, loop: false, loopMode: 'repeat' },
      }),
    )
    await loadHtmlDocument(page, htmlOnce)

    // Actor 1: visible [0, 0.5)
    expect(await htmlVisibilityAt(page, 0)).toBe('visible')
    expect(await htmlVisibilityAt(page, 0.499)).toBe('visible')
    expect(await htmlVisibilityAt(page, 0.5)).toBe('hidden')
    expect(await htmlVisibilityAt(page, 1)).toBe('hidden')

    // Actor 2 (stationary): visible [0.5, 1)
    const stillSel = '.ms-actor-2'
    expect(await htmlVisibilityAt(page, 0.499, stillSel)).toBe('hidden')
    expect(await htmlVisibilityAt(page, 0.5, stillSel)).toBe('visible')
    expect(await htmlVisibilityAt(page, 0.999, stillSel)).toBe('visible')
    expect(await htmlVisibilityAt(page, 1, stillSel)).toBe('hidden')

    await page.getByTestId('demo-replay').click()
    expect(await htmlVisibilityAt(page, 0)).toBe('visible')
    expect(await htmlVisibilityAt(page, 0.5)).toBe('hidden')
    expect(await htmlVisibilityAt(page, 1, stillSel)).toBe('hidden')

    // Repeat: sample inside cycles (avoid exact iteration seams).
    const htmlRepeat = buildHtmlDemoFromProject(
      makeProject({
        actors,
        playback: { durationMs, loop: true, loopMode: 'repeat' },
      }),
    )
    await loadHtmlDocument(page, htmlRepeat)
    expect(await htmlVisibilityAt(page, 0.25)).toBe('visible')
    expect(await htmlVisibilityAt(page, 0.99)).toBe('hidden')
    expect(await htmlVisibilityAt(page, 1.01)).toBe('visible')
    expect(await htmlVisibilityAt(page, 1.5)).toBe('hidden')

    const htmlAlt = buildHtmlDemoFromProject(
      makeProject({
        actors,
        playback: { durationMs, loop: true, loopMode: 'alternate' },
      }),
    )
    await loadHtmlDocument(page, htmlAlt)

    // Forward: t=0.25 → mover visible.
    expect(await htmlVisibilityAt(page, 0.25)).toBe('visible')
    // Alternate reverse at 1.25 → project progress 0.75 → mover hidden.
    expect(await htmlVisibilityAt(page, 1.25)).toBe('hidden')
    // Reverse mid 1.5 → progress 0.5 → hidden at end boundary.
    expect(await htmlVisibilityAt(page, 1.5)).toBe('hidden')
    // Reverse near start 1.75 → progress 0.25 → mover visible.
    expect(await htmlVisibilityAt(page, 1.75)).toBe('visible')
  })

  test('undo visibility toggles one flag at a time', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await clickAddActor(page)
    await selectActorByIndex(page, 1)
    await openClipTimeline(page)
    await applyClipSeconds(page, '0.30', '0.90')
    await page.getByTestId('clip-hide-before').check()
    await page.getByTestId('clip-hide-after').check()
    await expect(page.getByTestId('clip-hide-before')).toBeChecked()

    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('clip-hide-before')).toBeChecked()
    await expect(page.getByTestId('clip-hide-after')).not.toBeChecked()
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('clip-hide-before')).not.toBeChecked()
    await expect(page.getByTestId('clip-hide-after')).not.toBeChecked()
  })

  test('stationary second actor exports visibility', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await clickAddActor(page)
    await selectActorByIndex(page, 1)
    await openClipTimeline(page)
    await applyClipSeconds(page, '0.30', '0.90')
    await page.getByTestId('clip-hide-before').check()
    await page.getByTestId('clip-hide-after').check()

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    await page.getByTestId('btn-view-css').click()
    const cssText = await page.getByTestId('css-output').inputValue()
    expect(cssText).toMatch(/ms-[a-f0-9]{8}-vis-a2/)
    expect(cssText).toMatch(/\.ms-actor-2[\s\S]*visibility/)
    expect(cssText).toContain('step-end')
    expect(cssText).not.toContain('step-start')
  })

  test('selection stays while hidden; no silent reveal', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await page.getByTestId('btn-close-adjust').click()

    await openClipTimeline(page)
    await applyClipSeconds(page, '1.00', '2.00')
    await page.getByTestId('clip-hide-before').check()
    await expect(page.getByTestId('clip-hide-after')).not.toBeChecked()

    await page.getByTestId('playback-scrubber').fill('0.1')
    await ensureActorListExpanded(page)
    const item = page.locator('[data-testid^="actor-list-item-"]').first()
    await expect(item).toHaveAttribute('data-hidden-now', 'true')
    await item.click()
    await expect(item).toHaveAttribute('data-selected', 'true')
    await expect(page.getByTestId('actor-hidden-indicator')).toBeVisible()
    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-hidden',
      'true',
    )
  })
})
