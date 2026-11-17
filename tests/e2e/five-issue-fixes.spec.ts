import { expect, test, type Page } from '@playwright/test'
import {
  assertUnclippedClickable,
  ensureEditor,
  recordSimplePath,
} from './helpers'

async function dismissChrome(page: Page) {
  for (const id of ['btn-tutorial-skip', 'btn-dismiss-first-use'] as const) {
    const el = page.getByTestId(id)
    if (await el.isVisible().catch(() => false)) await el.click()
  }
}

async function gotoFresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    try {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('motionsketch.examplesHintDismissed', '1')
    } catch {
      /* ignore */
    }
  })
  await page.reload()
  await ensureEditor(page)
  await dismissChrome(page)
}

const EASING_IDS = [
  'easing-option-linear',
  'easing-option-easeOut',
  'easing-option-easeInOut',
  'easing-option-spring',
  'easing-option-bounce',
] as const

async function openMotionInspector(page: Page) {
  if (!(await page.getByTestId('inspector-panel').isVisible().catch(() => false))) {
    await page.getByTestId('btn-toggle-inspector-pane').click()
  }
  await expect(page.getByTestId('inspector-panel')).toBeVisible()
  await page.getByTestId('btn-inspector-motion').click()
  await expect(page.getByTestId('adjust-panel')).toBeVisible()
}

async function expectInOutOneLine(page: Page) {
  const inOut = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="easing-option-easeInOut"]')
    if (!(el instanceof HTMLElement)) return null
    const label = el.querySelector('span')
    if (!(label instanceof HTMLElement)) return null
    const fs = Number.parseFloat(getComputedStyle(label).fontSize) || 12
    const clientW = label.clientWidth
    const prev = label.style.cssText
    label.style.webkitLineClamp = 'unset'
    label.style.display = 'inline-block'
    label.style.overflow = 'visible'
    label.style.maxHeight = 'none'
    label.style.whiteSpace = 'nowrap'
    const oneLineH = label.scrollHeight
    const oneLineW = label.scrollWidth
    label.style.cssText = prev
    return {
      text: label.textContent?.trim(),
      aria: el.getAttribute('aria-label'),
      fs,
      oneLineH,
      oneLineW,
      clientW,
      fitsOneLine: oneLineH <= fs + 2 && oneLineW <= clientW + 1,
    }
  })
  expect(inOut).toBeTruthy()
  expect(inOut!.text).toBe('In-out')
  expect(inOut!.aria).toBe('Ease in-out')
  expect(inOut!.fs).toBeGreaterThanOrEqual(12)
  expect(inOut!.fitsOneLine, JSON.stringify(inOut)).toBe(true)
}

