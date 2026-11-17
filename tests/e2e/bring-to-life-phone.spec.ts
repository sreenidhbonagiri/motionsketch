import { expect, test, type Page } from '@playwright/test'
import { buildBringToLifeFixtureJson } from '../fixtures/bringToLifeProject'
import {
  clickBringToLife,
  ensureEditor,
  loadProjectSnapshot,
} from './helpers'

/** True when the element's border box is inside the page viewport. */
function boxInsideViewport(
  box: { x: number; y: number; width: number; height: number },
  height: number,
  width: number,
) {
  return (
    box.x >= -0.5 &&
    box.y >= -0.5 &&
    box.x + box.width <= width + 1 &&
    box.y + box.height <= height + 1
  )
}

/**
 * Short/phone preview must keep Original/Enhanced, Apply/Cancel, and Play
 * reachable together without Inspector splitting away the stage.
 */
async function assertPreviewControlsReachable(
  page: Page,
  width: number,
  height: number,
) {
  const panel = page.getByTestId('bring-to-life-panel')
  await expect(panel).toBeVisible()

  const workspace = page.getByTestId('editor-workspace')
  await expect(workspace).not.toHaveAttribute('data-inspector-split', 'true')
  await expect(page.getByTestId('inspector-slot')).toHaveCount(0)

  const stage = page.getByTestId('stage-viewport')
  const stageBox = await stage.boundingBox()
  expect(stageBox).toBeTruthy()
  expect(stageBox!.height).toBeGreaterThan(120)

  const toolbar = page.getByTestId('toolbar-slot')
  const toolbarBox = await toolbar.boundingBox()
  expect(toolbarBox).toBeTruthy()
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(height + 1)

  const apply = page.getByTestId('btn-bring-to-life-apply')
  const cancel = page.getByTestId('btn-bring-to-life-cancel')
  const compare = page.getByTestId('bring-to-life-compare-enhanced')
  const play = page.getByTestId('btn-play')
  const pause = page.getByTestId('btn-pause')
  // Preview autoplays when there is something to enhance — either control is fine.
  const playback = pause.or(play)

  for (const loc of [apply, cancel, compare, playback]) {
    await expect(loc).toBeVisible()
    const box = await loc.boundingBox()
    expect(box).toBeTruthy()
    expect(
      boxInsideViewport(box!, height, width),
      `control ${await loc.getAttribute('data-testid')} must stay in the ${width}x${height} viewport`,
    ).toBe(true)
  }

  // Clipping container: Play/Pause must sit inside the toolbar slot box.
  const playbackBox = await playback.boundingBox()
  expect(playbackBox).toBeTruthy()
  expect(playbackBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y - 0.5)
  expect(playbackBox!.y + playbackBox!.height).toBeLessThanOrEqual(
    toolbarBox!.y + toolbarBox!.height + 1,
  )

  // Normal clicks — no force.
  await page.getByTestId('bring-to-life-compare-original').click()
  await expect(
    page.getByTestId('bring-to-life-compare-original'),
  ).toHaveAttribute('aria-pressed', 'true')
  await compare.click()
  await expect(compare).toHaveAttribute('aria-pressed', 'true')

  if (await pause.isVisible()) {
    await pause.click()
    await expect(play).toBeVisible()
    await play.click()
    await expect(pause).toBeVisible()
  } else {
    await play.click()
    await expect(pause).toBeVisible()
    await pause.click()
    await expect(play).toBeVisible()
  }

  await apply.click()
  await expect(panel).toHaveCount(0)
}

