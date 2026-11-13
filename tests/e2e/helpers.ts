import { expect, type Locator, type Page } from '@playwright/test'

/** Load a standalone HTML document without keeping the Vite app URL as the document base. */
export async function loadHtmlDocument(page: Page, html: string) {
  await page.goto('about:blank')
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
}

/**
 * Skip an auto-started tutorial if the coach is visible (marks skipped locally).
 * If a keep/restore dialog appears, choose Start fresh / Restore.
 */
export async function skipTutorialIfPresent(page: Page) {
  const coach = page.getByTestId('tutorial-coach')
  // Auto-start runs after hydrate — wait briefly for fresh visits.
  try {
    await coach.waitFor({ state: 'visible', timeout: 2000 })
  } catch {
    return
  }
  await page.getByTestId('btn-tutorial-skip').click()
  const keep = page.getByTestId('tutorial-keep-confirm')
  if (await keep.isVisible().catch(() => false)) {
    const fresh = page.getByTestId('btn-tutorial-start-fresh')
    const restore = page.getByTestId('btn-tutorial-restore')
    if (await fresh.isVisible().catch(() => false)) {
      await fresh.click()
    } else if (await restore.isVisible().catch(() => false)) {
      await restore.click()
    }
  }
  await expect(coach).toHaveCount(0)
}

/** @deprecated Prefer {@link skipTutorialIfPresent}. */
export async function dismissTutorialOfferIfPresent(page: Page) {
  await skipTutorialIfPresent(page)
}

/**
 * Wait for the editor canvas. Optionally rename the project header.
 * No-ops the rename when the name already matches.
 * Skips an auto-started tutorial so unrelated suites stay on a blank canvas.
 */
export async function ensureEditor(page: Page, name?: string) {
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('welcome-screen')).toHaveCount(0)
  await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
  await skipTutorialIfPresent(page)
  if (!name) return
  const renameBtn = page.getByTestId('btn-rename-project')
  const current = (await renameBtn.textContent())?.trim()
  if (current === name) return
  await renameBtn.click()
  const input = page.getByTestId('header-project-name-input')
  await expect(input).toBeFocused()
  await input.fill(name)
  await input.press('Enter')
  await expect(renameBtn).toHaveText(name)
}

export async function dragActor(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const actor = page.getByTestId('actor')
  const box = await actor.boundingBox()
  expect(box).toBeTruthy()

  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Micro-move so engines that require movement after down arm capture.
  await page.mouse.move(startX + 2, startY + 1, { steps: 2 })
  await page.mouse.move(startX + from.x, startY + from.y, { steps: 8 })
  await page.mouse.move(startX + to.x, startY + to.y, { steps: 12 })
  // Brief hold: pointerup stamps duration (WebKit compresses move timeStamps).
  await page.waitForTimeout(60)
  await page.mouse.up()
}

/**
 * Dispatch pointercancel for common mouse pointer ids. Firefox uses 0;
 * Chromium/WebKit use 1. The recorder ignores non-active ids. Targets the
 * capture element (actor) and bubbles to the stage listener.
 */
export async function dispatchActivePointerCancel(
  page: Page,
  selector = '[data-testid="actor"]',
) {
  await page.evaluate((sel) => {
    const targets = [
      document.querySelector(sel),
      document.querySelector('[data-testid="stage-frame"]'),
      document.querySelector('[data-testid="stage"]'),
    ].filter(Boolean) as Element[]
    if (targets.length === 0) throw new Error(`missing ${sel}`)
    for (const el of targets) {
      for (const pointerId of [0, 1]) {
        el.dispatchEvent(
          new PointerEvent('pointercancel', {
            bubbles: true,
            cancelable: true,
            pointerId,
          }),
        )
      }
    }
  }, selector)
}

