import { clamp, clamp01 } from './coords'
import {
  copyPath,
  isEndpointHandle,
  localBendNeighborhood,
} from './edit'
import { isInStationaryRun } from './process'
import { aspectDistance, clampStageAspect } from './stageAspect'
import type { MotionSample } from './types'

/** Strength 0..1 → aspect-space max sample drift. */
const MAX_DEV_MIN = 0.004
const MAX_DEV_MAX = 0.018

/** Dense polyline check may not exceed this multiple of maxDev. */
const DENSE_DEV_FACTOR = 1.15

/** Reject polish if total path length grows by more than this fraction. */
const MAX_LENGTH_GROWTH = 0.04

/** Corner protection: turn angle (radians) with adequate arm length. */
const CORNER_ANGLE_RAD = 0.87 // ~50°
const MIN_CORNER_ARM = 0.02

/** Timing blend toward arc-length uniformity inside moving segments. */
const TIMING_BLEND_SCALE = 0.65

/** Below this max position change, treat as already clean. */
const CLEAN_EPS = 1e-5

export type PolishMotionOptions = {
  strength: number
  stageAspect: number
  /** Sample indices that must stay put (handles + inferred corners/pauses). */
  anchorIndices?: readonly number[]
  /**
   * When set, relax corner/handle protection at this interior sample so polish
   * may move it (and non-handle neighbors in its bend neighborhood) within
   * the deviation bound. Other handles, pauses, and endpoints stay anchored.
   */
  relaxCornerAtIndex?: number | null
}

export type PolishMotionResult = {
  samples: MotionSample[]
  changed: boolean
  /** Present when unchanged or polish was rejected. */
  reason?: string
  /** Max aspect deviation vs input (dense, between samples). */
  maxDeviation: number
  /** Whether timing within moving segments was redistributed. */
  timingAdjusted: boolean
}

export type PolishRoundingAvailability = {
  enabled: boolean
  /** Concise reason when the rounding override cannot be offered. */
  message: string | null
  /** Bend neighborhood used for preview highlight when enabled. */
  neighborhood: { lo: number; hi: number } | null
}

/**
 * Whether “Allow rounding at this point” can target `handleIndex`.
 * Endpoints and pause samples stay locked; requires an interior handle.
 */
