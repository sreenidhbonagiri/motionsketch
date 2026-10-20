import { expect, test } from '@playwright/test'
import {
  ensureEditor,
  openCssDialog,
  openPanel,
  recordSimplePath,
  expandExportOtherWays,
} from './helpers'

async function assertFullyInViewport(
  page: import('@playwright/test').Page,
  testId: string,
) {
  const visible = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return false
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    return r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1
  }, testId)
  expect(visible, `${testId} should be fully in the viewport`).toBeTruthy()
}

test.describe('workspace layout', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    test(`desktop ${viewport.width}x${viewport.height}: full-bleed stage + labeled chrome`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      await expect(page.getByTestId('app-shell')).toBeVisible()
      await expect(page.getByTestId('btn-project')).toBeVisible()
      await expect(page.getByTestId('btn-adjust')).toBeVisible()
      await expect(page.getByTestId('btn-appearance')).toBeVisible()
      await expect(page.getByTestId('btn-export')).toBeVisible()
      await expect(page.getByTestId('btn-settings')).toHaveCount(0)

      // Stage fills the viewport (no inset card).
      const stageFill = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="stage"]')
        if (!stage) return null
        const r = stage.getBoundingClientRect()
        return {
          top: r.top,
          left: r.left,
          right: window.innerWidth - r.right,
          bottom: window.innerHeight - r.bottom,
          width: r.width,
          height: r.height,
        }
      })
      expect(stageFill).toBeTruthy()
      expect(Math.abs(stageFill!.top)).toBeLessThan(2)
      expect(Math.abs(stageFill!.left)).toBeLessThan(2)
      expect(Math.abs(stageFill!.right)).toBeLessThan(2)
      expect(Math.abs(stageFill!.bottom)).toBeLessThan(2)
      expect(stageFill!.width).toBeGreaterThan(viewport.width * 0.95)
      expect(stageFill!.height).toBeGreaterThan(viewport.height * 0.95)

      await openPanel(page, 'adjust')
      await page.getByTestId('path-compare-toggle').check()
      await expect(page.getByTestId('path-compare-legend')).toBeVisible()

      await expect(page.getByTestId('playback-dock')).toBeVisible()
      await assertFullyInViewport(page, 'toolbar')
      await assertFullyInViewport(page, 'playback-timeline')

      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('dock-status')).toBeVisible()
      await expect(page.getByTestId('mode-status-label')).toHaveText('Edit points')

      const handle = page.locator('[data-testid^="path-handle-"]').first()
      await handle.click({ force: true })
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')

      await openPanel(page, 'adjust')
      await expect(page.getByTestId('smoothing-help')).toContainText(
        'baked into your path edit',
      )
      await page.getByTestId('btn-done-edit').click()

      const noPageScroll = await page.evaluate(() => {
        const root = document.documentElement
        return root.scrollHeight <= root.clientHeight + 2
      })
      expect(noPageScroll).toBeTruthy()

      await openPanel(page, 'export')
      await expandExportOtherWays(page)
      await page.getByTestId('btn-view-css').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('btn-view-css')).toBeVisible()
      await expect(page.getByTestId('btn-copy-css')).toBeVisible()

      await openCssDialog(page)
      await expect(page.getByTestId('css-output')).toBeVisible()
      const dialogBox = await page.getByTestId('css-dialog').boundingBox()
      expect(dialogBox).toBeTruthy()
      expect(dialogBox!.height).toBeGreaterThan(viewport.height * 0.55)
      expect(dialogBox!.width).toBeGreaterThan(viewport.width * 0.5)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('css-dialog')).toBeHidden()
      await expect(page.getByTestId('btn-view-css')).toBeFocused()
    })
  }

  test('mobile 390x844: fresh workspace chrome fits without horizontal clip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)

    const fit = await page.evaluate(() => {
      const ids = [
        'btn-project',
        'btn-examples',
        'btn-adjust',
        'btn-appearance',
        'btn-export',
        'playback-dock',
        'btn-record',
        'btn-toggle-actor-list',
      ]
      const clipped: string[] = []
      for (const id of ids) {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!(el instanceof HTMLElement)) {
          clipped.push(`${id}:missing`)
          continue
        }
        const r = el.getBoundingClientRect()
        if (
          r.left < -1 ||
          r.right > window.innerWidth + 1 ||
          r.top < -1 ||
          r.bottom > window.innerHeight + 1
        ) {
          clipped.push(id)
        }
      }
      const root = document.documentElement
      return {
        clipped,
        pageOverflowX: root.scrollWidth > root.clientWidth + 1,
        pageOverflowY: root.scrollHeight > root.clientHeight + 1,
      }
    })
    expect(fit.clipped, 'header/dock controls must stay in viewport').toEqual(
      [],
    )
    expect(fit.pageOverflowX).toBe(false)
    expect(fit.pageOverflowY).toBe(false)
  })

  test('mobile 390x844: Adjust sheet is bounded; Actors/Sequence prefs survive', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    const listToggle = page.getByTestId('btn-toggle-actor-list')
    if ((await listToggle.getAttribute('aria-expanded')) !== 'true') {
      await listToggle.click()
    }
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')

    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.click()
    }
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()

    await openPanel(page, 'adjust')
    const sheet = page.getByTestId('adjust-panel-root')
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId('btn-close-adjust')).toBeVisible()

    const bounds = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="adjust-panel-root"]')
      const close = document.querySelector('[data-testid="btn-close-adjust"]')
      const title = document.querySelector(
        '[data-testid="adjust-panel-root"] h2',
      )
      if (
        !(panel instanceof HTMLElement) ||
        !(close instanceof HTMLElement) ||
        !(title instanceof HTMLElement)
      ) {
        return null
      }
      const pr = panel.getBoundingClientRect()
      const cr = close.getBoundingClientRect()
      const tr = title.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      return {
        panelInView:
          pr.top >= -1 &&
          pr.left >= -1 &&
          pr.bottom <= vh + 1 &&
          pr.right <= vw + 1,
        closeInView:
          cr.top >= -1 &&
          cr.left >= -1 &&
          cr.bottom <= vh + 1 &&
          cr.right <= vw + 1,
        titleInView:
          tr.top >= -1 &&
          tr.left >= -1 &&
          tr.bottom <= vh + 1 &&
          tr.right <= vw + 1,
        dockInert: document
          .querySelector('[data-testid="toolbar-slot"]')
          ?.hasAttribute('inert'),
        actorsInert: document
          .querySelector('[data-testid="actor-list-slot"]')
          ?.hasAttribute('inert'),
      }
    })
    expect(bounds).toBeTruthy()
    expect(bounds!.panelInView).toBe(true)
    expect(bounds!.closeInView).toBe(true)
    expect(bounds!.titleInView).toBe(true)
    expect(bounds!.dockInert).toBe(true)
    expect(bounds!.actorsInert).toBe(true)

    // Prefs must not be collapsed while the sheet is open.
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')

    await page.getByTestId('btn-close-adjust').click()
    await expect(sheet).toHaveCount(0)

    // Closing the sheet restores interaction and keeps open prefs.
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('actor-list-body')).toBeVisible()
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()
    await expect(page.getByTestId('toolbar-slot')).not.toHaveAttribute('inert')
    await expect(page.getByTestId('actor-list-slot')).not.toHaveAttribute(
      'inert',
    )
  })

  test('mobile 390x844: expanded Actors stays clear of Sequence and dock', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    const listToggle = page.getByTestId('btn-toggle-actor-list')
    if ((await listToggle.getAttribute('aria-expanded')) !== 'true') {
      await listToggle.click()
    }
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('actor-list-body')).toBeVisible()

    // Leave Sequence collapsed (header only) and open Refine so the dock is tall.
    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await sequenceToggle.getAttribute('aria-expanded')) === 'true') {
      await sequenceToggle.click()
      await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'false')
    }
    const refine = page.getByTestId('refine-motion')
    await refine.evaluate((el) => {
      ;(el as HTMLDetailsElement).open = true
    })
    await expect(page.getByTestId('refine-motion-tools')).toBeVisible()

    // Expanded-state preference must survive the layout pass.
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')

    const controls = [
      'btn-add-actor',
      'btn-duplicate-actor',
      'btn-delete-actor',
      'actor-list-help',
    ] as const
    for (const id of controls) {
      const target = page.getByTestId(id)
      await target.evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      const clear = await page.evaluate((testId) => {
        const el = document.querySelector(`[data-testid="${testId}"]`)
        const list = document.querySelector('[data-testid="actor-list"]')
        const sequence = document.querySelector('[data-testid="clip-timeline"]')
        const dock = document.querySelector('[data-testid="playback-dock"]')
        if (!(el instanceof HTMLElement) || !(list instanceof HTMLElement)) {
          return { ok: false, reason: 'missing' }
        }
        const er = el.getBoundingClientRect()
        const lr = list.getBoundingClientRect()
        // Control must sit inside the Actors panel bounds (reachable via scroll).
        if (
          er.top < lr.top - 1 ||
          er.bottom > lr.bottom + 1 ||
          er.left < lr.left - 1 ||
          er.right > lr.right + 1
        ) {
          return { ok: false, reason: 'outside-list' }
        }
        // Sequence / dock must not cover the control’s center.
        const x = er.left + er.width / 2
        const y = er.top + er.height / 2
        for (const overlay of [sequence, dock]) {
          if (!(overlay instanceof HTMLElement)) continue
          const or = overlay.getBoundingClientRect()
          if (x >= or.left && x <= or.right && y >= or.top && y <= or.bottom) {
            return { ok: false, reason: 'covered' }
          }
        }
        return { ok: true, reason: 'ok' }
      }, id)
      expect(clear, `${id} reachable above Sequence/dock`).toEqual({
        ok: true,
        reason: 'ok',
      })
    }
  })

  test('mobile 390x844: actor control reachable with Sequence expanded', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    const listToggle = page.getByTestId('btn-toggle-actor-list')
    if ((await listToggle.getAttribute('aria-expanded')) !== 'true') {
      await listToggle.click()
    }
    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.click()
    }
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('actor-list-body')).toBeVisible()
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()

    // Body must have real height — not crushed to the toggle row.
    const bodyBox = await page.getByTestId('actor-list-body').boundingBox()
    expect(bodyBox).toBeTruthy()
    expect(bodyBox!.height).toBeGreaterThan(80)

    const add = page.getByTestId('btn-add-actor')
    await add.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await expect(add).toBeVisible()

    // Hit-test the control center: must land on Add (not Sequence/dock/header).
    const hit = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="btn-add-actor"]')
      if (!(el instanceof HTMLElement)) return { ok: false, reason: 'missing' }
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) {
        return { ok: false, reason: 'zero-size' }
      }
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const top = document.elementFromPoint(x, y)
      if (!(top instanceof Element)) return { ok: false, reason: 'no-hit' }
      const onAdd = !!top.closest('[data-testid="btn-add-actor"]')
      return {
        ok: onAdd,
        reason: onAdd ? 'ok' : (top as HTMLElement).dataset?.testid ?? top.tagName,
      }
    })
    expect(hit, 'Add must be the topmost target at its center').toEqual({
      ok: true,
      reason: 'ok',
    })

    // Actually use the control — proves reachability, not just geometry.
    await add.click()
    await expect(page.getByTestId('actor-list')).toContainText('2/8')

    // Prefs and Sequence stay open after the interaction.
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await assertFullyInViewport(page, 'sequence-collapse-label')
    await assertFullyInViewport(page, 'btn-play')
  })

  test('mobile 390x844: labeled menus stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    // Keep the actor list collapsed so bottom chrome stays reachable.
    const listExpanded = await page
      .getByTestId('btn-toggle-actor-list')
      .getAttribute('aria-expanded')
    if (listExpanded === 'true') {
      await page.getByTestId('btn-toggle-actor-list').click()
    }
    await recordSimplePath(page)

    // Sequence mounts only after a recording; collapse it so it cannot cover
    // the Export panel’s scrollable actions (View CSS sits near the bottom).
    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if (await sequenceToggle.isVisible().catch(() => false)) {
      if ((await sequenceToggle.getAttribute('aria-expanded')) === 'true') {
        await sequenceToggle.click()
        await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'false')
      }
    }

    await expect(page.getByTestId('stage')).toBeVisible()
    await expect(page.getByTestId('toolbar')).toBeVisible()
    await assertFullyInViewport(page, 'toolbar')

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const viewCss = page.getByTestId('btn-view-css')
    await expect(viewCss).toBeVisible()
    await viewCss.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await expect(viewCss).toBeInViewport()

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('duration-help')).toBeVisible()

    await openCssDialog(page)
    await expect(page.getByTestId('css-dialog')).toBeVisible()
    await page.getByTestId('btn-close-css-dialog').click()
    await expect(page.getByTestId('css-dialog')).toBeHidden()
  })

  /**
   * Regression: with Sequence expanded, the bottom dock used to paint over the
   * Export panel (header stacking at z-40). View CSS must remain clickable —
   * header rises to z-50 while a chrome panel is open.
   */
  test('mobile 390x844: View CSS opens over expanded Sequence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    const listExpanded = await page
      .getByTestId('btn-toggle-actor-list')
      .getAttribute('aria-expanded')
    if (listExpanded === 'true') {
      await page.getByTestId('btn-toggle-actor-list').click()
    }
    // Keep Export open so the panel stacks above the dock.
    await recordSimplePath(page)
    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    await expect(sequenceToggle).toBeVisible()
    // Toggle sits under the open Export panel; use the element click path so
    // Sequence can expand while Export stays open (the overlap under test).
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.evaluate((el) => {
        ;(el as HTMLButtonElement).click()
      })
    }
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const viewCss = page.getByTestId('btn-view-css')
    await expect(viewCss).toBeVisible()
    await viewCss.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await viewCss.scrollIntoViewIfNeeded()
    await viewCss.click()
    await expect(page.getByTestId('css-dialog')).toBeVisible()
  })
})
