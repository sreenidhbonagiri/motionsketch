import { mkdirSync } from 'fs'
import { join } from 'path'
import { expect, test, type Page } from '@playwright/test'
import {
  dragActor,
  ensureEditor,
  openPanel,
  recordSimplePath,
  skipTutorialIfPresent,
} from './helpers'
import { TUTORIAL_PROGRESS_KEY } from '../../src/lib/tutorial'

const SHOT_DIR = join(process.cwd(), 'tmp/tutorial-verify')
mkdirSync(SHOT_DIR, { recursive: true })

async function clearAppStorage(page: Page) {
  await page.goto('/')
  await page.evaluate((key) => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.removeItem(key)
  }, TUTORIAL_PROGRESS_KEY)
  await page.reload()
  await expect(page.getByTestId('app-shell')).toBeVisible()
}

async function awaitAutoTutorial(page: Page) {
  await expect(page.getByTestId('tutorial-coach')).toBeVisible({
    timeout: 8000,
  })
  await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
    'data-tutorial-step',
    'draw',
  )
  await expect(page.getByTestId('btn-rename-project')).toHaveText(
    'Tutorial practice',
  )
  await expect(page.getByTestId('btn-tutorial-skip')).toHaveAccessibleName(
    /Skip tutorial/i,
  )
}

/** Layout top/left from style — ignores entrance transform on the box. */
async function readCardPlacement(page: Page) {
  await page.waitForTimeout(50)
  return page.getByTestId('tutorial-coach-card').evaluate((el) => {
    const top = Number.parseFloat((el as HTMLElement).style.top || '0')
    const left = Number.parseFloat((el as HTMLElement).style.left || '0')
    return { top, left }
  })
}

