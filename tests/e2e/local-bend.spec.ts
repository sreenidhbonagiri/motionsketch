import { expect, test } from '@playwright/test'
import {
  buildPathHandlesFixtureJson,
  buildPathHandlesFixtureSamples,
  PATH_HANDLES_FREE_SAMPLE,
  PATH_HANDLES_INDICES,
} from '../fixtures/pathHandlesProject'
import { makeGeometryEdit } from '../../src/core/edit'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import {
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
} from './helpers'

function roundedTurnSamples(n = 41): MotionSample[] {
  const mid = Math.floor(n / 2)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 25
    if (i <= mid) {
      const u = i / mid
      return {
        t,
        x: 0.15 + 0.35 * u,
        y: 0.2 + 0.3 * u + 0.12 * Math.sin(Math.PI * u),
      }
    }
    const u = (i - mid) / (n - 1 - mid)
    return {
      t,
      x: 0.5 + 0.35 * u,
      y: 0.5 - 0.25 * u + 0.12 * Math.sin(Math.PI * u),
    }
  })
}

function noisyBendSamples(n = 41): MotionSample[] {
  const mid = Math.floor(n / 2)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 25
    if (i <= mid) {
      const u = i / mid
      const jag = i > 2 && i < mid - 1 ? ((i % 2) * 2 - 1) * 0.035 : 0
      return { t, x: 0.15 + 0.35 * u, y: 0.2 + 0.3 * u + jag }
    }
    const u = (i - mid) / (n - 1 - mid)
    const jag = i > mid + 1 && i < n - 2 ? ((i % 2) * 2 - 1) * 0.035 : 0
    return { t, x: 0.5 + 0.35 * u + jag, y: 0.5 - 0.25 * u }
  })
}

function fixtureJsonForSamples(
  samples: MotionSample[],
  handleIndices: number[],
): string {
  const geometryEdit = makeGeometryEdit(samples, 0.3, handleIndices)
  const actor = createSceneActor({
    id: 'local-bend-actor',
    name: 'Local bend',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit,
    smoothing: 0.3,
    steadySpeed: 0,
  })
  const project: Project = {
    version: 1,
    name: 'Local bend fixture',
    actors: [actor],
    playback: {
      durationMs: samples[samples.length - 1]!.t,
      loop: false,
      loopMode: 'repeat',
    },
    stageAspect: 1.6,
  }
  return serializeSnapshot(
    buildSnapshot(project, null, '2026-01-01T00:00:00.000Z'),
  )
}