/** True when the actor (or stage) still holds pointer capture for common ids. */
export async function actorHasPointerCapture(
  page: Page,
  selector = '[data-testid="actor"]',
): Promise<boolean> {
  return page.evaluate((sel) => {
    const els = [
      document.querySelector(sel),
      document.querySelector('[data-testid="stage-frame"]'),
      document.querySelector('[data-testid="stage"]'),
    ].filter(Boolean) as Element[]
    for (const el of els) {
      if (typeof el.hasPointerCapture !== 'function') continue
      for (const id of [0, 1, 2]) {
        try {
          if (el.hasPointerCapture(id)) return true
        } catch {
          // ignore
        }
      }
    }
    return false
  }, selector)
}

/**
 * Touch-capable placement gesture.
 * Chromium: real CDP touch (pointerType "touch"). WebKit/Firefox: trusted
 * pointer drag inside a hasTouch context (Playwright cannot CDP-touch-drag
 * there); cancel uses the same pointercancel path as production.
 */
export async function touchPointerGesture(
  page: Page,
  options: {
    from: { x: number; y: number }
    to: { x: number; y: number }
    /** 'up' commits; 'cancel' aborts without history. */
    end?: 'up' | 'cancel'
    browserName?: string
  },
) {
  const end = options.end ?? 'up'
  const browserName =
    options.browserName ??
    page.context().browser()?.browserType().name() ??
    'chromium'

  if (browserName === 'chromium') {
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: options.from.x, y: options.from.y }],
    })
    // Intermediate points help snap hysteresis engage like a finger drag.
    const mid = {
      x: (options.from.x + options.to.x) / 2,
      y: (options.from.y + options.to.y) / 2,
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: mid.x, y: mid.y }],
    })
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: options.to.x, y: options.to.y }],
    })
    if (end === 'cancel') {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchCancel',
        touchPoints: [],
      })
    } else {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
    }
    return
  }

  await page.mouse.move(options.from.x, options.from.y)
  await page.mouse.down()
  await page.mouse.move(options.to.x, options.to.y, { steps: 12 })
  if (end === 'cancel') {
    await dispatchActivePointerCancel(page)
    await page.mouse.up().catch(() => undefined)
  } else {
    await page.mouse.up()
  }
}

/**
 * Accept or dismiss a MotionSketch confirmation dialog by its root test id.
 * Call after the action that opens the dialog (not before).
 */
export async function respondToConfirm(
  page: Page,
  options: {
    accept?: boolean
    dialogTestId: string
    confirmTestId: string
    cancelTestId: string
  },
) {
  const accept = options.accept !== false
  const dialog = page.getByTestId(options.dialogTestId)
  await expect(dialog).toBeVisible()
  await page
    .getByTestId(accept ? options.confirmTestId : options.cancelTestId)
    .click()
  await expect(dialog).toBeHidden()
}

/**
 * Arm recording. When the selected actor already has a take, a confirm
 * dialog appears — pass `replaceExisting: true` to accept it when shown.
 * (A discarded short take may leave no recording; then no dialog appears.)
 */
export async function clickRecord(
  page: Page,
  options: { replaceExisting?: boolean } = {},
) {
  await page.getByTestId('btn-record').click()
  if (!options.replaceExisting) return
  const dialog = page.getByTestId('rerecord-confirm')
  try {
    await expect(dialog).toBeVisible({ timeout: 1500 })
  } catch {
    return
  }
  await page.getByTestId('btn-rerecord-confirm').click()
  await expect(dialog).toBeHidden()
}

/** Close the Timing dialog when it is open (modal blocks dock/Elements clicks). */
export async function dismissTimingDialogIfOpen(page: Page) {
  const open = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="timing-dialog"]')
    return el instanceof HTMLDialogElement && el.open
  })
  if (!open) return
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
}

/** Expand the Actors list when it is collapsed (items are unmounted while closed). */
export async function ensureActorListExpanded(page: Page) {
  await dismissTimingDialogIfOpen(page)
  const body = page.getByTestId('actor-list-body')
  if (await body.isVisible().catch(() => false)) return
  const listToggle = page.getByTestId('btn-toggle-actor-list')
  if (await listToggle.isVisible().catch(() => false)) {
    if ((await listToggle.getAttribute('aria-expanded')) !== 'true') {
      await listToggle.click()
    }
    await expect(body).toBeVisible()
    return
  }
  await ensureElementsOpen(page)
}

