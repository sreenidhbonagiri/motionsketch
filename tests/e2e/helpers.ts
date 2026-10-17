import { expect, type Page } from '@playwright/test'

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

export async function openCssDialog(page: Page) {
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
  await page.getByTestId('btn-record').click()
  await dragActor(page, { x: 30, y: -20 }, { x: 160, y: 50 })
  await expect(page.getByTestId('export-panel')).toBeVisible()
}
