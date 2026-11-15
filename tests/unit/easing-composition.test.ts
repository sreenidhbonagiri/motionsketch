import { describe, expect, it } from 'vitest'
import { applyEasing, MOTION_EASING_VALUES } from '../../src/core/easing'
import { applyGlide } from '../../src/core/glide'
import { applySteadySpeed } from '../../src/core/process'
import { evaluate } from '../../src/core/playback'
import type { MotionSample } from '../../src/core/types'

const ASPECT = 1.6

/** Unevenly timed curve — Steady/Glide have a clear effect under Linear. */
function buildUnevenCurve(): MotionSample[] {
  return Array.from({ length: 41 }, (_, i) => ({
    t: i * 40,
    x: 0.15 + 0.65 * (i / 40) ** 1.4,
    y: 0.4 + 0.05 * Math.sin((Math.PI * i) / 40),
  }))
}

function maxDiff(a: MotionSample[], b: MotionSample[]): number {
  let peak = 0
  for (let i = 0; i <= 200; i++) {
    const t = i / 200
    const p = evaluate(a, t)
    const q = evaluate(b, t)
    peak = Math.max(peak, Math.hypot(p.x - q.x, p.y - q.y))
  }
  return peak
}

describe('easing composes with Steady Speed and Glide', () => {
  it('Linear still shows Steady/Glide effects', () => {
    const path = buildUnevenCurve()
    expect(maxDiff(path, applyGlide(path, 0.8, ASPECT).samples)).toBeGreaterThan(
      0.01,
    )
    expect(maxDiff(path, applySteadySpeed(path, 1, ASPECT))).toBeGreaterThan(
      0.01,
    )
  })

  for (const kind of MOTION_EASING_VALUES) {
    if (kind === 'linear') continue
    it(`${kind} still changes when Steady or Glide precede it`, () => {
      const path = buildUnevenCurve()
      const base = applyEasing(path, kind, ASPECT).samples
      const withSteady = applyEasing(
        applySteadySpeed(path, 1, ASPECT),
        kind,
        ASPECT,
      ).samples
      const withGlide = applyEasing(
        applyGlide(path, 0.8, ASPECT).samples,
        kind,
        ASPECT,
      ).samples
      expect(maxDiff(base, withSteady)).toBeGreaterThan(0.001)
      expect(maxDiff(base, withGlide)).toBeGreaterThan(0.001)
    })
  }
})