/** Expand Actors then click Add (panel starts collapsed on a fresh workspace). */
export async function clickAddActor(page: Page) {
  await ensureActorListExpanded(page)
  await page.getByTestId('btn-add-actor').click()
}

export async function actorIdsFromList(page: Page): Promise<string[]> {
  await ensureActorListExpanded(page)
  await expect(page.getByTestId('actor-list')).toBeVisible()
  const items = page.locator('[data-testid^="actor-list-item-"]')
  const count = await items.count()
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const testId = await items.nth(i).getAttribute('data-testid')
    expect(testId).toBeTruthy()
    ids.push(testId!.replace('actor-list-item-', ''))
  }
  return ids
}

export async function selectActorByIndex(page: Page, index: number) {
  const ids = await actorIdsFromList(page)
  expect(ids.length).toBeGreaterThan(index)
  const item = page.getByTestId(`actor-list-item-${ids[index]}`)
  await item.evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  // On short viewports the Actors sheet can sit tight under Sequence; use the
  // element click path so selection isn’t blocked by the adjacent toggle.
  await item.evaluate((el) => {
    ;(el as HTMLButtonElement).click()
  })
  await expect(
    page.getByTestId(`actor-list-item-${ids[index]}`),
  ).toHaveAttribute('data-selected', 'true')
  return ids[index]
}

export type ChromePanel =
  | 'project'
  | 'adjust'
  | 'appearance'
  | 'export'
  | 'help'

/** Close every floating chrome panel (Help / Export). Docked inspector stays. */
export async function closeOpenChromePanels(page: Page) {
  const open = page.locator('[data-testid$="-panel-root"]')
  const count = await open.count()
  for (let i = 0; i < count; i++) {
    const panel = open.nth(i)
    if (!(await panel.isVisible().catch(() => false))) continue
    const closeBtn = panel.locator('[data-testid^="btn-close-"]').first()
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
  }
  await expect(page.locator('[data-testid$="-panel-root"]')).toHaveCount(0)
}

/**
 * Open Adjust / Appearance / Project in the docked inspector, or Help / Export
 * as floating panels.
 */
export async function openPanel(page: Page, id: ChromePanel) {
  await dismissTimingDialogIfOpen(page)
  if (id === 'adjust' || id === 'appearance' || id === 'project') {
    await closeOpenChromePanels(page)
    const tabId =
      id === 'adjust'
        ? 'btn-inspector-motion'
        : id === 'appearance'
          ? 'btn-inspector-style'
          : 'btn-inspector-project'
    const bodyId =
      id === 'adjust'
        ? 'inspector-motion-body'
        : id === 'appearance'
          ? 'inspector-style-body'
          : 'inspector-project-body'
    // Phone: reveal the inspector pane first.
    const toggle = page.getByTestId('btn-toggle-inspector-pane')
    if (await toggle.isVisible().catch(() => false)) {
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
        await toggle.click()
      }
    }
    await page.getByTestId(tabId).click()
    await expect(page.getByTestId(tabId)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('inspector-panel')).toHaveAttribute(
      'data-inspector-tab',
      id === 'adjust' ? 'motion' : id === 'appearance' ? 'style' : 'project',
    )
    await expect(page.getByTestId(bodyId)).toBeVisible()
    return
  }

  const root = page.getByTestId(`${id}-panel-root`)
  if (await root.isVisible().catch(() => false)) {
    await root.focus()
    return
  }
  const other = page.locator(
    '[data-testid$="-panel-root"]:not([data-testid="' + id + '-panel-root"])',
  )
  if ((await other.count()) > 0) {
    const closeBtn = other.locator('[data-testid^="btn-close-"]').first()
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await expect(other).toHaveCount(0)
  }
  await page.getByTestId(`btn-${id}`).click()
  await expect(root).toBeVisible()
  await root.focus()
}

/**
 * Close Adjust / Appearance / Project by leaving that inspector tab (or
 * collapsing the phone inspector). Close Help / Export floating panels.
 */