test.describe('bring to life phone preview layout', () => {
  for (const viewport of [
    { width: 320, height: 560 },
    { width: 390, height: 560 },
    { width: 390, height: 844 },
  ] as const) {
    test(`${viewport.width}x${viewport.height} keeps preview + playback reachable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
      await ensureEditor(page, 'Bring to life demos')
      await clickBringToLife(page)
      await page.screenshot({
        path: testInfo.outputPath(
          `btl-phone-${viewport.width}x${viewport.height}.png`,
        ),
      })
      await assertPreviewControlsReachable(
        page,
        viewport.width,
        viewport.height,
      )
    })
  }
})

/** Read Inspector tab + scroll and the stage camera transform. */
async function readInspectorAndCamera(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="inspector-panel"]')
    if (!(panel instanceof HTMLElement)) return null
    let scroller: HTMLElement = panel
    if (panel.scrollHeight <= panel.clientHeight + 1) {
      let node: HTMLElement | null = panel.parentElement
      while (node) {
        const cs = getComputedStyle(node)
        if (
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          scroller = node
          break
        }
        node = node.parentElement
      }
    }
    const world = document.querySelector('[data-testid="workspace-world"]')
    const toggle = document.querySelector(
      '[data-testid="btn-toggle-inspector-pane"]',
    )
    return {
      tab: panel.getAttribute('data-inspector-tab'),
      scrollTop: scroller.scrollTop,
      transform: world instanceof HTMLElement ? world.style.transform : '',
      inspectorPressed: toggle?.getAttribute('aria-pressed') ?? null,
      inspectorOpenPref: localStorage.getItem(
        'motionsketch.inspectorPanelOpen',
      ),
      actorsOpenPref: localStorage.getItem('motionsketch.actorsPanelOpen'),
    }
  })
}

async function prepareScrolledMotionInspector(page: Page) {
  await ensureEditor(page, 'Bring to life demos')
  // Open Motion so Bring to life is available, then scroll the sheet.
  const toggle = page.getByTestId('btn-toggle-inspector-pane')
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click()
  }
  await page.getByTestId('btn-inspector-motion').click()
  await expect(page.getByTestId('refine-motion-tools')).toBeVisible()
  await expect(page.getByTestId('inspector-panel')).toHaveAttribute(
    'data-inspector-tab',
    'motion',
  )

  // Place Bring to life fully inside the sheet so Playwright's pre-click
  // scrollIntoView does not change the offset we are about to assert.
  const scrolled = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="inspector-panel"]')
    const btn = document.querySelector('[data-testid="btn-bring-to-life"]')
    if (!(panel instanceof HTMLElement) || !(btn instanceof HTMLElement)) {
      return 0
    }
    const panelRect = panel.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const delta = btnRect.top - panelRect.top - 48
    panel.scrollTop += delta
    // Keep a non-zero offset so restore is observable.
    if (panel.scrollTop < 40) {
      panel.scrollTop = Math.min(
        80,
        Math.max(0, panel.scrollHeight - panel.clientHeight),
      )
    }
    return panel.scrollTop
  })
  expect(scrolled).toBeGreaterThan(0)

  const before = await readInspectorAndCamera(page)
  expect(before).toBeTruthy()
  expect(before!.tab).toBe('motion')
  expect(before!.scrollTop).toBeGreaterThan(0)
  expect(before!.inspectorPressed).toBe('true')
  return before!
}

test.describe('bring to life phone inspector restore', () => {
  // Short phone is where preview defers the Inspector sheet.
  test.use({ viewport: { width: 390, height: 560 } })

  for (const exit of ['Apply', 'Cancel', 'Escape'] as const) {
    test(`${exit} restores Inspector tab/scroll; prefs and camera stay`, async ({
      page,
    }) => {
      await loadProjectSnapshot(page, buildBringToLifeFixtureJson())
      const before = await prepareScrolledMotionInspector(page)

      await page.getByTestId('btn-bring-to-life').click()
      await expect(page.getByTestId('bring-to-life-panel')).toBeVisible()
      await expect(page.getByTestId('inspector-slot')).toHaveCount(0)
      // Temporary deferral — floating prefs must not flip to closed.
      // Stage letterbox may change while the sheet is away; that is not a
      // permanent camera preference change.
      const midPrefs = await page.evaluate(() => ({
        inspectorOpenPref: localStorage.getItem(
          'motionsketch.inspectorPanelOpen',
        ),
        actorsOpenPref: localStorage.getItem('motionsketch.actorsPanelOpen'),
      }))
      expect(midPrefs.inspectorOpenPref).toBe(before.inspectorOpenPref)
      expect(midPrefs.actorsOpenPref).toBe(before.actorsOpenPref)

      if (exit === 'Apply') {
        await page.getByTestId('btn-bring-to-life-apply').click()
      } else if (exit === 'Cancel') {
        await page.getByTestId('btn-bring-to-life-cancel').click()
      } else {
        await page.keyboard.press('Escape')
      }
      await expect(page.getByTestId('bring-to-life-panel')).toHaveCount(0)

      await expect(page.getByTestId('inspector-panel')).toBeVisible()
      const after = await readInspectorAndCamera(page)
      expect(after).toBeTruthy()
      expect(after!.tab).toBe(before.tab)
      expect(after!.scrollTop).toBe(before.scrollTop)
      // After the sheet returns, camera must match the pre-preview framing
      // (no sticky Fit / pan from the temporary layout).
      expect(after!.transform).toBe(before.transform)
      expect(after!.inspectorPressed).toBe('true')
      expect(after!.inspectorOpenPref).toBe(before.inspectorOpenPref)
      expect(after!.actorsOpenPref).toBe(before.actorsOpenPref)
    })
  }
})
