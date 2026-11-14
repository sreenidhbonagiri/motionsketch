import { expect, test, type Page } from '@playwright/test'
import {
  actorIdsFromList,
  assertUnclippedClickable,
  clickAddActor,
  closeOpenChromePanels,
  ensureActorListExpanded,
  ensureClipTimesOpen,
  ensureEditor,
  ensureRefineMotionOpen,
  openCssDialog,
  openDockMore,
  openPanel,
  recordSimplePath,
  expandExportOtherWays,
  closePanel,
  respondToConfirm,
  selectActorByIndex,
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
      await expect(page.getByTestId('btn-toggle-elements-pane')).toBeVisible()
      await expect(page.getByTestId('btn-toggle-inspector-pane')).toBeVisible()
      await expect(page.getByTestId('btn-export')).toBeVisible()
      await expect(page.getByTestId('btn-settings')).toHaveCount(0)
      // Canvas-first: side panels start closed on a fresh workspace.
      await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
      await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)

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
      // With both side panels closed, the stage should own most of the width.
      expect(stageFill!.width).toBeGreaterThan(viewport.width * 0.7)
      expect(stageFill!.height).toBeGreaterThan(viewport.height * 0.45)
      await expect(page.getByTestId('toolbar-slot')).toBeVisible()

      await page.getByTestId('btn-toggle-elements-pane').click()
      await expect(page.getByTestId('actor-list')).toBeVisible()
      await expect(page.getByTestId('actors-collapse-label')).toHaveText('Close')
      await page.getByTestId('btn-toggle-actor-list').click()
      await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)

      await openPanel(page, 'adjust')
      await expect(page.getByTestId('inspector-panel')).toBeVisible()
      await expect(page.getByTestId('btn-close-inspector')).toBeVisible()
      await expect(page.getByTestId('btn-inspector-style')).toBeVisible()
      await expect(page.getByTestId('btn-inspector-motion')).toBeVisible()
      await expect(page.getByTestId('btn-inspector-project')).toBeVisible()
      await page.getByTestId('path-compare-toggle').check()
      await expect(page.getByTestId('path-compare-legend')).toBeVisible()

      await expect(page.getByTestId('playback-dock')).toBeVisible()
      await assertFullyInViewport(page, 'toolbar')
      await assertFullyInViewport(page, 'playback-timeline')

      await page.getByTestId('btn-edit-path').click()
      // Edit-path status is screen-reader only; keep AT copy without grey paragraphs.
      await expect(page.getByTestId('dock-status')).toBeAttached()
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

  test('mobile 390x844: inspector takes priority; Stage returns; Timing button remains', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await expect(page.getByTestId('btn-dock-more')).toBeVisible()
    await openDockMore(page)
    await expect(page.getByTestId('btn-timing')).toBeVisible()
    await page.keyboard.press('Escape')

    await openPanel(page, 'adjust')
    const sheet = page.getByTestId('inspector-motion-body')
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-inspector-motion')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('btn-inspector-back-to-stage')).toBeVisible()

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
      const br = body.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      const stageHidden =
        stage.classList.contains('hidden') ||
        getComputedStyle(stage).display === 'none'
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
        stageHidden,
        panelHeight: pr.height,
        dockInert: document
          .querySelector('[data-testid="toolbar-slot"]')
          ?.hasAttribute('inert'),
      }
    })
    expect(bounds).toBeTruthy()
    expect(bounds!.panelInView).toBe(true)
    expect(bounds!.bodyInView || bounds!.panelInView).toBe(true)
    expect(bounds!.stageHidden).toBe(true)
    expect(bounds!.panelHeight).toBeGreaterThan(200)
    expect(bounds!.dockInert).toBeFalsy()

    await page.getByTestId('btn-inspector-back-to-stage').click()
    await expect(sheet).toHaveCount(0)
    await expect(page.getByTestId('stage-viewport')).toBeVisible()
    await expect(page.getByTestId('btn-dock-more')).toBeVisible()
    await openDockMore(page)
    await expect(page.getByTestId('btn-timing')).toBeVisible()
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

      // Scrub mid-path so Pause stays mounted while we measure Fit.
      await page.getByTestId('playback-scrubber').fill('0.25')
      const before = await fit.boundingBox()
      await page.getByTestId('btn-play').click()
      const pauseBtn = page.getByTestId('btn-pause')
      await expect(pauseBtn).toBeVisible()
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

      // Playback may finish during the hit probe — don't block on Pause.
      await pauseBtn.click({ timeout: 1000 }).catch(() => {})
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
      // Empty board: Edit/Reset/More stay mounted (disabled) so Play does not shift.
      await expect(page.getByTestId('dock-editing')).toBeVisible()
      await expect(page.getByTestId('btn-edit-path')).toBeDisabled()
      await expect(page.getByTestId('btn-reset')).toBeDisabled()
      await expect(page.getByTestId('btn-continue-path')).toHaveCount(0)
      await assertPlayCenteredInDock(page)

      await recordSimplePath(page)
      await expect(page.getByTestId('dock-editing')).toBeVisible()
      await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
      await openDockMore(page)
      await expect(page.getByTestId('btn-continue-path')).toBeVisible()
      await page.keyboard.press('Escape')
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
      await ensureRefineMotionOpen(page)
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

    await ensureRefineMotionOpen(page)
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

  test('mobile 390x844: expanded Actors stays clear of the transport dock', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list-body')).toBeVisible()
    await expect(page.getByTestId('btn-elements-back-to-stage')).toBeVisible()
    // No persistent Timing panel — Elements owns the phone workspace.
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()

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
        // Transport must not cover the control’s center.
        const x = er.left + er.width / 2
        const y = er.top + er.height / 2
        if (dock instanceof HTMLElement) {
          const or = dock.getBoundingClientRect()
          if (x >= or.left && x <= or.right && y >= or.top && y <= or.bottom) {
            return { ok: false, reason: 'covered' }
          }
        }
        return { ok: true, reason: 'ok' }
      }, id)
      expect(clear, `${id} reachable above transport`).toEqual({
        ok: true,
        reason: 'ok',
      })
    }
  })

  test('mobile 390x844: Elements sheet prioritizes list; Stage restores Timing button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await expect(page.getByTestId('btn-dock-more')).toBeVisible()

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list-body')).toBeVisible()
    await expect(page.getByTestId('btn-elements-back-to-stage')).toBeVisible()
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()

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

    await page.getByTestId('btn-elements-back-to-stage').click()
    await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
    await expect(page.getByTestId('btn-dock-more')).toBeVisible()
    await openDockMore(page)
    await expect(page.getByTestId('btn-timing')).toBeVisible()
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
    // Timing is a dialog — ensure it is not left open over the menus.
    const timingDialog = page.getByTestId('timing-dialog')
    if (await timingDialog.isVisible().catch(() => false)) {
      await page.getByTestId('btn-timing-cancel').click()
      await expect(timingDialog).toHaveCount(0)
    }

    await expect(page.getByTestId('stage')).toBeVisible()
    await expect(page.getByTestId('toolbar')).toBeVisible()
    await assertFullyInViewport(page, 'toolbar')

    // Continue path lives in More; keep touch height and no nested dock scroll.
    await openDockMore(page)
    const continueBtn = page.getByTestId('btn-continue-path')
    await expect(continueBtn).toBeVisible()
    await assertFullyInViewport(page, 'btn-continue-path')
    const continueBox = await continueBtn.boundingBox()
    expect(continueBox).toBeTruthy()
    expect(continueBox!.height).toBeGreaterThanOrEqual(32)
    await page.keyboard.press('Escape')
    const noOverflowX = await page.evaluate(() => {
      const root = document.documentElement
      const editing = document.querySelector('[data-testid="dock-editing"]')
      return {
        page: root.scrollWidth <= root.clientWidth + 1,
        editingScroll:
          editing instanceof HTMLElement
            ? editing.scrollWidth <= editing.clientWidth + 1
            : true,
      }
    })
    expect(noOverflowX.page).toBe(true)
    expect(noOverflowX.editingScroll).toBe(true)

    await openPanel(page, 'export')
    await expandExportOtherWays(page)
    const viewCss = page.getByTestId('btn-view-css')
    await expect(viewCss).toBeVisible()
    await viewCss.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    await expect(viewCss).toBeInViewport()

    await openPanel(page, 'adjust')
    await expect(page.getByTestId('inspector-motion-help')).toBeAttached()
    await expect(page.getByTestId('inspector-motion-help')).toContainText(
      'About Motion',
    )

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
  test('mobile 390x844: View CSS opens with Timing button present', async ({
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
    await expect(page.getByTestId('btn-dock-more')).toBeVisible()

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
    test(`${viewport.label}: Elements and Timing dialog stay independent`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      const narrow = viewport.width < 768
      const short = viewport.height < 700
      if (narrow && !short) {
        await page.getByTestId('btn-toggle-elements-pane').click()
        await expect(page.getByTestId('actor-list-body')).toBeVisible()
        await expect(page.getByTestId('actors-collapse-label')).toBeVisible()
        await expect(page.getByTestId('btn-elements-back-to-stage')).toBeVisible()
        await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
        await page.getByTestId('btn-elements-back-to-stage').click()
        await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
      } else if (!narrow) {
        await page.getByTestId('btn-toggle-elements-pane').click()
        await expect(page.getByTestId('actor-list-body')).toBeVisible()
        await expect(page.getByTestId('actors-collapse-label')).toHaveText(
          'Close',
        )
        await page.getByTestId('btn-toggle-actor-list').click()
        await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
      }

      await openDockMore(page)
      await page.getByTestId('btn-timing').click()
      await expect(page.getByTestId('timing-dialog')).toBeVisible()

      await page.getByTestId('btn-timing-cancel').click()
      await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
      await expect(page.getByTestId('btn-dock-more')).toBeFocused()
      expect(await topTestIdAtCenter(page, 'btn-play')).toBe('btn-play')

      await openDockMore(page)
      await page.getByTestId('btn-timing').click()
      await expect(page.getByTestId('timing-dialog')).toBeVisible()
      await page.getByTestId('btn-timing-cancel').click()

      if (!narrow) {
        await page.getByTestId('btn-toggle-elements-pane').click()
        await expect(page.getByTestId('actor-list-body')).toBeVisible()
        await page.getByTestId('btn-toggle-actor-list').click()
        await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
        await expect(page.getByTestId('btn-dock-more')).toBeVisible()
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

      await expect(page.getByTestId('btn-dock-more')).toBeVisible()

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

      expect(await topTestIdAtCenter(page, 'btn-fit-stage')).toBe('btn-fit-stage')
    })
  }

  test('390x560: Timing dialog applies; stage and Play stay reachable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('timing-element-name')).toBeVisible()
    await expect(page.getByTestId('timing-preview')).toBeVisible()

    await page.getByTestId('clip-start-input').fill('0.20')
    await page.getByTestId('clip-move-for-input').fill('0.80')
    await page.getByTestId('btn-apply-clip-times').evaluate((el) => {
      ;(el as HTMLButtonElement).click()
    })
    await expect(page.getByTestId('clip-times-error')).toHaveCount(0)
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    await expect(page.getByTestId('btn-dock-more')).toBeFocused()
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('clip-start-input')).toHaveValue('0.20')
    await expect(page.getByTestId('clip-move-for-input')).toHaveValue('0.80')
    await page.getByTestId('btn-timing-cancel').click()
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    await expect(page.getByTestId('btn-dock-more')).toBeFocused()
    await expect(page.getByTestId('snap-to-grid-toggle')).toBeVisible()
    await expect(page.getByTestId('btn-edit-path')).toBeVisible()
    expect(await topTestIdAtCenter(page, 'btn-play')).toBe('btn-play')
    expect(await topTestIdAtCenter(page, 'btn-fit-stage')).toBe('btn-fit-stage')
    await assertClickableInClip(page, 'snap-to-grid-toggle', 'playback-dock')
  })

  /**
   * True when the control’s center lies inside `clipTestId` and elementFromPoint
   * resolves to that control (not a covering sibling).
   */
  async function assertClickableInClip(
    page: Page,
    testId: string,
    clipTestId: string,
  ) {
    const result = await page.evaluate(
      ({ id, clipId }) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        const clip = document.querySelector(`[data-testid="${clipId}"]`)
        if (!(el instanceof HTMLElement) || !(clip instanceof HTMLElement)) {
          return { ok: false, reason: 'missing' }
        }
        const er = el.getBoundingClientRect()
        const cr = clip.getBoundingClientRect()
        if (er.width < 4 || er.height < 4) return { ok: false, reason: 'zero-size' }
        const cx = er.left + er.width / 2
        const cy = er.top + er.height / 2
        const insideClip =
          cx >= cr.left - 1 &&
          cx <= cr.right + 1 &&
          cy >= cr.top - 1 &&
          cy <= cr.bottom + 1
        if (!insideClip) return { ok: false, reason: 'outside-clip' }
        const top = document.elementFromPoint(cx, cy)
        if (!(top instanceof Element)) return { ok: false, reason: 'no-hit' }
        const hit =
          el === top ||
          el.contains(top) ||
          top.closest(`[data-testid="${id}"]`) === el
        return { ok: hit, reason: hit ? 'ok' : 'covered' }
      },
      { id: testId, clipId: clipTestId },
    )
    expect(result, `${testId} in ${clipTestId}: ${result.reason}`).toMatchObject({
      ok: true,
    })
  }

  for (const viewport of [
    { width: 1280, height: 800, label: 'desktop 1280x800' },
    { width: 390, height: 844, label: 'phone 390x844' },
    { width: 390, height: 560, label: 'short 390x560' },
  ]) {
    test(`${viewport.label}: Timing dialog fits and scrolls; dock stays hittable`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      await ensureClipTimesOpen(page)
      await expect(page.getByTestId('timing-dialog')).toBeVisible()
      await expect(page.getByTestId('timing-element-name')).toBeVisible()
      await expect(page.getByTestId('timing-preview')).toBeVisible()
      await expect(page.getByTestId('clip-start-input')).toBeVisible()
      await expect(page.getByTestId('clip-move-for-input')).toBeVisible()
      await expect(page.getByTestId('btn-apply-clip-times')).toBeVisible()

      const chrome = await page.evaluate(() => {
        const dialog = document.querySelector('[data-testid="timing-dialog"]')
        const title = document.querySelector('[data-testid="timing-dialog-title"]')
        const preview = document.querySelector('[data-testid="timing-preview"]')
        if (
          !(dialog instanceof HTMLElement) ||
          !(title instanceof HTMLElement) ||
          !(preview instanceof HTMLElement)
        ) {
          return { ok: false, reason: 'missing' }
        }
        const dr = dialog.getBoundingClientRect()
        const vh = window.innerHeight
        const vw = window.innerWidth
        return {
          ok:
            dr.height > 0 &&
            dr.top >= -2 &&
            dr.bottom <= vh + 2 &&
            dr.left >= -2 &&
            dr.right <= vw + 2,
          reason: 'ok',
          dialogHeight: Math.round(dr.height),
        }
      })
      expect(chrome, chrome.reason).toMatchObject({ ok: true })

      await page.getByTestId('btn-timing-cancel').click()
      await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
      await expect(page.getByTestId('btn-dock-more')).toBeFocused()
      await assertClickableInClip(page, 'btn-play', 'toolbar-slot')
      await assertClickableInClip(page, 'btn-record', 'toolbar-slot')
      await assertUnclippedClickable(page, 'btn-dock-more')
      await assertUnclippedClickable(page, 'btn-edit-path')
      // Timing lives in More — reopen proves it stays actionable.
      await openDockMore(page)
      const timingBtn = page.getByTestId('btn-timing')
      await expect(timingBtn).toBeVisible()
      await expect(timingBtn).toBeEnabled()
      await timingBtn.click()
      await expect(page.getByTestId('timing-dialog')).toBeVisible()
      await page.getByTestId('btn-timing-cancel').click()
      await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    })
  }

  test('canvas-first desktop: Elements and Inspector float without resizing the stage cell', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)

    await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
    await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
    const closed = await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="stage-viewport"]')
      return cell instanceof HTMLElement
        ? Math.round(cell.getBoundingClientRect().width)
        : 0
    })
    expect(closed).toBeGreaterThan(1000)

    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-close-inspector')).toBeVisible()
    const withInspector = await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="stage-viewport"]')
      return cell instanceof HTMLElement
        ? Math.round(cell.getBoundingClientRect().width)
        : 0
    })
    expect(Math.abs(withInspector - closed)).toBeLessThan(8)
    await page.getByTestId('btn-close-inspector').click()
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0)

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list-slot')).toBeVisible()
    const withElements = await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="stage-viewport"]')
      return cell instanceof HTMLElement
        ? Math.round(cell.getBoundingClientRect().width)
        : 0
    })
    expect(Math.abs(withElements - closed)).toBeLessThan(8)
    await page.getByTestId('btn-toggle-actor-list').click()
    await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
    const restored = await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="stage-viewport"]')
      return cell instanceof HTMLElement
        ? Math.round(cell.getBoundingClientRect().width)
        : 0
    })
    expect(Math.abs(restored - closed)).toBeLessThan(8)
  })

  test('desktop: Inspector + Timing dialog leave a useful drawing stage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)

    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await ensureClipTimesOpen(page)
    await expect(page.getByTestId('timing-dialog')).toBeVisible()
    await expect(page.getByTestId('clip-times-section')).toBeVisible()

    const measure = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="stage-viewport"]')
      const dialog = document.querySelector('[data-testid="timing-dialog"]')
      if (!(stage instanceof HTMLElement) || !(dialog instanceof HTMLElement)) {
        return null
      }
      const sr = stage.getBoundingClientRect()
      const dr = dialog.getBoundingClientRect()
      return {
        stageH: Math.round(sr.height),
        stageW: Math.round(sr.width),
        dialogH: Math.round(dr.height),
      }
    })
    expect(measure).toBeTruthy()
    // Stage stays tall — Timing is a compact dialog, not a reserved panel.
    expect(measure!.stageH).toBeGreaterThan(400)
    expect(measure!.stageW).toBeGreaterThan(700)
    expect(measure!.dialogH).toBeLessThanOrEqual(520)
    await page.getByTestId('btn-timing-cancel').click()
    await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
    expect(await topTestIdAtCenter(page, 'btn-play')).toBe('btn-play')
    expect(await topTestIdAtCenter(page, 'btn-record')).toBe('btn-record')
  })

  test('reduced layout 640×400: focused sheets, not three squeezed columns', async ({
    page,
  }) => {
    // Layout viewport of a 1280×800 window at 200% browser zoom.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await ensureEditor(page)
    await recordSimplePath(page)
    await page.setViewportSize({ width: 640, height: 400 })
    await page.waitForFunction(() => window.innerWidth === 640)

    await expect(page.getByTestId('btn-toggle-inspector-pane')).toBeVisible()
    // Below md: inspector is not mounted until the sheet opens.
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
    await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)

    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-inspector-back-to-stage')).toBeVisible()
    await assertClickableInClip(page, 'btn-inspector-style', 'inspector-panel')
    await assertClickableInClip(page, 'btn-inspector-motion', 'inspector-panel')
    await assertClickableInClip(page, 'btn-inspector-project', 'inspector-panel')

    await page.getByTestId('btn-inspector-back-to-stage').click()
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
    await assertClickableInClip(page, 'btn-play', 'toolbar-slot')
    await assertClickableInClip(page, 'btn-record', 'toolbar-slot')
    await assertClickableInClip(page, 'btn-export', 'editor-header')

    const layout = await page.evaluate(() => {
      const root = document.documentElement
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        pageOverflowX: root.scrollWidth > root.clientWidth + 1,
        shellOverflowX: (() => {
          const shell = document.querySelector('[data-testid="app-shell"]')
          return shell instanceof HTMLElement
            ? shell.scrollWidth > shell.clientWidth + 1
            : true
        })(),
      }
    })
    expect(layout.innerWidth).toBe(640)
    expect(layout.innerHeight).toBe(400)
    expect(layout.pageOverflowX).toBe(false)
    expect(layout.shellOverflowX).toBe(false)
  })

  for (const size of [
    { width: 853, height: 533, label: 'reduced layout 853×533 (150% of 1280×800)' },
    { width: 640, height: 400, label: 'reduced layout 640×400 (200% of 1280×800)' },
  ]) {
    test(`${size.label}: primary controls stay hittable in their clips`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)
      await expect(page.getByTestId('btn-dock-more')).toBeVisible()

      await page.setViewportSize({ width: size.width, height: size.height })
      await page.waitForTimeout(120)

      await assertClickableInClip(page, 'btn-play', 'toolbar-slot')
      await assertClickableInClip(page, 'btn-record', 'toolbar-slot')
      await assertClickableInClip(page, 'btn-export', 'editor-header')
      await assertUnclippedClickable(page, 'btn-dock-more')
      await assertUnclippedClickable(page, 'btn-edit-path')
      // Record / Play / Edit path / Reset / More / Snap stay on the dock strip.
      await expect(page.getByTestId('snap-to-grid-toggle')).toBeVisible()
      await expect(page.getByTestId('btn-edit-path')).toBeVisible()
      await expect(page.getByTestId('btn-reset')).toBeVisible()
      await assertClickableInClip(page, 'snap-to-grid-toggle', 'toolbar-slot')
      await assertClickableInClip(page, 'btn-edit-path', 'toolbar-slot')
      await assertClickableInClip(page, 'btn-reset', 'toolbar-slot')
      await openDockMore(page)
      await assertUnclippedClickable(page, 'btn-timing')
      await page.keyboard.press('Escape')

      const dims = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        pageOverflowX:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      }))
      expect(dims.innerWidth).toBe(size.width)
      expect(dims.innerHeight).toBe(size.height)
      expect(dims.pageOverflowX).toBe(false)
    })
  }

  for (const viewport of [
    { width: 1280, height: 800, label: 'resized-viewport desktop 1280x800' },
    { width: 390, height: 844, label: 'resized-viewport phone 390x844' },
    { width: 390, height: 560, label: 'resized-viewport short 390x560' },
  ]) {
    test(`${viewport.label}: no nested dock scroll; primary + More actions unclipped`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })
      await page.goto('/')
      await ensureEditor(page)
      await recordSimplePath(page)

      const nested = await page.evaluate(() => {
        const transport = document.querySelector('[data-testid="dock-transport"]')
        const editing = document.querySelector('[data-testid="dock-editing"]')
        const check = (el: Element | null) => {
          if (!(el instanceof HTMLElement)) return { overflowX: false, scroll: false }
          const style = getComputedStyle(el)
          return {
            overflowX: /auto|scroll/.test(style.overflowX),
            scroll: el.scrollWidth > el.clientWidth + 1,
          }
        }
        return {
          transport: check(transport),
          editing: check(editing),
          left: check(transport?.children[0] ?? null),
          right: check(transport?.children[2] ?? null),
        }
      })
      expect(nested.left.overflowX || nested.left.scroll).toBe(false)
      expect(nested.right.overflowX || nested.right.scroll).toBe(false)
      expect(nested.editing.overflowX || nested.editing.scroll).toBe(false)

      for (const id of [
        'btn-record',
        'btn-play',
        'btn-edit-path',
        'btn-reset',
        'btn-dock-more',
        'snap-to-grid-toggle',
      ] as const) {
        await assertUnclippedClickable(page, id)
      }

      const historyOnStrip = viewport.width >= 768
      if (historyOnStrip) {
        for (const id of [
          'btn-restart',
          'btn-undo-transform',
          'btn-redo-transform',
        ] as const) {
          await assertUnclippedClickable(page, id)
        }
      }

      await openDockMore(page)
      for (const id of [
        'btn-continue-path',
        'btn-timing',
        'btn-refine-motion',
      ] as const) {
        await assertUnclippedClickable(page, id)
      }
      if (!historyOnStrip) {
        for (const id of [
          'btn-restart',
          'btn-undo-transform',
          'btn-redo-transform',
        ] as const) {
          await assertUnclippedClickable(page, id)
        }
      }
      await page.keyboard.press('Escape')

      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('dock-status')).toBeAttached()
      await expect(page.getByTestId('mode-status-instruction')).toBeAttached()
      await expect(page.getByTestId('mode-status-instruction')).not.toContainText(
        '[ ] cycle',
      )
      await expect(page.getByTestId('mode-status-instruction')).toContainText(
        '[ and ] move between points',
      )
      const guidance = await page.evaluate(() => {
        const statusSlot = document.querySelector(
          '[data-testid="dock-status-slot"]',
        )
        const help = document.querySelector('[data-testid="snap-to-grid-help"]')
        const snap = document.querySelector('[data-testid="snap-to-grid-toggle"]')
        const slot = document.querySelector('[data-testid="toolbar-slot"]')
        const toolbar = document.querySelector('[data-testid="toolbar"]')
        if (
          !(statusSlot instanceof HTMLElement) ||
          !(help instanceof HTMLElement) ||
          !(snap instanceof HTMLElement) ||
          !(slot instanceof HTMLElement) ||
          !(toolbar instanceof HTMLElement)
        ) {
          return { ok: false, reason: 'missing' }
        }
        const sr = slot.getBoundingClientRect()
        const tr = toolbar.getBoundingClientRect()
        const snapR = snap.getBoundingClientRect()
        const hr = help.getBoundingClientRect()
        const statusVis =
          statusSlot.getBoundingClientRect().width > 2 &&
          statusSlot.getBoundingClientRect().height > 2 &&
          !statusSlot.classList.contains('sr-only')
        const helpVisible = hr.width > 2 && hr.height > 2
        return {
          ok:
            !statusVis &&
            !helpVisible &&
            tr.bottom <= sr.bottom + 1 &&
            snapR.bottom <= sr.bottom + 1 &&
            snapR.width >= 24 &&
            snapR.height >= 24,
          reason: 'ok',
          toolbarFits: tr.bottom <= sr.bottom + 1,
        }
      })
      expect(guidance, guidance.reason).toMatchObject({ ok: true })
      await assertUnclippedClickable(page, 'btn-done-edit')
      await assertUnclippedClickable(page, 'btn-edit-more')
      await assertUnclippedClickable(page, 'snap-to-grid-toggle')
      await expect(page.getByTestId('btn-help')).toHaveAttribute(
        'aria-label',
        'Help',
      )
    })
  }

  for (const size of [
    { width: 390, height: 844, label: 'phone 390×844' },
    { width: 320, height: 844, label: 'narrow 320×844' },
    { width: 390, height: 560, label: 'short 390×560' },
  ] as const) {
    test(`${size.label}: Play and Edit path bounds do not overlap; Edit left edge clicks Edit`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)
      await recordSimplePath(page)

      const measure = await page.evaluate(() => {
        const play = document
          .querySelector('[data-testid="btn-play"]')
          ?.getBoundingClientRect()
        const edit = document
          .querySelector('[data-testid="btn-edit-path"]')
          ?.getBoundingClientRect()
        if (!play || !edit) return { ok: false, reason: 'missing' as const }
        const overlap = !(
          play.right <= edit.left ||
          edit.right <= play.left ||
          play.bottom <= edit.top ||
          edit.bottom <= play.top
        )
        const top = document.elementFromPoint(
          edit.left + 3,
          edit.top + edit.height / 2,
        )
        const hit =
          top instanceof Element
            ? top.closest('[data-testid]')?.getAttribute('data-testid')
            : null
        return {
          ok: !overlap && hit === 'btn-edit-path',
          reason: overlap
            ? `overlap:${Math.round(play.right - edit.left)}`
            : hit !== 'btn-edit-path'
              ? `hit:${hit}`
              : ('ok' as const),
          gap: Math.round(edit.left - play.right),
        }
      })
      expect(measure, measure.reason).toMatchObject({ ok: true })

      // Normal click on Edit path’s left edge must enter edit mode (not Play).
      const edit = page.getByTestId('btn-edit-path')
      const box = await edit.boundingBox()
      expect(box).toBeTruthy()
      await page.mouse.click(box!.x + 4, box!.y + box!.height / 2)
      await expect(page.getByTestId('btn-done-edit')).toBeVisible()
      await expect(page.getByTestId('btn-play')).toHaveCount(0)
    })
  }

  for (const size of [
    { width: 850, height: 800, label: '850×800' },
    { width: 900, height: 800, label: '900×800' },
    { width: 950, height: 800, label: '950×800' },
    { width: 900, height: 560, label: '900×560 short' },
  ] as const) {
    test(`${size.label}: Record/Play/Edit path/Reset stay clear with Inspector open or closed`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await ensureEditor(page)
      await recordSimplePath(page)
      await closeOpenChromePanels(page)

      for (const inspectorOpen of [false, true] as const) {
        const toggle = page.getByTestId('btn-toggle-inspector-pane')
        const pressed = await toggle.getAttribute('aria-pressed')
        if (inspectorOpen && pressed !== 'true') await toggle.click()
        if (!inspectorOpen && pressed === 'true') await toggle.click()

        // Short height uses a focused Inspector sheet — confirm it opens, then
        // return to stage so Record/Play/Edit/Reset are the surface under test.
        const focusedInspector = await page
          .getByTestId('btn-inspector-back-to-stage')
          .isVisible()
          .catch(() => false)
        if (focusedInspector) {
          await expect(page.getByTestId('inspector-panel')).toBeVisible()
          await page.getByTestId('btn-inspector-back-to-stage').click()
          await expect(page.getByTestId('btn-play')).toBeVisible()
        } else if (inspectorOpen) {
          await expect(page.getByTestId('inspector-panel')).toBeVisible()
        }

        for (const id of [
          'btn-record',
          'btn-play',
          'btn-edit-path',
          'btn-reset',
        ] as const) {
          await assertClickableInClip(page, id, 'toolbar-slot')
          await assertUnclippedClickable(page, id)
        }

        const measure = await page.evaluate(() => {
          const play = document
            .querySelector('[data-testid="btn-play"]')
            ?.getBoundingClientRect()
          const edit = document
            .querySelector('[data-testid="btn-edit-path"]')
            ?.getBoundingClientRect()
          if (!play || !edit) return { ok: false, reason: 'missing' as const }
          const overlap = !(
            play.right <= edit.left ||
            edit.right <= play.left ||
            play.bottom <= edit.top ||
            edit.bottom <= play.top
          )
          return {
            ok: !overlap,
            reason: overlap
              ? `overlap:${Math.round(play.right - edit.left)}`
              : ('ok' as const),
            gap: Math.round(edit.left - play.right),
            editLabel:
              (
                document.querySelector(
                  '[data-testid="btn-edit-path"]',
                ) as HTMLElement | null
              )?.innerText?.trim() ?? '',
          }
        })
        expect(
          measure,
          `${inspectorOpen ? 'insp-open' : 'insp-closed'}: ${measure.reason}`,
        ).toMatchObject({ ok: true })
        // Readable label — do not collapse to icon-only at these widths.
        expect(measure.editLabel.length).toBeGreaterThan(0)
      }
    })
  }

  for (const size of [
    { width: 1280, height: 800, label: '1280 both panels' },
    { width: 900, height: 800, label: '900 both panels' },
    { width: 500, height: 800, label: '500 inspector sheet' },
  ] as const) {
    test(`${size.label}: Play/Edit do not overlap; Inspector chrome stays clickable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await page.evaluate(() => {
        try {
          sessionStorage.clear()
          localStorage.clear()
        } catch {
          /* ignore */
        }
      })
      await page.reload()
      await ensureEditor(page)
      const firstUse = page.getByTestId('btn-dismiss-first-use')
      if (await firstUse.isVisible().catch(() => false)) await firstUse.click()
      await recordSimplePath(page)
      await closeOpenChromePanels(page)

      const insp = page.getByTestId('btn-toggle-inspector-pane')
      if ((await insp.getAttribute('aria-pressed')) !== 'true') await insp.click()
      await expect(page.getByTestId('inspector-panel')).toBeVisible()

      const focused = await page
        .getByTestId('btn-inspector-back-to-stage')
        .isVisible()
        .catch(() => false)

      if (!focused) {
        const elements = page.getByTestId('btn-toggle-elements-pane')
        if ((await elements.getAttribute('aria-pressed')) !== 'true') {
          await elements.click()
        }
        await expect(page.getByTestId('actor-list-slot')).toBeVisible()
      }

      const measure = await page.evaluate(() => {
        const play = document
          .querySelector('[data-testid="btn-play"]')
          ?.getBoundingClientRect()
        const edit = document
          .querySelector('[data-testid="btn-edit-path"]')
          ?.getBoundingClientRect()
        if (!play || !edit) return { ok: false, reason: 'missing' as const }
        const overlap = !(
          play.right <= edit.left + 0.5 ||
          edit.right <= play.left + 0.5 ||
          play.bottom <= edit.top + 0.5 ||
          edit.bottom <= play.top + 0.5
        )
        const top = document.elementFromPoint(
          edit.left + edit.width / 2,
          edit.top + edit.height / 2,
        )
        const hit =
          top instanceof Element
            ? top.closest('[data-testid]')?.getAttribute('data-testid')
            : null
        return {
          ok: !overlap && hit === 'btn-edit-path',
          reason: overlap
            ? `overlap:${Math.round(play.right - edit.left)}`
            : hit !== 'btn-edit-path'
              ? `hit:${hit}`
              : ('ok' as const),
        }
      })
      expect(measure, measure.reason).toMatchObject({ ok: true })

      for (const id of [
        'btn-record',
        'btn-play',
        'btn-edit-path',
        'btn-reset',
        'snap-to-grid-toggle',
      ] as const) {
        await assertUnclippedClickable(page, id)
      }

      await assertUnclippedClickable(page, 'btn-inspector-style')
      await assertUnclippedClickable(page, 'btn-inspector-motion')
      await assertUnclippedClickable(page, 'btn-inspector-project')
      // Full labels — do not truncate Style / Motion / Project to fit Close.
      await expect(page.getByTestId('btn-inspector-style')).toHaveText('Style')
      await expect(page.getByTestId('btn-inspector-motion')).toHaveText('Motion')
      await expect(page.getByTestId('btn-inspector-project')).toHaveText(
        'Project',
      )
      const tabOverflow = await page.evaluate(() => {
        for (const id of [
          'btn-inspector-style',
          'btn-inspector-motion',
          'btn-inspector-project',
        ] as const) {
          const el = document.querySelector(`[data-testid="${id}"]`)
          if (!(el instanceof HTMLElement)) return id
          if (el.scrollWidth > el.clientWidth + 1) return id
        }
        return null
      })
      expect(tabOverflow, 'Inspector tab labels must not overflow').toBeNull()
      if (focused) {
        await assertUnclippedClickable(page, 'btn-inspector-back-to-stage')
        await page.getByTestId('btn-inspector-back-to-stage').click()
        await expect(page.getByTestId('btn-play')).toBeVisible()
      } else {
        await assertUnclippedClickable(page, 'btn-close-inspector')
        await page.getByTestId('btn-close-inspector').click()
        await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
      }

      // Undo remains reachable — either on the strip or under More.
      const undo = page.getByTestId('btn-undo-transform')
      if (await undo.isVisible().catch(() => false)) {
        await assertUnclippedClickable(page, 'btn-undo-transform')
      } else {
        await openDockMore(page)
        await assertUnclippedClickable(page, 'btn-undo-transform')
      }
    })
  }

  test('390×560: Inspector opens with Stage return and reachable tabs', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/')
    await page.evaluate(() => {
      try {
        sessionStorage.clear()
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
    await page.reload()
    await ensureEditor(page)
    const firstUse = page.getByTestId('btn-dismiss-first-use')
    if (await firstUse.isVisible().catch(() => false)) await firstUse.click()
    await recordSimplePath(page)

    const toggle = page.getByTestId('btn-toggle-inspector-pane')
    await assertUnclippedClickable(page, 'btn-toggle-inspector-pane')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-inspector-back-to-stage')).toBeVisible()
    await assertUnclippedClickable(page, 'btn-inspector-back-to-stage')
    await assertUnclippedClickable(page, 'btn-inspector-style')
    await assertUnclippedClickable(page, 'btn-inspector-motion')
    await assertUnclippedClickable(page, 'btn-inspector-project')
    await page.getByTestId('btn-inspector-motion').click()
    await expect(page.getByTestId('inspector-motion-body')).toBeVisible()
    await page.getByTestId('btn-inspector-back-to-stage').click()
    await expect(page.getByTestId('btn-play')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  for (const size of [
    { width: 1280, height: 800, label: '1280 both cards' },
    { width: 900, height: 800, label: '900 both cards' },
    { width: 390, height: 560, label: '390×560 sheet' },
  ] as const) {
    test(`${size.label}: full Elements list scrolls; chrome stays reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await page.evaluate(() => {
        try {
          sessionStorage.clear()
          localStorage.clear()
        } catch {
          /* ignore */
        }
      })
      await page.reload()
      await ensureEditor(page)
      const firstUse = page.getByTestId('btn-dismiss-first-use')
      if (await firstUse.isVisible().catch(() => false)) await firstUse.click()
      await recordSimplePath(page)
      await closeOpenChromePanels(page)

      const cameraBefore = await page.evaluate(() => {
        const zoom = document
          .querySelector('[data-testid="zoom-percent"]')
          ?.textContent?.trim()
        const world = document.querySelector(
          '[data-testid="workspace-world"]',
        ) as HTMLElement | null
        const stage = document.querySelector('[data-testid="stage-viewport"]')
        return {
          zoom,
          transform: world?.style.transform ?? '',
          stageW:
            stage instanceof HTMLElement
              ? Math.round(stage.getBoundingClientRect().width)
              : 0,
        }
      })

      await ensureActorListExpanded(page)
      // Fill to the hard 8-element capacity.
      for (let i = 0; i < 7; i++) await clickAddActor(page)
      let ids = await actorIdsFromList(page)
      expect(ids).toHaveLength(8)
      await expect(page.getByTestId('actor-list')).toContainText('8/8')
      await expect(page.getByTestId('btn-add-actor')).toBeDisabled()
      await expect(page.getByTestId('btn-duplicate-actor')).toBeDisabled()

      const focused = await page
        .getByTestId('btn-elements-back-to-stage')
        .isVisible()
        .catch(() => false)

      if (!focused) {
        const insp = page.getByTestId('btn-toggle-inspector-pane')
        if ((await insp.getAttribute('aria-pressed')) !== 'true') {
          await insp.click()
        }
        await expect(page.getByTestId('inspector-panel')).toBeVisible()
        await assertUnclippedClickable(page, 'btn-close-inspector')
      } else {
        await assertUnclippedClickable(page, 'btn-elements-back-to-stage')
      }

      // Title / count / Close stay available while the list scrolls.
      await assertUnclippedClickable(page, 'btn-toggle-actor-list')
      await expect(page.getByTestId('actors-collapse-label')).toBeVisible()

      const firstItem = page.getByTestId(`actor-list-item-${ids[0]}`)
      const lastItem = page.getByTestId(`actor-list-item-${ids[7]}`)
      await lastItem.evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await assertUnclippedClickable(page, `actor-list-item-${ids[7]}`)
      await lastItem.click()
      await expect(lastItem).toHaveAttribute('data-selected', 'true')

      await firstItem.evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await assertUnclippedClickable(page, `actor-list-item-${ids[0]}`)
      await firstItem.click()
      await expect(firstItem).toHaveAttribute('data-selected', 'true')

      const name = page.getByTestId('actor-name-input')
      await name.click()
      await name.fill('Alpha')
      await name.press('Enter')
      await expect(firstItem).toContainText('Alpha')

      const reorderDown = page.getByTestId('btn-actor-reorder-down')
      await reorderDown.evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await assertUnclippedClickable(page, 'btn-actor-reorder-down')
      await reorderDown.click()
      ids = await actorIdsFromList(page)
      expect(ids[1]).toBeTruthy()
      await expect(page.getByTestId(`actor-list-item-${ids[1]}`)).toContainText(
        'Alpha',
      )

      await selectActorByIndex(page, 7)
      const del = page.getByTestId('btn-delete-actor')
      await del.evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await del.click()
      await respondToConfirm(page, {
        dialogTestId: 'delete-actor-confirm',
        confirmTestId: 'btn-delete-actor-confirm',
        cancelTestId: 'btn-delete-actor-cancel',
      })
      ids = await actorIdsFromList(page)
      expect(ids).toHaveLength(7)
      await expect(page.getByTestId('actor-list')).toContainText('7/8')
      const dup = page.getByTestId('btn-duplicate-actor')
      await dup.evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
      await expect(dup).toBeEnabled()
      await dup.click()
      ids = await actorIdsFromList(page)
      expect(ids).toHaveLength(8)
      await expect(page.getByTestId('btn-add-actor')).toBeDisabled()

      // Keyboard: Close (desktop) or Stage back (phone) via focus + Enter.
      if (focused) {
        const back = page.getByTestId('btn-elements-back-to-stage')
        await back.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('actor-list-body')).toHaveCount(0)
        await expect(page.getByTestId('btn-play')).toBeVisible()
        await assertUnclippedClickable(page, 'btn-play')
      } else {
        await assertUnclippedClickable(page, 'btn-toggle-actor-list')
        await page.getByTestId('btn-toggle-actor-list').focus()
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
        await assertUnclippedClickable(page, 'btn-play')
        await assertUnclippedClickable(page, 'btn-fit-stage')
        if (
          (await page
            .getByTestId('btn-toggle-inspector-pane')
            .getAttribute('aria-pressed')) === 'true'
        ) {
          await page.getByTestId('btn-close-inspector').click()
        }
      }

      const cameraAfter = await page.evaluate(() => {
        const zoom = document
          .querySelector('[data-testid="zoom-percent"]')
          ?.textContent?.trim()
        const world = document.querySelector(
          '[data-testid="workspace-world"]',
        ) as HTMLElement | null
        const stage = document.querySelector('[data-testid="stage-viewport"]')
        return {
          zoom,
          transform: world?.style.transform ?? '',
          stageW:
            stage instanceof HTMLElement
              ? Math.round(stage.getBoundingClientRect().width)
              : 0,
        }
      })
      expect(cameraAfter.zoom).toBe(cameraBefore.zoom)
      expect(cameraAfter.transform).toBe(cameraBefore.transform)
      if (!focused) {
        expect(Math.abs(cameraAfter.stageW - cameraBefore.stageW)).toBeLessThan(
          8,
        )
      }
    })
  }

  test('1280 Inspector open: Fit keeps the stage clear of the floating card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.evaluate(() => {
      try {
        sessionStorage.clear()
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
    await page.reload()
    await ensureEditor(page)
    const firstUse = page.getByTestId('btn-dismiss-first-use')
    if (await firstUse.isVisible().catch(() => false)) await firstUse.click()
    await recordSimplePath(page)

    const camBeforeOpen = await page.evaluate(() => {
      const world = document.querySelector(
        '[data-testid="workspace-world"]',
      ) as HTMLElement | null
      return world?.style.transform ?? ''
    })

    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('inspector-slot')).toBeVisible()

    const camAfterOpen = await page.evaluate(() => {
      const world = document.querySelector(
        '[data-testid="workspace-world"]',
      ) as HTMLElement | null
      return world?.style.transform ?? ''
    })
    // Opening a card must not auto pan/zoom.
    expect(camAfterOpen).toBe(camBeforeOpen)

    await assertUnclippedClickable(page, 'btn-fit-stage')
    await page.getByTestId('btn-fit-stage').click()
    await page.waitForTimeout(120)

    const clearance = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="stage-frame"]')
      const slot = document.querySelector('[data-testid="inspector-slot"]')
      if (!(stage instanceof HTMLElement) || !(slot instanceof HTMLElement)) {
        return { ok: false, overlap: 0 }
      }
      const sr = stage.getBoundingClientRect()
      const ir = slot.getBoundingClientRect()
      const overlap = Math.max(
        0,
        Math.min(sr.right, ir.right) - Math.max(sr.left, ir.left),
      )
      // Allow 1px antialias; stage right edge should stay left of the card.
      return {
        ok: sr.right <= ir.left + 1,
        overlap,
        stageRight: sr.right,
        cardLeft: ir.left,
      }
    })
    expect(clearance.ok, JSON.stringify(clearance)).toBe(true)

    // Recording / Edit path still map through the fitted stage-frame.
    await page.getByTestId('btn-close-inspector').click()
    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('btn-done-edit')).toBeVisible()
    await page.getByTestId('btn-done-edit').click()
    await expect(page.getByTestId('btn-edit-path')).toBeVisible()
  })

  test('900 both cards: Fit clears Elements and Inspector; open/close preserves camera', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await page.goto('/')
    await page.evaluate(() => {
      try {
        sessionStorage.clear()
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
    await page.reload()
    await ensureEditor(page)
    const firstUse = page.getByTestId('btn-dismiss-first-use')
    if (await firstUse.isVisible().catch(() => false)) await firstUse.click()
    await recordSimplePath(page)

    await page.getByTestId('btn-toggle-elements-pane').click()
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('actor-list-slot')).toBeVisible()
    await expect(page.getByTestId('inspector-slot')).toBeVisible()

    const beforeFit = await page.evaluate(() => {
      const world = document.querySelector(
        '[data-testid="workspace-world"]',
      ) as HTMLElement | null
      return world?.style.transform ?? ''
    })

    await page.getByTestId('btn-fit-stage').click()
    await page.waitForTimeout(120)

    const afterFit = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="stage-frame"]')
      const left = document.querySelector('[data-testid="actor-list-slot"]')
      const right = document.querySelector('[data-testid="inspector-slot"]')
      const world = document.querySelector(
        '[data-testid="workspace-world"]',
      ) as HTMLElement | null
      if (
        !(stage instanceof HTMLElement) ||
        !(left instanceof HTMLElement) ||
        !(right instanceof HTMLElement)
      ) {
        return { ok: false, transform: world?.style.transform ?? '' }
      }
      const sr = stage.getBoundingClientRect()
      const lr = left.getBoundingClientRect()
      const rr = right.getBoundingClientRect()
      return {
        ok: sr.left >= lr.right - 1 && sr.right <= rr.left + 1,
        transform: world?.style.transform ?? '',
        stageLeft: sr.left,
        elementsRight: lr.right,
        stageRight: sr.right,
        inspectorLeft: rr.left,
      }
    })
    expect(afterFit.ok, JSON.stringify(afterFit)).toBe(true)
    expect(afterFit.transform).not.toBe(beforeFit)

    // Closing cards must not auto-fit / jump the camera.
    const afterFitTransform = afterFit.transform
    await page.getByTestId('btn-toggle-actor-list').click()
    await page.getByTestId('btn-close-inspector').click()
    const afterClose = await page.evaluate(() => {
      const world = document.querySelector(
        '[data-testid="workspace-world"]',
      ) as HTMLElement | null
      return world?.style.transform ?? ''
    })
    expect(afterClose).toBe(afterFitTransform)

    await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
    await page.getByTestId('btn-edit-path').click()
    await expect(page.getByTestId('btn-done-edit')).toBeVisible()
    await page.getByTestId('btn-done-edit').click()
  })

  test('800 both prefs: focused sheet instead of squeezing both floating cards', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 800 })
    await page.goto('/')
    await page.evaluate(() => {
      try {
        sessionStorage.clear()
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
    await page.reload()
    await ensureEditor(page)
    const firstUse = page.getByTestId('btn-dismiss-first-use')
    if (await firstUse.isVisible().catch(() => false)) await firstUse.click()

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list-slot')).toBeVisible()
    // Second card at this width must switch to focused chrome, not float both.
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
    // Focused sheet reuses inspector-slot; floating marker must stay off.
    await expect(page.getByTestId('stage-viewport')).not.toHaveAttribute(
      'data-inspector-floating',
      'true',
    )
    await expect(page.getByTestId('btn-inspector-back-to-stage')).toBeVisible()
    await expect(page.getByTestId('btn-close-inspector')).toHaveCount(0)
    await page.getByTestId('btn-inspector-back-to-stage').click()
    await expect(page.getByTestId('btn-play')).toBeVisible()
  })

  // Actual browser zoom (chrome.tabs.setZoom) lives in browser-zoom.spec.ts.
  // CSS zoom and viewport resize are not substitutes for that check.
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
