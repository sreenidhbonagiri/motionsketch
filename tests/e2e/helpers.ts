import { expect, type Page } from '@playwright/test'

/**
 * Wait for the editor canvas. Optionally rename the project header.
 * No-ops the rename when the name already matches.
 */
export async function ensureEditor(page: Page, name?: string) {
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('welcome-screen')).toHaveCount(0)
  await expect(page.getByTestId('project-name-dialog')).toHaveCount(0)
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
  await page.mouse.move(startX + from.x, startY + from.y, { steps: 8 })
  await page.mouse.move(startX + to.x, startY + to.y, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
}

/** Accept or dismiss the next native confirm/alert. */
export function acceptNextDialog(page: Page, accept = true) {
  page.once('dialog', (dialog) => {
    void (accept ? dialog.accept() : dialog.dismiss())
  })
}

/**
 * Arm recording. When the selected actor already has a take, a confirm
 * dialog appears — pass `replaceExisting: true` to accept it.
 */
export async function clickRecord(
  page: Page,
  options: { replaceExisting?: boolean } = {},
) {
  if (options.replaceExisting) acceptNextDialog(page, true)
  await page.getByTestId('btn-record').click()
}

export async function actorIdsFromList(page: Page): Promise<string[]> {
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
  await page.getByTestId(`actor-list-item-${ids[index]}`).click()
  await expect(
    page.getByTestId(`actor-list-item-${ids[index]}`),
  ).toHaveAttribute('data-selected', 'true')
  return ids[index]
}

export type ChromePanel = 'project' | 'adjust' | 'appearance' | 'export'

/** Open a labeled top chrome panel (Adjust / Appearance / Export / Project). */
export async function openPanel(page: Page, id: ChromePanel) {
  const root = page.getByTestId(`${id}-panel-root`)
  if (await root.isVisible().catch(() => false)) return
  // Close any other floating panel first — on narrow viewports an open
  // panel can cover sibling chrome buttons. Prefer the Close control over
  // Escape so a nested <dialog> (e.g. View CSS) cannot swallow the key.
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
}

export async function openCssDialog(page: Page) {
  await openPanel(page, 'export')
  await page.getByTestId('btn-view-css').click()
  await expect(page.getByTestId('css-dialog')).toBeVisible()
}

export async function readExportedCss(page: Page): Promise<string> {
  await openCssDialog(page)
  const css = await page.getByTestId('css-output').inputValue()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('css-dialog')).toBeHidden()
  return css
}

export async function recordSimplePath(page: Page) {
  await clickRecord(page)
  await dragActor(page, { x: 30, y: -20 }, { x: 160, y: 50 })
  await expect(page.getByTestId('btn-play')).toBeEnabled()
  await openPanel(page, 'export')
  await expect(page.getByTestId('export-panel')).toBeVisible()
}

/** @deprecated use openPanel */
export async function openSettings(page: Page) {
  await openPanel(page, 'adjust')
}
