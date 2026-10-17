import { clamp, clamp01 } from './coords'
import {
  CANONICAL_SAMPLE_COUNT,
  CSS_MAX_KEYFRAMES,
  type MotionSample,
} from './types'

/** Max Gaussian sigma at smoothing = 1 (ms). Kept modest to limit corner mush. */
const MAX_SIGMA_MS = 56

/** Normalized displacement below this is treated as stationary. */
const STATIONARY_EPSILON = 0.003

function copySamples(samples: MotionSample[]): MotionSample[] {
  return samples.map((s) => ({ ...s }))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * True when this sample sits in a held pose long enough that smoothing
 * should not pull it toward motion before/after the pause.
 */
function isInStationaryRun(
  samples: MotionSample[],
  index: number,
  minDurationMs: number,
): boolean {
  const origin = samples[index]
  let lo = index
  let hi = index

  while (
    lo > 0 &&
    Math.hypot(samples[lo - 1].x - origin.x, samples[lo - 1].y - origin.y) <=
      STATIONARY_EPSILON
  ) {
    lo -= 1
  }

  while (
    hi < samples.length - 1 &&
    Math.hypot(samples[hi + 1].x - origin.x, samples[hi + 1].y - origin.y) <=
      STATIONARY_EPSILON
  ) {
    hi += 1
  }

  return samples[hi].t - samples[lo].t >= minDurationMs
}

/**
 * How strongly to keep the original sample near sharp turns (0..1).
 * Straight sections stay fully smoothed; hard corners retain more of the raw path.
 */
function cornerRetain(samples: MotionSample[], index: number): number {
  if (index <= 0 || index >= samples.length - 1) return 1

  const a = samples[index - 1]
  const b = samples[index]
  const c = samples[index + 1]

  const v1x = b.x - a.x
  const v1y = b.y - a.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const n1 = Math.hypot(v1x, v1y)
  const n2 = Math.hypot(v2x, v2y)

  if (n1 < 1e-6 || n2 < 1e-6) return 0

  const dot = clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1)
  const angle = Math.acos(dot)
  // Begin retaining above ~25°, full retain near a hard bend.
  return clamp((angle - 0.45) / 1.1, 0, 1)
}

function pinEndpoints(
  smoothed: MotionSample[],
  original: MotionSample[],
): MotionSample[] {
  if (smoothed.length === 0 || original.length === 0) return smoothed
  const out = copySamples(smoothed)
  out[0] = {
    t: out[0].t,
    x: clamp01(original[0].x),
    y: clamp01(original[0].y),
  }
  const last = out.length - 1
  const origLast = original[original.length - 1]
  out[last] = {
    t: out[last].t,
    x: clamp01(origLast.x),
    y: clamp01(origLast.y),
  }
  return out
}

/**
 * Time-aware Gaussian smooth on x(t) and y(t).
 * Preserves endpoints, stationary segments, and sharp corners better than a
 * naive kernel by re-anchoring and blending back toward the raw path.
 */
export function gaussianSmooth(
  samples: MotionSample[],
  smoothing: number,
): MotionSample[] {
  if (samples.length === 0 || smoothing <= 0) {
    return copySamples(samples)
  }

  if (samples.length === 1) {
    return copySamples(samples)
  }

  const sigmaMs = lerp(0, MAX_SIGMA_MS, smoothing * smoothing)
  if (sigmaMs < 0.5) {
    return copySamples(samples)
  }

  const radius = sigmaMs * 3
  const twoSigmaSq = 2 * sigmaMs * sigmaMs

  const blurred = samples.map((sample, i) => {
    // Endpoints are pinned after the pass; skip work.
    if (i === 0 || i === samples.length - 1) {
      return { ...sample }
    }

    // Hold pauses (~40ms+) so timing plateaus do not drift spatially.
    if (isInStationaryRun(samples, i, 40)) {
      return { ...sample }
    }

    let weightSum = 0
    let xSum = 0
    let ySum = 0

    let j = i
    while (j > 0 && sample.t - samples[j - 1].t <= radius) j -= 1

    for (; j < samples.length; j++) {
      const dt = samples[j].t - sample.t
      if (dt > radius) break
      const w = Math.exp(-(dt * dt) / twoSigmaSq)
      weightSum += w
      xSum += samples[j].x * w
      ySum += samples[j].y * w
    }

    if (weightSum === 0) {
      return { ...sample }
    }

    const sx = clamp01(xSum / weightSum)
    const sy = clamp01(ySum / weightSum)
    const retain = cornerRetain(samples, i)

    return {
      t: sample.t,
      x: clamp01(lerp(sx, sample.x, retain)),
      y: clamp01(lerp(sy, sample.y, retain)),
    }
  })

  return pinEndpoints(blurred, samples)
}

