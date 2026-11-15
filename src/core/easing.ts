import { clamp01 } from './coords'
import { isInStationaryRun } from './process'
import { aspectDistance, clampStageAspect } from './stageAspect'
import type { MotionSample, Vec2 } from './types'

/** Discrete per-element motion easing (after Steady + Glide). */
export type MotionEasing =
  | 'linear'
  | 'easeOut'
  | 'easeInOut'
  | 'spring'
  | 'bounce'

export const MOTION_EASING_VALUES: readonly MotionEasing[] = [
  'linear',
  'easeOut',
  'easeInOut',
  'spring',
  'bounce',
] as const

export const DEFAULT_MOTION_EASING: MotionEasing = 'linear'

export const MOTION_EASING_LABELS: Record<MotionEasing, string> = {
  linear: 'Linear',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  spring: 'Spring',
  bounce: 'Bounce',
}

/** Moving segments shorter than this keep their recorded timing. */
const MIN_EASING_SEGMENT_MS = 64

/** Need enough samples to shape an ease without inventing motion. */
const MIN_EASING_SEGMENT_SAMPLES = 4

/** Resample density floor for curves that may leave the path (spring/bounce). */
const MIN_OVERSHOOT_SAMPLES = 24

function copySamples(samples: MotionSample[]): MotionSample[] {
  return samples.map((s) => ({ ...s }))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function isMotionEasing(value: unknown): value is MotionEasing {
  return (
    typeof value === 'string' &&
    (MOTION_EASING_VALUES as readonly string[]).includes(value)
  )
}

export function parseMotionEasing(value: unknown): MotionEasing {
  return isMotionEasing(value) ? value : DEFAULT_MOTION_EASING
}

/** Cubic ease-out on [0, 1]. */
export function easeOutCubic(u: number): number {
  const t = clamp01(u)
  return 1 - (1 - t) ** 3
}

/** Inverse of {@link easeOutCubic}. */
export function invEaseOutCubic(y: number): number {
  const v = clamp01(y)
  return 1 - (1 - v) ** (1 / 3)
}

/** Hermite smoothstep (ease-in-out). */
export function easeInOutSmoothstep(u: number): number {
  const x = clamp01(u)
  return x * x * (3 - 2 * x)
}

/** Inverse of {@link easeInOutSmoothstep}. */
export function invEaseInOutSmoothstep(y: number): number {
  const v = clamp01(y)
  const arg = Math.min(1, Math.max(-1, 1 - 2 * v))
  return 0.5 - Math.sin(Math.asin(arg) / 3)
}

/**
 * Underdamped spring progress: starts at 0, settles at 1 with 1–2 overshoots
 * past 1. Normalized so u=1 lands exactly on 1.
 */
export function springProgress(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const decay = 7
  const omega = 14
  const raw = 1 - Math.exp(-decay * u) * Math.cos(omega * u)
  const end = 1 - Math.exp(-decay) * Math.cos(omega)
  if (Math.abs(end) < 1e-9) return clamp01(raw)
  return raw / end
}

/**
 * Bounce that briefly travels past the end, then settles to 1 with decaying
 * peaks (overshoot is intentional; stage clamp happens when sampling).
 */
export function bounceProgress(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const travelEnd = 0.52
  if (u < travelEnd) {
    const s = u / travelEnd
    // Ease toward first overshoot peak.
    return (1 - (1 - s) ** 2) * 1.2
  }
  const v = (u - travelEnd) / (1 - travelEnd)
  const amp = 0.2
  return 1 + amp * Math.exp(-4.2 * v) * Math.cos(2.6 * Math.PI * v)
}

/** Progress curve for resampling (may leave [0, 1] for spring/bounce). */
export function easingProgress(kind: MotionEasing, u: number): number {
  switch (kind) {
    case 'linear':
      return clamp01(u)
    case 'easeOut':
      return easeOutCubic(u)
    case 'easeInOut':
      return easeInOutSmoothstep(u)
    case 'spring':
      return springProgress(u)
    case 'bounce':
      return bounceProgress(u)
  }
}

export function isOvershootEasing(
  kind: MotionEasing,
): kind is 'spring' | 'bounce' {
  return kind === 'spring' || kind === 'bounce'
}

export function isCurveEasing(
  kind: MotionEasing,
): kind is 'easeOut' | 'easeInOut' | 'spring' | 'bounce' {
  return kind !== 'linear'
}

/** True when two samples are the same boundary point (t + position). */
function isDuplicateBoundarySample(a: MotionSample, b: MotionSample): boolean {
  return (
    Math.abs(a.t - b.t) < 1e-9 &&
    Math.abs(a.x - b.x) < 1e-9 &&
    Math.abs(a.y - b.y) < 1e-9
  )
}

type ArcTable = {
  samples: MotionSample[]
  dist: number[]
  totalDist: number
  aspect: number
}

function buildArcTable(
  samples: MotionSample[],
  aspect: number,
): ArcTable | null {
  if (samples.length < 2) return null
  const dist: number[] = [0]
  for (let k = 1; k < samples.length; k++) {
    dist.push(
      dist[k - 1]! +
        aspectDistance(
          samples[k]!.x,
          samples[k]!.y,
          samples[k - 1]!.x,
          samples[k - 1]!.y,
          aspect,
        ),
    )
  }
  const totalDist = dist[dist.length - 1]!
  if (totalDist <= 1e-9) return null
  return { samples, dist, totalDist, aspect }
}

function unitTangentAt(
  table: ArcTable,
  fromIndex: number,
  toIndex: number,
): Vec2 {
  const a = table.samples[fromIndex]!
  const b = table.samples[toIndex]!
  const dx = (b.x - a.x) * table.aspect
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) return { x: 1, y: 0 }
  // Return tangent in normalized stage space (x already aspect-weighted inverse).
  return { x: dx / len / table.aspect, y: dy / len }
}

