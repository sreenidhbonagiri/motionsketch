import { expect, test, type Page } from '@playwright/test'
import {
  assertUnclippedClickable,
  ensureEditor,
  recordSimplePath,
  selectActorByIndex,
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
    } catch {
      /* ignore */
    }
    try {
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

/** Normalized stage point currently under the stage-viewport center. */
async function stageCenterNorm(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="stage-viewport"]')
    const frame = document.querySelector('[data-testid="stage-frame"]')
    const world = document.querySelector(
      '[data-testid="workspace-world"]',
    ) as HTMLElement | null
    if (!(stage instanceof HTMLElement) || !(frame instanceof HTMLElement)) {
      return null
    }
    const sr = stage.getBoundingClientRect()
    const fr = frame.getBoundingClientRect()
    if (fr.width < 1 || fr.height < 1) return null
    const cx = sr.left + sr.width / 2
    const cy = sr.top + sr.height / 2
    const m = /scale\(([^)]+)\)/.exec(world?.style.transform ?? '')
    return {
      nx: (cx - fr.left) / fr.width,
      ny: (cy - fr.top) / fr.height,
      zoom: m ? Number(m[1]) : NaN,
      stageW: Math.round(sr.width),
      stageH: Math.round(sr.height),
      transform: world?.style.transform ?? '',
    }
  })
}