export async function closePanel(page: Page, id: ChromePanel) {
  if (id === 'adjust' || id === 'appearance' || id === 'project') {
    const bodyId =
      id === 'adjust'
        ? 'inspector-motion-body'
        : id === 'appearance'
          ? 'inspector-style-body'
          : 'inspector-project-body'
    const body = page.getByTestId(bodyId)
    if (!(await body.isVisible().catch(() => false))) return
    const otherTab =
      id === 'appearance' ? 'btn-inspector-motion' : 'btn-inspector-style'
    await page.getByTestId(otherTab).click()
    await expect(body).toHaveCount(0)
    const toggle = page.getByTestId('btn-toggle-inspector-pane')
    if (
      (await toggle.isVisible().catch(() => false)) &&
      (await toggle.getAttribute('aria-pressed')) === 'true'
    ) {
      await toggle.click()
    }
    return
  }
  const root = page.getByTestId(`${id}-panel-root`)
  if (!(await root.isVisible().catch(() => false))) return
  const closeBtn = page.getByTestId(`btn-close-${id}`)
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await expect(root).toHaveCount(0)
}

/** Open the Elements list (docked sidebar or phone sheet). */
export async function ensureElementsOpen(page: Page) {
  const body = page.getByTestId('actor-list-body')
  if (await body.isVisible().catch(() => false)) return
  const listToggle = page.getByTestId('btn-toggle-actor-list')
  if (await listToggle.isVisible().catch(() => false)) {
    await listToggle.click()
    await expect(body).toBeVisible()
    return
  }
  await page.getByTestId('btn-toggle-elements-pane').click()
  await expect(body).toBeVisible()
}

/** Scroll `el` to the vertical center of its nearest `.overflow-y-auto` ancestor. */
async function scrollExportScrollerToCenter(locator: Locator) {
  await locator.evaluate((el) => {
    const scroller = el.closest('.overflow-y-auto') as HTMLElement | null
    if (!scroller) return
    // Assign scrollTop directly — scrollIntoView can animate / thrash on WebKit.
    const elRect = el.getBoundingClientRect()
    const scRect = scroller.getBoundingClientRect()
    const delta =
      elRect.top + elRect.height / 2 - (scRect.top + scRect.height / 2)
    scroller.scrollTop += delta
  })
}

/** Open the dock More menu when occasional actions are tucked away. */
export async function openDockMore(page: Page) {
  const menu = page.getByTestId('dock-more-menu')
  if (await menu.isVisible().catch(() => false)) return
  const btn = page.getByTestId('btn-dock-more')
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(menu).toBeVisible()
}

/** Open the edit-mode More menu for Place here / polish / restore, etc. */
export async function openEditMore(page: Page) {
  const menu = page.getByTestId('dock-edit-more-menu')
  if (await menu.isVisible().catch(() => false)) return
  const btn = page.getByTestId('btn-edit-more')
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(menu).toBeVisible()
}

/**
 * Open Motion tools in the docked inspector when a path exists.
 * Before any path, Snap is already on the dock.
 */
export async function ensureRefineMotionOpen(page: Page) {
  const tools = page.getByTestId('refine-motion-tools')
  if (await tools.isVisible().catch(() => false)) return
  // Motion tools live in the docked inspector — reveal it first.
  const toggle = page.getByTestId('btn-toggle-inspector-pane')
  if (await toggle.isVisible().catch(() => false)) {
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click()
    }
  }
  const motionTab = page.getByTestId('btn-inspector-motion')
  if (await motionTab.isVisible().catch(() => false)) {
    await motionTab.click()
    await expect(tools).toBeVisible()
    return
  }
  // Empty board: Snap lives on the dock; Motion tools are not mounted yet.
  await expect(page.getByTestId('snap-to-grid-toggle')).toBeVisible()
}

/** Open Refine if needed, then start Polish motion. */
export async function clickPolishMotion(page: Page) {
  await ensureRefineMotionOpen(page)
  await page.getByTestId('btn-polish-motion').click()
}

/** Open Refine if needed, then start Glide. */
export async function clickGlide(page: Page) {
  await ensureRefineMotionOpen(page)
  await page.getByTestId('btn-glide').click()
}

