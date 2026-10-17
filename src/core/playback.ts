import { clamp01 } from './coords'
import type { LoopMode, MotionSample, Vec2 } from './types'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Evaluate position at normalized playhead tNorm ∈ [0, 1].
 * Samples use absolute recorded time; evaluation stretches across the path.
 */
export function evaluate(samples: MotionSample[], tNorm: number): Vec2 {
  if (samples.length === 0) {
    return { x: 0.5, y: 0.5 }
  }
  if (samples.length === 1) {
    return { x: samples[0].x, y: samples[0].y }
  }

  const t = clamp01(tNorm)
  const duration = samples[samples.length - 1].t
  if (duration <= 0) {
    return { x: samples[0].x, y: samples[0].y }
  }

  const targetT = t * duration

  if (targetT <= samples[0].t) {
    return { x: samples[0].x, y: samples[0].y }
  }

  const last = samples[samples.length - 1]
  if (targetT >= last.t) {
    return { x: last.x, y: last.y }
  }

  let lo = 0
  let hi = samples.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t <= targetT) lo = mid
    else hi = mid
  }

  const a = samples[lo]
  const b = samples[hi]
  const span = b.t - a.t
  const u = span === 0 ? 0 : (targetT - a.t) / span

  return {
    x: clamp01(lerp(a.x, b.x, u)),
    y: clamp01(lerp(a.y, b.y, u)),
  }
}

export type PlaybackDirection = 1 | -1

export interface PlayheadSample {
  /** Path position in [0, 1] (start → end). */
  tNorm: number
  finished: boolean
  direction: PlaybackDirection
}

/**
 * Map wall-clock elapsed time onto a path playhead.
 *
 * - Loop off: one forward pass; finishes at t=1.
 * - Repeat: wraps 0→1→0… (may jump if endpoints differ).
 * - Alternate: triangle wave 0→1→0… with no position jump; one-way
 *   duration is `durationMs`, full cycle is `2 * durationMs`.
 */
export function tNormFromElapsed(
  elapsedMs: number,
  durationMs: number,
  loop: boolean,
  loopMode: LoopMode = 'repeat',
): PlayheadSample {
  if (durationMs <= 0) {
    return { tNorm: 1, finished: !loop, direction: 1 }
  }

  if (!loop) {
    if (elapsedMs >= durationMs) {
      return { tNorm: 1, finished: true, direction: 1 }
    }
    const t = Math.max(0, elapsedMs) / durationMs
    return { tNorm: t, finished: false, direction: 1 }
  }

  if (loopMode === 'repeat') {
    const mod = positiveMod(elapsedMs, durationMs)
    return { tNorm: mod / durationMs, finished: false, direction: 1 }
  }

  // alternate (back and forth)
  const cycle = durationMs * 2
  const mod = positiveMod(elapsedMs, cycle)
  if (mod <= durationMs) {
    // Forward half, including the end endpoint (mod === durationMs → tNorm 1).
    return {
      tNorm: mod / durationMs,
      finished: false,
      direction: 1,
    }
  }
  const back = mod - durationMs
  return {
    tNorm: 1 - back / durationMs,
    finished: false,
    direction: -1,
  }
}

/**
 * Convert a playhead + direction into an elapsed offset so pause/resume
 * continues in the same direction without a jump.
 */
export function elapsedFromPlayhead(
  tNorm: number,
  direction: PlaybackDirection,
  durationMs: number,
  loop: boolean,
  loopMode: LoopMode,
): number {
  const t = clamp01(tNorm)
  if (durationMs <= 0) return 0

  if (!loop || loopMode === 'repeat' || direction === 1) {
    return t * durationMs
  }

  // Backward half of an alternate cycle.
  return durationMs + (1 - t) * durationMs
}

/** Elapsed within the current one-way traversal (0 at each turnaround). */
export function traversalElapsedMs(
  tNorm: number,
  direction: PlaybackDirection,
  durationMs: number,
): number {
  const t = clamp01(tNorm)
  return direction === 1 ? t * durationMs : (1 - t) * durationMs
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}
