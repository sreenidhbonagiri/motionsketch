import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  buildFaceAlongArcFixtureJson,
  buildFaceAlongFidelityWarningFixtureJson,
  buildFaceAlongLFixtureJson,
  buildFaceAlongSpiralFixtureJson,
  buildFaceAlongStraightScaleFixtureJson,
} from '../fixtures/faceAlongPathProject'
import {
  ensureEditor,
  loadHtmlDocument,
  loadProjectSnapshot,
  openPanel,
} from './helpers'

function angleDeltaDeg(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180)
}

async function editorPoseAt(
  page: Page,
  tNorm: number,
): Promise<{ rotationDeg: number; scale: number; xFrac: number; yFrac: number }> {
  await page.getByTestId('playback-scrubber').fill(String(tNorm))
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="actor"]') as HTMLElement
    const stage = el.closest('[data-testid="stage"]') as HTMLElement | null
    const m = getComputedStyle(el).transform
    let rotationDeg = 0
    let scale = 1
    if (m && m !== 'none') {
      const m2 = m.match(/^matrix\((.+)\)$/)
      if (m2) {
        const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
        rotationDeg = (Math.atan2(b!, a!) * 180) / Math.PI
        scale = Math.hypot(a!, b!)
      }
    }
    // Use layout center — matrix tx/ty include translate(-50%,-50%), not stage x.
    const stageBox = stage?.getBoundingClientRect()
    const actorBox = el.getBoundingClientRect()
    const sw = stageBox?.width || 1
    const sh = stageBox?.height || 1
    const cx = actorBox.left + actorBox.width / 2 - (stageBox?.left ?? 0)
    const cy = actorBox.top + actorBox.height / 2 - (stageBox?.top ?? 0)
    return {
      rotationDeg,
      scale,
      xFrac: cx / sw,
      yFrac: cy / sh,
    }
  })
}

async function editorRotationAt(page: Page, tNorm: number): Promise<number> {
  return (await editorPoseAt(page, tNorm)).rotationDeg
}

