import { processForCss } from '../process'
import type { Keyframe, MotionSample } from '../types'

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
