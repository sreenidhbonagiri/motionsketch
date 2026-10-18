import { expect, test } from '@playwright/test'

/**
 * Minimal dialog + iframe fixture mirroring the trigger preview shell.
 * Distinguishes event delivery from Playwright actionability.
 *
 * Evidence (Playwright WebKit, MotionSketch preview): after the scene holds
 * focus, trusted pointerdown/up reach Play but click is omitted. Desktop
 * Safari UI was not verified separately.
 */

const childHtml = `<!DOCTYPE html><html><body style="margin:0;padding:12px;font:14px sans-serif">
<div id="scene" data-testid="scene" tabindex="0"
  style="width:200px;height:100px;background:#cde">scene</div>
<button id="play" data-testid="play" type="button">Play</button>
<script>
window.log = [];
function push(m, e) {
  window.log.push({
    m: m,
    trusted: e && e.isTrusted,
    tgt: e && (e.target.id || e.target.tagName),
  });
}
var play = document.getElementById('play');
var scene = document.getElementById('scene');
document.addEventListener('pointerdown', function (e) { push('pointerdown', e); }, true);
document.addEventListener('pointerup', function (e) { push('pointerup', e); }, true);
document.addEventListener('click', function (e) { push('click', e); }, true);
play.addEventListener('click', function () {
  scene.dataset.activated = 'click';
});
play.addEventListener('pointerup', function (e) {
  if (typeof e.button === 'number' && e.button !== 0) return;
  scene.dataset.activated = scene.dataset.activated || 'pointerup';
});
</script>
</body></html>`

async function openFixture(
  page: import('@playwright/test').Page,
) {
  await page.setContent(`<!DOCTYPE html><html><body>
<dialog id="dlg" style="width:420px;height:280px;border:1px solid #ccc;padding:0">
  <iframe id="f" sandbox="allow-scripts allow-same-origin" style="width:100%;height:100%;border:0"></iframe>
</dialog>
</body></html>`)
  await page.evaluate(() => {
    ;(document.getElementById('dlg') as HTMLDialogElement).showModal()
  })
  const handle = await page.$('#f')
  const frame = await handle!.contentFrame()
  await frame!.setContent(childHtml)
  return page.frameLocator('#f')
}

test.describe('iframe sibling pointer activation', () => {
  test.use({ viewport: { width: 800, height: 600 } })

  test('without scene focus, pointer click delivers trusted click', async ({
    page,
  }) => {
    const frame = await openFixture(page)
    await frame.getByTestId('play').click()
    const result = await frame.locator('html').evaluate(() => ({
      log: (window as unknown as { log: Array<{ m: string; trusted: boolean }> })
        .log,
      activated: document.getElementById('scene')!.dataset.activated,
    }))
    expect(result.log.some((e) => e.m === 'click' && e.trusted)).toBe(true)
    expect(result.activated).toBe('click')
  })

  test('after scene focus: record pointer delivery; activation via pointerup or click', async ({
    page,
    browserName,
  }) => {
    const frame = await openFixture(page)
    await frame.getByTestId('scene').focus()
    await frame.getByTestId('play').click()

    const result = await frame.locator('html').evaluate(() => {
      const log = (
        window as unknown as {
          log: Array<{ m: string; trusted: boolean; tgt: string }>
        }
      ).log
      return {
        log,
        activated: document.getElementById('scene')!.dataset.activated,
        hadTrustedPd: log.some(
          (e) => e.m === 'pointerdown' && e.trusted && e.tgt === 'play',
        ),
        hadTrustedPu: log.some(
          (e) => e.m === 'pointerup' && e.trusted && e.tgt === 'play',
        ),
        hadTrustedClick: log.some(
          (e) => e.m === 'click' && e.trusted && e.tgt === 'play',
        ),
      }
    })

    // Not an actionability miss: the control receives trusted pointer events.
    expect(result.hadTrustedPd).toBe(true)
    expect(result.hadTrustedPu).toBe(true)

    if (browserName === 'webkit') {
      // Observed under Playwright WebKit: click may be omitted after focus.
      // pointerup still marks activation in this fixture (mirrors controller).
      expect(result.activated).toMatch(/^(click|pointerup)$/)
      if (!result.hadTrustedClick) {
        expect(result.activated).toBe('pointerup')
      }
    } else {
      expect(result.hadTrustedClick).toBe(true)
      expect(result.activated).toBe('click')
    }
  })

  test('keyboard Enter activates independently of pointer click', async ({
    page,
  }) => {
    const frame = await openFixture(page)
    await frame.getByTestId('scene').focus()
    await frame.getByTestId('play').press('Enter')
    const activated = await frame
      .getByTestId('scene')
      .getAttribute('data-activated')
    expect(activated).toBe('click')
  })
})
