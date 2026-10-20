import { expect, test } from '@playwright/test'
import { PERSIST_FORMAT_VERSION } from '../../src/core/persist/document'
import {
  ensureEditor,
  loadHtmlDocument,
  openPanel,
  readExportedCss,
  recordSimplePath,
  expandExportOtherWays,
} from './helpers'

test.describe('text actors', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('create multiline text, resize, export matches editor pose', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Text actor')

    await openPanel(page, 'appearance')
    await page.getByTestId('actor-kind-text').check()
    await expect(page.getByTestId('actor-text-section')).toBeVisible()
    // Wide glyphs + wrap + explicit newlines — height must follow layout, not a
    // fixed estimate (fullwidth M / W stress wrap metrics).
    const copy =
      'ＭＭＭＭ wide wrap line\nHello Motion\nWWWWWWWWWWWWWWWW'
    await page.getByTestId('actor-text-content').fill(copy)
    await page.getByTestId('actor-text-weight-700').check()
    await page.getByTestId('actor-text-align-center').check()
    await page.getByTestId('actor-color').fill('#0f766e')

    await expect(page.getByTestId('actor')).toHaveAttribute(
      'data-actor-kind',
      'text',
    )
    await expect(page.getByTestId('actor-text-content')).toHaveValue(copy)

    const actor = page.getByTestId('actor')
    const before = await actor.boundingBox()
    expect(before).toBeTruthy()
    const centerBefore = {
      x: before!.x + before!.width / 2,
      y: before!.y + before!.height / 2,
    }

    await page.getByTestId('actor-size-slider').evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(input, '0.28')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const after = await actor.boundingBox()
    expect(after).toBeTruthy()
    expect(after!.width).toBeGreaterThan(before!.width)
    // Center stays put while width/content-driven height change.
    const centerAfter = {
      x: after!.x + after!.width / 2,
      y: after!.y + after!.height / 2,
    }
    expect(Math.abs(centerAfter.x - centerBefore.x)).toBeLessThan(8)
    expect(Math.abs(centerAfter.y - centerBefore.y)).toBeLessThan(8)

    // No clipping: scrollHeight matches laid-out client height.
    const clip = await actor.evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }))
    expect(clip.scroll).toBeLessThanOrEqual(clip.client + 1)

    const editorNorm = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="actor"]',
      ) as HTMLElement | null
      const stage = document.querySelector(
        '[data-testid="stage-frame"]',
      ) as HTMLElement | null
      if (!el || !stage) throw new Error('missing actor/stage-frame')
      const sr = stage.getBoundingClientRect()
      const ar = el.getBoundingClientRect()
      const minSide = Math.min(sr.width, sr.height)
      return {
        w: ar.width / minSide,
        h: ar.height / minSide,
      }
    })

    await recordSimplePath(page)

    const css = await readExportedCss(page)
    expect(css).toMatch(/white-space:\s*pre-wrap/)
    expect(css).toMatch(/height:\s*auto/)
    expect(css).toMatch(/CSS alone does NOT include the copy/i)
    expect(css).toMatch(/system-ui|Segoe UI/)

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const fs = await import('node:fs')
    const html = fs.readFileSync((await download.path())!, 'utf8')
    expect(html).toContain('Hello')
    expect(html).toContain('Motion')

    await loadHtmlDocument(page, html)
    const demo = page.getByTestId('demo-actor')
    await expect(demo).toBeVisible()
    await expect(demo).toContainText('Hello')
    await expect(demo).toContainText('Motion')

    const demoNorm = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement | null
      const stage = document.querySelector(
        '[data-testid="demo-stage"]',
      ) as HTMLElement | null
      if (!el || !stage) throw new Error('missing demo actor/stage')
      const sr = stage.getBoundingClientRect()
      const ar = el.getBoundingClientRect()
      const minSide = Math.min(sr.width, sr.height)
      return {
        w: ar.width / minSide,
        h: ar.height / minSide,
        client: el.clientHeight,
        scroll: el.scrollHeight,
      }
    })
    expect(demoNorm.scroll).toBeLessThanOrEqual(demoNorm.client + 1)
    // cqmin-normalized size should match between editor and HTML export.
    expect(Math.abs(demoNorm.w - editorNorm.w)).toBeLessThan(0.03)
    expect(Math.abs(demoNorm.h - editorNorm.h)).toBeLessThan(0.06)
  })

  test('empty text content round-trips through project download', async ({
    page,
  }) => {
    await page.goto('/')
    await ensureEditor(page, 'Empty text')
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-kind-text').check()
    // Record while default copy still gives a hit target, then clear.
    await recordSimplePath(page)
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-text-content').fill('')
    await expect(page.getByTestId('actor-text-content')).toHaveValue('')

    await openPanel(page, 'project')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const download = await downloadPromise
    const fs = await import('node:fs')
    const json = fs.readFileSync((await download.path())!, 'utf8')
    const snap = JSON.parse(json)
    expect(snap.project.actors[0].appearance.text.content).toBe('')

    await page.goto('/')
    await page.evaluate((raw) => {
      localStorage.setItem('motionsketch.project.v1', raw)
    }, json)
    await page.reload()
    await ensureEditor(page)
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-kind-text')).toBeChecked()
    await expect(page.getByTestId('actor-text-content')).toHaveValue('')
  })

  test('project download/open keeps text settings', async ({ page }) => {
    await page.goto('/')
    await ensureEditor(page, 'Text persist')
    await openPanel(page, 'appearance')
    await page.getByTestId('actor-kind-text').check()
    await page.getByTestId('actor-text-content').fill('Persist me')
    await page.getByTestId('actor-text-align-right').check()
    await page.getByTestId('actor-text-font').selectOption('serif')
    // Project download stays disabled until the actor has a recording.
    await recordSimplePath(page)

    await openPanel(page, 'project')
    await expect(page.getByTestId('btn-download-project')).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const download = await downloadPromise
    const fs = await import('node:fs')
    const json = fs.readFileSync((await download.path())!, 'utf8')
    const snap = JSON.parse(json)
    expect(snap.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(snap.project.actors[0].appearance.kind).toBe('text')
    expect(snap.project.actors[0].appearance.text.content).toBe('Persist me')

    await page.goto('/')
    await page.evaluate((raw) => {
      localStorage.setItem('motionsketch.project.v1', raw)
    }, json)
    await page.reload()
    await ensureEditor(page)
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-kind-text')).toBeChecked()
    await expect(page.getByTestId('actor-text-content')).toHaveValue(
      'Persist me',
    )
    await expect(page.getByTestId('actor-text-align-right')).toBeChecked()
    await expect(page.getByTestId('actor-text-font')).toHaveValue('serif')
  })
})
