import { clamp01 } from './coords'
import type { MotionSample, Vec2 } from './types'

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

export function tNormFromElapsed(
  elapsedMs: number,
  durationMs: number,
  loop: boolean,
): { tNorm: number; finished: boolean } {
  if (durationMs <= 0) {
    return { tNorm: 1, finished: !loop }
  }

  if (loop) {
    const mod = elapsedMs % durationMs
    return { tNorm: mod / durationMs, finished: false }
  }

  if (elapsedMs >= durationMs) {
    return { tNorm: 1, finished: true }
  }

  return { tNorm: elapsedMs / durationMs, finished: false }
}