function clampStage(p: Vec2): Vec2 {
  return { x: clamp01(p.x), y: clamp01(p.y) }
}

/**
 * Position at arc progress. Progress outside [0, 1] extrapolates along the
 * end/start tangent by (excess × totalDist) in aspect space, then clamps to
 * the stage.
 */
export function positionAtArcProgress(table: ArcTable, progress: number): Vec2 {
  const { samples, dist, totalDist } = table
  const n = samples.length

  if (progress >= 0 && progress <= 1) {
    const target = progress * totalDist
    if (target <= 0) return { x: samples[0]!.x, y: samples[0]!.y }
    if (target >= totalDist) return { x: samples[n - 1]!.x, y: samples[n - 1]!.y }
    let lo = 0
    let hi = n - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (dist[mid]! <= target) lo = mid
      else hi = mid
    }
    const d0 = dist[lo]!
    const d1 = dist[hi]!
    const span = d1 - d0
    const w = span > 1e-12 ? (target - d0) / span : 0
    return {
      x: lerp(samples[lo]!.x, samples[hi]!.x, w),
      y: lerp(samples[lo]!.y, samples[hi]!.y, w),
    }
  }

  if (progress > 1) {
    const end = samples[n - 1]!
    const tan = unitTangentAt(table, Math.max(0, n - 2), n - 1)
    const excess = (progress - 1) * totalDist
    // tan.x is already in normalized x; aspectDistance uses x*aspect.
    // excess is aspect-space length → deltaX = excess / aspect * tanDir...
    // unitTangentAt returns {dx/len/aspect, dy/len} so moving by excess along
    // aspect-space unit vector (dx/len, dy/len) means:
    //   Δ(x*aspect) = (dx/len)*excess → Δx = (dx/len)*excess/aspect = tan.x*excess
    //   Δy = (dy/len)*excess = tan.y * aspect * excess? Wait.
    // tan = { x: dx/len/aspect, y: dy/len }
    // aspect-space unit: û = (dx/len, dy/len) = (tan.x * aspect, tan.y)
    // position += excess * û in aspect space →
    //   x' = x + excess * ûx / aspect = x + excess * tan.x
    //   y' = y + excess * ûy = y + excess * tan.y
    return clampStage({
      x: end.x + excess * tan.x,
      y: end.y + excess * tan.y,
    })
  }

  // progress < 0: extrapolate backward from start along -outgoing tangent.
  const start = samples[0]!
  const tan = unitTangentAt(table, 0, Math.min(1, n - 1))
  const excess = -progress * totalDist
  return clampStage({
    x: start.x - excess * tan.x,
    y: start.y - excess * tan.y,
  })
}

export type EasingResult = {
  samples: MotionSample[]
  changed: boolean
  reason: string | null
  segmentsAdjusted: number
}

/**
 * Sample a moving segment by *incoming time* progress so Steady Speed and
 * Glide (already baked into timestamps) still affect the result. Progress
 * outside [0, 1] extrapolates along the end/start tangent (stage-clamped).
 */
export function positionAtTimedProgress(
  segment: MotionSample[],
  progress: number,
  stageAspect: number,
): Vec2 {
  if (segment.length === 0) return { x: 0.5, y: 0.5 }
  if (segment.length === 1) {
    return { x: segment[0]!.x, y: segment[0]!.y }
  }
  const aspect = clampStageAspect(stageAspect)
  const t0 = segment[0]!.t
  const t1 = segment[segment.length - 1]!.t
  const segDur = t1 - t0

  if (progress >= 0 && progress <= 1) {
    if (segDur <= 1e-12) return { x: segment[0]!.x, y: segment[0]!.y }
    const targetT = t0 + progress * segDur
    if (targetT <= t0) return { x: segment[0]!.x, y: segment[0]!.y }
    if (targetT >= t1) {
      const last = segment[segment.length - 1]!
      return { x: last.x, y: last.y }
    }
    let lo = 0
    let hi = segment.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (segment[mid]!.t <= targetT) lo = mid
      else hi = mid
    }
    const a = segment[lo]!
    const b = segment[hi]!
    const span = b.t - a.t
    const w = span > 1e-12 ? (targetT - a.t) / span : 0
    return { x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w) }
  }

  const table = buildArcTable(segment, aspect)
  if (!table) {
    const end = segment[segment.length - 1]!
    return clampStage({ x: end.x, y: end.y })
  }
  // Map overshoot magnitude through arc length (same units as Spring/Bounce).
  return positionAtArcProgress(table, progress)
}

