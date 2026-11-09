import { expect, test, type Page } from '@playwright/test'
import {
  ensureEditor,
  openCssDialog,
  openPanel,
  recordSimplePath,
  expandExportOtherWays,
  closePanel,
} from './helpers'

/** Play/Pause center X should match the dock center (balanced transport columns). */
async function assertPlayCenteredInDock(page: Page, tolerancePx = 6) {
  const play = page.getByTestId('btn-play').or(page.getByTestId('btn-pause'))
  await expect(play).toBeVisible()
  const centered = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="playback-dock"]')
    const control =
      document.querySelector('[data-testid="btn-play"]') ??
      document.querySelector('[data-testid="btn-pause"]')
    if (!(dock instanceof HTMLElement) || !(control instanceof HTMLElement)) {
      return { ok: false, delta: Infinity }
    }
    const dr = dock.getBoundingClientRect()
    const cr = control.getBoundingClientRect()
    const dockMid = dr.left + dr.width / 2
    const controlMid = cr.left + cr.width / 2
    return { ok: true, delta: Math.abs(dockMid - controlMid) }
  })
  expect(centered.ok, 'dock and play control present').toBe(true)
  expect(centered.delta).toBeLessThanOrEqual(tolerancePx)
}

/** Topmost test id at the element's center (walks out of inner SVG/text). */
async function topTestIdAtCenter(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!(el instanceof HTMLElement)) return 'missing'
    const rect = el.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return 'zero-size'
    const top = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
    if (!(top instanceof Element)) return 'none'
    // Labels and icons inside the control are that control. A different
    // test id counts only when it actually covers the center.
    if (el.contains(top)) return id
    return top.closest('[data-testid]')?.getAttribute('data-testid') ?? 'none'
  }, testId)
}

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

      // Stage fills its docked center viewport (not under sidebars / transport).
      const stageFill = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="stage"]')
        const cell = document.querySelector('[data-testid="stage-viewport"]')
        if (!(stage instanceof HTMLElement) || !(cell instanceof HTMLElement)) {
          return null
        }
        const r = stage.getBoundingClientRect()
        const c = cell.getBoundingClientRect()
        return {
          dx: Math.abs(r.left - c.left) + Math.abs(r.top - c.top),
          dw: Math.abs(r.width - c.width),
          dh: Math.abs(r.height - c.height),
          width: r.width,
          height: r.height,
          cellWidth: c.width,
          cellHeight: c.height,
        }
      })
      expect(stageFill).toBeTruthy()
      expect(stageFill!.dx).toBeLessThan(2)
      expect(stageFill!.dw).toBeLessThan(2)
      expect(stageFill!.dh).toBeLessThan(2)
      expect(stageFill!.width).toBeGreaterThan(viewport.width * 0.35)
      expect(stageFill!.height).toBeGreaterThan(viewport.height * 0.4)
      await expect(page.getByTestId('inspector-panel')).toBeVisible()
      await expect(page.getByTestId('actor-list')).toBeVisible()
      await expect(page.getByTestId('toolbar-slot')).toBeVisible()

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
        'btn-toggle-elements-pane',
        'btn-toggle-inspector-pane',
        'btn-examples',
        'btn-help',
        'btn-export',
        'playback-dock',
        'btn-record',
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

  test('mobile 390x844: docked Motion inspector reserves space; Timing prefs survive', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.click()
    }
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()

    await openPanel(page, 'adjust')
    const sheet = page.getByTestId('inspector-motion-body')
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()

    const bounds = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="inspector-slot"]')
      const stage = document.querySelector('[data-testid="stage-viewport"]')
      const body = document.querySelector(
        '[data-testid="inspector-motion-body"]',
      )
      if (
        !(panel instanceof HTMLElement) ||
        !(stage instanceof HTMLElement) ||
        !(body instanceof HTMLElement)
      ) {
        return null
      }
      const pr = panel.getBoundingClientRect()
      const sr = stage.getBoundingClientRect()
      const br = body.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      return {
        panelInView:
          pr.top >= -1 &&
          pr.left >= -1 &&
          pr.bottom <= vh + 1 &&
          pr.right <= vw + 1,
        bodyInView:
          br.top >= -1 &&
          br.left >= -1 &&
          br.bottom <= vh + 1 &&
          br.right <= vw + 1,
        stageAboveInspector: sr.bottom <= pr.top + 2,
        stageHeight: sr.height,
        dockInert: document
          .querySelector('[data-testid="toolbar-slot"]')
          ?.hasAttribute('inert'),
      }
    })
    expect(bounds).toBeTruthy()
    expect(bounds!.panelInView).toBe(true)
    // Motion body may scroll inside the inspector; require a visible slice.
    expect(bounds!.bodyInView || bounds!.panelInView).toBe(true)
    expect(bounds!.stageAboveInspector).toBe(true)
    expect(bounds!.stageHeight).toBeGreaterThan(120)
    expect(bounds!.dockInert).toBeFalsy()

    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')

    await closePanel(page, 'adjust')
    await expect(sheet).toHaveCount(0)
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()
    await expect(page.getByTestId('toolbar-slot')).not.toHaveAttribute('inert')
  })

  test('mobile: Play/Pause does not shift Fit/zoom; both stay clickable', async ({
    page,
  }) => {
    for (const width of [390, 320] as const) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)
      await recordSimplePath(page)

      await expect(page.getByTestId('after-path-website-toast')).toHaveCount(0)
      const bar = page.getByTestId('workspace-camera-bar')
      const fit = page.getByTestId('btn-fit-stage')
      await expect(bar).toBeVisible()
      await expect(fit).toBeVisible()

      const before = await fit.boundingBox()
      await page.getByTestId('btn-play').click()
      await expect(page.getByTestId('btn-pause')).toBeVisible()
      const during = await fit.boundingBox()
      expect(before).toBeTruthy()
      expect(during).toBeTruthy()
      expect(Math.abs(during!.y - before!.y)).toBeLessThanOrEqual(2)
      expect(Math.abs(during!.x - before!.x)).toBeLessThanOrEqual(2)

      const hit = await page.evaluate(() => {
        const fitEl = document.querySelector('[data-testid="btn-fit-stage"]')
        const zoomEl = document.querySelector('[data-testid="btn-zoom-in"]')
        if (!(fitEl instanceof HTMLElement) || !(zoomEl instanceof HTMLElement)) {
          return { ok: false, reason: 'missing' }
        }
        const probe = (el: HTMLElement) => {
          const r = el.getBoundingClientRect()
          const top = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          )
          return top instanceof Element && (top === el || el.contains(top))
        }
        return { ok: probe(fitEl) && probe(zoomEl), reason: 'ok' }
      })
      expect(hit, `${width}px Fit/zoom hit`).toMatchObject({ ok: true })

      await page.getByTestId('btn-pause').click()
      await fit.click()
      await expect(page.getByTestId('zoom-percent')).toBeVisible()
    }
  })

  test('Play stays dock-centered empty, recorded, and recording', async ({
    page,
  }) => {
    for (const width of [1280, 390, 320] as const) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)

      await expect(page.getByTestId('dock-transport')).toBeVisible()
      // Empty board: hide motion-editing row so the dock stays compact.
      await expect(page.getByTestId('dock-editing')).toHaveCount(0)

      // Empty: no Continue; Record primary — Play must not shift.
      await expect(page.getByTestId('btn-continue-path')).toHaveCount(0)
      await assertPlayCenteredInDock(page)

      await recordSimplePath(page)
      await expect(page.getByTestId('dock-editing')).toBeVisible()
      await expect(page.getByTestId('btn-continue-path')).toBeVisible()
      await assertPlayCenteredInDock(page)

      await page.getByTestId('btn-record').click()
      const confirm = page.getByTestId('btn-rerecord-confirm')
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
      await expect(page.getByTestId('btn-stop')).toBeVisible()
      // Armed/recording: Continue hidden, Stop replaces Record — Play stays put.
      await assertPlayCenteredInDock(page)

      const actor = page.getByTestId('actor')
      const box = await actor.boundingBox()
      expect(box).toBeTruthy()
      const x = box!.x + box!.width / 2
      const y = box!.y + box!.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 30, y - 10, { steps: 4 })
      await expect(page.getByTestId('mode-status-label')).toContainText(
        /Recording/i,
      )
      await assertPlayCenteredInDock(page)
      await page.mouse.up()
    }
  })

  test('dock bounds stay stable between paused and playing', async ({
    page,
  }) => {
    for (const width of [1280, 390] as const) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)
      await recordSimplePath(page)

      const dock = page.getByTestId('playback-dock')
      const edit = page.getByTestId('btn-edit-path')
      const pausedBox = await dock.boundingBox()
      const playBox = await page.getByTestId('btn-play').boundingBox()
      const editBox = await edit.boundingBox()
      expect(pausedBox).toBeTruthy()
      expect(playBox).toBeTruthy()
      expect(editBox).toBeTruthy()

      await expect(page.getByTestId('dock-status')).toHaveCount(0)
      await expect(edit).toBeEnabled()

      await page.getByTestId('btn-play').click()
      await expect(page.getByTestId('btn-pause')).toBeVisible()
      // Playing no longer mounts a visible “Pause before editing…” status row.
      await expect(page.getByTestId('dock-status')).toHaveCount(0)
      await expect(edit).toBeDisabled()
      await expect(edit).toHaveAttribute('title', 'Pause before editing the path.')
      await expect(edit).toHaveAttribute(
        'aria-describedby',
        'playing-edit-path-hint',
      )
      await expect(page.getByTestId('playing-edit-path-hint')).toHaveText(
        'Pause before editing the path.',
      )

      const playingBox = await dock.boundingBox()
      const pauseBox = await page.getByTestId('btn-pause').boundingBox()
      const editPlaying = await edit.boundingBox()
      expect(playingBox).toBeTruthy()
      expect(pauseBox).toBeTruthy()
      expect(editPlaying).toBeTruthy()

      expect(Math.abs(playingBox!.height - pausedBox!.height)).toBeLessThanOrEqual(
        2,
      )
      expect(Math.abs(playingBox!.y - pausedBox!.y)).toBeLessThanOrEqual(2)
      expect(Math.abs(pauseBox!.x - playBox!.x)).toBeLessThanOrEqual(2)
      expect(Math.abs(pauseBox!.y - playBox!.y)).toBeLessThanOrEqual(2)
      expect(Math.abs(editPlaying!.x - editBox!.x)).toBeLessThanOrEqual(2)
      expect(Math.abs(editPlaying!.y - editBox!.y)).toBeLessThanOrEqual(2)

      await page.getByTestId('btn-pause').click()
      await expect(page.getByTestId('btn-play')).toBeVisible()
      await assertPlayCenteredInDock(page)
    }
  })

  test('Motion tools stay in the docked inspector on 500-wide short, 390, and 320', async ({
    page,
  }) => {
    for (const size of [
      { width: 500, height: 700 },
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ] as const) {
      await page.setViewportSize(size)
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)
      await recordSimplePath(page)
      await page.getByTestId('btn-refine-motion').click()
      const tools = page.getByTestId('refine-motion-tools')
      await expect(tools).toBeVisible()
      await expect(page.getByTestId('inspector-motion-body')).toBeVisible()
      const slot = page.getByTestId('inspector-slot')
      await expect(slot).toBeVisible()
      const slotBox = await slot.boundingBox()
      expect(slotBox, `${size.width}x${size.height} inspector`).toBeTruthy()
      expect(slotBox!.x).toBeGreaterThanOrEqual(0)
      expect(slotBox!.x + slotBox!.width).toBeLessThanOrEqual(size.width + 1)
      expect(slotBox!.y).toBeGreaterThanOrEqual(0)
      expect(slotBox!.y + slotBox!.height).toBeLessThanOrEqual(size.height + 1)
      await closePanel(page, 'adjust')
      await expect(tools).toHaveCount(0)
    }
  })

  test('mobile 390x844: Motion tools open in inspector; Snap indicator syncs', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('btn-refine-motion').click()
    const tools = page.getByTestId('refine-motion-tools')
    await expect(tools).toBeVisible()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()

    const polish = page.getByTestId('btn-polish-motion')
    await polish.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    expect(await topTestIdAtCenter(page, 'btn-polish-motion')).toBe(
      'btn-polish-motion',
    )

    // Snap stays on the transport dock (not inside Motion tools).
    if (
      (await page.getByTestId('btn-toggle-inspector-pane').getAttribute(
        'aria-pressed',
      )) === 'true'
    ) {
      await page.getByTestId('btn-toggle-inspector-pane').click()
    }
    const snap = page.getByTestId('snap-to-grid-toggle')
    await expect(snap).toBeVisible()
    await snap.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    expect(await topTestIdAtCenter(page, 'snap-to-grid-toggle')).toBe(
      'snap-to-grid-toggle',
    )

    const indicator = page.getByTestId('snap-to-grid-indicator')
    await expect(snap).toHaveAttribute('aria-pressed', 'false')
    await expect(indicator).toHaveAttribute('data-checked', 'false')
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
    await expect(indicator).toHaveAttribute('data-checked', 'true')
    await expect(snap).toContainText('Snap on')
  })

  test('mobile 390x844: expanded Actors stays clear of Sequence and dock', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list-body')).toBeVisible()

    // Leave Sequence collapsed (header only) so the Elements sheet can scroll.
    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await sequenceToggle.getAttribute('aria-expanded')) === 'true') {
      await sequenceToggle.click()
      await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'false')
    }

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

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list-body')).toBeVisible()
    const listToggle = page.getByTestId('btn-toggle-actor-list')
    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.click()
    }
    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()

    const bodyBox = await page.getByTestId('actor-list-body').boundingBox()
    expect(bodyBox).toBeTruthy()
    expect(bodyBox!.height).toBeGreaterThan(80)

    const add = page.getByTestId('btn-add-actor')
    await add.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await expect(add).toBeVisible()
    expect(await topTestIdAtCenter(page, 'btn-add-actor')).toBe('btn-add-actor')

    await add.click()
    await expect(page.getByTestId('actor-list')).toContainText('2/8')

    await expect(listToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await assertFullyInViewport(page, 'btn-play')
  })

  test('mobile 390x844: labeled menus stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    // Keep the Elements sheet closed so the stage + dock stay reachable.
    const elementsPane = page.getByTestId('btn-toggle-elements-pane')
    if ((await elementsPane.getAttribute('aria-pressed')) === 'true') {
      await elementsPane.click()
    }
    await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
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

    // Continue path sits on the main dock after Record; keep touch height and
    // avoid horizontal overflow when the longer label wraps.
    const continueBtn = page.getByTestId('btn-continue-path')
    await expect(continueBtn).toBeVisible()
    await assertFullyInViewport(page, 'btn-continue-path')
    const continueBox = await continueBtn.boundingBox()
    expect(continueBox).toBeTruthy()
    expect(continueBox!.height).toBeGreaterThanOrEqual(32)
    const noOverflowX = await page.evaluate(() => {
      const root = document.documentElement
      return root.scrollWidth <= root.clientWidth + 1
    })
    expect(noOverflowX).toBe(true)

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
  test('mobile 390x844: View CSS opens with Timing expanded', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    const elementsPane = page.getByTestId('btn-toggle-elements-pane')
    if ((await elementsPane.getAttribute('aria-pressed')) === 'true') {
      await elementsPane.click()
    }
    await recordSimplePath(page)
    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const sequenceToggle = page.getByTestId('btn-toggle-clip-timeline')
    await expect(sequenceToggle).toBeVisible()
    if ((await sequenceToggle.getAttribute('aria-expanded')) !== 'true') {
      await sequenceToggle.evaluate((el) => {
        ;(el as HTMLButtonElement).click()
      })
    }
    await expect(sequenceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sequence-panel-body')).toBeVisible()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()

    const viewCss = page.getByTestId('btn-view-css')
    await scrollExportScrollerToCenterSafe(page, viewCss)
    await viewCss.click({ force: true })
    await expect(page.getByTestId('css-dialog')).toBeVisible()
  })

  for (const viewport of [
    { width: 390, height: 844, label: '390x844' },
    { width: 390, height: 560, label: '390x560 short' },
    { width: 850, height: 650, label: '850x650' },
    { width: 1280, height: 720, label: '1280x720' },
  ]) {
    test(`${viewport.label}: Elements and Timing collapse stay independent`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      const narrow = viewport.width < 640
      const short = viewport.height < 700
      if (narrow && !short) {
        await page.getByTestId('btn-toggle-elements-pane').click()
        await expect(page.getByTestId('actor-list-body')).toBeVisible()
        await expect(page.getByTestId('actors-collapse-label')).toBeVisible()
      } else if (!narrow) {
        await expect(page.getByTestId('actor-list-body')).toBeVisible()
        await expect(page.getByTestId('actors-collapse-label')).toBeVisible()
      }

      const timingToggle = page.getByTestId('btn-toggle-clip-timeline')
      if ((await timingToggle.getAttribute('aria-expanded')) !== 'true') {
        await timingToggle.click()
      }
      await expect(timingToggle).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByTestId('sequence-collapse-label')).toBeVisible()
      expect(await topTestIdAtCenter(page, 'btn-play')).toBe('btn-play')

      await timingToggle.click()
      await expect(timingToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByTestId('sequence-panel-body')).toHaveCount(0)

      await timingToggle.click()
      await expect(page.getByTestId('sequence-panel-body')).toBeVisible()

      if (!narrow) {
        await page.getByTestId('btn-toggle-actor-list').click()
        await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
        await expect(timingToggle).toHaveAttribute('aria-expanded', 'true')
      } else if (!short) {
        await page.getByTestId('btn-toggle-elements-pane').click()
        await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
      }
    })
  }

  for (const viewport of [
    { width: 850, height: 650, label: '850x650 docked regions' },
    { width: 390, height: 844, label: '390x844 docked regions' },
    { width: 1280, height: 720, label: '1280x720 docked regions' },
  ]) {
    test(`${viewport.label}: stage stays clear of Timing and camera stays usable`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      const timingToggle = page.getByTestId('btn-toggle-clip-timeline')
      if ((await timingToggle.getAttribute('aria-expanded')) !== 'true') {
        await timingToggle.click()
      }

      const clear = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="stage-viewport"]')
        const toolbar = document.querySelector('[data-testid="toolbar-slot"]')
        const camera = document.querySelector(
          '[data-testid="workspace-camera-bar"]',
        )
        if (
          !(stage instanceof HTMLElement) ||
          !(toolbar instanceof HTMLElement) ||
          !(camera instanceof HTMLElement)
        ) {
          return { ok: false, reason: 'missing' }
        }
        const sr = stage.getBoundingClientRect()
        const tr = toolbar.getBoundingClientRect()
        const cr = camera.getBoundingClientRect()
        // Stage cell should end at/above the transport region (1px borders ok).
        const gap = tr.top - sr.bottom
        return {
          ok: gap >= -2 && cr.width > 8 && cr.height > 8,
          reason: gap < -2 ? `stage overlaps toolbar by ${Math.round(-gap)}` : 'ok',
          gap: Math.round(gap),
        }
      })
      expect(clear, clear.reason).toMatchObject({ ok: true })

      for (const id of [
        'btn-record',
        'btn-play',
        'btn-zoom-out',
        'btn-zoom-in',
        'btn-fit-stage',
      ] as const) {
        await page.getByTestId(id).evaluate((el) => {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        })
        expect(await topTestIdAtCenter(page, id), id).toBe(id)
      }

      await timingToggle.click()
      await expect(timingToggle).toHaveAttribute('aria-expanded', 'false')
      expect(await topTestIdAtCenter(page, 'btn-fit-stage')).toBe('btn-fit-stage')
    })
  }

  test('390x560: Timing fields apply; stage and Play stay reachable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    // Keep Elements closed on a short phone so Timing + stage remain usable.
    await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
    const timingToggle = page.getByTestId('btn-toggle-clip-timeline')
    if ((await timingToggle.getAttribute('aria-expanded')) !== 'true') {
      await timingToggle.click()
    }
    await expect(timingToggle).toHaveAttribute('aria-expanded', 'true')

    await page.getByTestId('clip-start-input').fill('0.20')
    await page.getByTestId('clip-move-for-input').fill('0.80')
    await page.getByTestId('btn-apply-clip-times').evaluate((el) => {
      ;(el as HTMLButtonElement).click()
    })
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('0.80')
    await expect(page.getByTestId('clip-times-error')).toHaveCount(0)

    expect(await topTestIdAtCenter(page, 'btn-play')).toBe('btn-play')
    expect(await topTestIdAtCenter(page, 'btn-fit-stage')).toBe('btn-fit-stage')
  })
})

async function scrollExportScrollerToCenterSafe(
  page: Page,
  locator: ReturnType<Page['getByTestId']>,
) {
  await locator.evaluate((el) => {
    const scroller = el.closest('.overflow-y-auto') as HTMLElement | null
    if (!scroller) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      return
    }
    const elRect = el.getBoundingClientRect()
    const scRect = scroller.getBoundingClientRect()
    scroller.scrollTop +=
      elRect.top + elRect.height / 2 - (scRect.top + scRect.height / 2)
  })
}
