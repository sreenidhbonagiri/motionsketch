import { clamp01 } from './coords'
import type { MotionSample, Vec2 } from './types'

/** Default number of draggable handles along the path (including endpoints). */
export const DEFAULT_HANDLE_COUNT = 9

/** Copy samples without sharing references. */
export function copyPath(samples: MotionSample[]): MotionSample[] {
  return samples.map((s) => ({ t: s.t, x: s.x, y: s.y }))
}

/**
 * Evenly spaced handle indices into a canonical path.
 * Always includes the first and last samples.
 */
export function selectHandleIndices(
  sampleCount: number,
  handleCount: number = DEFAULT_HANDLE_COUNT,
): number[] {
  if (sampleCount <= 0) return []
  if (sampleCount === 1) return [0]
  if (handleCount <= 2 || sampleCount === 2) return [0, sampleCount - 1]

  const count = Math.min(handleCount, sampleCount)
  const indices = new Set<number>()
  indices.add(0)
  indices.add(sampleCount - 1)
  for (let i = 1; i < count - 1; i++) {
    indices.add(Math.round((i / (count - 1)) * (sampleCount - 1)))
  }
  return [...indices].sort((a, b) => a - b)
}

/**
 * Cosine falloff weight by sample-index distance.
 * w=1 at the handle, w=0 at/ beyond radius — smooth and predictable.
 */
export function influenceWeight(
  sampleIndex: number,
  handleIndex: number,
  radius: number,
): number {
  if (radius <= 0) {
    return sampleIndex === handleIndex ? 1 : 0
  }
  const d = Math.abs(sampleIndex - handleIndex)
  if (d >= radius) return 0
  const u = d / radius
  return 0.5 * (1 + Math.cos(Math.PI * u))
}

export function defaultInfluenceRadius(sampleCount: number): number {
  // ~1/8 of the path, enough for smooth bends without warping the whole curve.
  return Math.max(6, Math.round(sampleCount / 8))
}

/**
 * Move a handle by delta, deforming nearby samples with cosine falloff.
 * Timestamps are preserved exactly so duration/timing stay intact.
 */
export function applyHandleDelta(
  samples: MotionSample[],
  handleIndex: number,
  delta: Vec2,
  radius: number = defaultInfluenceRadius(samples.length),
): MotionSample[] {
  if (
    samples.length === 0 ||
    handleIndex < 0 ||
    handleIndex >= samples.length
  ) {
    return copyPath(samples)
  }

  if (delta.x === 0 && delta.y === 0) {
    return copyPath(samples)
  }

  return samples.map((sample, i) => {
    const w = influenceWeight(i, handleIndex, radius)
    if (w === 0) {
      return { t: sample.t, x: sample.x, y: sample.y }
    }
    return {
      t: sample.t,
      x: clamp01(sample.x + delta.x * w),
      y: clamp01(sample.y + delta.y * w),
    }
  })
}

/** Nudge a handle by a small normalized step (keyboard). */
export function nudgeHandle(
  samples: MotionSample[],
  handleIndex: number,
  step: Vec2,
  radius?: number,
): MotionSample[] {
  return applyHandleDelta(samples, handleIndex, step, radius)
}

/** True when every sample timestamp matches (geometry-only edit). */
export function timestampsPreserved(
  before: MotionSample[],
  after: MotionSample[],
): boolean {
  if (before.length !== after.length) return false
  for (let i = 0; i < before.length; i++) {
    if (before[i].t !== after[i].t) return false
  }
  return true
}
