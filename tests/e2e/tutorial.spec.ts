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
  await expect(page.getByTestId('tutorial-coach-card')).toHaveCSS(
    'opacity',
    '1',
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
    await expect(page.getByTestId('tutorial-step-label')).toHaveText('1 of 3')
    await expect(page.getByTestId('tutorial-coach-title')).toHaveText(
      'Draw your flight',
    )
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Click Record to start.',
    )
    await page.waitForTimeout(280)
    await page.screenshot({ path: join(SHOT_DIR, '01-auto-draw.png') })

    const nearRecord = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tutorial-coach-card"]')
      const record = document.querySelector('[data-testid="btn-record"]')
      if (!(card instanceof HTMLElement) || !(record instanceof HTMLElement)) {
        return { ok: false, reason: 'missing' }
      }
      const cr = card.getBoundingClientRect()
      const rr = record.getBoundingClientRect()
      const overlap =
        cr.left < rr.right - 2 &&
        cr.right > rr.left + 2 &&
        cr.top < rr.bottom - 2 &&
        cr.bottom > rr.top + 2
      const cx = cr.left + cr.width / 2
      const cy = cr.top + cr.height / 2
      const rx = rr.left + rr.width / 2
      const ry = rr.top + rr.height / 2
      const dist = Math.hypot(cx - rx, cy - ry)
      const hit = document.elementFromPoint(
        rr.left + rr.width / 2,
        rr.top + rr.height / 2,
      )
      const recordClear =
        hit instanceof Element && (hit === record || record.contains(hit))
      return {
        ok: !overlap && dist < 320 && recordClear,
        reason: overlap
          ? 'covers-record'
          : dist >= 320
            ? `far-from-record:${Math.round(dist)}`
            : !recordClear
              ? 'record-blocked'
              : 'ok',
        dist: Math.round(dist),
      }
    })
    expect(nearRecord, nearRecord.reason).toMatchObject({
      ok: true,
      reason: 'ok',
    })

    const cardBefore = await readCardPlacement(page)

    // Zero-motion / cancel must not advance; card stays near Record.
    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Drag the plane to draw a path. Release to finish.',
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
    await expect(page.getByTestId('tutorial-step-label')).toHaveText('2 of 3')
    await expect(page.getByTestId('tutorial-coach-title')).toHaveText(
      'Watch it move',
    )
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Click Play to watch your flight.',
    )
    const cardPlay = await readCardPlacement(page)
    await page.screenshot({ path: join(SHOT_DIR, '02-play-idle.png') })

    const fitBefore = await page.getByTestId('btn-fit-stage').boundingBox()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Your flight is playing.',
    )
    const cardWatching = await readCardPlacement(page)
    expect(Math.abs(cardWatching.left - cardPlay.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardWatching.top - cardPlay.top)).toBeLessThanOrEqual(1)
    const fitDuring = await page.getByTestId('btn-fit-stage').boundingBox()
    expect(fitBefore).toBeTruthy()
    expect(fitDuring).toBeTruthy()
    expect(Math.abs(fitDuring!.y - fitBefore!.y)).toBeLessThanOrEqual(2)
    await page.screenshot({ path: join(SHOT_DIR, '03-play-watching.png') })
    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Select Next to export your flight.',
    )
    await expect(page.getByTestId('btn-tutorial-next')).toBeVisible()
    const cardAfterPause = await readCardPlacement(page)
    expect(Math.abs(cardAfterPause.left - cardPlay.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardAfterPause.top - cardPlay.top)).toBeLessThanOrEqual(1)
    await page.getByTestId('btn-tutorial-next').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'export',
    )
    await expect(page.getByTestId('tutorial-step-label')).toHaveText('3 of 3')
    await expect(page.getByTestId('tutorial-coach-title')).toHaveText(
      'Use it on your website',
    )
    await expect(page.getByTestId('tutorial-coach-body')).toHaveText(
      'Open Export to see your download options.',
    )

    // Strong Export highlight: white gap + cobalt outline + halo; Export stays hittable.
    const exportHighlight = await page.evaluate(() => {
      const ring = document.querySelector('[data-testid="tutorial-highlight"]')
      const exportBtn = document.querySelector('[data-testid="btn-export"]')
      if (!(ring instanceof HTMLElement) || !(exportBtn instanceof HTMLElement)) {
        return { ok: false, reason: 'missing' }
      }
      if (ring.getAttribute('data-tutorial-highlight') !== 'export') {
        return { ok: false, reason: 'not-export-variant' }
      }
      const shadow = getComputedStyle(ring).boxShadow
      if (!shadow.includes('rgb(48, 72, 184)') && !shadow.includes('#3048b8')) {
        // Browsers serialize #3048b8 as rgb(48, 72, 184).
        if (!/48,\s*72,\s*184/.test(shadow)) {
          return { ok: false, reason: `shadow:${shadow}` }
        }
      }
      const r = exportBtn.getBoundingClientRect()
      const top = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      )
      const hittable =
        top instanceof Element &&
        (top === exportBtn || exportBtn.contains(top))
      return {
        ok: hittable,
        reason: hittable ? 'ok' : 'export-blocked',
        shadow,
      }
    })
    expect(exportHighlight, exportHighlight.reason).toMatchObject({
      ok: true,
      reason: 'ok',
    })

    // Opening Export must not complete the tutorial.
    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()
    await expect(page.getByTestId('tutorial-keep-confirm')).toHaveCount(0)
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Choose HTML or React/i,
    )
    await expect(page.getByTestId('btn-tutorial-finish')).toBeVisible()
    await expect(page.getByTestId('btn-tutorial-skip')).toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, '04-export-open.png') })

    // Hit-test: Finish and a primary export control must be clickable.
    const finishHit = await page.evaluate(() => {
      const finish = document.querySelector('[data-testid="btn-tutorial-finish"]')
      const download = document.querySelector(
        '[data-testid="btn-download-web-package"]',
      )
      const tabs = document.querySelector(
        '[data-testid="export-website-path-tabs"]',
      )
      const close = document.querySelector('[data-testid="btn-close-export"]')
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
      return {
        finish: probe(finish),
        download: probe(download),
        tabs: probe(tabs),
        close: probe(close),
      }
    })
    expect(finishHit.finish.ok, finishHit.finish.reason).toBe(true)
    expect(finishHit.download.ok, finishHit.download.reason).toBe(true)
    expect(finishHit.tabs.ok, finishHit.tabs.reason).toBe(true)
    expect(finishHit.close.ok, finishHit.close.reason).toBe(true)

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
    await expect(page.getByTestId('help-recording-blurb')).not.toContainText('—')
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

  test('Examples/New during tutorial cannot overwrite a saved project', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await skipTutorialIfPresent(page)
    await ensureEditor(page, 'Saved before tutorial')
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
    expect(storedBefore).toContain('Saved before tutorial')

    await openPanel(page, 'help')
    await page.getByTestId('btn-restart-tutorial').click()
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()

    // Examples → Orbit must be blocked while practice is active.
    await page.getByTestId('btn-examples').click()
    await expect(page.getByTestId('examples-gallery')).toBeVisible()
    await page.getByTestId('btn-use-orbit').click()
    await expect(page.getByTestId('tutorial-blocks-replace-confirm')).toBeVisible()
    await expect(page.getByTestId('tutorial-blocks-replace-copy')).toContainText(
      /Skip or finish the tutorial/i,
    )
    await page.getByTestId('btn-tutorial-blocks-replace-ok').click()
    await expect(page.getByTestId('tutorial-blocks-replace-confirm')).toHaveCount(
      0,
    )
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Tutorial practice',
    )
    await page.getByTestId('btn-close-examples').click()

    let storedMid = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1') || '',
    )
    expect(storedMid).toBe(storedBefore)
    expect(storedMid).not.toContain('"name": "Orbit"')

    // Reload before Skip — original must still restore.
    await page.reload()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Saved before tutorial',
    )
    storedMid = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1') || '',
    )
    expect(storedMid).toBe(storedBefore)

    // Restart again; New project blocked; Skip restores; reload keeps original.
    await openPanel(page, 'help')
    await page.getByTestId('btn-restart-tutorial').click()
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()
    await openPanel(page, 'project')
    await page.getByTestId('btn-new-project').click()
    await expect(page.getByTestId('tutorial-blocks-replace-confirm')).toBeVisible()
    await page.getByTestId('btn-tutorial-blocks-replace-back').click()
    await expect(page.getByTestId('new-project-confirm')).toHaveCount(0)
    const storedAfterBlock = await page.evaluate(
      () => localStorage.getItem('motionsketch.project.v1') || '',
    )
    expect(storedAfterBlock).toBe(storedBefore)

    await page.getByTestId('btn-close-project').click()
    await page.getByTestId('btn-tutorial-skip').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Saved before tutorial',
    )
    await page.reload()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Saved before tutorial',
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
    await page.waitForTimeout(280)
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
      const overlap = (a: DOMRect, b: DOMRect) =>
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
      if (cr.top < -1 || cr.bottom > 844 + 1 || cr.left < -1 || cr.right > 390 + 1) {
        return { ok: false, reason: 'card-offscreen' }
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

    const cardDraw = await readCardPlacement(page)
    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Drag the plane/i,
    )
    const cardArmed = await readCardPlacement(page)
    expect(Math.abs(cardArmed.left - cardDraw.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardArmed.top - cardDraw.top)).toBeLessThanOrEqual(1)

    await dragActor(page, { x: 30, y: -20 }, { x: 120, y: 40 })
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'play',
    )
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    const cardPlay = await readCardPlacement(page)
    await page.getByTestId('btn-pause').click()
    const cardPaused = await readCardPlacement(page)
    expect(Math.abs(cardPaused.left - cardPlay.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cardPaused.top - cardPlay.top)).toBeLessThanOrEqual(1)
    await page.getByTestId('btn-tutorial-next').click()
    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const exportHits = await page.evaluate(() => {
      const finish = document.querySelector('[data-testid="btn-tutorial-finish"]')
      const skip = document.querySelector('[data-testid="btn-tutorial-skip"]')
      const close = document.querySelector('[data-testid="btn-close-export"]')
      const download = document.querySelector(
        '[data-testid="btn-download-web-package"]',
      )
      const tabs = document.querySelector(
        '[data-testid="export-website-path-tabs"]',
      )
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
      for (const [el, label] of [
        [finish, 'finish'],
        [skip, 'skip'],
        [close, 'close'],
        [download, 'download'],
        [tabs, 'tabs'],
      ] as const) {
        const p = probe(el, label)
        if (!p.ok) return p
      }
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
