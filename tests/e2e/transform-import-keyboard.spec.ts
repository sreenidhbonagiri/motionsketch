import { expect, test } from '@playwright/test'
import { openPanel, recordSimplePath } from './helpers'

test.describe('transform import + keyboard scope', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('invalid transform import is rejected without replacing the project', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await page.getByTestId('playback-scrubber').fill('0.5')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('45')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)

    const badProject = {
      formatVersion: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        actor: {
          kind: 'shape',
          width: 0.12,
          height: 0.12,
          borderRadius: 0.28,
          color: '#112233',
          image: null,
        },
        recording: {
          recordedDurationMs: 200,
          samples: [
            { t: 0, x: 0.2, y: 0.2 },
            { t: 200, x: 0.8, y: 0.8 },
          ],
        },
        playback: {
          durationMs: 500,
          smoothing: 0,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
        stageAspect: 1.6,
        transform: {
          keyframes: [
            { id: 'a', t: 0, rotationDeg: 0, scale: 1 },
            { id: 'bad', t: 1, rotationDeg: 90, scale: 99 },
          ],
        },
      },
      geometryEdit: null,
    }

    await openPanel(page, 'project')
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'bad-transform.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(badProject), 'utf-8'),
    })

    await expect(page.getByTestId('import-error')).toBeVisible()
    await expect(page.getByTestId('import-error')).toContainText(/scale/i)

    // Current project preserved (still has our transform markers).
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('actor-color-value')).not.toHaveText('#112233')
  })

  test('shortcuts skip inputs; delete requires selected keyframe; markers stay keyboard-accessible', async ({
    page,
  }) => {
    await page.goto('/')
    await recordSimplePath(page)
    await page.getByTestId('playback-scrubber').fill('0.6')
    await openPanel(page, 'appearance')
    await page.getByTestId('transform-rotation-input').fill('90')
    await page.getByTestId('btn-set-transform-keyframe').click()
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)

    // Typing Backspace in the rotation field must not delete the keyframe.
    const rotation = page.getByTestId('transform-rotation-input')
    await rotation.fill('120')
    await rotation.focus()
    await page.keyboard.press('Backspace')
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)
    await expect(rotation).toHaveValue('12')

    // Without a selected keyframe, Delete is a no-op for the track.
    await page.getByTestId('btn-deselect-transform').click()
    await page.locator('body').click({ position: { x: 8, y: 8 } })
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-transform-marker]')).toHaveCount(2)

    // Markers are buttons: Tab/Enter selects; Delete then removes.
    const marker = page.locator('[data-transform-marker]').last()
    await marker.focus()
    await expect(marker).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(marker).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-transform-marker]')).toHaveCount(1)
  })
})