/** Arm Continue path from the dock More menu. */
export async function clickContinuePath(page: Page) {
  const btn = page.getByTestId('btn-continue-path')
  if (!(await btn.isVisible().catch(() => false))) {
    await openDockMore(page)
  }
  await expect(btn).toBeVisible()
  await btn.click()
}

/** Select Add to your website path tab (html | react). */
export async function selectExportWebsitePath(
  page: Page,
  path: 'html' | 'react',
) {
  await page.getByTestId(`btn-export-path-${path}`).click()
  await expect(page.getByTestId(`btn-export-path-${path}`)).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByTestId(`btn-export-path-${path}`)).toHaveAttribute(
    'data-selected',
    'true',
  )
  await expect(page.getByTestId(`export-guide-${path}`)).toBeVisible()
}

/** Expand Export → Advanced exports (CSS, own-element, project file). */
export async function expandExportOtherWays(page: Page) {
  const details = page.getByTestId('export-other-ways')
  await expect(details).toBeAttached()
  const summary = page.getByTestId('export-other-ways-summary')
  await scrollExportScrollerToCenter(summary)
  const open = await details.evaluate(
    (el) => (el as HTMLDetailsElement).open,
  )
  if (!open) {
    // Prefer a real summary click (a11y path). If the taller “Add to your
    // website” guide leaves the hit target flaky under parallel Firefox/
    // WebKit load, force the details open so Advanced exports stay reachable.
    try {
      await summary.click({ timeout: 2000 })
    } catch {
      await details.evaluate((el) => {
        ;(el as HTMLDetailsElement).open = true
      })
    }
    if (
      !(await details.evaluate((el) => (el as HTMLDetailsElement).open))
    ) {
      await details.evaluate((el) => {
        ;(el as HTMLDetailsElement).open = true
      })
    }
  }
  await expect
    .poll(() =>
      details.evaluate((el) => (el as HTMLDetailsElement).open),
    )
    .toBe(true)
  // Expanded Other ways is taller than the panel. Center HTML demo (below CSS)
  // via scrollTop so callers can click without Playwright’s nested
  // scrollIntoViewIfNeeded path (never-stable on Linux WebKit).
  const htmlDemo = page.getByTestId('btn-download-html-demo')
  await scrollExportScrollerToCenter(htmlDemo)
  await expect(page.getByTestId('btn-download-css')).toBeAttached()
  await expect(htmlDemo).toBeAttached()
  await expect
    .poll(() =>
      htmlDemo.evaluate((el) => {
        const scroller = el.closest('.overflow-y-auto') as HTMLElement | null
        if (!scroller) return true
        const er = el.getBoundingClientRect()
        const sr = scroller.getBoundingClientRect()
        return (
          er.height > 0 &&
          er.top >= sr.top - 1 &&
          er.bottom <= sr.bottom + 1
        )
      }),
    )
    .toBe(true)
}

export async function openCssDialog(page: Page): Promise<{
  collapsedActorList: boolean
}> {
  await openPanel(page, 'export')
  // Collapse Elements when it is open so it cannot compete with Export chrome.
  // readExportedCss restores afterward; other callers should ensureActorListExpanded.
  let collapsedActorList = false
  const listBody = page.getByTestId('actor-list-body')
  if (await listBody.isVisible().catch(() => false)) {
    const listToggle = page.getByTestId('btn-toggle-actor-list')
    const elementsToggle = page.getByTestId('btn-toggle-elements-pane')
    if (await listToggle.isVisible().catch(() => false)) {
      await listToggle.click()
    } else if (await elementsToggle.isVisible().catch(() => false)) {
      await elementsToggle.click()
    }
    await expect(listBody).toHaveCount(0)
    collapsedActorList = true
  }
  await expandExportOtherWays(page)
  const viewBtn = page.getByTestId('btn-view-css')
  await expect(viewBtn).toBeVisible()
  // Export panel body scrolls on short viewports; nested overflow can leave
  // View CSS outside the clickable area until scrolled into the panel.
  await scrollExportScrollerToCenter(viewBtn)
  await expect(viewBtn).toBeVisible()
  await viewBtn.click()
  await expect(page.getByTestId('css-dialog')).toBeVisible()
  return { collapsedActorList }
}

