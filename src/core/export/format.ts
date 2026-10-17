import { processForCss, simplifyRdp } from '../process'
import { CSS_MAX_KEYFRAMES, type Keyframe, type MotionSample } from '../types'

export function samplesToKeyframes(samples: MotionSample[]): Keyframe[] {
  if (samples.length === 0) return []

  const duration = samples[samples.length - 1].t || 1

  return samples.map((s) => ({
    offset: duration === 0 ? 0 : s.t / duration,
    x: s.x,
    y: s.y,
  }))
}

export function buildKeyframes(
  rawSamples: MotionSample[],
  smoothing: number,
  steadySpeed = 0,
): Keyframe[] {
  const processed = processForCss(rawSamples, smoothing, steadySpeed)
  return samplesToKeyframes(processed)
}

/** Keyframes from an already-processed playback path (keeps edit/export parity). */
export function buildKeyframesFromProcessed(
  processed: MotionSample[],
): Keyframe[] {
  const simplified = simplifyRdp(processed, 0.002, CSS_MAX_KEYFRAMES)
  return samplesToKeyframes(simplified)
}
