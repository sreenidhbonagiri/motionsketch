import { evaluate } from '../playback'
import type { Keyframe, MotionSample, Vec2 } from '../types'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Evaluate a keyframe list the same way CSS linear interpolation would. */
export function evaluateKeyframes(keyframes: Keyframe[], tNorm: number): Vec2 {
  if (keyframes.length === 0) return { x: 0.5, y: 0.5 }
  if (keyframes.length === 1 || tNorm <= keyframes[0].offset) {
    return { x: keyframes[0].x, y: keyframes[0].y }
  }

  const last = keyframes[keyframes.length - 1]
  if (tNorm >= last.offset) {
    return { x: last.x, y: last.y }
  }

  let lo = 0
  let hi = keyframes.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (keyframes[mid].offset <= tNorm) lo = mid
    else hi = mid
  }

  const a = keyframes[lo]
  const b = keyframes[hi]
  const span = b.offset - a.offset
  const u = span === 0 ? 0 : (tNorm - a.offset) / span
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
  }
}

export function maxPlaybackExportError(
  playbackPath: MotionSample[],
  keyframes: Keyframe[],
  samples = 32,
): number {
  let maxErr = 0
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    const a = evaluate(playbackPath, t)
    const b = evaluateKeyframes(keyframes, t)
    maxErr = Math.max(maxErr, Math.hypot(a.x - b.x, a.y - b.y))
  }
  return maxErr
}