export function polishRoundingAvailability(
  samples: MotionSample[],
  handleIndices: readonly number[],
  handleIndex: number | null,
  stageAspect: number,
): PolishRoundingAvailability {
  const aspect = clampStageAspect(stageAspect)
  if (handleIndex === null || samples.length < 3) {
    return {
      enabled: false,
      message: 'Select an interior path point in Edit path first.',
      neighborhood: null,
    }
  }
  if (isEndpointHandle(samples.length, handleIndex)) {
    return {
      enabled: false,
      message: 'Endpoints stay anchored and cannot be rounded.',
      neighborhood: null,
    }
  }
  if (!handleIndices.includes(handleIndex)) {
    return {
      enabled: false,
      message: 'Select an interior path point in Edit path first.',
      neighborhood: null,
    }
  }
  if (isInStationaryRun(samples, handleIndex, 40, aspect)) {
    return {
      enabled: false,
      message: 'This point is part of a pause and cannot be rounded.',
      neighborhood: null,
    }
  }
  const nb = localBendNeighborhood(
    samples,
    [...handleIndices],
    handleIndex,
    aspect,
  )
  if (!nb) {
    return {
      enabled: false,
      message: 'Neighborhood is too narrow to round this point safely.',
      neighborhood: null,
    }
  }
  return {
    enabled: true,
    message: null,
    neighborhood: { lo: nb.lo, hi: nb.hi },
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function pathLength(samples: MotionSample[], aspect: number): number {
  let len = 0
  for (let i = 1; i < samples.length; i++) {
    len += aspectDistance(
      samples[i - 1]!.x,
      samples[i - 1]!.y,
      samples[i]!.x,
      samples[i]!.y,
      aspect,
    )
  }
  return len
}

function turnAngleRad(
  samples: MotionSample[],
  index: number,
  aspect: number,
): number {
  if (index <= 0 || index >= samples.length - 1) return 0
  const a = samples[index - 1]!
  const b = samples[index]!
  const c = samples[index + 1]!
  const v1x = (b.x - a.x) * aspect
  const v1y = b.y - a.y
  const v2x = (c.x - b.x) * aspect
  const v2y = c.y - b.y
  const n1 = Math.hypot(v1x, v1y)
  const n2 = Math.hypot(v2x, v2y)
  if (n1 < MIN_CORNER_ARM || n2 < MIN_CORNER_ARM) return 0
  const dot = clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1)
  return Math.acos(dot)
}

function boundToOriginal(
  original: MotionSample,
  x: number,
  y: number,
  maxDev: number,
  aspect: number,
): { x: number; y: number } {
  const dx = (x - original.x) * aspect
  const dy = y - original.y
  const dist = Math.hypot(dx, dy)
  if (dist <= maxDev || dist === 0) {
    return { x: clamp01(x), y: clamp01(y) }
  }
  const scale = maxDev / dist
  return {
    x: clamp01(original.x + (dx * scale) / aspect),
    y: clamp01(original.y + dy * scale),
  }
}

/**
 * Build a protection mask. Prefer retain when corner evidence is weak.
 * Anchors (handles) are protected unless explicitly relaxed for rounding.
 */
export function buildPolishProtection(
  samples: MotionSample[],
  stageAspect: number,
  anchorIndices: readonly number[] = [],
  relaxCornerAtIndex: number | null = null,
): boolean[] {
  const n = samples.length
  const aspect = clampStageAspect(stageAspect)
  const protectedMask = new Array<boolean>(n).fill(false)
  if (n === 0) return protectedMask

  protectedMask[0] = true
  protectedMask[n - 1] = true

  for (const idx of anchorIndices) {
    if (idx >= 0 && idx < n) protectedMask[idx] = true
  }

  for (let i = 0; i < n; i++) {
    if (isInStationaryRun(samples, i, 40, aspect)) {
      protectedMask[i] = true
    }
  }

  for (let i = 1; i < n - 1; i++) {
    const angle = turnAngleRad(samples, i, aspect)
    if (angle >= CORNER_ANGLE_RAD) {
      protectedMask[i] = true
      // Prefer retain: also shield immediate neighbors of hard corners.
      if (angle >= 1.2) {
        protectedMask[i - 1] = true
        protectedMask[i + 1] = true
      }
    }
  }

  const relax = polishRoundingAvailability(
    samples,
    anchorIndices,
    relaxCornerAtIndex,
    aspect,
  )
  if (
    relax.enabled &&
    relaxCornerAtIndex !== null &&
    relax.neighborhood
  ) {
    const handleSet = new Set(anchorIndices)
    const { lo, hi } = relax.neighborhood
    for (let i = lo + 1; i < hi; i++) {
      if (i <= 0 || i >= n - 1) continue
      if (isInStationaryRun(samples, i, 40, aspect)) continue
      if (handleSet.has(i) && i !== relaxCornerAtIndex) continue
      protectedMask[i] = false
    }
    protectedMask[relaxCornerAtIndex] = false
  }

  return protectedMask
}

/**
 * Max aspect-space distance between two polylines, densified between vertices.
 */
export function maxDensePolylineDeviation(
  a: MotionSample[],
  b: MotionSample[],
  stageAspect: number,
  stepsPerSegment = 4,
): number {
  const aspect = clampStageAspect(stageAspect)
  if (a.length < 2 || b.length < 2) return 0
  let max = 0

  const measure = (from: MotionSample[], to: MotionSample[]) => {
    for (let i = 0; i < from.length - 1; i++) {
      const p0 = from[i]!
      const p1 = from[i + 1]!
      for (let s = 0; s <= stepsPerSegment; s++) {
        const u = s / stepsPerSegment
        const x = lerp(p0.x, p1.x, u)
        const y = lerp(p0.y, p1.y, u)
        // Nearest point on `to` polyline (segment-wise).
        let best = Infinity
        for (let j = 0; j < to.length - 1; j++) {
          const q0 = to[j]!
          const q1 = to[j + 1]!
          const ax = (q1.x - q0.x) * aspect
          const ay = q1.y - q0.y
          const lenSq = ax * ax + ay * ay
          let t = 0
          if (lenSq > 1e-18) {
            t = clamp(
              (((x - q0.x) * aspect) * ax + (y - q0.y) * ay) / lenSq,
              0,
              1,
            )
          }
          const px = q0.x + (q1.x - q0.x) * t
          const py = q0.y + (q1.y - q0.y) * t
          best = Math.min(best, aspectDistance(x, y, px, py, aspect))
        }
        if (best < Infinity) max = Math.max(max, best)
      }
    }
  }

  measure(a, b)
  measure(b, a)
  return max
}

function fairUnprotected(
  samples: MotionSample[],
  protectedMask: boolean[],
  strength: number,
  maxDev: number,
  aspect: number,
): MotionSample[] {
  const out = copyPath(samples)
  const iterations = 1 + Math.floor(strength * 3)
  const blend = 0.35 + 0.4 * strength

  for (let iter = 0; iter < iterations; iter++) {
    const prev = copyPath(out)
    for (let i = 1; i < out.length - 1; i++) {
      if (protectedMask[i]) continue
      const ax = prev[i - 1]!.x
      const ay = prev[i - 1]!.y
      const cx = prev[i + 1]!.x
      const cy = prev[i + 1]!.y
      const midX = (ax + cx) * 0.5
      const midY = (ay + cy) * 0.5
      const nx = lerp(prev[i]!.x, midX, blend)
      const ny = lerp(prev[i]!.y, midY, blend)
      const bounded = boundToOriginal(samples[i]!, nx, ny, maxDev, aspect)
      out[i] = { t: prev[i]!.t, x: bounded.x, y: bounded.y }
    }
    // Re-anchor protected samples every iteration.
    for (let i = 0; i < out.length; i++) {
      if (!protectedMask[i]) continue
      out[i] = { t: out[i]!.t, x: samples[i]!.x, y: samples[i]!.y }
    }
  }

  return out
}

function blendMovingSegmentTiming(
  samples: MotionSample[],
  amount: number,
  aspect: number,
): { samples: MotionSample[]; timingAdjusted: boolean } {
  if (samples.length < 2 || amount <= 0) {
    return { samples: copyPath(samples), timingAdjusted: false }
  }

  const n = samples.length
  const duration = samples[n - 1]!.t
  if (duration <= 0) {
    return { samples: copyPath(samples), timingAdjusted: false }
  }

  const pause = samples.map((_, i) => isInStationaryRun(samples, i, 40, aspect))
  const newT = samples.map((s) => s.t)
  let adjusted = false

  let cursor = 0
  while (cursor < n) {
    const flag = pause[cursor]!
    let end = cursor
    while (end + 1 < n && pause[end + 1] === flag) end += 1
    if (!flag && end > cursor) {
      const t0 = samples[cursor]!.t
      const t1 = samples[end]!.t
      const segDur = t1 - t0
      if (segDur > 0) {
        const dist: number[] = [0]
        for (let k = cursor + 1; k <= end; k++) {
          dist.push(
            dist[dist.length - 1]! +
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
        if (totalDist > 1e-9) {
          for (let k = cursor; k <= end; k++) {
            const u = dist[k - cursor]! / totalDist
            const tUniform = t0 + u * segDur
            const next = lerp(samples[k]!.t, tUniform, amount)
            if (Math.abs(next - samples[k]!.t) > 1e-6) adjusted = true
            newT[k] = next
          }
        }
      }
    }
    cursor = end + 1
  }

  for (let k = 1; k < n; k++) {
    if (newT[k]! < newT[k - 1]!) newT[k] = newT[k - 1]!
  }

  const endT = newT[n - 1]!
  const scale = endT > 0 ? duration / endT : 1
  const out = samples.map((s, i) => ({
    t: newT[i]! * scale,
    x: s.x,
    y: s.y,
  }))
  out[0]!.t = 0
  out[n - 1]!.t = duration
  return { samples: out, timingAdjusted: adjusted }
}

function maxVertexDeviation(
  a: MotionSample[],
  b: MotionSample[],
  aspect: number,
): number {
  const n = Math.min(a.length, b.length)
  let max = 0
  for (let i = 0; i < n; i++) {
    max = Math.max(
      max,
      aspectDistance(a[i]!.x, a[i]!.y, b[i]!.x, b[i]!.y, aspect),
    )
  }
  return max
}

/**
 * Polish a spatial path: fair unprotected spans, then mildly equalize timing
 * inside moving segments. Deterministic. Leaves path unchanged when unsafe
 * or already clean.
 */
export function polishMotion(
  samples: MotionSample[],
  options: PolishMotionOptions,
): PolishMotionResult {
  const strength = clamp01(options.strength)
  const aspect = clampStageAspect(options.stageAspect)
  const baseline = copyPath(samples)

  if (baseline.length < 3) {
    return {
      samples: baseline,
      changed: false,
      reason: 'Path is too short to polish.',
      maxDeviation: 0,
      timingAdjusted: false,
    }
  }

  if (strength <= 0) {
    return {
      samples: baseline,
      changed: false,
      reason: 'Strength is zero — nothing to polish.',
      maxDeviation: 0,
      timingAdjusted: false,
    }
  }

  const anchors = options.anchorIndices ?? []
  const relaxAt =
    typeof options.relaxCornerAtIndex === 'number'
      ? options.relaxCornerAtIndex
      : null
  const protectedMask = buildPolishProtection(
    baseline,
    aspect,
    anchors,
    relaxAt,
  )
  const movable = protectedMask.some((p) => !p)
  const maxDev = lerp(MAX_DEV_MIN, MAX_DEV_MAX, strength)

  let faired = baseline
  if (movable) {
    faired = fairUnprotected(baseline, protectedMask, strength, maxDev, aspect)
  }

  // Pin endpoints and still-protected samples explicitly (timestamps untouched).
  for (let i = 0; i < faired.length; i++) {
    if (protectedMask[i]) {
      faired[i] = {
        t: baseline[i]!.t,
        x: baseline[i]!.x,
        y: baseline[i]!.y,
      }
    } else {
      // Geometry pass never rewrites timestamps.
      faired[i] = {
        t: baseline[i]!.t,
        x: faired[i]!.x,
        y: faired[i]!.y,
      }
    }
  }
  faired[0] = {
    t: baseline[0]!.t,
    x: baseline[0]!.x,
    y: baseline[0]!.y,
  }
  faired[faired.length - 1] = {
    t: baseline[baseline.length - 1]!.t,
    x: baseline[baseline.length - 1]!.x,
    y: baseline[baseline.length - 1]!.y,
  }

  const lenBefore = pathLength(baseline, aspect)
  const lenAfter = pathLength(faired, aspect)
  if (lenBefore > 1e-9 && lenAfter > lenBefore * (1 + MAX_LENGTH_GROWTH)) {
    return {
      samples: baseline,
      changed: false,
      reason:
        'Polish would stretch the path too far — left unchanged to avoid overshoot.',
      maxDeviation: 0,
      timingAdjusted: false,
    }
  }

  const denseDev = maxDensePolylineDeviation(baseline, faired, aspect)
  if (denseDev > maxDev * DENSE_DEV_FACTOR) {
    return {
      samples: baseline,
      changed: false,
      reason:
        'Polish exceeded the safe deviation bound — left unchanged.',
      maxDeviation: denseDev,
      timingAdjusted: false,
    }
  }

  // Rounding override is a geometry-only pass: keep sample timestamps.
  // Normal polish may still blend timing in moving segments separately.
  const timingAmount =
    relaxAt !== null ? 0 : strength * TIMING_BLEND_SCALE
  const timed = blendMovingSegmentTiming(faired, timingAmount, aspect)

  const vertexDev = maxVertexDeviation(baseline, timed.samples, aspect)
  const finalDense = maxDensePolylineDeviation(baseline, timed.samples, aspect)
  const changed =
    vertexDev > CLEAN_EPS ||
    finalDense > CLEAN_EPS ||
    timed.timingAdjusted

  if (!changed) {
    return {
      samples: baseline,
      changed: false,
      reason: movable
        ? 'Path is already clean within polish constraints.'
        : 'Nothing to polish — pauses, corners, and handles protect the whole path.',
      maxDeviation: 0,
      timingAdjusted: false,
    }
  }

  // Duration and endpoints must match.
  timed.samples[0]!.t = 0
  timed.samples[0]!.x = baseline[0]!.x
  timed.samples[0]!.y = baseline[0]!.y
  const last = timed.samples.length - 1
  timed.samples[last]!.t = baseline[last]!.t
  timed.samples[last]!.x = baseline[last]!.x
  timed.samples[last]!.y = baseline[last]!.y

  return {
    samples: timed.samples,
    changed: true,
    maxDeviation: Math.max(denseDev, finalDense),
    timingAdjusted: timed.timingAdjusted,
  }
}