test.describe('face along path', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('toggle and offset preview on L path; editor matches export', async ({
    page,
  }) => {
    await loadProjectSnapshot(
      page,
      buildFaceAlongLFixtureJson(undefined, { faceAlongPath: false }),
    )
    await ensureEditor(page)

    await openPanel(page, 'appearance')
    const toggle = page.getByTestId('face-along-path-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).not.toBeChecked()
    await expect(page.getByTestId('direction-offset-slider')).toHaveCount(0)

    const offEarly = await editorRotationAt(page, 0.15)
    expect(Math.abs(offEarly)).toBeLessThan(5)

    await toggle.check()
    await expect(page.getByTestId('direction-offset-slider')).toBeVisible()
    await expect(page.getByTestId('face-along-path-section')).toContainText(
      /Turns the actor to follow its movement/i,
    )
    await expect(page.getByTestId('face-along-path-section')).toContainText(
      /does not turn around to face backward travel/i,
    )

    const onEarly = await editorRotationAt(page, 0.15)
    expect(angleDeltaDeg(onEarly, 0)).toBeLessThan(12)

    const onLate = await editorRotationAt(page, 0.85)
    expect(angleDeltaDeg(onLate, 90)).toBeLessThan(15)

    // After the corner pause — heading faces the vertical leg (~90°).
    // (t≈0.5 is still in the pause hold at ~0°, covered by the pause e2e.)
    const onAfterPause = await editorRotationAt(page, 0.65)
    expect(angleDeltaDeg(onAfterPause, 90)).toBeLessThan(20)

    await page.getByTestId('direction-offset-input').fill('-90')
    await page.getByTestId('direction-offset-input').blur()

    const editor = {
      early: await editorRotationAt(page, 0.15),
      mid: await editorRotationAt(page, 0.5),
      late: await editorRotationAt(page, 0.85),
    }
    expect(angleDeltaDeg(editor.early, -90)).toBeLessThan(12)
    // Mid is inside the pause: path heading held at ~0°, plus −90° offset.
    expect(angleDeltaDeg(editor.mid, -90)).toBeLessThan(12)

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toMatch(/Face along path/i)

    await loadHtmlDocument(page, html)
    const demoActor = page.getByTestId('demo-actor')
    await expect(demoActor).toBeVisible()

    const demo = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as CSSAnimation).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (!anim) throw new Error('missing animation')
      anim.pause()
      const dur =
        Number(anim.effect?.getTiming().duration) ||
        parseFloat(getComputedStyle(el).animationDuration) * 1000 ||
        1000
      const read = (tNorm: number) => {
        anim.currentTime = tNorm * dur
        void el.offsetWidth
        const m = getComputedStyle(el).transform
        if (!m || m === 'none') return 0
        const m2 = m.match(/^matrix\((.+)\)$/)
        if (m2) {
          const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
          return (Math.atan2(b, a) * 180) / Math.PI
        }
        return 0
      }
      return { early: read(0.15), mid: read(0.5), late: read(0.85) }
    })

    expect(angleDeltaDeg(demo.early, editor.early)).toBeLessThan(8)
    expect(angleDeltaDeg(demo.mid, editor.mid)).toBeLessThan(10)
    expect(angleDeltaDeg(demo.late, editor.late)).toBeLessThan(8)
  })

  test('additive transform + offset on arc; alternate retraces angle', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildFaceAlongArcFixtureJson())
    await ensureEditor(page)

    const t0 = await editorRotationAt(page, 0)
    const tMid = await editorRotationAt(page, 0.5)
    const t1 = await editorRotationAt(page, 1)
    expect(Number.isFinite(t0)).toBe(true)
    expect(Number.isFinite(tMid)).toBe(true)
    expect(Number.isFinite(t1)).toBe(true)
    expect(angleDeltaDeg(tMid, t0)).toBeGreaterThan(20)

    await openPanel(page, 'adjust')
    await page.getByTestId('loop-toggle').check()
    await page.getByTestId('loop-mode-alternate').check()

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const html = readFileSync((await (await downloadPromise).path())!, 'utf8')

    await loadHtmlDocument(page, html)
    await expect(page.getByTestId('demo-actor')).toBeVisible()
    const angles = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as CSSAnimation).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (!anim) throw new Error('missing animation')
      anim.pause()
      const dur =
        Number(anim.effect?.getTiming().duration) ||
        parseFloat(getComputedStyle(el).animationDuration) * 1000
      const read = (t: number) => {
        anim.currentTime = t * dur
        void el.offsetWidth
        const m = getComputedStyle(el).transform
        const m2 = m.match(/^matrix\((.+)\)$/)
        if (!m2) return 0
        const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
        return (Math.atan2(b, a) * 180) / Math.PI
      }
      return { mid: read(0.5), reverseMid: read(1.5) }
    })
    expect(angleDeltaDeg(angles.mid, angles.reverseMid)).toBeLessThan(3)
    expect(angleDeltaDeg(angles.mid, tMid)).toBeLessThan(12)
  })

  test('multi-turn spiral: unwrapped export progression past ±360', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildFaceAlongSpiralFixtureJson())
    await ensureEditor(page)

    // Wrapped matrix angles alone cannot distinguish revolutions — accumulate
    // shortest-path deltas across dense scrub samples.
    const editorProgression: number[] = []
    let prevWrapped = await editorRotationAt(page, 0)
    let unwrapped = prevWrapped
    editorProgression.push(unwrapped)
    for (let i = 1; i <= 40; i++) {
      const wrapped = await editorRotationAt(page, i / 40)
      unwrapped += ((((wrapped - prevWrapped) % 360) + 540) % 360) - 180
      prevWrapped = wrapped
      editorProgression.push(unwrapped)
    }

    const editorSpan =
      editorProgression[editorProgression.length - 1]! - editorProgression[0]!
    expect(Math.abs(editorSpan)).toBeGreaterThan(360 * 2)
    const editorMid =
      editorProgression[Math.floor(editorProgression.length / 2)]!
    expect(Math.abs(editorMid - editorProgression[0]!)).toBeGreaterThan(180)

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toMatch(/Sampled angular export check/i)

    // Authored rotate() values are unwrapped degrees.
    const rotates = [...html.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map((m) =>
      Number(m[1]),
    )
    expect(rotates.length).toBeGreaterThan(10)
    const exportSpan = rotates[rotates.length - 1]! - rotates[0]!
    expect(Math.abs(exportSpan)).toBeGreaterThan(360 * 2)

    await loadHtmlDocument(page, html)
    const demoProgression = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as CSSAnimation).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (!anim) throw new Error('missing animation')
      anim.pause()
      const dur =
        Number(anim.effect?.getTiming().duration) ||
        parseFloat(getComputedStyle(el).animationDuration) * 1000
      const readWrapped = () => {
        const m = getComputedStyle(el).transform
        const m2 = m.match(/^matrix\((.+)\)$/)
        if (!m2) return 0
        const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
        return (Math.atan2(b!, a!) * 180) / Math.PI
      }
      const shortest = (from: number, to: number) =>
        ((((to - from) % 360) + 540) % 360) - 180
      let acc = readWrapped()
      let prev = acc
      const samples: number[] = [acc]
      for (let i = 1; i <= 40; i++) {
        anim.currentTime = (i / 40) * dur
        void el.offsetWidth
        const wrapped = readWrapped()
        acc += shortest(prev, wrapped)
        prev = wrapped
        samples.push(acc)
      }
      return samples
    })

    const demoSpan =
      demoProgression[demoProgression.length - 1]! - demoProgression[0]!
    expect(Math.abs(demoSpan)).toBeGreaterThan(360 * 2)
    expect(Math.abs(Math.abs(demoSpan) - Math.abs(editorSpan))).toBeLessThan(90)
  })
  test('export keeps mid position+scale with facing on', async ({ page }) => {
    await loadProjectSnapshot(page, buildFaceAlongStraightScaleFixtureJson())
    await ensureEditor(page)

    const editorMid = await editorPoseAt(page, 0.5)
    expect(editorMid.scale).toBeGreaterThan(2.5)
    expect(editorMid.xFrac).toBeGreaterThan(0.12)
    expect(editorMid.xFrac).toBeLessThan(0.35)

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toMatch(/50%/)
    expect(html).toMatch(/scale\(\s*3/)

    await loadHtmlDocument(page, html)
    const demoMid = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const stage = el.parentElement as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as CSSAnimation).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (!anim) throw new Error('missing animation')
      anim.pause()
      const dur =
        Number(anim.effect?.getTiming().duration) ||
        parseFloat(getComputedStyle(el).animationDuration) * 1000
      anim.currentTime = 0.5 * dur
      void el.offsetWidth
      const m = getComputedStyle(el).transform
      const m2 = m.match(/^matrix\((.+)\)$/)
      if (!m2) throw new Error('no matrix')
      const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
      const stageBox = stage.getBoundingClientRect()
      const actorBox = el.getBoundingClientRect()
      const cx = actorBox.left + actorBox.width / 2 - stageBox.left
      const cy = actorBox.top + actorBox.height / 2 - stageBox.top
      return {
        scale: Math.hypot(a!, b!),
        xFrac: cx / (stageBox.width || 1),
        yFrac: cy / (stageBox.height || 1),
        rotationDeg: (Math.atan2(b!, a!) * 180) / Math.PI,
      }
    })

    expect(demoMid.scale).toBeGreaterThan(2.5)
    expect(Math.abs(demoMid.scale - editorMid.scale)).toBeLessThan(0.35)
    expect(Math.abs(demoMid.xFrac - editorMid.xFrac)).toBeLessThan(0.08)
    // Facing on a straight path: rotation near 0 (not a large authored spin).
    expect(Math.abs(demoMid.rotationDeg)).toBeLessThan(15)
    expect(angleDeltaDeg(demoMid.rotationDeg, editorMid.rotationDeg)).toBeLessThan(
      12,
    )
  })

  test('L-path pause holds inbound heading in editor and export', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildFaceAlongLFixtureJson())
    await ensureEditor(page)

    // Pause spans t=760–920 on a path ending at t=1720 → ~0.44–0.53 local.
    const pauseLocals = [0.44, 0.48, 0.5, 0.53]
    const editorPause: number[] = []
    for (const t of pauseLocals) {
      editorPause.push(await editorRotationAt(page, t))
    }
    for (const r of editorPause) {
      expect(Math.abs(r)).toBeLessThan(12)
    }
    const after = await editorRotationAt(page, 0.7)
    expect(after).toBeGreaterThan(40)

    await openPanel(page, 'export')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const html = readFileSync((await (await downloadPromise).path())!, 'utf8')
    await loadHtmlDocument(page, html)

    const demo = await page.evaluate((times: number[]) => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as CSSAnimation).animationName
        return typeof name === 'string' && name !== '' && name !== 'none'
      })
      if (!anim) throw new Error('missing animation')
      anim.pause()
      const dur =
        Number(anim.effect?.getTiming().duration) ||
        parseFloat(getComputedStyle(el).animationDuration) * 1000
      const read = (t: number) => {
        anim.currentTime = t * dur
        void el.offsetWidth
        const m = getComputedStyle(el).transform
        const m2 = m.match(/^matrix\((.+)\)$/)
        if (!m2) return 0
        const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
        return (Math.atan2(b!, a!) * 180) / Math.PI
      }
      return {
        pause: times.map(read),
        after: read(0.7),
      }
    }, pauseLocals)

    for (const r of demo.pause) {
      expect(Math.abs(r)).toBeLessThan(12)
    }
    expect(demo.after).toBeGreaterThan(40)
    for (let i = 0; i < pauseLocals.length; i++) {
      expect(angleDeltaDeg(demo.pause[i]!, editorPause[i]!)).toBeLessThan(10)
    }
  })

  test('export panel shows facing fidelity warning; CSS comment kept', async ({
    page,
  }) => {
    await loadProjectSnapshot(page, buildFaceAlongFidelityWarningFixtureJson())
    await ensureEditor(page)
    await openPanel(page, 'export')

    const banner = page.getByTestId('export-facing-fidelity-warning')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/Facing export/i)
    await expect(banner).toContainText(/sample grid/i)
    await expect(banner).toContainText(/Copy CSS, View CSS, Download CSS/i)

    // Export still proceeds — View CSS includes the technical comment.
    await page.getByTestId('btn-view-css').click()
    const css = await page.getByTestId('css-output').inputValue()
    expect(css).toMatch(/sampled angular error/i)
    expect(css).toMatch(/Sampled angular export check/i)

    await page.getByTestId('btn-close-css-dialog').click()

    // Download HTML demo still works with the warning present.
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-html-demo').click()
    const download = await downloadPromise
    const html = readFileSync((await download.path())!, 'utf8')
    expect(html).toMatch(/sampled angular error/i)
  })

  test('persists face settings through download/open', async ({ page }) => {
    await loadProjectSnapshot(
      page,
      buildFaceAlongLFixtureJson(undefined, {
        faceAlongPath: true,
        directionOffsetDeg: 45,
      }),
    )
    await ensureEditor(page)
    await openPanel(page, 'project')
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('btn-download-project').click()
    const download = await downloadPromise
    const json = readFileSync((await download.path())!, 'utf8')
    const snap = JSON.parse(json)
    expect(snap.formatVersion).toBe(11)
    expect(snap.project.actors[0].faceAlongPath).toBe(true)
    expect(snap.project.actors[0].directionOffsetDeg).toBe(45)

    await loadProjectSnapshot(page, json)
    await ensureEditor(page)
    await openPanel(page, 'appearance')
    await expect(page.getByTestId('face-along-path-toggle')).toBeChecked()
    await expect(page.getByTestId('direction-offset-input')).toHaveValue('45')
  })
})