test.describe('phone / mid-width panel chrome', () => {
  test('900px: rename opens on click/Enter/Space; Escape cancels; input selectable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await gotoFresh(page)

    const rename = page.getByTestId('btn-rename-project')
    await expect(rename).toBeVisible()

    // select-none on the button is the fix for the original failure:
    // a press-drag across the title selected text instead of activating rename.
    const style = await rename.evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        userSelect: s.userSelect,
        webkitUserSelect: (
          s as CSSStyleDeclaration & { webkitUserSelect?: string }
        ).webkitUserSelect,
      }
    })
    expect(style.userSelect).toMatch(/none/)
    expect(style.webkitUserSelect ?? style.userSelect).toMatch(/none/)

    // Original failure: press-drag across the title selected "Untitled project"
    // and never opened rename. With select-none, selection stays empty mid-drag.
    const box = await rename.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box!.x + 4, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width - 4, box!.y + box!.height / 2, {
      steps: 6,
    })
    const selectionMidDrag = await page.evaluate(
      () => window.getSelection()?.toString() ?? '',
    )
    expect(selectionMidDrag).toBe('')
    await page.mouse.up()
    // Dismiss any click-activated edit from mouseup so the explicit click below
    // is the activation under test.
    if (
      await page
        .getByTestId('header-project-name-input')
        .isVisible()
        .catch(() => false)
    ) {
      await page.keyboard.press('Escape')
      await expect(rename).toBeVisible()
    }

    await rename.click()
    const input = page.getByTestId('header-project-name-input')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused()
    // Selection inside the input remains allowed (not blocked by select-none).
    await input.fill('Mid width name')
    await input.selectText()
    const selected = await input.evaluate((el) =>
      el instanceof HTMLInputElement
        ? (el.selectionEnd ?? 0) - (el.selectionStart ?? 0)
        : 0,
    )
    expect(selected).toBeGreaterThan(0)
    await input.press('Enter')
    await expect(rename).toHaveText('Mid width name')

    // Escape cancels without saving the draft.
    await rename.click()
    await expect(page.getByTestId('header-project-name-input')).toBeFocused()
    await page.getByTestId('header-project-name-input').fill('Should cancel')
    await page.keyboard.press('Escape')
    await expect(rename).toBeVisible()
    await expect(rename).toHaveText('Mid width name')

    // Keyboard activation (Enter / Space) opens rename without a pointer.
    await rename.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('header-project-name-input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rename).toBeVisible()
    await rename.focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('header-project-name-input')).toBeFocused()
    await page.keyboard.press('Escape')

    await page.screenshot({
      path: 'tmp/phone-fixes/900x720-rename.png',
      fullPage: false,
    })
  })

  for (const size of [
    { width: 390, height: 844, label: 'phone' },
    { width: 390, height: 560, label: 'short-phone' },
  ] as const) {
    test(`${size.label}: Elements/Inspector exclusive split, close, camera chrome`, async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({
        width: size.width,
        height: size.height,
      })
      await gotoFresh(page)
      await recordSimplePath(page)

      await expect(page.getByTestId('workspace-camera-chrome')).toBeVisible()
      const fitInChrome = page
        .getByTestId('workspace-camera-chrome')
        .getByTestId('btn-fit-stage')
      await expect(fitInChrome).toBeVisible()
      await assertUnclippedClickable(page, 'btn-fit-stage')
      await assertUnclippedClickable(page, 'btn-zoom-in')
      await page.getByTestId('zoom-percent').click()
      await expect(page.getByTestId('zoom-percent-input')).toBeVisible()
      await page.getByTestId('zoom-percent-input').fill('110')
      await page.getByTestId('zoom-percent-input').press('Enter')
      await expect(page.getByTestId('zoom-percent')).toContainText('110')

      // Camera bar must not sit inside the drawing stage cell.
      const barOutsideStage = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="workspace-camera-bar"]')
        const stage = document.querySelector('[data-testid="stage-viewport"]')
        if (!(bar instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
          return false
        }
        return !stage.contains(bar)
      })
      expect(barOutsideStage).toBe(true)

      const beforeOpen = await stageCenterNorm(page)
      expect(beforeOpen).toBeTruthy()

      await page.getByTestId('btn-toggle-elements-pane').click()
      await expect(page.getByTestId('editor-workspace')).toHaveAttribute(
        'data-elements-split',
        'true',
      )
      await expect(page.getByTestId('stage-viewport')).toBeVisible()
      await expect(page.getByTestId('btn-elements-back-to-stage')).toHaveText(
        /Close elements/i,
      )
      // One Close only — no duplicate ActorList header Close.
      await expect(page.getByTestId('btn-elements-back-to-stage')).toHaveCount(1)
      await expect(
        page.getByTestId('actor-list').getByTestId('btn-toggle-actor-list'),
      ).toHaveCount(0)
      await expect(
        page.getByTestId('actor-list').getByTestId('actors-collapse-label'),
      ).toHaveCount(0)
      await expect(
        page.getByTestId('actor-list').getByTestId('actors-close-label'),
      ).toHaveCount(0)

      await page.screenshot({
        path: `tmp/phone-fixes/${size.width}x${size.height}-elements-split.png`,
        fullPage: false,
      })

      const afterOpen = await stageCenterNorm(page)
      expect(afterOpen).toBeTruthy()
      // Expected: stage cell resizes when the bottom panel opens.
      expect(afterOpen!.stageH).toBeLessThan(beforeOpen!.stageH)
      // Unintended drift would move the logical center; preserve-center keeps it.
      expect(afterOpen!.nx).toBeCloseTo(beforeOpen!.nx, 2)
      expect(afterOpen!.ny).toBeCloseTo(beforeOpen!.ny, 2)
      expect(afterOpen!.zoom).toBeCloseTo(beforeOpen!.zoom, 5)

      const stageBox = await page.getByTestId('stage-viewport').boundingBox()
      const listBox = await page.getByTestId('actor-list-slot').boundingBox()
      expect(stageBox?.height ?? 0).toBeGreaterThan(40)
      expect(listBox?.top ?? 0).toBeGreaterThanOrEqual((stageBox?.bottom ?? 0) - 2)

      await page.getByTestId('btn-add-actor').scrollIntoViewIfNeeded()
      await assertUnclippedClickable(page, 'btn-add-actor')
      await page.getByTestId('btn-add-actor').click()
      await expect(page.getByTestId('actor-list')).toContainText('2/8')

      // Switch to Inspector — exclusive bottom panel.
      await page.getByTestId('btn-toggle-inspector-pane').click()
      await expect(page.getByTestId('inspector-panel')).toBeVisible()
      await expect(page.getByTestId('actor-list-slot')).toHaveCount(0)
      await expect(page.getByTestId('btn-inspector-back-to-stage')).toHaveText(
        /Close inspector/i,
      )
      await expect(page.getByTestId('stage-viewport')).toBeVisible()

      await page.getByTestId('btn-inspector-motion').click()
      const order = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="adjust-panel"]')
        if (!(root instanceof HTMLElement)) return null
        const top = (id: string) => {
          const el = root.querySelector(`[data-testid="${id}"]`)
          return el instanceof HTMLElement ? el.getBoundingClientRect().top : null
        }
        const d = top('duration-slider')
        const e = top('easing-picker')
        const about = top('inspector-motion-help')
        const svg = top('svg-path-import')
        if (d == null || e == null || about == null || svg == null) return null
        return { ok: d < e && e < about && about < svg, d, e, about, svg }
      })
      expect(order?.ok, JSON.stringify(order)).toBe(true)

      await assertUnclippedClickable(page, 'btn-inspector-back-to-stage')
      await page.getByTestId('btn-inspector-back-to-stage').click()
      await expect(page.getByTestId('inspector-panel')).toHaveCount(0)
      await expect(page.getByTestId('btn-play')).toBeVisible()
      // Wait for preserve-center layout to settle after the stage cell expands.
      await page
        .getByTestId('stage-viewport')
        .evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            }),
        )

      const afterClose = await stageCenterNorm(page)
      expect(afterClose).toBeTruthy()
      expect(afterClose!.nx).toBeCloseTo(beforeOpen!.nx, 2)
      expect(afterClose!.ny).toBeCloseTo(beforeOpen!.ny, 2)
      expect(afterClose!.zoom).toBeCloseTo(beforeOpen!.zoom, 5)

      // Path-edit still maps through the stage-frame after layout churn.
      // Re-select the recorded actor (Add above may leave an empty selection).
      await page.getByTestId('btn-toggle-elements-pane').click()
      await selectActorByIndex(page, 0)
      await page.getByTestId('btn-elements-back-to-stage').click()
      await expect(page.getByTestId('btn-edit-path')).toBeEnabled()
      await page.getByTestId('btn-edit-path').click()
      await expect(page.getByTestId('btn-done-edit')).toBeVisible()
      await page.getByTestId('btn-done-edit').click()
      await expect(page.getByTestId('btn-edit-path')).toBeVisible()
      await expect(page.getByTestId('btn-play')).toBeEnabled()

      await page.screenshot({
        path: `tmp/phone-fixes/${size.width}x${size.height}-after-close.png`,
        fullPage: false,
      })
    })
  }

  test('900px: stage visible; Duration/Easing first when Inspector open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await gotoFresh(page)
    await recordSimplePath(page)

    await expect(page.getByTestId('stage-viewport')).toBeVisible()
    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await page.getByTestId('btn-inspector-motion').click()
    const order = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="adjust-panel"]')
      if (!(root instanceof HTMLElement)) return null
      const top = (id: string) => {
        const el = root.querySelector(`[data-testid="${id}"]`)
        return el instanceof HTMLElement ? el.getBoundingClientRect().top : null
      }
      const d = top('duration-slider')
      const e = top('easing-picker')
      const about = top('inspector-motion-help')
      const svg = top('svg-path-import')
      if (d == null || e == null || about == null || svg == null) return null
      return { ok: d < e && e < about && about < svg }
    })
    expect(order?.ok).toBe(true)

    await page.screenshot({
      path: 'tmp/phone-fixes/900x720-inspector.png',
      fullPage: false,
    })
  })

  test('1280 desktop: camera over stage; Elements Close/Collapse; rename unchanged', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoFresh(page)
    await expect(page.getByTestId('workspace-camera-chrome')).toHaveCount(0)
    const barInStage = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="workspace-camera-bar"]')
      const stage = document.querySelector('[data-testid="stage-viewport"]')
      return !!(bar && stage && stage.contains(bar))
    })
    expect(barInStage).toBe(true)

    await page.getByTestId('btn-toggle-elements-pane').click()
    await expect(page.getByTestId('actor-list')).toBeVisible()
    await expect(page.getByTestId('btn-collapse-actor-list')).toBeVisible()
    await expect(page.getByTestId('actors-collapse-label')).toHaveText(
      /Collapse|Expand/,
    )
    await expect(page.getByTestId('actors-close-label')).toHaveText('Close')
    await expect(page.getByTestId('btn-elements-back-to-stage')).toHaveCount(0)

    await page.getByTestId('btn-toggle-inspector-pane').click()
    await expect(page.getByTestId('inspector-panel')).toBeVisible()
    await expect(page.getByTestId('btn-close-inspector')).toBeVisible()
    await expect(page.getByTestId('btn-inspector-back-to-stage')).toHaveCount(0)

    await page.getByTestId('btn-rename-project').click()
    await expect(page.getByTestId('header-project-name-input')).toBeFocused()
    await page.keyboard.press('Escape')
  })
})
