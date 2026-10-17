import { clamp, clamp01 } from './coords'
import {
  CANONICAL_SAMPLE_COUNT,
  CSS_MAX_KEYFRAMES,
  type MotionSample,
} from './types'

/**
 * Max Gaussian sigma at smoothing = 1 (ms).
 * Raised so the upper slider range can clear small wobbles; deviation is capped.
 */
const MAX_SIGMA_MS = 96

/** Normalized displacement below this is treated as co-located. */
const STATIONARY_EPSILON = 0.003

/** Minimum hold duration to treat as an intentional pause. */
const PAUSE_MIN_MS = 40

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
export function isInStationaryRun(
  samples: MotionSample[],
  index: number,
  minDurationMs: number = PAUSE_MIN_MS,
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
 * Uses a short baseline so micro-wobble is not mistaken for intentional corners.
 */
function cornerRetain(samples: MotionSample[], index: number): number {
  if (index <= 0 || index >= samples.length - 1) return 1

  // Look a couple samples out so high-frequency shake does not look like a corner.
  const span = 2
  const a = samples[Math.max(0, index - span)]
  const b = samples[index]
  const c = samples[Math.min(samples.length - 1, index + span)]

  const v1x = b.x - a.x
  const v1y = b.y - a.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const n1 = Math.hypot(v1x, v1y)
  const n2 = Math.hypot(v2x, v2y)

  // Ignore tiny arms — those are jitter, not gesture corners.
  const minArm = 0.02
  if (n1 < minArm || n2 < minArm) return 0

  const dot = clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1)
  const angle = Math.acos(dot)
  // Begin retaining above ~35°, full retain near a hard bend.
  return clamp((angle - 0.6) / 1.0, 0, 1)
}

/** Cap how far a smoothed point may leave its recorded position. */
function boundDeviation(
  original: MotionSample,
  x: number,
  y: number,
  maxDev: number,
): { x: number; y: number } {
  const dx = x - original.x
  const dy = y - original.y
  const dist = Math.hypot(dx, dy)
  if (dist <= maxDev || dist === 0) {
    return { x: clamp01(x), y: clamp01(y) }
  }
  const scale = maxDev / dist
  return {
    x: clamp01(original.x + dx * scale),
    y: clamp01(original.y + dy * scale),
  }
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
 * Upper slider values use a wider kernel, but path deviation stays bounded so
 * the overall gesture is preserved. Endpoints, pauses, and sharp corners win.
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

  // Milder than ^2 at the top so high smoothing actually clears wobble.
  const sigmaMs = lerp(0, MAX_SIGMA_MS, Math.pow(smoothing, 1.35))
  if (sigmaMs < 0.5) {
    return copySamples(samples)
  }

  const radius = sigmaMs * 3
  const twoSigmaSq = 2 * sigmaMs * sigmaMs
  // Bound gesture drift: stronger cleanup is allowed, but not a rewrite.
  const maxDev = lerp(0.005, 0.03, smoothing)

  const blurred = samples.map((sample, i) => {
    if (i === 0 || i === samples.length - 1) {
      return { ...sample }
    }

    if (isInStationaryRun(samples, i, PAUSE_MIN_MS)) {
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

    const bounded = boundDeviation(
      sample,
      xSum / weightSum,
      ySum / weightSum,
      maxDev,
    )
    const retain = cornerRetain(samples, i)

    return {
      t: sample.t,
      x: clamp01(lerp(bounded.x, sample.x, retain)),
      y: clamp01(lerp(bounded.y, sample.y, retain)),
    }
  })

  return pinEndpoints(blurred, samples)
}

/**
 * Soften accidental speed spikes by blending toward arc-length timing within
 * each moving segment. Intentional pauses (held poses) keep their durations.
 */
export function applySteadySpeed(
  samples: MotionSample[],
  amount: number,
): MotionSample[] {
  if (samples.length < 2 || amount <= 0) {
    return copySamples(samples)
  }

  const n = samples.length
  const duration = samples[n - 1].t
  if (duration <= 0) {
    return copySamples(samples)
  }

  const pause = samples.map((_, i) => isInStationaryRun(samples, i, PAUSE_MIN_MS))

  type Segment = { start: number; end: number; isPause: boolean }
  const segments: Segment[] = []
  let cursor = 0
  while (cursor < n) {
    const flag = pause[cursor]
    let end = cursor
    while (end + 1 < n && pause[end + 1] === flag) end += 1
    segments.push({ start: cursor, end, isPause: flag })
    cursor = end + 1
  }

  const newT = samples.map((s) => s.t)

  for (const seg of segments) {
    const { start, end, isPause } = seg
    if (isPause || start === end) continue

    const t0 = samples[start].t
    const t1 = samples[end].t
    const segDur = t1 - t0
    if (segDur <= 0) continue

    const dist: number[] = [0]
    for (let k = start + 1; k <= end; k++) {
      dist.push(
        dist[dist.length - 1] +
          Math.hypot(
            samples[k].x - samples[k - 1].x,
            samples[k].y - samples[k - 1].y,
          ),
      )
    }
    const totalDist = dist[dist.length - 1]
    if (totalDist < 1e-9) continue

    for (let k = start; k <= end; k++) {
      const u = dist[k - start] / totalDist
      const tUniform = t0 + u * segDur
      newT[k] = lerp(samples[k].t, tUniform, amount)
    }
  }

  for (let k = 1; k < n; k++) {
    if (newT[k] < newT[k - 1]) newT[k] = newT[k - 1]
  }

  const endT = newT[n - 1]
  const scale = endT > 0 ? duration / endT : 1
  const out = samples.map((s, i) => ({
    t: newT[i] * scale,
    x: s.x,
    y: s.y,
  }))
  out[0].t = 0
  out[n - 1].t = duration
  return out
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
          const idx = Math.round(
            (i / (innerBudget - 1 || 1)) * (inner.length - 1),
          )
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
  steadySpeed = 0,
): MotionSample[] {
  if (samples.length === 0) return []
  const smoothed = gaussianSmooth(samples, smoothing)
  const timed = applySteadySpeed(smoothed, steadySpeed)
  const resampled = resampleUniform(timed, CANONICAL_SAMPLE_COUNT)
  return pinEndpoints(resampled, samples)
}

export function processForCss(
  samples: MotionSample[],
  smoothing: number,
  steadySpeed = 0,
): MotionSample[] {
  const canonical = processMotion(samples, smoothing, steadySpeed)
  return simplifyRdp(canonical, 0.002, CSS_MAX_KEYFRAMES)
}