/**
 * Apply a discrete easing preset to moving segments.
 *
 * Precedence (composes, does not replace earlier stages):
 *   Steady Speed → Glide → {@link applyEasing}
 *
 * Non-linear easing warps each moving segment by sampling the *incoming*
 * time→position curve at {@link easingProgress}. Steady and Glide therefore
 * still change motion. Pauses, endpoints, and total duration stay put.
 * Spring/Bounce may briefly leave the polyline (tangent + stage clamp).
 *
 * Raw recordings are never mutated.
 */
export function applyEasing(
  samples: MotionSample[],
  kind: MotionEasing,
  stageAspect = 1,
): EasingResult {
  if (kind === 'linear' || samples.length < 2) {
    return {
      samples: copySamples(samples),
      changed: false,
      reason: kind === 'linear' ? 'Linear easing.' : 'Path is too short.',
      segmentsAdjusted: 0,
    }
  }

  if (!isCurveEasing(kind)) {
    return {
      samples: copySamples(samples),
      changed: false,
      reason: 'Unknown easing.',
      segmentsAdjusted: 0,
    }
  }

  const aspect = clampStageAspect(stageAspect)
  const n = samples.length
  const duration = samples[n - 1]!.t
  if (duration <= 0) {
    return {
      samples: copySamples(samples),
      changed: false,
      reason: 'Path has no duration.',
      segmentsAdjusted: 0,
    }
  }

  const pause = samples.map((_, i) =>
    isInStationaryRun(samples, i, 40, aspect),
  )

  return warpMovingSegments(samples, pause, kind, aspect, duration)
}

function warpMovingSegments(
  samples: MotionSample[],
  pause: boolean[],
  kind: 'easeOut' | 'easeInOut' | 'spring' | 'bounce',
  aspect: number,
  duration: number,
): EasingResult {
  const n = samples.length
  const out: MotionSample[] = []
  let segmentsAdjusted = 0
  const densify = isOvershootEasing(kind)

  let cursor = 0
  while (cursor < n) {
    const flag = pause[cursor]!
    let end = cursor
    while (end + 1 < n && pause[end + 1] === flag) end += 1

    const slice = samples.slice(cursor, end + 1)

    if (flag || end - cursor + 1 < MIN_EASING_SEGMENT_SAMPLES) {
      for (const s of slice) out.push({ ...s })
      cursor = end + 1
      continue
    }

    const t0 = samples[cursor]!.t
    const t1 = samples[end]!.t
    const segDur = t1 - t0
    if (segDur < MIN_EASING_SEGMENT_MS) {
      for (const s of slice) out.push({ ...s })
      cursor = end + 1
      continue
    }

    if (
      out.length > 0 &&
      isDuplicateBoundarySample(out[out.length - 1]!, slice[0]!)
    ) {
      out.pop()
    }

    const startIndex = out.length
    if (densify) {
      const count = Math.max(slice.length, MIN_OVERSHOOT_SAMPLES)
      for (let i = 0; i <= count; i++) {
        const u = i / count
        const pos = positionAtTimedProgress(
          slice,
          easingProgress(kind, u),
          aspect,
        )
        out.push({ t: t0 + u * segDur, x: pos.x, y: pos.y })
      }
    } else {
      for (let k = 0; k < slice.length; k++) {
        const s = slice[k]!
        const u = segDur > 0 ? (s.t - t0) / segDur : 0
        const pos = positionAtTimedProgress(
          slice,
          easingProgress(kind, u),
          aspect,
        )
        out.push({ t: s.t, x: pos.x, y: pos.y })
      }
    }

    out[startIndex] = { t: t0, x: slice[0]!.x, y: slice[0]!.y }
    out[out.length - 1] = {
      t: t1,
      x: slice[slice.length - 1]!.x,
      y: slice[slice.length - 1]!.y,
    }
    segmentsAdjusted += 1
    cursor = end + 1
  }

  if (segmentsAdjusted === 0) {
    return {
      samples: copySamples(samples),
      changed: false,
      reason: 'Nothing to ease — pauses protect the path or sections are short.',
      segmentsAdjusted: 0,
    }
  }

  for (let k = 1; k < out.length; k++) {
    if (out[k]!.t < out[k - 1]!.t) out[k]!.t = out[k - 1]!.t
  }
  if (out.length > 0) {
    out[0]!.t = 0
    out[out.length - 1]!.t = duration
  }

  return {
    samples: out,
    changed: true,
    reason: null,
    segmentsAdjusted,
  }
}