test.describe('local bend actions', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('smooth bend / make corner / straight reject + undo', async ({
    page,
  }) => {
    const handles = [...PATH_HANDLES_INDICES]
    const mid = handles[Math.floor(handles.length / 2)]!

    // --- Smooth a noisy bend ---
    await loadProjectSnapshot(
      page,
      fixtureJsonForSamples(noisyBendSamples(), handles),
    )
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('path-handles')).toBeVisible()

    // Select the mid handle via keyboard cycling.
    for (let i = 0; i < handles.indexOf(mid); i++) {
      await page.keyboard.press(']')
    }
    await expect(
      page.locator('[data-testid^="path-handle-"][aria-pressed="true"]'),
    ).toHaveAttribute('data-handle-index', String(mid))

    const apexBefore = await page
      .locator(`[data-testid="path-handle-${mid}"]`)
      .evaluate((el) => ({
        x: el.getAttribute('data-sample-x'),
        y: el.getAttribute('data-sample-y'),
      }))

    await expect(page.getByTestId('btn-smooth-bend')).toBeEnabled()
    await page.getByTestId('btn-smooth-bend').click()
    await expect(page.getByTestId('action-live-region')).toContainText(
      'Smoothed',
    )
    const apexAfterSmooth = await page
      .locator(`[data-testid="path-handle-${mid}"]`)
      .evaluate((el) => ({
        x: el.getAttribute('data-sample-x'),
        y: el.getAttribute('data-sample-y'),
      }))
    expect(apexAfterSmooth).toEqual(apexBefore)

    const cssAfterSmooth = await readExportedCss(page)
    await page.getByTestId('btn-close-export').click()

    await page.getByTestId('btn-undo-edit').click()
    await expect(page.getByTestId('btn-redo-edit')).toBeEnabled()

    // --- Make corner on a rounded turn ---
    await page.getByTestId('btn-done-edit').click()
    await loadProjectSnapshot(
      page,
      fixtureJsonForSamples(roundedTurnSamples(), handles),
    )
    await page.getByTestId('btn-edit-path').click()
    for (let i = 0; i < handles.indexOf(mid); i++) {
      await page.keyboard.press(']')
    }
    await expect(page.getByTestId('btn-make-corner')).toBeEnabled()
    await page.keyboard.press('c')
    await expect(page.getByTestId('action-live-region')).toContainText(
      'Sharpened',
    )

    // --- Straight fixture: make corner disabled ---
    await page.getByTestId('btn-done-edit').click()
    await loadProjectSnapshot(page, buildPathHandlesFixtureJson())
    await page.getByTestId('btn-edit-path').click()
    // Select an interior handle (not endpoint).
    await page.keyboard.press(']')
    await expect(page.getByTestId('btn-make-corner')).toBeDisabled()
    await page.keyboard.press('c')
    await expect(page.getByTestId('action-live-region')).toContainText(
      /straight|already/i,
    )
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(
      PATH_HANDLES_INDICES.length,
    )

    // Keyboard S on straight may be disabled no-op — still no crash.
    await page.keyboard.press('s')
    await expect(page.getByTestId('path-handles')).toBeVisible()

    // Free sample still addable after local actions (selection model intact).
    const free = buildPathHandlesFixtureSamples()[PATH_HANDLES_FREE_SAMPLE]!
    await page.getByTestId('btn-path-add-mode').click()
    const stage = page.getByTestId('stage')
    const box = await stage.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.click(
      box!.x + free.x * box!.width,
      box!.y + free.y * box!.height,
    )
    await expect(page.getByTestId('action-live-region')).toContainText(
      'Handle added',
    )

    // Export still available (same edited geometry pipeline).
    const css = await readExportedCss(page)
    expect(css.length).toBeGreaterThan(20)
    expect(cssAfterSmooth.length).toBeGreaterThan(20)
  })

  test('actor isolation: local bend does not alter the other actor', async ({
    page,
  }) => {
    const samples = roundedTurnSamples()
    const handles = [...PATH_HANDLES_INDICES]
    const mid = handles[Math.floor(handles.length / 2)]!
    const ge = makeGeometryEdit(samples, 0.3, handles)
    const a = createSceneActor({
      id: 'actor-a',
      name: 'A',
      recording: {
        samples: samples.map((s) => ({ ...s })),
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      geometryEdit: ge,
    })
    const straight = buildPathHandlesFixtureSamples()
    const b = createSceneActor({
      id: 'actor-b',
      name: 'B',
      recording: {
        samples: straight.map((s) => ({ ...s })),
        recordedDurationMs: straight[straight.length - 1]!.t,
      },
      geometryEdit: makeGeometryEdit(straight, 0.3, [...PATH_HANDLES_INDICES]),
    })
    const project: Project = {
      version: 1,
      name: 'Two actors bend',
      actors: [a, b],
      playback: { durationMs: 1000, loop: false, loopMode: 'repeat' },
      stageAspect: 1.6,
    }
    await loadProjectSnapshot(
      page,
      serializeSnapshot(
        buildSnapshot(project, null, '2026-01-01T00:00:00.000Z'),
      ),
    )

    await openPanel(page, 'appearance')
    await page.getByTestId('actor-list-item-actor-a').click()
    await page.getByTestId('btn-close-appearance').click()
    await page.getByTestId('btn-edit-path').click()
    for (let i = 0; i < handles.indexOf(mid); i++) {
      await page.keyboard.press(']')
    }
    await page.getByTestId('btn-make-corner').click()
    await expect(page.getByTestId('action-live-region')).toContainText(
      'Sharpened',
    )
    await page.getByTestId('btn-done-edit').click()

    await openPanel(page, 'appearance')
    await page.getByTestId('actor-list-item-actor-b').click()
    await page.getByTestId('btn-close-appearance').click()
    await page.getByTestId('btn-edit-path').click()
    // Actor B still has the straight fixture handle count / make-corner disabled.
    await page.keyboard.press(']')
    await expect(page.getByTestId('btn-make-corner')).toBeDisabled()
    await expect(page.locator('[data-testid^="path-handle-"]')).toHaveCount(
      PATH_HANDLES_INDICES.length,
    )
  })
})
