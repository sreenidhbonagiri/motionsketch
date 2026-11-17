import { expect, test } from '@playwright/test'
import {
  BTL_LOGO_ID,
  buildBringToLifeFixtureJson,
} from '../fixtures/bringToLifeProject'
import {
  clickBringToLife,
  ensureEditor,
  ensureRefineMotionOpen,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
  selectActorByIndex,
} from './helpers'

test.describe('bring to life', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('preview compare cancel apply undo and export stay consistent', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
    await ensureEditor(page, 'Bring to life demos')

    await clickBringToLife(page)
    await expect(page.getByTestId('bring-to-life-panel')).toBeVisible()
    await expect(page.getByTestId('bring-to-life-compare-legend')).toContainText(
      /Original/i,
    )
    await expect(page.getByTestId('bring-to-life-compare-enhanced')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByTestId('bring-to-life-compare-original').click()
    await expect(
      page.getByTestId('bring-to-life-compare-original'),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('bring-to-life-compare-enhanced').click()

    await page.getByTestId('btn-bring-to-life-cancel').click()
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)

    await clickBringToLife(page)
    await expect(page.getByTestId('bring-to-life-replace-notice')).toContainText(
      /replaces Easing, Glide, and Steady Speed/i,
    )
    await expect(page.getByTestId('btn-bring-to-life-apply')).toBeEnabled()
    await page.getByTestId('btn-bring-to-life-apply').click()
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)

    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()
    await page.getByTestId('btn-undo-transform').click()
    await expect(page.getByTestId('btn-redo-transform')).toBeEnabled()
    await page.getByTestId('btn-redo-transform').click()

    const css = await readExportedCss(page)
    expect(css).toContain('@keyframes')
  })

  test('Escape cancels without applying', async ({ page }) => {
    await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
    await ensureEditor(page, 'Bring to life demos')
    await clickBringToLife(page)
    await expect(page.getByTestId('bring-to-life-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)
  })

  test('save and open keeps enhanced motion', async ({ page }) => {
    await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
    await ensureEditor(page, 'Bring to life demos')
    await clickBringToLife(page)
    await page.getByTestId('btn-bring-to-life-apply').click()
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)

    await openPanel(page, 'project')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).toBeTruthy()

    const fs = await import('node:fs')
    const raw = fs.readFileSync(path!, 'utf8')
    expect(raw).toContain(BTL_LOGO_ID)
    expect(raw).toMatch(/"glide"\s*:\s*0\.42/)
    expect(raw).toMatch(/"steadySpeed"\s*:\s*0\.28/)
    expect(raw).toMatch(/"easing"\s*:\s*"easeOut"/)

    await loadProjectSnapshot(page, raw)
    await ensureEditor(page)
    await ensureRefineMotionOpen(page)
    await expect(page.getByTestId('btn-bring-to-life')).toBeEnabled()
    await expect(page.getByTestId('bring-to-life-tool-desc')).toContainText(
      /Already applied/i,
    )
    await clickBringToLife(page)
    await expect(page.getByTestId('btn-bring-to-life-apply')).toBeDisabled()
    await expect(page.getByTestId('bring-to-life-status')).toContainText(
      /Already applied/i,
    )
    await page.getByTestId('btn-bring-to-life-cancel').click()
  })

  test('reopen after Apply does not compound; Apply stays disabled', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
    await ensureEditor(page, 'Bring to life demos')
    await clickBringToLife(page)
    await page.getByTestId('btn-bring-to-life-apply').click()
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)

    await clickBringToLife(page)
    await expect(page.getByTestId('bring-to-life-panel')).toBeVisible()
    await expect(page.getByTestId('btn-bring-to-life-apply')).toBeDisabled()
    await expect(page.getByTestId('bring-to-life-status')).toContainText(
      /Already applied/i,
    )
    await page.getByTestId('btn-bring-to-life-cancel').click()
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)
  })

  test('phone layout keeps Apply and Cancel reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
    await ensureEditor(page, 'Bring to life demos')
    await clickBringToLife(page)
    const panel = page.getByTestId('bring-to-life-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('btn-bring-to-life-apply')).toBeVisible()
    await expect(page.getByTestId('btn-bring-to-life-cancel')).toBeVisible()
    const box = await panel.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1)
  })

  test('actor isolation: other takes stay selectable', async ({ page }) => {
    await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
    await ensureEditor(page, 'Bring to life demos')
    await clickBringToLife(page)
    await page.getByTestId('btn-bring-to-life-apply').click()
    await selectActorByIndex(page, 1)
    await ensureRefineMotionOpen(page)
    await expect(page.getByTestId('btn-bring-to-life')).toBeEnabled()
    await page.getByTestId('btn-bring-to-life').click()
    await expect(page.getByTestId('bring-to-life-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)
  })
})