export async function readExportedCss(page: Page): Promise<string> {
  const { collapsedActorList } = await openCssDialog(page)
  const css = await page.getByTestId('css-output').inputValue()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('css-dialog')).toBeHidden()
  if (collapsedActorList) {
    await ensureActorListExpanded(page)
  }
  return css
}

/**
 * Record a short path and leave the editor idle with Play enabled.
 * Closes floating panels before/after so later steps (Export, Adjust)
 * are not blocked by leftover chrome from earlier helpers.
 */
export async function recordSimplePath(page: Page) {
  await closeOpenChromePanels(page)
  await skipTutorialIfPresent(page)
  await clickRecord(page)
  // Drag only after Record has armed — under load the click can return before
  // mode flips, and idle drags leave Play disabled (stage-empty-hint).
  await expect(page.getByTestId('btn-stop')).toBeVisible()
  await dragActor(page, { x: 30, y: -20 }, { x: 160, y: 50 })
  await expect(page.getByTestId('btn-play')).toBeEnabled()
  await expect(page.getByTestId('btn-record')).toBeVisible()
  await expect(page.getByTestId('btn-stop')).toHaveCount(0)
  await closeOpenChromePanels(page)
}

/**
 * Load a persisted project snapshot once (does not re-seed on later reloads,
 * so autosave round-trips stay intact).
 */
export async function loadProjectSnapshot(page: Page, snapshotJson: string) {
  await page.goto('/')
  await page.evaluate((raw) => {
    localStorage.setItem('motionsketch.project.v1', raw)
  }, snapshotJson)
  await page.reload()
  await ensureEditor(page)
}

/** Stage-local sample → page client coordinates (CSS px). */
export async function clientPointForSample(
  page: Page,
  sample: { x: number; y: number },
) {
  // Geometry tools map through the transformed stage-frame, not the camera viewport.
  const box = await page.getByTestId('stage-frame').boundingBox()
  expect(box).toBeTruthy()
  return {
    x: box!.x + sample.x * box!.width,
    y: box!.y + sample.y * box!.height,
  }
}

/** Leave Motion tools (switch Style tab) when they are showing in the inspector. */
export async function ensureRefineMotionClosed(page: Page) {
  const tools = page.getByTestId('refine-motion-tools')
  if (!(await tools.isVisible().catch(() => false))) return
  await closePanel(page, 'adjust')
  await expect(tools).toHaveCount(0)
}

/** Open the Timing dialog so Start after / Move for are visible. */
export async function ensureClipTimesOpen(page: Page) {
  const start = page.getByTestId('clip-start-input')
  if (await start.isVisible().catch(() => false)) return
  const btn = page.getByTestId('btn-timing')
  if (!(await btn.isVisible().catch(() => false))) {
    await openDockMore(page)
  }
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(page.getByTestId('timing-dialog')).toBeVisible()
  await expect(page.getByTestId('clip-times-section')).toBeVisible()
  await expect(start).toBeVisible()
}

/** Click Reset on the dock (confirm flow unchanged). */
export async function clickResetMotion(page: Page) {
  const btn = page.getByTestId('btn-reset')
  await expect(btn).toBeVisible()
  await btn.click()
}

/**
 * Assert a control’s full bounds sit inside every overflow clipping ancestor,
 * have a readable accessible name, and receive a normal center click.
 */