/** Linear interpolate sample at absolute time t (ms). */
export function sampleAtTime(samples: MotionSample[], t: number): MotionSample {
  if (samples.length === 0) {
    return { t: 0, x: 0.5, y: 0.5 }
  }
  if (samples.length === 1 || t <= samples[0].t) {
    return { ...samples[0], t }
  }

  const last = samples[samples.length - 1]
  if (t >= last.t) {
    return { ...last, t }
  }

  let lo = 0
  let hi = samples.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid
  }

  const a = samples[lo]
  const b = samples[hi]
  const span = b.t - a.t
  const u = span === 0 ? 0 : (t - a.t) / span

  return {
    t,
    x: clamp01(lerp(a.x, b.x, u)),
    y: clamp01(lerp(a.y, b.y, u)),
  }
}

/** Uniform resample onto N points across the recording duration. */
export function resampleUniform(
  samples: MotionSample[],
  count: number = CANONICAL_SAMPLE_COUNT,
): MotionSample[] {
  if (samples.length === 0) return []
  if (samples.length === 1 || count <= 1) {
    return [{ ...samples[0], t: 0 }]
  }

  const duration = samples[samples.length - 1].t
  if (duration <= 0) {
    return Array.from({ length: count }, (_, i) => ({
      t: i,
      x: samples[0].x,
      y: samples[0].y,
    }))
  }

  const result: MotionSample[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * duration
    result.push(sampleAtTime(samples, t))
  }

  // Resampling can reintroduce tiny endpoint drift via float math; pin again.
  return pinEndpoints(result, samples)
}

interface Point3 {
  tNorm: number
  x: number
  y: number
  index: number
}

function perpendicularDistance(
  point: Point3,
  start: Point3,
  end: Point3,
): number {
  const dx = end.tNorm - start.tNorm
  const dy = end.x - start.x
  const dz = end.y - start.y
  const mag = Math.hypot(dx, dy, dz)
  if (mag === 0) {
    return Math.hypot(
      point.tNorm - start.tNorm,
      point.x - start.x,
      point.y - start.y,
    )
  }
  const cx = (point.x - start.x) * dz - (point.y - start.y) * dy
  const cy = (point.y - start.y) * dx - (point.tNorm - start.tNorm) * dz
  const cz = (point.tNorm - start.tNorm) * dy - (point.x - start.x) * dx
  return Math.hypot(cx, cy, cz) / mag
}

/** Ramer–Douglas–Peucker in (tNorm, x, y) space. Always keeps endpoints. */
export function simplifyRdp(
  samples: MotionSample[],
  epsilon: number,
  maxPoints: number = CSS_MAX_KEYFRAMES,
): MotionSample[] {
  if (samples.length <= 2) return copySamples(samples)

  const duration = samples[samples.length - 1].t || 1
  const points: Point3[] = samples.map((s, index) => ({
    tNorm: s.t / duration,
    x: s.x,
    y: s.y,
    index,
  }))

  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true

  const stack: Array<[number, number]> = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [startIdx, endIdx] = stack.pop()!
    const start = points[startIdx]
    const end = points[endIdx]
    let maxDist = 0
    let maxIndex = -1

    for (let i = startIdx + 1; i < endIdx; i++) {
      const dist = perpendicularDistance(points[i], start, end)
      if (dist > maxDist) {
        maxDist = dist
        maxIndex = i
      }
    }

    if (maxDist > epsilon && maxIndex !== -1) {
      keep[maxIndex] = true
      stack.push([startIdx, maxIndex], [maxIndex, endIdx])
    }
  }

  let result = samples.filter((_, i) => keep[i]).map((s) => ({ ...s }))

  if (result.length > maxPoints) {
    const first = result[0]
    const last = result[result.length - 1]
    const innerBudget = Math.max(0, maxPoints - 2)
    const inner = result.slice(1, -1)
    const thinnedInner: MotionSample[] = []

    if (innerBudget > 0 && inner.length > 0) {
      if (inner.length <= innerBudget) {
        thinnedInner.push(...inner)
      } else {
        for (let i = 0; i < innerBudget; i++) {
          const idx = Math.round((i / (innerBudget - 1 || 1)) * (inner.length - 1))
          thinnedInner.push(inner[idx])
        }
      }
    }

    result = [first, ...thinnedInner, last]
  }

  return pinEndpoints(result, samples)
}

export function processMotion(
  samples: MotionSample[],
  smoothing: number,
): MotionSample[] {
  if (samples.length === 0) return []
  const smoothed = gaussianSmooth(samples, smoothing)
  const resampled = resampleUniform(smoothed, CANONICAL_SAMPLE_COUNT)
  // Guarantee playback ends exactly where the user started/stopped.
  return pinEndpoints(resampled, samples)
}

export function processForCss(
  samples: MotionSample[],
  smoothing: number,
): MotionSample[] {
  const canonical = processMotion(samples, smoothing)
  return simplifyRdp(canonical, 0.002, CSS_MAX_KEYFRAMES)
}
