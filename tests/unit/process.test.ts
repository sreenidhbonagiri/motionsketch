import { describe, expect, it } from 'vitest'
import {
  gaussianSmooth,
  processForCss,
  processMotion,
  resampleUniform,
} from '../../src/core/process'
import { CANONICAL_SAMPLE_COUNT, type MotionSample } from '../../src/core/types'

function LShape(): MotionSample[] {
  return [
    { t: 0, x: 0.1, y: 0.1 },
    { t: 100, x: 0.8, y: 0.1 },
    { t: 200, x: 0.8, y: 0.8 },
  ]
}

function withPause(): MotionSample[] {
  return [
    { t: 0, x: 0.2, y: 0.2 },
    { t: 80, x: 0.5, y: 0.2 },
    { t: 160, x: 0.5, y: 0.2 },
    { t: 240, x: 0.5, y: 0.2 },
    { t: 320, x: 0.8, y: 0.5 },
  ]
}

function denseLShape(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 20; i++) {
    samples.push({ t: i * 10, x: 0.1 + (0.7 * i) / 20, y: 0.1 })
  }
  for (let i = 1; i <= 20; i++) {
    samples.push({ t: 200 + i * 10, x: 0.8, y: 0.1 + (0.7 * i) / 20 })
  }
  return samples
}

describe('process', () => {
  it('returns identity when smoothing is 0', () => {
    const samples = LShape()
    const smoothed = gaussianSmooth(samples, 0)
    expect(smoothed).toEqual(samples)
  })

  it('preserves start and end positions after smoothing', () => {
    const samples = denseLShape()
    const smoothed = gaussianSmooth(samples, 0.8)
    expect(smoothed[0].x).toBeCloseTo(samples[0].x, 5)
    expect(smoothed[0].y).toBeCloseTo(samples[0].y, 5)
    const last = samples.length - 1
    expect(smoothed[last].x).toBeCloseTo(samples[last].x, 5)
    expect(smoothed[last].y).toBeCloseTo(samples[last].y, 5)
  })

  it('preserves start and end through the full process pipeline', () => {
    const samples = denseLShape()
    const path = processMotion(samples, 0.7)
    expect(path[0].x).toBeCloseTo(samples[0].x, 5)
    expect(path[0].y).toBeCloseTo(samples[0].y, 5)
    expect(path[path.length - 1].x).toBeCloseTo(samples[samples.length - 1].x, 5)
    expect(path[path.length - 1].y).toBeCloseTo(samples[samples.length - 1].y, 5)
  })

  it('keeps sharp L-turns from collapsing into a diagonal shortcut', () => {
    const samples = denseLShape()
    const cornerT = 200
    const smoothed = gaussianSmooth(samples, 0.55)
    const nearCorner = smoothed.reduce((best, s) =>
      Math.abs(s.t - cornerT) < Math.abs(best.t - cornerT) ? s : best,
    )
    // A naive Gaussian would pull this toward ~(0.45, 0.45). Retain the elbow.
    expect(nearCorner.x).toBeGreaterThan(0.65)
    expect(nearCorner.y).toBeLessThan(0.35)
  })

  it('keeps stationary pause samples from drifting', () => {
    const samples = withPause()
    const smoothed = gaussianSmooth(samples, 0.7)
    // Interior pause samples should stay put; edges may blend into motion.
    const pauseSamples = smoothed.filter((s) => s.t >= 120 && s.t <= 200)
    expect(pauseSamples.length).toBeGreaterThan(0)
    for (const s of pauseSamples) {
      expect(s.x).toBeCloseTo(0.5, 2)
      expect(s.y).toBeCloseTo(0.2, 2)
    }
  })

  it('handles irregular timestamps without breaking monotonic t', () => {
    const irregular: MotionSample[] = [
      { t: 0, x: 0.1, y: 0.5 },
      { t: 16, x: 0.2, y: 0.5 },
      { t: 80, x: 0.5, y: 0.5 },
      { t: 200, x: 0.9, y: 0.5 },
    ]
    const smoothed = gaussianSmooth(irregular, 0.5)
    for (let i = 1; i < smoothed.length; i++) {
      expect(smoothed[i].t).toBeGreaterThanOrEqual(smoothed[i - 1].t)
    }
  })

  it('produces stronger deviation from raw path at higher smoothing', () => {
    const samples = denseLShape().map((s, i) => ({
      ...s,
      x: s.x + (i % 2 === 0 ? 0.02 : -0.02),
      y: s.y + (i % 2 === 0 ? -0.015 : 0.015),
    }))
    // Re-pin ends so the noise comparison is about the middle.
    samples[0] = { ...denseLShape()[0] }
    samples[samples.length - 1] = { ...denseLShape()[denseLShape().length - 1] }

    const low = gaussianSmooth(samples, 0.2)
    const high = gaussianSmooth(samples, 0.9)

    const err = (a: MotionSample[], b: MotionSample[]) =>
      a.reduce(
        (sum, s, i) => sum + Math.hypot(s.x - b[i].x, s.y - b[i].y),
        0,
      )

    expect(err(high, samples)).toBeGreaterThan(err(low, samples))
  })

  it('resamples to a canonical count', () => {
    const path = processMotion(LShape(), 0.35)
    expect(path).toHaveLength(CANONICAL_SAMPLE_COUNT)
    expect(path[0].t).toBe(0)
    expect(path[path.length - 1].t).toBe(200)
  })

  it('keeps resampled samples in bounds', () => {
    const noisy: MotionSample[] = Array.from({ length: 40 }, (_, i) => ({
      t: i * 10,
      x: 0.5 + Math.sin(i) * 0.6,
      y: 0.5 + Math.cos(i) * 0.6,
    }))
    const path = resampleUniform(gaussianSmooth(noisy, 0.8), 60)
    for (const s of path) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(1)
    }
  })

  it('CSS simplification preserves endpoints', () => {
    const samples = denseLShape()
    const cssPath = processForCss(samples, 0.4)
    expect(cssPath[0].x).toBeCloseTo(samples[0].x, 5)
    expect(cssPath[0].y).toBeCloseTo(samples[0].y, 5)
    expect(cssPath[cssPath.length - 1].x).toBeCloseTo(
      samples[samples.length - 1].x,
      5,
    )
    expect(cssPath[cssPath.length - 1].y).toBeCloseTo(
      samples[samples.length - 1].y,
      5,
    )
  })
})
