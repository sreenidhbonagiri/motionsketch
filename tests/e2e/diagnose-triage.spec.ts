import { test, expect } from '@playwright/test'
import { ensureEditor, recordSimplePath, loadProjectSnapshot } from '../../tests/e2e/helpers'
import { buildPathMoveFixtureJson } from '../../tests/fixtures/pathMoveProject'

function dump(label: string, value: unknown) {
  console.log(`DIAG ${label} ${JSON.stringify(value)}`)
}

test('measure clusters', async ({ page, browserName }) => {
  test.setTimeout(180_000)
  dump('browser', browserName)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await ensureEditor(page)
  const snap = await page.evaluate(() => ({
    refine: document.querySelectorAll('[data-testid="btn-refine-motion"]').length,
    dockEditing: document.querySelectorAll('[data-testid="dock-editing"]').length,
    snap: document.querySelectorAll('[data-testid="snap-to-grid-toggle"]').length,
    snapText: document.querySelector('[data-testid="snap-to-grid-toggle"]')?.textContent ?? null,
  }))
  dump('empty-snap', snap)

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await ensureEditor(page)
  await recordSimplePath(page)
  await page.getByTestId('btn-project').click()
  await expect(page.getByTestId('project-panel-root')).toBeVisible()
  const overlap = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="btn-toggle-actor-list"]')
    const panel = document.querySelector('[data-testid="project-panel-root"]')
    const help = [...document.querySelectorAll('p')].find((p) =>
      (p.textContent ?? '').includes('Width and Height are saved composition units'),
    )
    if (!(btn instanceof HTMLElement) || !(panel instanceof HTMLElement)) return { missing: true }
    const r = btn.getBoundingClientRect()
    const pr = panel.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    const hr = help?.getBoundingClientRect()
    return {
      btn: { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) },
      panel: { t: Math.round(pr.top), b: Math.round(pr.bottom), h: Math.round(pr.height) },
      help: hr ? { t: Math.round(hr.top), b: Math.round(hr.bottom), h: Math.round(hr.height) } : null,
      hit: hit instanceof Element ? hit.closest('[data-testid]')?.getAttribute('data-testid') ?? hit.tagName : null,
      covered: pr.bottom > r.top && pr.left < r.right && pr.right > r.left,
    }
  })
  dump('project-overlap', overlap)

  for (const size of [
    { width: 390, height: 560 },
    { width: 390, height: 844 },
    { width: 850, height: 650 },
  ]) {
    await page.setViewportSize(size)
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
    await ensureEditor(page)
    await recordSimplePath(page)
    const elements = page.getByTestId('btn-toggle-actor-list')
    const timing = page.getByTestId('btn-toggle-clip-timeline')
    if ((await elements.getAttribute('aria-expanded')) !== 'true') await elements.click()
    if ((await timing.getAttribute('aria-expanded')) !== 'true') await timing.click()
    const layout = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel)
        if (!(el instanceof HTMLElement)) return null
        const r = el.getBoundingClientRect()
        return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }
      }
      const shell = document.querySelector('[data-testid="app-shell"]') as HTMLElement | null
      const style = shell ? getComputedStyle(shell) : null
      const help = document.querySelector('[data-testid="actor-list-help"]')
      const list = document.querySelector('[data-testid="actor-list"]')
      let helpVsList: unknown = null
      if (help instanceof HTMLElement && list instanceof HTMLElement) {
        help.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const er = help.getBoundingClientRect()
        const lr = list.getBoundingClientRect()
        helpVsList = {
          help: { t: Math.round(er.top), b: Math.round(er.bottom), h: Math.round(er.height) },
          list: { t: Math.round(lr.top), b: Math.round(lr.bottom), h: Math.round(lr.height) },
          outside:
            er.top < lr.top - 1 ||
            er.bottom > lr.bottom + 1 ||
            er.left < lr.left - 1 ||
            er.right > lr.right + 1,
        }
      }
      const toggle = document.querySelector('[data-testid="btn-toggle-actor-list"]')
      let toggleHit: string | null = null
      if (toggle instanceof HTMLElement) {
        const r = toggle.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        toggleHit =
          top instanceof Element
            ? (top.closest('[data-testid]')?.getAttribute('data-testid') ?? top.tagName)
            : null
      }
      const header = document.querySelector('[data-testid="sequence-header"]')
      const camera = document.querySelector('[data-testid="workspace-camera-bar"]')
      let headerOverlap: string | null = null
      if (header instanceof HTMLElement && camera instanceof HTMLElement) {
        const a = header.getBoundingClientRect()
        const b = camera.getBoundingClientRect()
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        headerOverlap = x > 2 && y > 2 ? `camera ${Math.round(x)}x${Math.round(y)}` : 'camera-clear'
        const listEl = document.querySelector('[data-testid="actor-list"]')
        if (listEl instanceof HTMLElement) {
          const c = listEl.getBoundingClientRect()
          const x2 = Math.min(a.right, c.right) - Math.max(a.left, c.left)
          const y2 = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)
          if (x2 > 2 && y2 > 2) headerOverlap += ` elements ${Math.round(x2)}x${Math.round(y2)}`
        }
      }
      return {
        vars: {
          sheet: style?.getPropertyValue('--ms-sheet-top'),
          reserve: style?.getPropertyValue('--ms-actors-reserve'),
          maxW: style?.getPropertyValue('--ms-actors-max-w'),
        },
        actorBody: box('[data-testid="actor-list-body"]'),
        actorScroller: box('[data-testid="actor-list-body"] .overflow-y-auto'),
        sequenceBody: box('[data-testid="sequence-panel-body"]'),
        sequenceHeader: box('[data-testid="sequence-header"]'),
        dock: box('[data-testid="playback-dock"]'),
        slot: box('[data-testid="toolbar-slot"]'),
        camera: box('[data-testid="workspace-camera-bar"]'),
        helpVsList,
        toggleHit,
        headerOverlap,
      }
    })
    dump(`layout-${size.width}x${size.height}`, layout)
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  await loadProjectSnapshot(page, buildPathMoveFixtureJson())
  await page.getByTestId('btn-edit-path').click()
  await page.getByTestId('btn-path-tool-move').click()
  await expect(page.getByTestId('path-move-overlay')).toBeFocused()
  await page.keyboard.down('ArrowRight')
  const before = await page.evaluate(() => ({
    done: !!document.querySelector('[data-testid="btn-done-edit"]'),
    edit: !!document.querySelector('[data-testid="btn-edit-path"]'),
  }))
  await page.getByTestId('btn-done-edit').click()
  const after = await page.evaluate(() => ({
    done: !!document.querySelector('[data-testid="btn-done-edit"]'),
    edit: !!document.querySelector('[data-testid="btn-edit-path"]'),
    modeText: document.querySelector('[data-testid="btn-done-edit"]')?.textContent ?? null,
  }))
  dump('done-click', { before, after })
  await page.keyboard.up('ArrowRight')

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await ensureEditor(page)
  await recordSimplePath(page)
  const fitBefore = await page.evaluate(() => {
    const fit = document.querySelector('[data-testid="btn-fit-stage"]')
    const header = document.querySelector('header')
    const save = document.querySelector('[data-testid="header-save-status"]')
    const fr = fit?.getBoundingClientRect()
    const hr = header?.getBoundingClientRect()
    return {
      fitY: fr ? Math.round(fr.top) : null,
      headerH: hr ? Math.round(hr.height) : null,
      save: save?.textContent ?? null,
      sheet: getComputedStyle(document.querySelector('[data-testid="app-shell"]')!).getPropertyValue('--ms-sheet-top'),
    }
  })
  await page.getByTestId('btn-play').click()
  await expect(page.getByTestId('btn-pause')).toBeVisible()
  const fitDuring = await page.evaluate(() => {
    const fit = document.querySelector('[data-testid="btn-fit-stage"]')
    const header = document.querySelector('header')
    const save = document.querySelector('[data-testid="header-save-status"]')
    const fr = fit?.getBoundingClientRect()
    const hr = header?.getBoundingClientRect()
    const dock = document.querySelector('[data-testid="playback-dock"]')
    return {
      fitY: fr ? Math.round(fr.top) : null,
      headerH: hr ? Math.round(hr.height) : null,
      save: save?.textContent ?? null,
      sheet: getComputedStyle(document.querySelector('[data-testid="app-shell"]')!).getPropertyValue('--ms-sheet-top'),
      dockH: dock ? Math.round(dock.getBoundingClientRect().height) : null,
      status: [...document.querySelectorAll('[data-testid="playback-dock"] p')].map((p) => p.textContent),
    }
  })
  dump('fit', { before: fitBefore, during: fitDuring, delta: (fitDuring.fitY ?? 0) - (fitBefore.fitY ?? 0) })
})
