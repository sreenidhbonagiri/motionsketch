import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { buildClipsTimingFixtureJson } from '../fixtures/clipsTimingProject'
import {
  applyClipSeconds,
  ensureEditor,
  actorIdsFromList,
  loadHtmlDocument,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

async function ensureClipTimelineOpen(
  page: import('@playwright/test').Page,
) {
  const toggle = page.getByTestId('btn-toggle-clip-timeline')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(page.getByTestId('clip-timeline-rows')).toBeVisible()
}

async function collapseClipTimeline(page: import('@playwright/test').Page) {
  const toggle = page.getByTestId('btn-toggle-clip-timeline')
  if ((await toggle.getAttribute('aria-expanded')) === 'true') {
    await toggle.click()
  }
}

async function actorBox(
  page: import('@playwright/test').Page,
  actorId: string,
) {
  const selected =
    (await page
      .getByTestId(`actor-list-item-${actorId}`)
      .getAttribute('data-selected')) === 'true'
  const testId = selected ? 'actor' : `actor-${actorId}`
  return page.getByTestId(testId).boundingBox()
}

test.describe('per-actor clip timing', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('late clip holds before start; early clip holds after end', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await expect(page.getByTestId('btn-rename-project')).toContainText(
      'Clips timing fixture',
    )

    const ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(3)
    const lateId = ids[1]
    const earlyId = ids[2]

    await collapseClipTimeline(page)
    await page.getByTestId('playback-scrubber').fill('0.2')
    const lateAt02 = await actorBox(page, lateId)
    await page.getByTestId('playback-scrubber').fill('0.45')
    const lateAt045 = await actorBox(page, lateId)
    expect(lateAt02).toBeTruthy()
    expect(lateAt045).toBeTruthy()
    expect(Math.abs(lateAt045!.x - lateAt02!.x)).toBeLessThan(2)
    expect(Math.abs(lateAt045!.y - lateAt02!.y)).toBeLessThan(2)

    await page.getByTestId('playback-scrubber').fill('0.75')
    const lateAt075 = await actorBox(page, lateId)
    expect(lateAt075).toBeTruthy()
    expect(
      Math.abs(lateAt075!.x - lateAt045!.x) > 2 ||
        Math.abs(lateAt075!.y - lateAt045!.y) > 2,
    ).toBeTruthy()

    await page.getByTestId('playback-scrubber').fill('0.5')
    const earlyMid = await actorBox(page, earlyId)
    await page.getByTestId('playback-scrubber').fill('0.9')
    const earlyLate = await actorBox(page, earlyId)
    expect(earlyMid).toBeTruthy()
    expect(earlyLate).toBeTruthy()
    expect(Math.abs(earlyLate!.x - earlyMid!.x)).toBeLessThan(2)
    expect(Math.abs(earlyLate!.y - earlyMid!.y)).toBeLessThan(2)
  })

  test('Move for edit then undo restores prior duration', async ({ page }) => {
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureClipTimelineOpen(page)
    await selectActorByIndex(page, 2)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('1.00')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.00')
    // Second actor (Late) begins at 1.00s for 1.00s.
    await selectActorByIndex(page, 1)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('1.00')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('1.00')
    await selectActorByIndex(page, 2)
    await applyClipSeconds(page, '0.00', '1.50')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('1.50')
    await expect(page.getByTestId('clip-ends-at')).toContainText('1.50')
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('1.00')
  })

  test('three overlapping actors stay readable; first-use hint dismisses', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await ensureClipTimelineOpen(page)
    await expect(page.getByTestId('sequence-first-use-hint')).toBeVisible()
    await page.getByTestId('btn-dismiss-sequence-hint').click()
    await expect(page.getByTestId('sequence-first-use-hint')).toHaveCount(0)
    await expect(page.getByTestId('sequence-ruler')).toBeVisible()
    const ids = await actorIdsFromList(page)
    for (const id of ids) {
      await expect(page.getByTestId(`clip-row-${id}`)).toBeVisible()
      await expect(page.getByTestId(`clip-bar-${id}`)).toBeVisible()
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('clip-timeline')).toBeVisible()
    await expect(page.getByTestId('btn-play')).toBeVisible()
  })

  test('transform marker uses project scrub time with a late clip', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildClipsTimingFixtureJson())
    await selectActorByIndex(page, 1)
    await page.getByTestId('playback-scrubber').fill('0.75')
    await collapseClipTimeline(page)
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('90')
    await page.getByTestId('btn-set-transform-keyframe').click()
    const markerLeft = await page
      .locator('[data-transform-marker]')
      .last()
      .evaluate((el) => (el as HTMLElement).style.left)
    expect(markerLeft).toBe('75%')
  })

  test('alternate loop exports CSS and offline HTML for all actors', async ({
    page,
  }) => {
    await loadProjectSnapshot(
      page,
      buildClipsTimingFixtureJson('2026-01-01T00:00:00.000Z', {
        loop: true,
        loopMode: 'alternate',
      }),
    )

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('loop-toggle')).toBeChecked()
    await expect(page.getByTestId('loop-mode-alternate')).toBeChecked()
    await page.getByTestId('btn-close-adjust').click()

    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.getByTestId('btn-pause').click()

    const css = await readExportedCss(page)
    expect(css).toContain('50%')
    expect(css).toContain('100%')
    expect(css).toContain('infinite alternate')
    expect(css).toMatch(/Clip /)

    await openPanel(page, 'export')
    const dl = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const path = await (await dl).path()
    const html = readFileSync(path!, 'utf8')
    expect(html).toContain('actor-1')
    expect(html).toContain('actor-3')
    expect(html.replace(/data:image\/[^"']+/g, '')).not.toMatch(/https?:\/\//i)
    await loadHtmlDocument(page, html)
    await expect(page.getByTestId('demo-stage')).toBeVisible()
    await expect(page.locator('.ms-actor-1')).toBeVisible()
    await expect(page.locator('.ms-actor-2')).toBeVisible()
    await expect(page.locator('.ms-actor-3')).toBeVisible()
  })

  test('clip row selection does not arm recording', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    await ensureClipTimelineOpen(page)
    const ids = await actorIdsFromList(page)
    await page.getByTestId(`clip-row-${ids[0]}`).click()
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.getByTestId('btn-stop')).toHaveCount(0)
  })
})
