import { expect, test } from '@playwright/test'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { makeActor, makeProject, makeRecording } from '../unit/helpers/project'
import { loadHtmlDocument } from './helpers'

function decomposeRotation(transform: string): number {
  if (!transform || transform === 'none') return 0
  const m2 = transform.match(/^matrix\((.+)\)$/)
  if (m2) {
    const [a, b] = m2[1].split(',').map((v) => Number(v.trim()))
    return (Math.atan2(b, a) * 180) / Math.PI
  }
  const m3 = transform.match(/^matrix3d\((.+)\)$/)
  if (m3) {
    const parts = m3[1].split(',').map((v) => Number(v.trim()))
    return (Math.atan2(parts[1], parts[0]) * 180) / Math.PI
  }
  return 0
}

test.describe('clip export keyframe precision', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('HTML demo holds final pose at and after a short clip end', async ({
    page,
  }) => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'short',
          clip: { start: 0.2, end: 0.25 },
          recording: makeRecording(10),
          transform: {
            keyframes: [
              { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
              { id: 'k1', t: 0.9995, rotationDeg: 0, scale: 1 },
              { id: 'k2', t: 1, rotationDeg: 180, scale: 1 },
            ],
          },
        }),
      ],
      playback: { durationMs: 1000, loop: false, loopMode: 'repeat' },
    })
    const html = buildHtmlDemoFromProject(project)
    await loadHtmlDocument(page, html)

    const rotations = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="demo-actor"]',
      ) as HTMLElement
      const anim = el.getAnimations().find((a) => {
        const name = (a as Animation & { animationName?: unknown }).animationName
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
        return getComputedStyle(el).transform
      }
      return {
        atClipEnd: read(0.25),
        afterClip: read(0.5),
        atEnd: read(1),
        beforeClip: read(0.1),
      }
    })

    expect(decomposeRotation(rotations.beforeClip)).toBeCloseTo(0, 0)
    expect(Math.abs(decomposeRotation(rotations.atClipEnd))).toBeCloseTo(180, 0)
    expect(Math.abs(decomposeRotation(rotations.afterClip))).toBeCloseTo(180, 0)
    expect(Math.abs(decomposeRotation(rotations.atEnd))).toBeCloseTo(180, 0)
  })
})
