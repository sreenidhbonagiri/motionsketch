import { expect, test, type Page } from '@playwright/test'
import {
  ensureEditor,
  openCssDialog,
  openPanel,
  recordSimplePath,
  expandExportOtherWays,
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
    for (const width of [1280, 390, 320] as const) {
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

  test('Refine stays in-viewport on 500-wide short, 390, and 320', async ({
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
      await expect(tools).toHaveAttribute('data-placement', 'sheet')
      const box = await tools.boundingBox()
      expect(box, `${size.width}x${size.height} box`).toBeTruthy()
      expect(box!.x).toBeGreaterThanOrEqual(8)
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1)
      expect(box!.y).toBeGreaterThanOrEqual(8)
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1)
      // Comfortable edge spacing — not flush against the left edge.
      expect(box!.x).toBeGreaterThan(10)
      await page.keyboard.press('Escape')
      await expect(tools).toHaveCount(0)
    }
  })

  test('mobile 390x844: Refine popover stacks above Actors; Snap indicator syncs', async ({
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
    await expect(page.getByTestId('actor-list-body')).toBeVisible()

    await page.getByTestId('btn-refine-motion').click()
    const tools = page.getByTestId('refine-motion-tools')
    await expect(tools).toBeVisible()

    // Opaque surface — dock chrome must not paint through the popover.
    const surface = await tools.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        bg: style.backgroundColor,
        opacity: style.opacity,
        z: style.zIndex,
      }
    })
    expect(surface.opacity).toBe('1')
    expect(surface.bg).toMatch(/rgba?\(\s*255,\s*255,\s*255/)
    expect(Number(surface.z)).toBeGreaterThanOrEqual(70)

    // Hit-test Polish + Snap centers: Refine must win over Actors / Sequence.
    const snap = page.getByTestId('snap-to-grid-toggle')
    await expect(snap).toBeVisible()
    for (const testId of ['btn-polish-motion', 'snap-to-grid-toggle'] as const) {
      const hit = await page.getByTestId(testId).evaluate((el) => {
        const r = el.getBoundingClientRect()
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        const top = document.elementFromPoint(x, y)
        if (!(top instanceof Element)) return { ok: false, reason: 'no-hit' }
        const inTools = !!top.closest('[data-testid="refine-motion-tools"]')
        const inActors = !!top.closest('[data-testid="actor-list"]')
        const inSequence = !!top.closest('[data-testid="clip-timeline"]')
        return {
          ok: inTools && !inActors && !inSequence,
          reason: inTools
            ? inActors
              ? 'actors'
              : inSequence
                ? 'sequence'
                : 'ok'
            : 'outside-tools',
        }
      })
      expect(hit, `${testId} above Actors/Sequence`).toEqual({
        ok: true,
        reason: 'ok',
      })
    }

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
    await page.getByTestId('btn-refine-motion').click()
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
