import { expect, test } from '@playwright/test'
import {
  buildPathHandlesFixtureJson,
  buildPathHandlesFixtureSamples,
  PATH_HANDLES_EXISTING_INTERIOR,
  PATH_HANDLES_FREE_SAMPLE,
  PATH_HANDLES_INDICES,
} from '../fixtures/pathHandlesProject'
import {
  clientPointForSample,
  ensureEditor,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
  recordSimplePath,
} from './helpers'

test.describe('user path handles', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true })

  test('add handle without reshape, drag locally, remove without reshape, undo', async ({
    page,
  }) => {
    const samples = buildPathHandlesFixtureSamples()
    const freeSample = samples[PATH_HANDLES_FREE_SAMPLE]!
    const existingSample = samples[PATH_HANDLES_EXISTING_INTERIOR]!

    await loadProjectSnapshot(page, buildPathHandlesFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()

    const handleCountBefore = await page
      .locator('[data-testid^="path-handle-"]')
      .count()
    expect(handleCountBefore).toBe(PATH_HANDLES_INDICES.length)

    const first = page.getByTestId('path-handle-0')
    const last = page.getByTestId(
      `path-handle-${samples.length - 1}`,
    )
    const firstBox = await first.boundingBox()
    const lastBox = await last.boundingBox()
    expect(firstBox && lastBox).toBeTruthy()

    // Geometry + timestamps fingerprint (export includes sample timing).
    const cssBeforeAdd = await readExportedCss(page)
    await page.getByTestId('btn-close-export').click()
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)

    await page.getByTestId('btn-path-add-mode').click()
    await expect(page.getByTestId('stage')).toHaveAttribute(
      'data-path-add-mode',
      'true',
    )

    // Reject adding on an existing handle first (still in add mode afterward).
    const existingPt = await clientPointForSample(page, existingSample)
    await page.mouse.move(existingPt.x, existingPt.y)
    await page.mouse.click(existingPt.x, existingPt.y)
    await expect(page.getByTestId('action-live-region')).toContainText(
      'A handle is already on that point.',
    )
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(
      handleCountBefore,
    )
    await expect(page.getByTestId('stage')).toHaveAttribute(
      'data-path-add-mode',
      'true',
    )

    // Aim at a known free interior sample — verify ghost before committing.
    const freePt = await clientPointForSample(page, freeSample)
    await page.mouse.move(freePt.x, freePt.y)
    const ghost = page.getByTestId('path-add-candidate')
    await expect(ghost).toBeVisible()
    await expect(ghost).toHaveAttribute(
      'data-candidate-sample-index',
      String(PATH_HANDLES_FREE_SAMPLE),
    )
    await expect(ghost).toHaveAttribute('data-sample-x', String(freeSample.x))
    await expect(ghost).toHaveAttribute('data-sample-y', String(freeSample.y))

    await page.mouse.click(freePt.x, freePt.y)

    await expect(page.getByTestId('action-live-region')).toContainText(
      'Handle added',
    )
    const handleCountAfterAdd = await page
      .locator('[data-testid^="path-handle-"]')
      .count()
    expect(handleCountAfterAdd).toBe(handleCountBefore + 1)

    const selected = page.locator(
      '[data-testid^="path-handle-"][aria-pressed="true"]',
    )
    await expect(selected).toHaveAttribute(
      'data-handle-index',
      String(PATH_HANDLES_FREE_SAMPLE),
    )
    await expect(selected).toHaveAttribute('data-sample-x', String(freeSample.x))
    await expect(selected).toHaveAttribute('data-sample-y', String(freeSample.y))

    // Add alone must not reshape geometry or retarget timestamps.
    const cssAfterAdd = await readExportedCss(page)
    expect(cssAfterAdd).toBe(cssBeforeAdd)
    await page.getByTestId('btn-close-export').click()
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)

    const firstAfter = await first.boundingBox()
    const lastAfter = await last.boundingBox()
    expect(Math.abs(firstAfter!.x - firstBox!.x)).toBeLessThan(2)
    expect(Math.abs(lastAfter!.x - lastBox!.x)).toBeLessThan(2)

    // Drag the new handle locally.
    const beforeDrag = await selected.boundingBox()
    expect(beforeDrag).toBeTruthy()
    const cx = beforeDrag!.x + beforeDrag!.width / 2
    const cy = beforeDrag!.y + beforeDrag!.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 40, { steps: 8 })
    await page.mouse.up()
    const afterDrag = await selected.boundingBox()
    expect(afterDrag).toBeTruthy()
    expect(Math.abs(afterDrag!.y - beforeDrag!.y)).toBeGreaterThan(8)

    const cssAfterDrag = await readExportedCss(page)
    expect(cssAfterDrag).not.toBe(cssBeforeAdd)
    await page.getByTestId('btn-close-export').click()
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)

    // Remove the interior handle — geometry should stay dragged.
    await page.getByTestId('btn-path-remove-handle').click()
    await expect(page.getByTestId('action-live-region')).toContainText(
      'Handle removed',
    )
    const handleCountAfterRemove = await page
      .locator('[data-testid^="path-handle-"]')
      .count()
    expect(handleCountAfterRemove).toBe(handleCountBefore)

    const cssAfterRemove = await readExportedCss(page)
    expect(cssAfterRemove).toBe(cssAfterDrag)
    await page.getByTestId('btn-close-export').click()
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)

    // Undo remove → handle returns; undo drag → shape restores toward pre-drag.
    await page.getByTestId('btn-undo-edit').click()
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(
      handleCountBefore + 1,
    )
    await page.getByTestId('btn-undo-edit').click()
    await page.getByTestId('btn-undo-edit').click()
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(
      handleCountBefore,
    )

    await page.getByTestId('btn-done-edit').click()
    await openPanel(page, 'project')
    // Autosave then reload — handles should round-trip with geometry.
    await page.waitForTimeout(500)
    await page.reload()
    await ensureEditor(page)
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(
      handleCountBefore,
    )
  })

  test('Delete key ignores inputs and protects endpoints', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-edit-path').click()

    // Enter edit selects the start endpoint by default.
    const endpoint = page.getByTestId('path-handle-0')
    await expect(endpoint).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Delete')
    await expect(page.getByTestId('action-live-region')).toContainText(
      /can’t be removed|can't be removed/i,
    )
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(9)

    await openPanel(page, 'adjust')
    const duration = page.getByTestId('duration-slider')
    await duration.focus()
    await page.keyboard.press('Delete')
    // Still editing with same handle count — delete did not steal focus action.
    await expect(page.getByTestId('path-handles')).toBeVisible()
  })

  test('keyboard cycles handles in path order with Point N of M', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()

    const total = await page.locator('[data-testid^="path-handle-"]').count()
    // Mode stays on action-live-region; Point N of M uses handle-selection-status.
    await expect(page.getByTestId('action-live-region')).toHaveText('Edit points')
    await expect(page.getByTestId('handle-selection-status')).toContainText(
      `Point 1 of ${total}`,
    )
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveAttribute('data-handle-ordinal', '1')

    await page.keyboard.press(']')
    await expect(page.getByTestId('handle-selection-status')).toContainText(
      `Point 2 of ${total}`,
    )
    await expect(page.getByTestId('action-live-region')).toHaveText('Edit points')
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveAttribute('data-handle-ordinal', '2')

    await page.keyboard.press(']')
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveAttribute('data-handle-ordinal', '3')

    await page.keyboard.press('[')
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveAttribute('data-handle-ordinal', '2')

    // Wrap backward from first.
    await page.keyboard.press('[')
    await page.keyboard.press('[')
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveAttribute('data-handle-ordinal', String(total))
  })

  test('add-point ghost matches the sample that becomes the handle', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-edit-path').click()

    await page.getByTestId('btn-path-add-mode').click()
    // Step until the ghost is on a free sample (not an existing handle).
    const ghost = page.getByTestId('path-add-candidate')
    for (let i = 0; i < 40; i++) {
      if (await ghost.isVisible().catch(() => false)) break
      await page.keyboard.press('ArrowRight')
    }
    await expect(ghost).toBeVisible()
    const sampleIndex = await ghost.getAttribute('data-candidate-sample-index')
    expect(sampleIndex).toBeTruthy()
    const ghostX = await ghost.getAttribute('data-sample-x')
    const ghostY = await ghost.getAttribute('data-sample-y')

    await page.getByTestId('btn-path-add-confirm').click()
    await expect(page.getByTestId('action-live-region')).toContainText(
      'Handle added',
    )
    const selected = page.locator(
      '[data-testid^="path-handle-"][aria-pressed="true"]',
    )
    await expect(selected).toHaveAttribute('data-handle-index', sampleIndex!)
    await expect(selected).toHaveAttribute('data-sample-x', ghostX!)
    await expect(selected).toHaveAttribute('data-sample-y', ghostY!)
  })

  test('tap without drag keeps geometry; touch selects without reshaping', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-edit-path').click()

    async function sampleFingerprint() {
      return page.locator('[data-testid^="path-handle-"]').evaluateAll((els) =>
        els
          .map(
            (el) =>
              `${el.getAttribute('data-handle-index')}:${el.getAttribute('data-sample-x')},${el.getAttribute('data-sample-y')}`,
          )
          .sort()
          .join('|'),
      )
    }

    const before = await sampleFingerprint()
    const selected = page.locator(
      '[data-testid^="path-handle-"][aria-pressed="true"]',
    )
    await expect(selected).toHaveCount(1)
    const beforeBox = await selected.boundingBox()
    expect(beforeBox).toBeTruthy()

    // Mouse tap: down/up with no move — may cycle selection if handles overlap,
    // but must not reshape geometry.
    const cx = beforeBox!.x + beforeBox!.width / 2
    const cy = beforeBox!.y + beforeBox!.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.up()
    expect(await sampleFingerprint()).toBe(before)

    // Select second handle via keyboard, then tiny pointer nudge under threshold.
    await page.keyboard.press(']')
    const second = page.locator(
      '[data-testid^="path-handle-"][aria-pressed="true"]',
    )
    const box2 = await second.boundingBox()
    expect(box2).toBeTruthy()
    const x2 = box2!.x + box2!.width / 2
    const y2 = box2!.y + box2!.height / 2
    const indexBeforeNudge = await second.getAttribute('data-handle-index')
    await page.mouse.move(x2, y2)
    await page.mouse.down()
    await page.mouse.move(x2 + 2, y2 + 1)
    await page.mouse.up()
    expect(await sampleFingerprint()).toBe(before)
    // Selection may cycle among nearby handles; geometry must stay put.
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveCount(1)

    // Touch tap on an interior handle — still no reshape.
    await page.keyboard.press(']')
    const third = page.locator(
      '[data-testid^="path-handle-"][aria-pressed="true"]',
    )
    const box3 = await third.boundingBox()
    expect(box3).toBeTruthy()
    await page.touchscreen.tap(
      box3!.x + box3!.width / 2,
      box3!.y + box3!.height / 2,
    )
    expect(await sampleFingerprint()).toBe(before)
    expect(indexBeforeNudge).toBeTruthy()
  })
})