test.describe('first-use tutorial', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('auto-starts for fresh visitors; draw → play → export finish', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await awaitAutoTutorial(page)
    await expect(page.getByTestId('btn-try-tutorial')).toHaveCount(0)
    await expect(page.getByTestId('btn-start-creating')).toHaveCount(0)
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Click Record.*plane/i,
    )
    // Wait for entrance opacity so verification shots show the card.
    await page.waitForTimeout(280)
    await page.screenshot({ path: join(SHOT_DIR, '01-auto-draw.png') })

    const cardBefore = await readCardPlacement(page)

    // Zero-motion / cancel must not advance.
    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Drag the plane/i,
    )
    const cardArmed = await readCardPlacement(page)
    expect(Math.abs(cardArmed.left - cardBefore.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardArmed.top - cardBefore.top)).toBeLessThanOrEqual(1)

    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'draw',
    )

    // Missed empty-canvas drag while ready stays on draw.
    await page.getByTestId('btn-record').click()
    const stage = await page.getByTestId('stage').boundingBox()
    expect(stage).toBeTruthy()
    await page.mouse.move(stage!.x + 40, stage!.y + stage!.height * 0.8)
    await page.mouse.down()
    await page.mouse.move(stage!.x + 120, stage!.y + stage!.height * 0.8 + 30, {
      steps: 8,
    })
    await page.mouse.up()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'draw',
    )
    const cardMiss = await readCardPlacement(page)
    expect(Math.abs(cardMiss.left - cardBefore.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardMiss.top - cardBefore.top)).toBeLessThanOrEqual(1)
    await page.getByTestId('btn-stop').click()

    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 40, y: -30 }, { x: 180, y: 40 })
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'play',
      { timeout: 5000 },
    )
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Play your flight.',
    )
    // Placement stays fixed across draw → play (only resize/Export may move it).
    const cardPlay = await readCardPlacement(page)
    expect(Math.abs(cardPlay.left - cardBefore.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardPlay.top - cardBefore.top)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: join(SHOT_DIR, '02-play-idle.png') })

    const fitBefore = await page.getByTestId('btn-fit-stage').boundingBox()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Watch your flight/i,
    )
    const cardWatching = await readCardPlacement(page)
    expect(Math.abs(cardWatching.left - cardBefore.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardWatching.top - cardBefore.top)).toBeLessThanOrEqual(1)
    const fitDuring = await page.getByTestId('btn-fit-stage').boundingBox()
    expect(fitBefore).toBeTruthy()
    expect(fitDuring).toBeTruthy()
    expect(Math.abs(fitDuring!.y - fitBefore!.y)).toBeLessThanOrEqual(2)
    await page.screenshot({ path: join(SHOT_DIR, '03-play-watching.png') })
    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('btn-tutorial-next')).toBeVisible()
    await page.getByTestId('btn-tutorial-next').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'export',
    )

    // Opening Export must not complete the tutorial.
    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()
    await expect(page.getByTestId('tutorial-keep-confirm')).toHaveCount(0)
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()
    await expect(page.getByTestId('btn-tutorial-finish')).toBeVisible()
    await expect(page.getByTestId('btn-tutorial-skip')).toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, '04-export-open.png') })

    // Hit-test: Finish and a primary export control must be clickable.
    const finishHit = await page.evaluate(() => {
      const finish = document.querySelector('[data-testid="btn-tutorial-finish"]')
      const download = document.querySelector(
        '[data-testid="btn-download-web-package"]',
      )
      const probe = (el: Element | null) => {
        if (!(el instanceof HTMLElement)) return { ok: false, reason: 'missing' }
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        )
        const ok =
          top instanceof Element && (top === el || el.contains(top))
        return {
          ok,
          reason: ok
            ? 'ok'
            : `blocked:${top instanceof Element ? top.getAttribute('data-testid') || top.tagName : 'null'}`,
        }
      }
      return { finish: probe(finish), download: probe(download) }
    })
    expect(finishHit.finish.ok, finishHit.finish.reason).toBe(true)
    expect(finishHit.download.ok, finishHit.download.reason).toBe(true)

    await page.getByTestId('btn-tutorial-finish').click()
    await expect(page.getByTestId('tutorial-keep-confirm')).toBeVisible()
    await page.getByTestId('btn-tutorial-start-fresh').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)
    const progress = await page.evaluate(
      (key) => localStorage.getItem(key),
      TUTORIAL_PROGRESS_KEY,
    )
    expect(progress).toContain('completed')
  })

  test('does not auto-start over a saved project; Skip remembers preference', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await skipTutorialIfPresent(page)
    await ensureEditor(page, 'My real project')
    await recordSimplePath(page)
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
      { timeout: 4000 },
    )
    await page.getByTestId('btn-close-project').click()

    const storedBefore = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1') || '',
    )
    expect(storedBefore).toContain('My real project')

    await page.reload()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'My real project',
    )

    // Restart from Help still works and never writes over storage mid-practice.
    await openPanel(page, 'help')
    await expect(page.getByTestId('help-recording-blurb')).toContainText(
      /Click Record, drag an element, then release to finish/i,
    )
    await page.getByTestId('btn-restart-tutorial').click()
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()
    const storedMid = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1') || '',
    )
    expect(storedMid).toBe(storedBefore)

    await page.getByTestId('btn-tutorial-skip').click()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'My real project',
    )
    const storedAfter = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1') || '',
    )
    expect(storedAfter).toBe(storedBefore)
  })

  test('Keep from Export preserves flight and leaves Export open', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await awaitAutoTutorial(page)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 40, y: -20 }, { x: 170, y: 50 })
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'play',
    )
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.getByTestId('btn-pause').click()
    await page.getByTestId('btn-tutorial-next').click()
    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()
    await page.getByTestId('btn-tutorial-finish').click()
    await expect(page.getByTestId('tutorial-keep-confirm')).toBeVisible()
    await page.getByTestId('btn-tutorial-keep').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('export-panel-root')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Tutorial practice',
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()
  })

  test('mobile 390×844: card clears Fit/Record; Export actions stay hittable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await clearAppStorage(page)
    await awaitAutoTutorial(page)
    await page.screenshot({ path: join(SHOT_DIR, '05-mobile-draw.png') })

    const geometry = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tutorial-coach-card"]')
      const fit = document.querySelector('[data-testid="btn-fit-stage"]')
      const record = document.querySelector('[data-testid="btn-record"]')
      const actor = document.querySelector('[data-testid="actor"]')
      if (
        !(card instanceof HTMLElement) ||
        !(fit instanceof HTMLElement) ||
        !(record instanceof HTMLElement) ||
        !(actor instanceof HTMLElement)
      ) {
        return { ok: false, reason: 'missing' }
      }
      const cr = card.getBoundingClientRect()
      const fr = fit.getBoundingClientRect()
      const rr = record.getBoundingClientRect()
      const ar = actor.getBoundingClientRect()
      const overlap = (
        a: DOMRect,
        b: DOMRect,
      ) =>
        a.left < b.right - 2 &&
        a.right > b.left + 2 &&
        a.top < b.bottom - 2 &&
        a.bottom > b.top + 2
      const hit = (el: HTMLElement) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        )
        return top instanceof Element && (top === el || el.contains(top))
      }
      if (overlap(cr, fr)) return { ok: false, reason: 'card-over-fit' }
      if (overlap(cr, rr)) return { ok: false, reason: 'card-over-record' }
      if (overlap(cr, ar)) return { ok: false, reason: 'card-over-plane' }
      if (!hit(record)) return { ok: false, reason: 'record-blocked' }
      if (!hit(fit)) return { ok: false, reason: 'fit-blocked' }
      return {
        ok: true,
        reason: 'ok',
        card: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
      }
    })
    expect(geometry, geometry.reason).toMatchObject({ ok: true, reason: 'ok' })

    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 30, y: -20 }, { x: 120, y: 40 })
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'play',
    )
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await page.getByTestId('btn-pause').click()
    await page.getByTestId('btn-tutorial-next').click()
    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const exportHits = await page.evaluate(() => {
      const finish = document.querySelector('[data-testid="btn-tutorial-finish"]')
      const skip = document.querySelector('[data-testid="btn-tutorial-skip"]')
      const close = document.querySelector('[data-testid="btn-close-export"]')
      const probe = (el: Element | null, label: string) => {
        if (!(el instanceof HTMLElement)) {
          return { ok: false, reason: `${label}-missing` }
        }
        const r = el.getBoundingClientRect()
        if (r.bottom > 844 + 1 || r.top < -1) {
          return { ok: false, reason: `${label}-offscreen` }
        }
        const top = document.elementFromPoint(
          r.left + Math.min(r.width / 2, r.width - 2),
          r.top + Math.min(r.height / 2, r.height - 2),
        )
        const ok =
          top instanceof Element && (top === el || el.contains(top))
        return {
          ok,
          reason: ok
            ? 'ok'
            : `${label}-blocked:${top instanceof Element ? top.getAttribute('data-testid') || top.tagName : 'null'}`,
        }
      }
      const f = probe(finish, 'finish')
      if (!f.ok) return f
      const s = probe(skip, 'skip')
      if (!s.ok) return s
      const c = probe(close, 'close')
      if (!c.ok) return c
      return { ok: true, reason: 'ok' }
    })
    expect(exportHits, exportHits.reason).toEqual({ ok: true, reason: 'ok' })
    await page.screenshot({ path: join(SHOT_DIR, '06-mobile-export.png') })
  })

  test('keyboard reaches Skip; reduced-motion still usable', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await clearAppStorage(page)
    await awaitAutoTutorial(page)
    await page.getByTestId('btn-tutorial-skip').focus()
    await expect(page.getByTestId('btn-tutorial-skip')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    const progress = await page.evaluate(
      (key) => localStorage.getItem(key),
      TUTORIAL_PROGRESS_KEY,
    )
    expect(progress).toContain('skipped')
  })
})
