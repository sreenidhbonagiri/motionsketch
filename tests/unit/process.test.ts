import { describe, expect, it } from 'vitest'
import {
  applySteadySpeed,
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

/** Straight path with high-frequency lateral wobble (accidental shake). */
function shakyCurve(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 60; i++) {
    const u = i / 60
    samples.push({
      t: i * 20,
      x: 0.1 + 0.8 * u,
      y: 0.5 + Math.sin(i * 2.7) * 0.035,
    })
  }
  return samples
}

/**
 * Uniform spatial steps with irregular timing (speed jitter),
 * plus a deliberate pause, then a fast move.
 */
function pauseThenFastWithJitter(): MotionSample[] {
  const samples: MotionSample[] = []
  // Approach
  for (let i = 0; i <= 10; i++) {
    samples.push({ t: i * 30, x: 0.1 + i * 0.03, y: 0.3 })
  }
  // Pause ~300ms
  const pauseStart = samples[samples.length - 1].t
  for (let i = 1; i <= 10; i++) {
    samples.push({ t: pauseStart + i * 30, x: 0.4, y: 0.3 })
  }
  // Fast dart with uneven timestamps (accidental speed spikes)
  const dartStart = samples[samples.length - 1].t
  const dts = [8, 40, 10, 50, 12, 45, 9, 35]
  let t = dartStart
  let x = 0.4
  for (let i = 0; i < dts.length; i++) {
    t += dts[i]
    x += 0.06
    samples.push({ t, x, y: 0.3 + (i % 2 === 0 ? 0.01 : -0.01) })
  }
  return samples
}

function pathWobbleError(processed: MotionSample[], idealY = 0.5): number {
  return processed.reduce((sum, s) => sum + Math.abs(s.y - idealY), 0)
}

function speedVariance(samples: MotionSample[]): number {
  const speeds: number[] = []
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t
    if (dt <= 1e-6) continue
    const dist = Math.hypot(
      samples[i].x - samples[i - 1].x,
      samples[i].y - samples[i - 1].y,
    )
    // Ignore near-stationary segments when measuring move jitter.
    if (dist < 0.002) continue
    speeds.push(dist / dt)
  }
  if (speeds.length < 2) return 0
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
  return (
    speeds.reduce((sum, s) => sum + (s - mean) ** 2, 0) / speeds.length
  )
}

function pauseDuration(samples: MotionSample[], x: number, y: number): number {
  const hit = samples.filter(
    (s) => Math.hypot(s.x - x, s.y - y) < 0.01,
  )
  if (hit.length < 2) return 0
  return hit[hit.length - 1].t - hit[0].t
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
    const path = processMotion(samples, 0.7, 0.5)
    expect(path[0].x).toBeCloseTo(samples[0].x, 5)
    expect(path[0].y).toBeCloseTo(samples[0].y, 5)
    expect(path[path.length - 1].x).toBeCloseTo(samples[samples.length - 1].x, 5)
    expect(path[path.length - 1].y).toBeCloseTo(samples[samples.length - 1].y, 5)
  })

  it('keeps sharp L-turns from collapsing into a diagonal shortcut', () => {
    const samples = denseLShape()
    const cornerT = 200
    const smoothed = gaussianSmooth(samples, 0.9)
    const nearCorner = smoothed.reduce((best, s) =>
      Math.abs(s.t - cornerT) < Math.abs(best.t - cornerT) ? s : best,
    )
    expect(nearCorner.x).toBeGreaterThan(0.65)
    expect(nearCorner.y).toBeLessThan(0.35)
  })

  it('high smoothing clears shaky-curve wobble more than mid smoothing', () => {
    const samples = shakyCurve()
    const mid = gaussianSmooth(samples, 0.45)
    const high = gaussianSmooth(samples, 0.95)
    expect(pathWobbleError(high)).toBeLessThan(pathWobbleError(mid) * 0.85)
  })

  it('bounds path deviation from the recorded gesture at high smoothing', () => {
    const samples = shakyCurve()
    const smoothed = gaussianSmooth(samples, 1)
    let maxDev = 0
    for (let i = 0; i < samples.length; i++) {
      maxDev = Math.max(
        maxDev,
        Math.hypot(smoothed[i].x - samples[i].x, smoothed[i].y - samples[i].y),
      )
    }
    // Must stay within the configured bound (~0.03) plus tiny float slack.
    expect(maxDev).toBeLessThanOrEqual(0.035)
  })

  it('keeps stationary pause samples from drifting', () => {
    const samples = withPause()
    const smoothed = gaussianSmooth(samples, 0.7)
    const pauseSamples = smoothed.filter((s) => s.t >= 120 && s.t <= 200)
    expect(pauseSamples.length).toBeGreaterThan(0)
    for (const s of pauseSamples) {
      expect(s.x).toBeCloseTo(0.5, 2)
      expect(s.y).toBeCloseTo(0.2, 2)
    }
  })

  it('steady speed reduces move-segment speed variance while keeping pauses', () => {
    const samples = pauseThenFastWithJitter()
    const rawPause = pauseDuration(samples, 0.4, 0.3)
    const steadied = applySteadySpeed(samples, 0.85)
    const steadyPause = pauseDuration(steadied, 0.4, 0.3)

    expect(speedVariance(steadied)).toBeLessThan(speedVariance(samples) * 0.75)
    // Pause should remain roughly intact (within 20%).
    expect(steadyPause).toBeGreaterThan(rawPause * 0.8)
    expect(steadied[0].t).toBe(0)
    expect(steadied[steadied.length - 1].t).toBe(samples[samples.length - 1].t)
  })

  it('steady speed does not rewrite path geometry', () => {
    const samples = pauseThenFastWithJitter()
    const steadied = applySteadySpeed(samples, 1)
    for (let i = 0; i < samples.length; i++) {
      expect(steadied[i].x).toBeCloseTo(samples[i].x, 8)
      expect(steadied[i].y).toBeCloseTo(samples[i].y, 8)
    }
  })

  it('handles short recordings', () => {
    const short: MotionSample[] = [
      { t: 0, x: 0.2, y: 0.2 },
      { t: 60, x: 0.7, y: 0.6 },
    ]
    const path = processMotion(short, 0.8, 0.5)
    expect(path.length).toBe(CANONICAL_SAMPLE_COUNT)
    expect(path[0].x).toBeCloseTo(0.2, 5)
    expect(path[path.length - 1].x).toBeCloseTo(0.7, 5)
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
    const cssPath = processForCss(samples, 0.4, 0.4)
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
