import { clamp01 } from './coords'
import { isInStationaryRun } from './process'
import { aspectDistance, clampStageAspect } from './stageAspect'
import type { MotionSample } from './types'

/** Default Glide strength when opening a preview session. */
export const DEFAULT_GLIDE_STRENGTH = 0.75

/** Moving segments shorter than this keep their recorded timing. */
const MIN_GLIDE_SEGMENT_MS = 64

/** Need enough samples to shape an ease without inventing motion. */
const MIN_GLIDE_SEGMENT_SAMPLES = 4

function copySamples(samples: MotionSample[]): MotionSample[] {
  return samples.map((s) => ({ ...s }))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Hermite smoothstep on [0, 1]. */
export function smoothstep(u: number): number {
  const x = clamp01(u)
  return x * x * (3 - 2 * x)
}

/**
 * Inverse of {@link smoothstep}. Maps arc fraction → normalized time so
 * linear playback yields ease-in/out along the path.
 */
export function invSmoothstep(u: number): number {
  const y = clamp01(u)
  // y = 3x² − 2x³ → x = ½ − sin(asin(1 − 2y) / 3)
  const arg = Math.min(1, Math.max(-1, 1 - 2 * y))
  return 0.5 - Math.sin(Math.asin(arg) / 3)
}

export type GlideResult = {
  samples: MotionSample[]
  changed: boolean
  reason: string | null
  /** Number of moving segments that received easing. */
  segmentsAdjusted: number
}

/**
 * Retime moving segments with ease-in/out along arc length.
 *
 * - Geometry (x, y), endpoints, and total duration are preserved.
 * - Intentional pauses keep their timestamps/durations.
 * - Sharp corners keep shape; easing spans the whole moving section
 *   (no forced stop at the corner).
 * - Short / sparse moving sections are left unchanged.
 *
 * Distinct from Steady Speed (uniform speed) and Polish (geometry fairing +
 * light uniform timing blend). Typical pipeline: Steady Speed first (optional),
 * then Glide. Applying both is intentional composition, not double application
 * of the same effect.
 */
export function applyGlide(
  samples: MotionSample[],
  amount: number,
  stageAspect = 1,
): GlideResult {
  const strength = clamp01(amount)
  if (samples.length < 2 || strength <= 0) {
    return {
      samples: copySamples(samples),
      changed: false,
      reason: strength <= 0 ? 'Glide is off.' : 'Path is too short to glide.',
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
  const newT = samples.map((s) => s.t)
  let segmentsAdjusted = 0

  let cursor = 0
  while (cursor < n) {
    const flag = pause[cursor]!
    let end = cursor
    while (end + 1 < n && pause[end + 1] === flag) end += 1

    if (!flag && end - cursor + 1 >= MIN_GLIDE_SEGMENT_SAMPLES) {
      const t0 = samples[cursor]!.t
      const t1 = samples[end]!.t
      const segDur = t1 - t0
      if (segDur >= MIN_GLIDE_SEGMENT_MS) {
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
          let touched = false
          for (let k = cursor; k <= end; k++) {
            const uArc = dist[k - cursor]! / totalDist
            const tEase = t0 + invSmoothstep(uArc) * segDur
            const next = lerp(samples[k]!.t, tEase, strength)
            if (Math.abs(next - samples[k]!.t) > 1e-6) touched = true
            newT[k] = next
          }
          if (touched) segmentsAdjusted += 1
        }
      }
    }
    cursor = end + 1
  }

  if (segmentsAdjusted === 0) {
    return {
      samples: copySamples(samples),
      changed: false,
      reason:
        'Nothing to glide — pauses protect the path or moving sections are too short.',
      segmentsAdjusted: 0,
    }
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

  return {
    samples: out,
    changed: true,
    reason: null,
    segmentsAdjusted,
  }
}

/** Peak |Δs/Δt| along the path (aspect-space / ms). */
export function peakSpeed(
  samples: MotionSample[],
  stageAspect: number,
): number {
  const aspect = clampStageAspect(stageAspect)
  let peak = 0
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i]!.t - samples[i - 1]!.t
    if (dt <= 1e-9) continue
    const ds = aspectDistance(
      samples[i - 1]!.x,
      samples[i - 1]!.y,
      samples[i]!.x,
      samples[i]!.y,
      aspect,
    )
    peak = Math.max(peak, ds / dt)
  }
  return peak
}

/**
 * Rough start/end rush: mean speed in the first vs middle third of the first
 * long moving segment (aspect-space / ms). Used by usefulness fixtures.
 */
export function segmentEdgeSpeedRatio(
  samples: MotionSample[],
  stageAspect: number,
): number | null {
  const aspect = clampStageAspect(stageAspect)
  const pause = samples.map((_, i) =>
    isInStationaryRun(samples, i, 40, aspect),
  )
  let cursor = 0
  while (cursor < samples.length) {
    const flag = pause[cursor]!
    let end = cursor
    while (end + 1 < samples.length && pause[end + 1] === flag) end += 1
    if (!flag && end - cursor >= 8) {
      const slice = samples.slice(cursor, end + 1)
      const n = slice.length
      const a = Math.max(2, Math.floor(n / 6))
      const mid0 = Math.floor(n / 3)
      const mid1 = Math.floor((2 * n) / 3)
      const mean = (lo: number, hi: number) => {
        let sum = 0
        let count = 0
        for (let i = lo + 1; i <= hi; i++) {
          const dt = slice[i]!.t - slice[i - 1]!.t
          if (dt <= 1e-9) continue
          sum +=
            aspectDistance(
              slice[i - 1]!.x,
              slice[i - 1]!.y,
              slice[i]!.x,
              slice[i]!.y,
              aspect,
            ) / dt
          count += 1
        }
        return count ? sum / count : 0
      }
      const edge = mean(0, a)
      const mid = mean(mid0, mid1)
      if (mid < 1e-12) return null
      return edge / mid
    }
    cursor = end + 1
  }
  return null
}
