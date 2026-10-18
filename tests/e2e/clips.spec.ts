import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  actorIdsFromList,
  clickRecord,
  dragActor,
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

  test('overlapping / late / early clips, scrub, reverse, duration, export', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await page.getByTestId('actor-name-input').fill('Lead')
    await page.getByTestId('actor-name-input').press('Enter')

    await page.getByTestId('btn-add-actor').click()
    await page.getByTestId('actor-name-input').fill('Late')
    await page.getByTestId('actor-name-input').press('Enter')
    await clickRecord(page)
    await dragActor(page, { x: -20, y: 30 }, { x: -120, y: -40 })

    await page.getByTestId('btn-add-actor').click()
    await page.getByTestId('actor-name-input').fill('Early')
    await page.getByTestId('actor-name-input').press('Enter')
    await clickRecord(page)
    await dragActor(page, { x: 15, y: -25 }, { x: 90, y: 60 })

    const ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(3)

    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')
    await page.getByTestId('btn-close-adjust').click()

    await ensureClipTimelineOpen(page)
    await expect(page.getByTestId('clip-timeline-help')).toContainText(
      'not visibility',
    )

    await selectActorByIndex(page, 1)
    await page.getByTestId('clip-start-input').fill('1.00')
    await page.getByTestId('clip-end-input').fill('2.00')
    await page.getByTestId('clip-end-input').blur()

    await selectActorByIndex(page, 2)
    await page.getByTestId('clip-start-input').fill('0.00')
    await page.getByTestId('clip-end-input').fill('1.00')
    await page.getByTestId('clip-end-input').blur()

    const lateId = ids[1]
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

    const earlyId = ids[2]
    await page.getByTestId('playback-scrubber').fill('0.5')
    const earlyMid = await actorBox(page, earlyId)
    await page.getByTestId('playback-scrubber').fill('0.9')
    const earlyLate = await actorBox(page, earlyId)
    expect(earlyMid).toBeTruthy()
    expect(earlyLate).toBeTruthy()
    expect(Math.abs(earlyLate!.x - earlyMid!.x)).toBeLessThan(2)
    expect(Math.abs(earlyLate!.y - earlyMid!.y)).toBeLessThan(2)

    await selectActorByIndex(page, 1)
    await page.getByTestId('playback-scrubber').fill('0.75')
    await collapseClipTimeline(page)
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('90')
    await page.getByTestId('btn-set-transform-keyframe').click({ force: true })
    const markerLeft = await page
      .locator('[data-transform-marker]')
      .last()
      .evaluate((el) => (el as HTMLElement).style.left)
    expect(markerLeft).toBe('75%')

    await ensureClipTimelineOpen(page)
    await selectActorByIndex(page, 2)
    await page.getByTestId('clip-end-input').fill('1.50')
    await page.getByTestId('clip-end-input').blur()
    await collapseClipTimeline(page)
    await page.getByTestId('btn-undo-transform').click()
    await ensureClipTimelineOpen(page)
    await expect(page.getByTestId('clip-end-input')).toHaveValue('1.00')
    await collapseClipTimeline(page)

    await openPanel(page, 'adjust')
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('loop-mode-alternate').check()
    await page.getByTestId('btn-close-adjust').click()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.waitForTimeout(400)
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
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('demo-stage')).toBeVisible()
    await expect(page.locator('.actor-1')).toBeVisible()
    await expect(page.locator('.actor-2')).toBeVisible()
    await expect(page.locator('.actor-3')).toBeVisible()
  })

  test('clip row selection does not arm recording', async ({ page }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    await ensureClipTimelineOpen(page)
    const ids = await actorIdsFromList(page)
    await page.getByTestId(`clip-row-${ids[0]}`).click()
    await expect(page.getByTestId('btn-record')).toBeVisible()
    await expect(page.getByTestId('btn-stop')).toHaveCount(0)
  })
})
