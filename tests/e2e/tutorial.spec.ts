import { mkdirSync } from 'fs'
import { join } from 'path'
import { expect, test, type Page } from '@playwright/test'
import {
  dragActor,
  ensureEditor,
  openPanel,
  recordSimplePath,
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

async function startTutorial(page: Page) {
  await expect(page.getByTestId('btn-try-tutorial')).toBeVisible()
  await page.getByTestId('btn-try-tutorial').click()
  await expect(page.getByTestId('tutorial-coach')).toBeVisible()
  await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
    'data-tutorial-step',
    'draw',
  )
  await expect(page.getByTestId('btn-rename-project')).toHaveText(
    'Tutorial practice',
  )
}

test.describe('first-use tutorial', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('offer → draw → play → export completion without download', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await expect(page.getByTestId('btn-try-tutorial')).toBeVisible()
    await expect(page.getByTestId('btn-start-creating')).toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, '01-offer.png') })

    await startTutorial(page)
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Click Record/i,
    )
    await expect(page.getByTestId('tutorial-highlight')).toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, '02-draw-record.png') })

    // Zero-motion / cancel must not advance.
    await page.getByTestId('btn-record').click()
    await expect(page.getByTestId('dock-status')).toHaveAttribute(
      'data-mode-status',
      'armed',
    )
    await expect(page.getByTestId('tutorial-coach-body')).toContainText(
      /Drag the plane/i,
    )
    await page.getByTestId('btn-stop').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'draw',
    )

    // Missed empty-canvas drag while armed stays on draw.
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
    await page.getByTestId('btn-stop').click()

    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 40, y: -30 }, { x: 180, y: 40 })
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'play',
      { timeout: 5000 },
    )
    await page.screenshot({ path: join(SHOT_DIR, '03-play.png') })

    const fitBefore = await page.getByTestId('btn-fit-stage').boundingBox()
    await page.getByTestId('btn-play').click()
    await expect(page.getByTestId('btn-pause')).toBeVisible()
    const fitDuring = await page.getByTestId('btn-fit-stage').boundingBox()
    expect(fitBefore).toBeTruthy()
    expect(fitDuring).toBeTruthy()
    expect(Math.abs(fitDuring!.y - fitBefore!.y)).toBeLessThanOrEqual(2)
    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('btn-tutorial-next')).toBeVisible()
    await page.getByTestId('btn-tutorial-next').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'export',
    )
    await page.screenshot({ path: join(SHOT_DIR, '04-export.png') })

    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()
    // Keep prompt because a flight exists.
    await expect(page.getByTestId('tutorial-keep-confirm')).toBeVisible()
    await page.getByTestId('btn-tutorial-restore').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).not.toHaveText(
      'Tutorial practice',
    )
    const progress = await page.evaluate(
      (key) => localStorage.getItem(key),
      TUTORIAL_PROGRESS_KEY,
    )
    expect(progress).toContain('completed')
  })

  test('Skip available on each step; Start creating remembers skip', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await page.getByTestId('btn-start-creating').click()
    await expect(page.getByTestId('btn-try-tutorial')).toHaveCount(0)
    let progress = await page.evaluate(
      (key) => localStorage.getItem(key),
      TUTORIAL_PROGRESS_KEY,
    )
    expect(progress).toContain('skipped')

    await clearAppStorage(page)
    await startTutorial(page)
    await page.getByTestId('btn-tutorial-skip').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    progress = await page.evaluate(
      (key) => localStorage.getItem(key),
      TUTORIAL_PROGRESS_KEY,
    )
    expect(progress).toContain('skipped')

    await clearAppStorage(page)
    await startTutorial(page)
    await page.getByTestId('btn-record').click()
    await dragActor(page, { x: 30, y: -20 }, { x: 150, y: 30 })
    await expect(page.getByTestId('tutorial-coach')).toHaveAttribute(
      'data-tutorial-step',
      'play',
    )
    await page.getByTestId('btn-tutorial-skip').click()
    await expect(page.getByTestId('tutorial-keep-confirm')).toBeVisible()
    await page.getByTestId('btn-tutorial-restore').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
  })

  test('existing project restored; tutorial never writes over storage', async ({
    page,
  }) => {
    await clearAppStorage(page)
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

    // Restart tutorial from Help while a real project is loaded.
    await openPanel(page, 'help')
    await page.getByTestId('btn-restart-tutorial').click()
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Tutorial practice',
    )

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

  test('Help restart; keyboard reaches Skip; mobile coach stays on-screen', async ({
    page,
  }) => {
    await clearAppStorage(page)
    await page.getByTestId('btn-start-creating').click()
    await openPanel(page, 'help')
    await expect(page.getByTestId('help-recording-blurb')).toBeVisible()
    await expect(page.getByTestId('help-export-blurb')).toBeVisible()
    await page.getByTestId('btn-restart-tutorial').click()
    await expect(page.getByTestId('tutorial-coach')).toBeVisible()

    await page.getByTestId('btn-tutorial-skip').focus()
    await expect(page.getByTestId('btn-tutorial-skip')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)

    await clearAppStorage(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await startTutorial(page)
    const coach = page.getByTestId('tutorial-coach').locator('[role="dialog"]')
    const box = await coach.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.x).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 2)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 2)
    await page.screenshot({ path: join(SHOT_DIR, '05-mobile-draw.png') })
  })

  test('Keep this animation adopts the practice flight', async ({ page }) => {
    await clearAppStorage(page)
    await startTutorial(page)
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
    await expect(page.getByTestId('tutorial-keep-confirm')).toBeVisible()
    await page.getByTestId('btn-tutorial-keep').click()
    await expect(page.getByTestId('tutorial-coach')).toHaveCount(0)
    await expect(page.getByTestId('btn-rename-project')).toHaveText(
      'Tutorial practice',
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await openPanel(page, 'project')
    await expect(page.getByTestId('save-status')).toHaveText(
      'Saved in this browser',
      { timeout: 4000 },
    )
  })
})
