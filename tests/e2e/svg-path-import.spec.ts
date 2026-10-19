import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { Project } from '../../src/core/types'
import {
  ensureEditor,
  loadHtmlDocument,
  loadProjectSnapshot,
  openPanel,
  readExportedCss,
} from './helpers'

function squareStageProjectJson(): string {
  const project: Project = {
    version: 1,
    name: 'Square stage SVG import',
    actors: [createSceneActor({ name: 'Actor 1' })],
    playback: {
      durationMs: 1200,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: 1,
  }
  return serializeSnapshot(
    buildSnapshot(project, null, '2026-01-01T00:00:00.000Z'),
  )
}

const CURVE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 80 C 10 10, 90 10, 90 80" fill="none" stroke="#000"/>
</svg>`

const CORNER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 50 L 50 50 L 50 10" fill="none"/>
</svg>`

const LOOP_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 25 25 L 75 25 L 75 75 L 25 75 Z" fill="none"/>
</svg>`

const INVALID_MULTI = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 0 0 L 50 50"/>
  <path d="M 50 0 L 100 50"/>
</svg>`

async function importSvg(
  page: import('@playwright/test').Page,
  svg: string,
  options: { confirm?: boolean } = {},
) {
  const confirm = options.confirm !== false
  await openPanel(page, 'adjust')
  await page.getByTestId('svg-path-file-input').setInputFiles({
    name: 'motion.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg, 'utf8'),
  })
  await expect(page.getByTestId('svg-path-import-dialog')).toBeVisible()
  await expect(page.getByTestId('svg-path-import-preview')).toBeVisible()
  await expect(page.getByTestId('svg-path-mapping-note')).toContainText(
    /viewBox maps onto the stage/i,
  )
  if (!confirm) return
  await page.getByTestId('btn-svg-path-import-confirm').click()
  await expect(page.getByTestId('svg-path-import-dialog')).toBeHidden()
  await expect(page.getByTestId('action-live-region')).toContainText(
    /SVG path imported/i,
  )
}

test.describe('SVG path import', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('imports curve, exports matching motion, rejects invalid SVG', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)

    await importSvg(page, CURVE_SVG)
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
    await expect(page.getByTestId('steady-speed-value')).toHaveText('100%')

    // Playback uses the imported path (actor leaves rest).
    await page.getByTestId('btn-play').click()
    await page.waitForTimeout(200)
    const moved = await page.getByTestId('actor').evaluate((el) => {
      const t = getComputedStyle(el).transform
      return t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)'
    })
    expect(moved).toBe(true)

    const css = await readExportedCss(page)
    expect(css).toContain('translate3d(')
    expect(css).toMatch(/10\.[0-9]+cqw|1[0-5]\.[0-9]+cqw/)

    // HTML demo animates with the same export pipeline.
    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()
    const html = readFileSync(downloadPath!, 'utf8')
    await loadHtmlDocument(page, html)
    await expect(page.getByTestId('demo-actor')).toBeVisible()
    const demoAnim = await page.getByTestId('demo-actor').evaluate((el) => {
      const anims = el.getAnimations()
      return anims.length > 0 && anims.some((a) => a.playState === 'running')
    })
    expect(demoAnim).toBe(true)
  })

  test('imports sharp corner and closed loop; shows clear invalid error', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page)

    await importSvg(page, CORNER_SVG)
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()

    await importSvg(page, LOOP_SVG)
    // Re-open file picker path for invalid
    await openPanel(page, 'adjust')
    await page.getByTestId('svg-path-file-input').setInputFiles({
      name: 'bad.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(INVALID_MULTI, 'utf8'),
    })
    await expect(page.getByTestId('svg-path-import-error')).toContainText(
      /paths/i,
    )
    await expect(page.getByTestId('svg-path-import-dialog')).toBeHidden()
  })

  test('square stage preview matches project aspect; path matches export', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, squareStageProjectJson())

    const projectAspect = await page.evaluate(() => {
      const raw = localStorage.getItem('motionsketch.project.v1')
      if (!raw) return null
      return (JSON.parse(raw) as { project: { stageAspect: number } }).project
        .stageAspect
    })
    expect(projectAspect).toBeCloseTo(1, 5)

    await importSvg(page, CURVE_SVG, { confirm: false })

    const preview = page.getByTestId('svg-path-import-preview')
    await expect(preview).toHaveAttribute('data-stage-aspect', '1')
    const previewBox = await preview.boundingBox()
    expect(previewBox).toBeTruthy()
    expect(previewBox!.width / previewBox!.height).toBeCloseTo(1, 2)

    // Confirm, then compare start pose in CSS export to imported normalized x.
    await page.getByTestId('btn-svg-path-import-confirm').click()
    await expect(page.getByTestId('svg-path-import-dialog')).toBeHidden()

    const css = await readExportedCss(page)
    expect(css).toMatch(/aspect-ratio:\s*1\s*\/\s*1/)
    const startX = Number(
      css.match(
        /\.ms-actor[^{]*\{[^}]*transform:\s*translate3d\(([0-9.]+)cqw/,
      )?.[1],
    )
    expect(startX).toBeGreaterThan(5)
    expect(startX).toBeLessThan(20)

    await page.getByTestId('btn-play').click()
    await page.waitForTimeout(180)
    const actorMoved = await page.getByTestId('actor').evaluate((el) => {
      const t = getComputedStyle(el).transform
      return t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)'
    })
    expect(actorMoved).toBe(true)
  })
})
