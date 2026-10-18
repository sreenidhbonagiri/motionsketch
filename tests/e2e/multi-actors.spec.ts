import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  ensureEditor,
  acceptNextDialog,
  actorIdsFromList,
  clickRecord,
  dragActor,
  openPanel,
  readExportedCss,
  recordSimplePath,
  selectActorByIndex,
} from './helpers'

async function readDownloadText(download: import('@playwright/test').Download) {
  const path = await download.path()
  expect(path).toBeTruthy()
  return readFileSync(path!, 'utf8')
}

test.describe('multiple actors', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('add, rename, duplicate, delete, and reorder', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await expect(page.getByTestId('actor-list')).toBeVisible()
    await expect(page.getByTestId('btn-add-actor')).toBeEnabled()

    await page.getByTestId('btn-add-actor').click()
    let ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(2)
    await expect(page.getByTestId('actor-name-input')).toHaveValue(/Actor/)

    // Clearing the field must stay empty (no “Actor” snap-back) until commit.
    const nameInput = page.getByTestId('actor-name-input')
    await nameInput.click()
    await nameInput.fill('')
    await expect(nameInput).toHaveValue('')
    await nameInput.fill('Beacon')
    await nameInput.press('Enter')
    await expect(page.getByTestId(`actor-list-item-${ids[1]}`)).toContainText(
      'Beacon',
    )
    await expect(nameInput).toHaveValue('Beacon')
    await expect(page.getByTestId('actor-list-help')).toContainText(
      'clears path and transform undo history',
    )

    await page.getByTestId('btn-duplicate-actor').click()
    ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(3)
    await expect(page.getByTestId('actor-name-input')).toHaveValue(
      /Beacon copy/,
    )

    // Duplicate inserts after the source; move the copy earlier, then put the
    // first actor on top via reorder-down so list order matches stacking.
    await page.getByTestId('btn-actor-reorder-up').click()
    await selectActorByIndex(page, 0)
    await page.getByTestId('btn-actor-reorder-down').click()
    await page.getByTestId('btn-actor-reorder-down').click()
    ids = await actorIdsFromList(page)
    const topId = ids[ids.length - 1]
    await expect(
      page.getByTestId(`actor-list-item-${topId}`),
    ).toHaveAttribute('data-selected', 'true')

    const zTop = await page.getByTestId('actor').evaluate((el) =>
      Number(getComputedStyle(el).zIndex),
    )
    await selectActorByIndex(page, 0)
    const zBottom = await page.getByTestId('actor').evaluate((el) =>
      Number(getComputedStyle(el).zIndex),
    )
    expect(zTop).toBeGreaterThan(zBottom)

    // Canceling delete keeps the project and selection.
    const beforeCancel = await actorIdsFromList(page)
    const selectedId = (
      await page
        .locator('[data-testid^="actor-list-item-"][data-selected="true"]')
        .getAttribute('data-testid')
    )?.replace('actor-list-item-', '')
    expect(selectedId).toBeTruthy()
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/Delete “.+”\?/)
      await dialog.dismiss()
    })
    await page.getByTestId('btn-delete-actor').click()
    expect(await actorIdsFromList(page)).toEqual(beforeCancel)
    await expect(
      page.getByTestId(`actor-list-item-${selectedId}`),
    ).toHaveAttribute('data-selected', 'true')

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/Delete “.+”\?/)
      expect(dialog.message()).toContain('cannot be undone')
      await dialog.accept()
    })
    await page.getByTestId('btn-delete-actor').click()
    ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(2)
  })

  test('appearance and recording are per-actor; playback is shared', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color').fill('#0f766e')
    await page.getByTestId('actor-size-slider').fill('0.22')

    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')

    await page.getByTestId('btn-add-actor').click()
    const ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(2)

    // New actor has no take — play stays enabled from the other actor.
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color').fill('#c2410c')
    await page.getByTestId('actor-size-slider').fill('0.14')

    // Unrecorded actors stay at rest while the shared playhead scrubs.
    const restAt0 = await page.getByTestId('actor').boundingBox()
    expect(restAt0).toBeTruthy()
    await page.getByTestId('playback-scrubber').fill('0.7')
    const restAt07 = await page.getByTestId('actor').boundingBox()
    expect(restAt07).toBeTruthy()
    expect(Math.abs(restAt07!.x - restAt0!.x)).toBeLessThan(2)
    expect(Math.abs(restAt07!.y - restAt0!.y)).toBeLessThan(2)
    await page.getByTestId('playback-scrubber').fill('0')

    await clickRecord(page)
    await dragActor(page, { x: -40, y: 30 }, { x: -140, y: -40 })
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    // Finishing a take must not rewrite shared Duration.
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')

    await page.getByTestId('playback-scrubber').fill('0')
    const a0At0 = await page.getByTestId(`actor-${ids[0]}`).boundingBox()
    const a1At0 = await page.getByTestId('actor').boundingBox()
    expect(a0At0).toBeTruthy()
    expect(a1At0).toBeTruthy()

    await page.getByTestId('playback-scrubber').fill('0.6')
    const a0At06 = await page.getByTestId(`actor-${ids[0]}`).boundingBox()
    const a1At06 = await page.getByTestId('actor').boundingBox()
    expect(a0At06).toBeTruthy()
    expect(a1At06).toBeTruthy()

    const moved0 =
      Math.abs(a0At06!.x - a0At0!.x) > 2 ||
      Math.abs(a0At06!.y - a0At0!.y) > 2
    const moved1 =
      Math.abs(a1At06!.x - a1At0!.x) > 2 ||
      Math.abs(a1At06!.y - a1At0!.y) > 2
    expect(moved0).toBeTruthy()
    expect(moved1).toBeTruthy()

    await selectActorByIndex(page, 0)
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-color-value')).toHaveText('#0f766e')
    await expect(page.getByTestId('actor-size-value')).toHaveText(
      '22% of stage',
    )

    await selectActorByIndex(page, 1)
    await expect(page.getByTestId('actor-color-value')).toHaveText('#c2410c')
    await expect(page.getByTestId('actor-size-value')).toHaveText(
      '14% of stage',
    )
  })

  test('transform history clears on actor selection', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('playback-scrubber').fill('0.5')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('90')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await expect(page.getByTestId('btn-undo-transform')).toBeEnabled()

    await page.getByTestId('btn-add-actor').click()
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
    await expect(page.getByTestId('btn-redo-transform')).toBeDisabled()

    await selectActorByIndex(page, 0)
    // Switching selection drops stacks — undo must not apply another actor’s edits.
    await expect(page.getByTestId('btn-undo-transform')).toBeDisabled()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)
  })

  test('reset clears only the selected actor', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    await clickRecord(page)
    await dragActor(page, { x: 20, y: 20 }, { x: 100, y: -30 })

    const ids = await actorIdsFromList(page)
    await selectActorByIndex(page, 0)
    acceptNextDialog(page, true)
    await page.getByTestId('btn-reset').click()
    await expect(page.getByTestId('btn-edit-path')).toBeDisabled()

    // Other actor’s take remains; shared play stays available.
    await selectActorByIndex(page, 1)
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
    await expect(
      page.getByTestId(`actor-list-item-${ids[1]}`),
    ).toContainText('path')
  })

  test('multi-actor CSS and HTML demo use scoped selectors', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-add-actor').click()
    await clickRecord(page)
    await dragActor(page, { x: -20, y: 10 }, { x: -110, y: 40 })

    const css = await readExportedCss(page)
    expect(css).toContain('.ms-actor-1')
    expect(css).toContain('.ms-actor-2')
    expect(css).toMatch(/@keyframes ms-[a-f0-9]{8}-a1/)
    expect(css).toMatch(/@keyframes ms-[a-f0-9]{8}-a2/)
    expect(css).toContain('ms-scene-')
    expect(css).not.toMatch(/^\.actor\s*\{/m)
    expect(css).not.toMatch(/^\.stage\s*\{/m)

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const html = await readDownloadText(await downloadPromise)
    expect(html).toContain('ms-actor-1')
    expect(html).toContain('ms-actor-2')
    expect(html).toMatch(/ms-[a-f0-9]{8}-a1/)
    expect(html).not.toMatch(/https?:\/\//i)

    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('demo-stage')).toBeVisible()
    await expect(page.getByTestId('demo-actor')).toBeVisible()
    await expect(page.locator('.ms-actor-2')).toBeVisible()
  })

  test('imports a legacy single-actor project as one actor', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.waitForTimeout(400)

    const snapshotJson = await page.evaluate(() =>
      localStorage.getItem('motionsketch.project.v1'),
    )
    expect(snapshotJson).toBeTruthy()
    const current = JSON.parse(snapshotJson!)
    const actor = current.project.actors[0]

    const legacy = {
      formatVersion: 4,
      savedAt: new Date().toISOString(),
      project: {
        version: 1,
        actor: actor.appearance,
        recording: actor.recording,
        playback: {
          durationMs: 1800,
          smoothing: actor.smoothing,
          steadySpeed: actor.steadySpeed,
          loop: true,
          loopMode: 'alternate',
        },
        stageAspect: current.project.stageAspect,
        transform: actor.transform,
      },
    }

    acceptNextDialog(page, true)
    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'legacy-v4.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy), 'utf-8'),
    })

    const ids = await actorIdsFromList(page)
    expect(ids).toHaveLength(1)
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-value')).toHaveText('1.80 s')
    await expect(page.getByTestId('loop-toggle')).toBeChecked()
    await expect(page.getByTestId('loop-mode-alternate')).toBeChecked()
    await expect(page.getByTestId('btn-play')).toBeEnabled()

    const css = await readExportedCss(page)
    expect(css).toContain('.ms-actor')
    expect(css).toMatch(/@keyframes ms-[a-f0-9]{8}/)
    expect(css).not.toContain('.ms-actor-1')
  })

  test('rejects duplicate ids and missing assets without replacing', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.waitForTimeout(400)
    await openPanel(page, 'adjust')
    await page.getByTestId('duration-slider').fill('2000')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')
    const idsBefore = await actorIdsFromList(page)

    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'dup-ids.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          formatVersion: 5,
          savedAt: new Date().toISOString(),
          project: {
            version: 1,
            actors: [
              {
                id: 'dup',
                name: 'A',
                appearance: {
                  kind: 'shape',
                  width: 0.12,
                  height: 0.12,
                  borderRadius: 0.28,
                  color: '#4f46e5',
                  image: null,
                },
                recording: null,
                restPosition: { x: 0.5, y: 0.5 },
                smoothing: 0.35,
                steadySpeed: 0,
                transform: { keyframes: [] },
                geometryEdit: null,
              },
              {
                id: 'dup',
                name: 'B',
                appearance: {
                  kind: 'shape',
                  width: 0.12,
                  height: 0.12,
                  borderRadius: 0.28,
                  color: '#0f766e',
                  image: null,
                },
                recording: null,
                restPosition: { x: 0.6, y: 0.5 },
                smoothing: 0.35,
                steadySpeed: 0,
                transform: { keyframes: [] },
                geometryEdit: null,
              },
            ],
            playback: { durationMs: 900, loop: false, loopMode: 'repeat' },
            stageAspect: 1.6,
          },
        }),
        'utf-8',
      ),
    })
    await expect(page.getByTestId('import-error')).toContainText(
      'Duplicate actor id',
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()
    expect(await actorIdsFromList(page)).toEqual(idsBefore)
    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-value')).toHaveText('2.00 s')

    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'missing-asset.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          formatVersion: 5,
          savedAt: new Date().toISOString(),
          project: {
            version: 1,
            actors: [
              {
                id: 'img-1',
                name: 'Broken',
                appearance: {
                  kind: 'image',
                  width: 0.2,
                  height: 0.2,
                  borderRadius: 0,
                  color: '#111111',
                  image: { assetId: 'gone' },
                },
                recording: null,
                restPosition: { x: 0.5, y: 0.5 },
                smoothing: 0.35,
                steadySpeed: 0,
                transform: { keyframes: [] },
                geometryEdit: null,
              },
            ],
            playback: { durationMs: 900, loop: false, loopMode: 'repeat' },
            stageAspect: 1.6,
          },
          assets: {},
        }),
        'utf-8',
      ),
    })
    await expect(page.getByTestId('import-error')).toContainText(
      'missing assets[gone]',
    )
    await expect(page.getByTestId('btn-play')).toBeEnabled()
  })

  test('canvas click selects actor and scopes Appearance', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page)
    if (
      (await page
        .getByTestId('btn-toggle-actor-list')
        .getAttribute('aria-expanded')) !== 'true'
    ) {
      await page.getByTestId('btn-toggle-actor-list').click()
    }
    await expect(page.getByTestId('actor-list-items')).toBeVisible()
    await page.getByTestId('btn-add-actor').click()
    const ids = await actorIdsFromList(page)

    await openPanel(page, 'appearance')
    await page.getByTestId('actor-color').fill('#c2410c')
    await expect(page.getByTestId('actor-color-value')).toHaveText('#c2410c')

    await selectActorByIndex(page, 0)
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-color-value')).not.toHaveText(
      '#c2410c',
    )

    // Click the second actor on the canvas (unselected test id).
    await page.getByTestId(`actor-${ids[1]}`).click()
    await expect(
      page.getByTestId(`actor-list-item-${ids[1]}`),
    ).toHaveAttribute('data-selected', 'true')
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-color-value')).toHaveText('#c2410c')
  })
})