export async function assertUnclippedClickable(
  page: Page,
  testId: string,
) {
  const result = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!(el instanceof HTMLElement)) return { ok: false, reason: 'missing' }
    const er = el.getBoundingClientRect()
    if (er.width < 4 || er.height < 4) return { ok: false, reason: 'zero-size' }

    // Fixed menus intentionally escape overflow:hidden dock ancestors.
    let fixedRoot: HTMLElement | null = null
    let walk: HTMLElement | null = el
    while (walk) {
      if (getComputedStyle(walk).position === 'fixed') {
        fixedRoot = walk
        break
      }
      walk = walk.parentElement
    }

    if (!fixedRoot) {
      let node: HTMLElement | null = el.parentElement
      while (node) {
        const style = getComputedStyle(node)
        const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX)
        const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY)
        if (clipsX || clipsY) {
          const nr = node.getBoundingClientRect()
          const pad = 1
          if (
            er.left < nr.left - pad ||
            er.right > nr.right + pad ||
            er.top < nr.top - pad ||
            er.bottom > nr.bottom + pad
          ) {
            return {
              ok: false,
              reason: `clipped-by-${node.getAttribute('data-testid') || node.tagName}`,
            }
          }
        }
        node = node.parentElement
      }
    } else {
      const vh = window.innerHeight
      const vw = window.innerWidth
      if (
        er.left < -1 ||
        er.top < -1 ||
        er.right > vw + 1 ||
        er.bottom > vh + 1
      ) {
        return { ok: false, reason: 'fixed-outside-viewport' }
      }
    }

    const name =
      el.getAttribute('aria-label')?.trim() ||
      el.getAttribute('title')?.trim() ||
      (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!name) return { ok: false, reason: 'no-accessible-name' }

    const cx = er.left + er.width / 2
    const cy = er.top + er.height / 2
    const top = document.elementFromPoint(cx, cy)
    if (!(top instanceof Element)) return { ok: false, reason: 'no-hit' }
    const hit =
      el === top ||
      el.contains(top) ||
      top.closest(`[data-testid="${id}"]`) === el
    if (!hit) return { ok: false, reason: 'covered' }
    return { ok: true, reason: 'ok', name }
  }, testId)
  expect(result, `${testId}: ${result.reason}`).toMatchObject({ ok: true })
  const btn = page.getByTestId(testId)
  if (await btn.isEnabled()) {
    await btn.click({ trial: true })
  }
}

/**
 * Set Timing Start after / Move for from absolute start/end seconds and Apply.
 * Blur alone does not commit. Times live in the Timing dialog.
 */
export async function applyClipSeconds(
  page: Page,
  startSec: string | number,
  endSec: string | number,
) {
  await ensureClipTimesOpen(page)
  const start = Number(startSec)
  const end = Number(endSec)
  const moveFor = end - start
  await page.getByTestId('clip-start-input').fill(String(startSec))
  await page.getByTestId('clip-move-for-input').fill(String(moveFor))
  await page.getByTestId('btn-apply-clip-times').click()
  await expect(page.getByTestId('clip-times-error')).toHaveCount(0)
  // Successful Apply closes Timing and returns focus to the opener.
  await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
}

/** Expand Timing → More options so visibility radios are interactable. */
export async function ensureTimingMoreOptionsOpen(page: Page) {
  await ensureClipTimesOpen(page)
  const hide = page.getByTestId('clip-hide-before')
  if (await hide.isVisible().catch(() => false)) return
  await page.getByText('More options').click()
  await expect(hide).toBeVisible()
}

/**
 * Draft visibility radios then Apply (times + visibility share one commit).
 * Pass null to leave a flag unchanged in the draft.
 */
export async function applyClipVisibility(
  page: Page,
  opts: { hideBefore?: boolean; hideAfter?: boolean },
) {
  await ensureTimingMoreOptionsOpen(page)
  if (opts.hideBefore === true) {
    await page.getByTestId('clip-hide-before').check()
  } else if (opts.hideBefore === false) {
    await page.getByTestId('clip-show-before').check()
  }
  if (opts.hideAfter === true) {
    await page.getByTestId('clip-hide-after').check()
  } else if (opts.hideAfter === false) {
    await page.getByTestId('clip-hold-after').check()
  }
  await page.getByTestId('btn-apply-clip-times').click()
  await expect(page.getByTestId('clip-times-error')).toHaveCount(0)
  await expect(page.getByTestId('timing-dialog')).not.toBeVisible()
}

/** @deprecated use openPanel */
export async function openSettings(page: Page) {
  await openPanel(page, 'adjust')
}