test.describe('five-issue local fixes', () => {
  async function probePhoneEasing(page: Page) {
    return page.evaluate((ids) => {
      const panel = document.querySelector('[data-testid="inspector-panel"]')
      const stage = document.querySelector('[data-testid="stage-viewport"]')
      const duration = document.querySelector('[data-testid="duration-slider"]')
      if (
        !(panel instanceof HTMLElement) ||
        !(stage instanceof HTMLElement) ||
        !(duration instanceof HTMLElement)
      ) {
        return { ok: false as const, reason: 'missing' }
      }
      const pr = panel.getBoundingClientRect()
      const sr = stage.getBoundingClientRect()
      const dr = duration.getBoundingClientRect()
      const tiles = ids.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!(el instanceof HTMLElement)) return null
        const r = el.getBoundingClientRect()
        const label = el.querySelector('span')
        const labelProbe = label
          ? (() => {
              const fs = Number.parseFloat(getComputedStyle(label).fontSize) || 12
              const clampedW = label.clientWidth
              const prev = label.style.cssText
              label.style.webkitLineClamp = 'unset'
              label.style.display = 'block'
              label.style.overflow = 'visible'
              label.style.maxHeight = 'none'
              const h = label.scrollHeight
              const w = label.scrollWidth
              label.style.cssText = prev
              // Full text within two lines (not merely line-clamp truncated).
              // +2px covers Firefox leading-none scrollHeight vs font-size noise.
              return {
                h,
                w,
                fits: h <= fs * 2 + 2 && w <= clampedW + 1,
              }
            })()
          : null
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const hit = document.elementFromPoint(cx, cy)
        const clickOk =
          hit instanceof Element &&
          (hit === el ||
            el.contains(hit) ||
            hit.closest(`[data-testid="${id}"]`) === el)
        return {
          id,
          top: r.top,
          bottom: r.bottom,
          visible:
            r.bottom <= pr.bottom + 1 &&
            r.top >= pr.top - 1 &&
            r.height > 8 &&
            r.width > 8,
          labelFitsWithoutClamp: labelProbe?.fits === true,
          clickOk,
        }
      })
      return {
        ok: true as const,
        stageH: Math.round(sr.height),
        panelH: Math.round(pr.height),
        durationVisible: dr.bottom <= pr.bottom + 1 && dr.top >= pr.top - 1,
        tiles,
        allTilesVisible: tiles.every((t) => t?.visible),
        allLabelsReadable: tiles.every((t) => t?.labelFitsWithoutClamp),
        allClickable: tiles.every((t) => t?.clickOk),
      }
    }, [...EASING_IDS])
  }

  test('390×560: Duration + five easing choices visible on open; stage usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await gotoFresh(page)
    await recordSimplePath(page)
    await openMotionInspector(page)

    const probe = await probePhoneEasing(page)
    expect(probe.ok, JSON.stringify(probe)).toBe(true)
    if (!probe.ok) return
    expect(probe.stageH, JSON.stringify(probe)).toBeGreaterThan(80)
    expect(probe.durationVisible, JSON.stringify(probe)).toBe(true)
    expect(probe.allTilesVisible, JSON.stringify(probe)).toBe(true)
    expect(probe.allLabelsReadable, JSON.stringify(probe)).toBe(true)
    expect(probe.allClickable, JSON.stringify(probe)).toBe(true)
    await expectInOutOneLine(page)

    for (const id of EASING_IDS) {
      await assertUnclippedClickable(page, id)
    }
    await page.getByTestId('easing-option-easeOut').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Ease out')

    await page.screenshot({
      path: 'tmp/five-issue-review/after-390x560-motion.png',
      fullPage: false,
    })
  })

  test('320×560: all five tiles including Bounce fit and click; labels readable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 560 })
    await gotoFresh(page)
    await recordSimplePath(page)
    await openMotionInspector(page)

    const probe = await probePhoneEasing(page)
    expect(probe.ok, JSON.stringify(probe)).toBe(true)
    if (!probe.ok) return
    expect(probe.durationVisible, JSON.stringify(probe)).toBe(true)
    expect(probe.allTilesVisible, JSON.stringify(probe)).toBe(true)
    expect(probe.allLabelsReadable, JSON.stringify(probe)).toBe(true)
    expect(probe.allClickable, JSON.stringify(probe)).toBe(true)
    await expectInOutOneLine(page)

    for (const id of EASING_IDS) {
      await assertUnclippedClickable(page, id)
    }
    await page.getByTestId('easing-option-bounce').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Bounce')

    await page.screenshot({
      path: 'tmp/five-issue-review/after-320x560-motion.png',
      fullPage: false,
    })
  })

  test('900: rename height stable; click/Enter/Space/save/Escape; status readable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await gotoFresh(page)

    const header = page.getByTestId('editor-header')
    const field = page.getByTestId('project-name-field')
    const rename = page.getByTestId('btn-rename-project')
    const hBefore = await header.evaluate((el) => el.getBoundingClientRect().height)
    const fieldH = await field.evaluate((el) => el.getBoundingClientRect().height)
    expect(fieldH).toBe(24)

    await rename.click()
    const input = page.getByTestId('header-project-name-input')
    await expect(input).toBeFocused()
    const selected = await input.evaluate((el) => {
      if (!(el instanceof HTMLInputElement)) return false
      return el.selectionStart === 0 && el.selectionEnd === el.value.length
    })
    expect(selected).toBe(true)
    const hEditing = await header.evaluate((el) => el.getBoundingClientRect().height)
    const fieldHEditing = await field.evaluate((el) => el.getBoundingClientRect().height)
    expect(Math.abs(hEditing - hBefore)).toBeLessThan(1)
    expect(fieldHEditing).toBe(24)

    // While renaming: saved status is the check icon + full accessible label
    // (not the long "Saved in this browser" visible text).
    const statusWhile = page.getByTestId('header-save-status')
    if (await statusWhile.isVisible().catch(() => false)) {
      const probe = await statusWhile.evaluate((el) => {
        const label = el.getAttribute('aria-label') || el.getAttribute('title') || ''
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
        const svg = el.querySelector('svg')
        const visibleText = [...el.querySelectorAll('span')].some((span) => {
          const cs = getComputedStyle(span)
          if (cs.position === 'absolute' && cs.width === '1px') return false
          if (cs.clipPath?.includes('inset(50%)')) return false
          if (cs.clip === 'rect(0px, 0px, 0px, 0px)') return false
          return span.getClientRects().length > 0 && (span.textContent || '').trim().length > 0
        })
        return {
          label,
          text,
          hasCheck: !!svg,
          visibleText,
        }
      })
      if (/Saved in this browser/i.test(probe.label)) {
        expect(probe.hasCheck, JSON.stringify(probe)).toBe(true)
        expect(probe.visibleText, JSON.stringify(probe)).toBe(false)
        expect(probe.label).toMatch(/Saved in this browser/i)
      }
    }

    await input.fill('Stable rename')
    await input.press('Enter')
    await expect(rename).toHaveText('Stable rename')

    const status = page.getByTestId('header-save-status')
    if (await status.isVisible().catch(() => false)) {
      await assertUnclippedClickable(page, 'header-save-status')
    }

    await rename.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('header-project-name-input')).toBeFocused()
    await page.getByTestId('header-project-name-input').fill('Should cancel')
    await page.keyboard.press('Escape')
    await expect(rename).toHaveText('Stable rename')

    await rename.focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('header-project-name-input')).toBeFocused()
    await page.keyboard.press('Escape')

    await page.screenshot({
      path: 'tmp/five-issue-review/after-900-rename.png',
      fullPage: false,
    })
  })

  test('1280: Export hides Inspector then restores tab/scroll/camera/project', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoFresh(page)
    await recordSimplePath(page)

    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-toggle-inspector-pane')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByTestId('btn-inspector-motion').click()
    await page.getByTestId('easing-option-bounce').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Bounce')

    const before = await page.evaluate(() => {
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
      scroller.scrollTop = Math.min(120, scroller.scrollHeight - scroller.clientHeight)
      const world = document.querySelector('[data-testid="workspace-world"]')
      return {
        tab: panel.getAttribute('data-inspector-tab'),
        scrollTop: scroller.scrollTop,
        transform:
          world instanceof HTMLElement ? world.style.transform : '',
        name: document.querySelector('[data-testid="btn-rename-project"]')
          ?.textContent,
        easing: document.querySelector('[data-testid="easing-value"]')
          ?.textContent,
      }
    })
    expect(before).toBeTruthy()
    expect(before!.scrollTop).toBeGreaterThan(0)

    await page.getByTestId('btn-export').click()
    await expect(page.getByTestId('export-panel-root')).toBeVisible()
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
    await expect(page.getByTestId('btn-toggle-inspector-pane')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.screenshot({
      path: 'tmp/five-issue-review/after-1280-export.png',
      fullPage: false,
    })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('export-panel-root')).toHaveCount(0)
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-export')).toBeFocused()

    const after = await page.evaluate(() => {
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
      return {
        tab: panel.getAttribute('data-inspector-tab'),
        scrollTop: scroller.scrollTop,
        transform:
          world instanceof HTMLElement ? world.style.transform : '',
        name: document.querySelector('[data-testid="btn-rename-project"]')
          ?.textContent,
        easing: document.querySelector('[data-testid="easing-value"]')
          ?.textContent,
      }
    })
    expect(after).toBeTruthy()
    expect(after!.tab).toBe(before!.tab)
    expect(after!.scrollTop).toBe(before!.scrollTop)
    expect(after!.transform).toBe(before!.transform)
    expect(after!.name).toBe(before!.name)
    expect(after!.easing).toBe(before!.easing)
  })

  test('1280 floating Inspector: easing columns follow card width; clicks work', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoFresh(page)
    await recordSimplePath(page)
    await openMotionInspector(page)

    await expectInOutOneLine(page)

    const grid = await page.evaluate((ids) => {
      const picker = document.querySelector('[data-testid="easing-picker"]')
      const options = document.querySelector('[data-testid="easing-options"]')
      if (!(picker instanceof HTMLElement) || !(options instanceof HTMLElement)) {
        return null
      }
      const pr = picker.getBoundingClientRect()
      const tiles = ids.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!(el instanceof HTMLElement)) return null
        const r = el.getBoundingClientRect()
        const label = el.querySelector('span')
        const cs = label ? getComputedStyle(label) : null
        return {
          id,
          top: Math.round(r.top),
          left: Math.round(r.left),
          w: Math.round(r.width),
          h: Math.round(r.height),
          labelFs: cs ? Number.parseFloat(cs.fontSize) : 0,
          labelClientH: label?.clientHeight ?? 0,
          clamped: cs?.webkitLineClamp === '2' || cs?.lineClamp === '2',
          unclampedH: 0,
          labelFitsWithoutClamp: false,
        }
      }).map((t) => {
        if (!t) return t
        const el = document.querySelector(`[data-testid="${t.id}"]`)
        const label = el?.querySelector('span')
        if (!(label instanceof HTMLElement)) return t
        const fs = t.labelFs || 12
        const clampedW = label.clientWidth
        const prev = label.style.cssText
        label.style.webkitLineClamp = 'unset'
        label.style.display = 'block'
        label.style.overflow = 'visible'
        label.style.maxHeight = 'none'
        const unclampedH = label.scrollHeight
        const unclampedW = label.scrollWidth
        label.style.cssText = prev
        return {
          ...t,
          unclampedH,
          // Full label within two lines; +2px for Firefox font metrics.
          labelFitsWithoutClamp:
            unclampedH <= fs * 2 + 2 && unclampedW <= clampedW + 1,
        }
      })
      const tops = [...new Set(tiles.map((t) => t?.top).filter((t) => t != null))]
      return {
        pickerW: Math.round(pr.width),
        rowCount: tops.length,
        tiles,
        labelMinFs: Math.min(...tiles.map((t) => t?.labelFs ?? 99)),
      }
    }, [...EASING_IDS])

    expect(grid).toBeTruthy()
    // ~260px floating card must not use a 5-wide viewport md row.
    expect(grid!.pickerW).toBeLessThan(320)
    expect(grid!.rowCount).toBeGreaterThanOrEqual(2)
    expect(grid!.labelMinFs).toBeGreaterThanOrEqual(12)
    for (const t of grid!.tiles) {
      expect(t?.labelFitsWithoutClamp, JSON.stringify(t)).toBe(true)
      // Full label within two lines at ~12px / leading-none.
      expect((t?.unclampedH ?? 99) / (t?.labelFs ?? 12), JSON.stringify(t)).toBeLessThanOrEqual(
        2.15,
      )
    }

    await assertUnclippedClickable(page, 'easing-option-bounce')
    await page.getByTestId('easing-option-bounce').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Bounce')

    await page.screenshot({
      path: 'tmp/five-issue-review/after-1280-easing.png',
      fullPage: false,
    })
  })

  test('900 both-open Motion: easing tiles clickable without clipping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await gotoFresh(page)
    await recordSimplePath(page)
    await page.getByTestId('btn-toggle-elements-pane').click()
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('editor-workspace')).toHaveAttribute(
      'data-inspector-split',
      'true',
    )
    await page.getByTestId('btn-inspector-motion').click()
    await expect(page.getByTestId('duration-slider')).toBeVisible()
    for (const id of EASING_IDS) {
      await assertUnclippedClickable(page, id)
    }
    await page.getByTestId('easing-option-spring').click()
    await expect(page.getByTestId('easing-value')).toHaveText('Spring')

    await page.screenshot({
      path: 'tmp/five-issue-review/after-900-motion.png',
      fullPage: false,
    })
  })
})
