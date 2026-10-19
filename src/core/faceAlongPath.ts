import { clamp01 } from './coords'
import { aspectDistance, clampStageAspect } from './stageAspect'
import { evaluateTransform } from './transform'
import type { MotionSample, SceneActor } from './types'

/** Aspect-space length below which a segment is treated as a pause. */
export const HEADING_PAUSE_EPS = 1e-5

/**
 * Symmetric smoothing window as a fraction of total path length.
 * Kept short so corners are not anticipated far ahead.
 */
export const HEADING_SMOOTH_FRACTION = 0.035

/** Hard cap on samples included in the smoothing window (each side + center). */
export const HEADING_SMOOTH_MAX_RADIUS = 4

/** Minimum heading change (°) that inserts an export keyframe. */
export const HEADING_EXPORT_STEP_DEG = 6

/**
 * Soft cap on total export local offsets when facing is on.
 * Prefer meeting {@link HEADING_EXPORT_ANGULAR_TOLERANCE_DEG}; if the cap
 * prevents that, export surfaces an explicit fidelity warning instead of
 * silently thinning turns.
 */
export const HEADING_EXPORT_MAX_OFFSETS = 120

/**
 * Max allowed unwrapped angular error (°) for the *sampled* export fidelity
 * check: peak |editor rotation − CSS linear lerp| over
 * {@link HEADING_EXPORT_ERROR_PROBE_COUNT} evenly spaced local times in [0, 1].
 * This is not a continuous / analytical bound. Chosen as half of
 * {@link HEADING_EXPORT_STEP_DEG} so densified heading samples stay visually
 * faithful through sharp turns.
 */
export const HEADING_EXPORT_ANGULAR_TOLERANCE_DEG = HEADING_EXPORT_STEP_DEG / 2

/** Evenly spaced probe count for {@link measureExportHeadingError}. */
export const HEADING_EXPORT_ERROR_PROBE_COUNT = 800

/** Negligible FP slack when comparing measured error to the tolerance. */
const ANGULAR_TOLERANCE_EPS_DEG = 1e-9

export interface HeadingSample {
  /** Absolute time along the processed path (same domain as MotionSample.t). */
  t: number
  /** Unwrapped heading in degrees (CSS: +clockwise from +x, y-down). */
  headingDeg: number
}

function aspectDelta(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  stageAspect: number,
): { dx: number; dy: number; len: number } {
  const aspect = clampStageAspect(stageAspect)
  const dx = (bx - ax) * aspect
  const dy = by - ay
  return { dx, dy, len: Math.hypot(dx, dy) }
}

/** Instantaneous heading from A→B in CSS degrees, or null if too short. */
export function segmentHeadingDeg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  stageAspect: number,
): number | null {
  const { dx, dy, len } = aspectDelta(ax, ay, bx, by, stageAspect)
  if (len < HEADING_PAUSE_EPS) return null
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

/** Smallest signed delta from `from` to `to` on the circle (−180, 180]. */
export function shortestAngleDeltaDeg(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

function unwrapHeading(prev: number, next: number): number {
  return prev + shortestAngleDeltaDeg(prev, next)
}

function pathLength(samples: MotionSample[], stageAspect: number): number {
  let total = 0
  for (let i = 1; i < samples.length; i++) {
    total += aspectDistance(
      samples[i - 1]!.x,
      samples[i - 1]!.y,
      samples[i]!.x,
      samples[i]!.y,
      stageAspect,
    )
  }
  return total
}

/**
 * Build a per-sample heading track from the processed path used for playback
 * and export. Pauses hold the prior heading; stationary paths stay at 0°.
 * Headings are unwrapped and lightly smoothed along arc length.
 */
export function buildHeadingTrack(
  samples: MotionSample[],
  stageAspect: number,
): HeadingSample[] {
  if (samples.length === 0) return []
  if (samples.length === 1) {
    return [{ t: samples[0]!.t, headingDeg: 0 }]
  }

  const aspect = clampStageAspect(stageAspect)
  const n = samples.length
  const segLen = (i: number, j: number) =>
    aspectDistance(
      samples[i]!.x,
      samples[i]!.y,
      samples[j]!.x,
      samples[j]!.y,
      aspect,
    )

  const outgoing: Array<number | null> = new Array(n).fill(null)
  const incoming: Array<number | null> = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const h = segmentHeadingDeg(
        samples[i]!.x,
        samples[i]!.y,
        samples[j]!.x,
        samples[j]!.y,
        aspect,
      )
      if (h !== null) {
        outgoing[i] = h
        break
      }
    }
    for (let j = i - 1; j >= 0; j--) {
      const h = segmentHeadingDeg(
        samples[j]!.x,
        samples[j]!.y,
        samples[i]!.x,
        samples[i]!.y,
        aspect,
      )
      if (h !== null) {
        incoming[i] = h
        break
      }
    }
  }

  // Moving samples use travel direction (outgoing). Pause samples — and the
  // still-stationary sample that begins the next leg — hold the incoming
  // heading so the upcoming turn is not applied while parked. Turning resumes
  // on samples after motion has actually occurred (prevLen > 0).
  const raw: Array<number | null> = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const prevLen = i > 0 ? segLen(i - 1, i) : 0
    const nextLen = i < n - 1 ? segLen(i, i + 1) : 0
    const paused = prevLen < HEADING_PAUSE_EPS && nextLen < HEADING_PAUSE_EPS
    const stillOnDwell =
      prevLen < HEADING_PAUSE_EPS && nextLen >= HEADING_PAUSE_EPS
    if (paused || stillOnDwell) {
      raw[i] = incoming[i] ?? outgoing[i]
    } else if (nextLen >= HEADING_PAUSE_EPS) {
      raw[i] = outgoing[i] ?? incoming[i]
    } else {
      // Arriving into a pause / end — keep incoming travel direction.
      raw[i] = incoming[i] ?? outgoing[i]
    }
  }

  let last: number | null = null
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== null) last = raw[i]
    else if (last !== null) raw[i] = last
  }
  last = null
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i] !== null) last = raw[i]
    else if (last !== null) raw[i] = last
  }

  if (raw.every((h) => h === null)) {
    return samples.map((s) => ({ t: s.t, headingDeg: 0 }))
  }

  // Unwrap so consecutive samples never jump ±180°.
  const unwrapped: number[] = new Array(samples.length)
  let prev = raw.find((h) => h !== null) ?? 0
  for (let i = 0; i < samples.length; i++) {
    const cur = raw[i] ?? prev
    const next = i === 0 ? cur : unwrapHeading(prev, cur)
    unwrapped[i] = next
    prev = next
  }

  // Short arc-length box smooth — mostly causal (look back) with a tiny
  // forward peek so corners are not rounded far in advance.
  //
  // Pause / dwell segments (near-zero length) are hard barriers: the window
  // must not walk through them. Zero-length steps would otherwise leave the
  // peek budget unused and blend the *upcoming* turn into a stationary hold.
  // Tradeoff: after a pause, the first moving samples may still blend briefly
  // with the held inbound heading (softening departure) — we do not anticipate
  // the next leg while parked, so a sharp corner after a dwell can change
  // heading quickly once motion resumes.
  const totalLen = pathLength(samples, aspect)
  const windowLen = Math.max(
    HEADING_PAUSE_EPS,
    totalLen * HEADING_SMOOTH_FRACTION,
  )
  const forwardPeek = windowLen * 0.35
  const smoothed = unwrapped.map((h, i) => {
    if (totalLen < HEADING_PAUSE_EPS * 2) return h
    const prevLen = i > 0 ? segLen(i - 1, i) : 0
    // Complete dwell protection: any sample that has not yet moved from its
    // predecessor — including the departure-boundary sample whose *next*
    // segment is moving — must not run forwardPeek into the upcoming turn.
    // Otherwise heading lerps across the final stationary interval while the
    // actor center stays put.
    if (prevLen < HEADING_PAUSE_EPS) {
      return h
    }
    let sum = h
    let weight = 1
    let acc = 0
    for (let j = i - 1; j >= 0 && i - j <= HEADING_SMOOTH_MAX_RADIUS; j--) {
      const step = segLen(j, j + 1)
      if (step < HEADING_PAUSE_EPS) break
      acc += step
      if (acc > windowLen) break
      sum += unwrapped[j]!
      weight += 1
    }
    acc = 0
    for (
      let j = i + 1;
      j < samples.length && j - i <= Math.max(1, HEADING_SMOOTH_MAX_RADIUS - 2);
      j++
    ) {
      const step = segLen(j - 1, j)
      if (step < HEADING_PAUSE_EPS) break
      acc += step
      if (acc > forwardPeek) break
      sum += unwrapped[j]!
      weight += 1
    }
    return sum / weight
  })

  return samples.map((s, i) => ({
    t: s.t,
    headingDeg: smoothed[i]!,
  }))
}

/** Evaluate unwrapped path heading at clip-local progress. */
export function evaluatePathHeading(
  track: HeadingSample[],
  tNorm: number,
): number {
  if (track.length === 0) return 0
  if (track.length === 1) return track[0]!.headingDeg

  const t = clamp01(tNorm)
  const duration = track[track.length - 1]!.t
  if (duration <= 0) return track[0]!.headingDeg

  const targetT = t * duration
  if (targetT <= track[0]!.t) return track[0]!.headingDeg
  const last = track[track.length - 1]!
  if (targetT >= last.t) return last.headingDeg

  let lo = 0
  let hi = track.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (track[mid]!.t <= targetT) lo = mid
    else hi = mid
  }
  const a = track[lo]!
  const b = track[hi]!
  const span = b.t - a.t
  const u = span === 0 ? 0 : (targetT - a.t) / span
  return a.headingDeg + (b.headingDeg - a.headingDeg) * u
}

/**
 * Convenience: build + evaluate heading from processed samples.
 * Prefer {@link buildHeadingTrack} when evaluating many times.
 */
export function pathHeadingAt(
  samples: MotionSample[],
  tNorm: number,
  stageAspect: number,
): number {
  return evaluatePathHeading(buildHeadingTrack(samples, stageAspect), tNorm)
}

export function clampDirectionOffsetDeg(value: number): number {
  if (!Number.isFinite(value)) return 0
  // Keep a wide authoring range; display can wrap visually.
  return Math.min(3600, Math.max(-3600, value))
}

/**
 * Total actor rotation: path heading (if enabled) + direction offset +
 * transform track. Never mutates the transform track.
 */
export function evaluateActorRotationDeg(
  actor: Pick<
    SceneActor,
    'faceAlongPath' | 'directionOffsetDeg' | 'transform'
  >,
  samples: MotionSample[],
  localT: number,
  stageAspect: number,
  headingTrack?: HeadingSample[],
): number {
  const xf = evaluateTransform(actor.transform, localT)
  let heading = 0
  if (actor.faceAlongPath && samples.length >= 2) {
    const track = headingTrack ?? buildHeadingTrack(samples, stageAspect)
    heading = evaluatePathHeading(track, localT)
  }
  const offset = actor.faceAlongPath
    ? clampDirectionOffsetDeg(actor.directionOffsetDeg)
    : 0
  return heading + offset + xf.rotationDeg
}

/**
 * Clip-local offsets at path pause enter/leave (and stationary samples).
 * These must survive adaptive thinning even when heading is already flat
 * along a straight approach into the dwell.
 */
export function pauseExportOffsets(
  samples: MotionSample[],
  stageAspect: number,
): number[] {
  if (samples.length < 2) return []
  const duration = samples[samples.length - 1]!.t
  if (duration <= 0) return [0, 1]
  const aspect = clampStageAspect(stageAspect)
  const set = new Set<number>()
  for (let i = 0; i < samples.length; i++) {
    const prevLen =
      i > 0
        ? aspectDistance(
            samples[i - 1]!.x,
            samples[i - 1]!.y,
            samples[i]!.x,
            samples[i]!.y,
            aspect,
          )
        : 0
    const nextLen =
      i < samples.length - 1
        ? aspectDistance(
            samples[i]!.x,
            samples[i]!.y,
            samples[i + 1]!.x,
            samples[i + 1]!.y,
            aspect,
          )
        : 0
    const enteringPause =
      prevLen >= HEADING_PAUSE_EPS && nextLen < HEADING_PAUSE_EPS
    const leavingPause =
      prevLen < HEADING_PAUSE_EPS && nextLen >= HEADING_PAUSE_EPS
    // Keep only enter/leave — interior dwell samples share the same heading.
    if (enteringPause || leavingPause) {
      set.add(clamp01(samples[i]!.t / duration))
    }
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Extra clip-local offsets so CSS keyframes can reproduce heading changes
 * between sparse position keyframes. Includes pause hold boundaries so a
 * dwell is not crossed by linear rotation interpolation.
 */
export function headingExportOffsets(
  samples: MotionSample[],
  stageAspect: number,
  stepDeg: number = HEADING_EXPORT_STEP_DEG,
): number[] {
  if (samples.length < 2) return []
  const track = buildHeadingTrack(samples, stageAspect)
  const duration = track[track.length - 1]!.t
  if (duration <= 0) return [0, 1]

  const set = new Set<number>([0])
  let lastKept = track[0]!.headingDeg
  for (let i = 1; i < track.length; i++) {
    const h = track[i]!.headingDeg
    if (Math.abs(h - lastKept) >= stepDeg) {
      set.add(clamp01(track[i]!.t / duration))
      lastKept = h
    }
  }
  for (const t of pauseExportOffsets(samples, stageAspect)) set.add(t)
  set.add(clamp01(track[track.length - 1]!.t / duration))
  return [...set].sort((a, b) => a - b)
}

export interface MergeExportLocalOffsetsResult {
  offsets: number[]
  /** Peak unwrapped |truth − CSS lerp| over a dense probe of [0,1]. */
  maxErrDeg: number
  /**
   * Set when {@link HEADING_EXPORT_MAX_OFFSETS} prevents meeting
   * {@link HEADING_EXPORT_ANGULAR_TOLERANCE_DEG}.
   */
  fidelityWarning: string | null
}

/** Uniform thin used only to document pre-fix mismatch in tests. */
export function mergeExportLocalOffsetsUniform(
  base: number[],
  extra: number[],
  maxOffsets: number = HEADING_EXPORT_MAX_OFFSETS,
): number[] {
  const sorted = uniqueSortedOffsets(base, extra)
  if (sorted.length <= maxOffsets) return sorted
  const kept = [sorted[0]!]
  const inner = sorted.length - 2
  const budget = maxOffsets - 2
  for (let i = 1; i <= budget; i++) {
    const idx = Math.round((i * (inner + 1)) / (budget + 1))
    const t = sorted[Math.min(sorted.length - 2, Math.max(1, idx))]!
    if (t > kept[kept.length - 1]! + 1e-12) kept.push(t)
  }
  const last = sorted[sorted.length - 1]!
  if (kept[kept.length - 1]! < last - 1e-12) kept.push(last)
  return kept
}

function uniqueSortedOffsets(base: number[], extra: number[]): number[] {
  const set = new Set<number>()
  for (const t of base) set.add(clamp01(t))
  for (const t of extra) set.add(clamp01(t))
  return [...set].sort((a, b) => a - b)
}

function lerpScalar(a: number, b: number, u: number): number {
  return a + (b - a) * u
}

function segmentMaxError(
  times: number[],
  rots: number[],
  lo: number,
  hi: number,
): { index: number; err: number } {
  if (hi <= lo + 1) return { index: -1, err: 0 }
  const t0 = times[lo]!
  const t1 = times[hi]!
  const r0 = rots[lo]!
  const r1 = rots[hi]!
  const span = t1 - t0
  let bestIndex = -1
  let bestErr = 0
  for (let i = lo + 1; i < hi; i++) {
    const u = span === 0 ? 0 : (times[i]! - t0) / span
    const err = Math.abs(rots[i]! - lerpScalar(r0, r1, u))
    if (err > bestErr) {
      bestErr = err
      bestIndex = i
    }
  }
  return { index: bestIndex, err: bestErr }
}

export interface ExportHeadingErrorSample {
  /** Peak unwrapped |truth − CSS lerp| over the probe grid. */
  maxErrDeg: number
  /** Local time of the peak sample (not a continuous maximizer). */
  atT: number
}

/**
 * Sampled peak unwrapped angular error of CSS-style linear interpolation
 * between export keyframes versus a rotation evaluator. Checks
 * `probeCount + 1` evenly spaced times in [0, 1] — not a continuous bound.
 */
export function measureExportHeadingErrorDetailed(
  offsets: number[],
  rotationAt: (localT: number) => number,
  probeCount: number = HEADING_EXPORT_ERROR_PROBE_COUNT,
): ExportHeadingErrorSample {
  if (offsets.length === 0) return { maxErrDeg: 0, atT: 0 }
  const values = offsets.map((t) => rotationAt(t))
  let maxErr = 0
  let atT = 0
  for (let i = 0; i <= probeCount; i++) {
    const t = i / probeCount
    const truth = rotationAt(t)
    let approx = values[0]!
    if (t <= offsets[0]!) approx = values[0]!
    else if (t >= offsets[offsets.length - 1]!) {
      approx = values[values.length - 1]!
    } else {
      for (let j = 1; j < offsets.length; j++) {
        if (t <= offsets[j]!) {
          const span = offsets[j]! - offsets[j - 1]!
          const u = span === 0 ? 0 : (t - offsets[j - 1]!) / span
          approx = lerpScalar(values[j - 1]!, values[j]!, u)
          break
        }
      }
    }
    const err = Math.abs(truth - approx)
    if (err > maxErr) {
      maxErr = err
      atT = t
    }
  }
  return { maxErrDeg: maxErr, atT }
}

/** @see measureExportHeadingErrorDetailed */
export function measureExportHeadingError(
  offsets: number[],
  rotationAt: (localT: number) => number,
  probeCount: number = HEADING_EXPORT_ERROR_PROBE_COUNT,
): number {
  return measureExportHeadingErrorDetailed(offsets, rotationAt, probeCount)
    .maxErrDeg
}

/** Technical note embedded in exported CSS comments. */
export function formatFacingFidelityWarningCss(
  maxErrDeg: number,
  toleranceDeg: number = HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  maxOffsets: number = HEADING_EXPORT_MAX_OFFSETS,
): string {
  return (
    `Face-along export: sampled angular error ~${maxErrDeg.toFixed(2)}° ` +
    `(tolerance ${toleranceDeg}°, ${HEADING_EXPORT_ERROR_PROBE_COUNT}-point probe) ` +
    `exceeds the budget of ${maxOffsets} keyframes. ` +
    `Simplify the path or reduce heading detail.`
  )
}

/** Plain-language warning for the Export panel (export still proceeds). */
export function formatFacingFidelityWarningPlain(
  maxErrDeg: number,
  toleranceDeg: number = HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  actorLabel?: string,
): string {
  const where = actorLabel ? ` for “${actorLabel}”` : ''
  return (
    `Facing export${where} may drift from the editor by about ` +
    `${maxErrDeg.toFixed(1)}° in places (limit ${toleranceDeg}°, checked on a ` +
    `sample grid — not every instant). This path turns too sharply for the ` +
    `export keyframe budget. You can still copy or download — simplify the ` +
    `path if you need a closer match.`
  )
}

function exceedsAngularTolerance(
  maxErrDeg: number,
  toleranceDeg: number,
): boolean {
  return maxErrDeg > toleranceDeg + ANGULAR_TOLERANCE_EPS_DEG
}

/**
 * Merge position/transform and heading sample times, then apply
 * error-bounded adaptive sampling so important turns and pause boundaries
 * stay within the *sampled* {@link HEADING_EXPORT_ANGULAR_TOLERANCE_DEG}.
 *
 * All `base` offsets (position + transform export times) are mandatory and
 * are never dropped for heading optimization. Heading densify uses only the
 * remaining budget: `maxOffsets - baseCount` (and may omit heading samples
 * when base already fills the cap — sampled error is still measured/warned).
 *
 * When `rotationAt` is omitted (tests only), returns the full unique set
 * capped by uniform thinning — production export always supplies rotation.
 */
export function mergeExportLocalOffsets(
  base: number[],
  extra: number[],
  maxOffsets: number = HEADING_EXPORT_MAX_OFFSETS,
  rotationAt?: (localT: number) => number,
  angularToleranceDeg: number = HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  /** Offsets that must survive thinning (e.g. {@link pauseExportOffsets}). */
  mustKeepOffsets: number[] = [],
): MergeExportLocalOffsetsResult {
  const sorted = uniqueSortedOffsets(base, extra)
  if (sorted.length === 0) {
    return { offsets: [], maxErrDeg: 0, fidelityWarning: null }
  }

  if (!rotationAt) {
    // Still never drop base when thinning without a rotation evaluator.
    const baseSorted = uniqueSortedOffsets(base, [])
    if (sorted.length <= maxOffsets) {
      return { offsets: sorted, maxErrDeg: 0, fidelityWarning: null }
    }
    const extraOnly = sorted.filter(
      (t) => !baseSorted.some((b) => Math.abs(b - t) < 1e-9),
    )
    const headingBudget = Math.max(0, maxOffsets - baseSorted.length)
    const keptExtra =
      extraOnly.length <= headingBudget
        ? extraOnly
        : mergeExportLocalOffsetsUniform([], extraOnly, headingBudget)
    const offsets = uniqueSortedOffsets(baseSorted, keptExtra)
    return { offsets, maxErrDeg: 0, fidelityWarning: null }
  }

  // Mutable candidate list — probe peaks may add times not in the initial set.
  let candidates = sorted.slice()
  let rots = candidates.map((t) => rotationAt(t))
  const baseSet = new Set(base.map((t) => clamp01(t)))

  const indexOfTime = (target: number, maxDist = 1e-6): number => {
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < candidates.length; i++) {
      const d = Math.abs(candidates[i]! - target)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    return best >= 0 && bestDist <= maxDist ? best : -1
  }

  const mustKeep = new Set<number>()
  // Mandatory: every position / transform export offset.
  for (const t of baseSet) {
    const idx = indexOfTime(t)
    if (idx >= 0) mustKeep.add(idx)
  }
  if (candidates.length > 0) {
    mustKeep.add(0)
    mustKeep.add(candidates.length - 1)
  }

  // Geometry pause boundaries (may sit inside a flat heading run).
  for (const t of mustKeepOffsets) {
    const idx = indexOfTime(clamp01(t))
    if (idx >= 0) mustKeep.add(idx)
  }

  // Also preserve endpoints of multi-sample constant-heading runs.
  const holdEps = 1e-4
  let runStart = 0
  for (let i = 1; i <= candidates.length; i++) {
    const same =
      i < candidates.length &&
      Math.abs(rots[i]! - rots[runStart]!) <= holdEps
    if (same) continue
    if (i - 1 > runStart) {
      mustKeep.add(runStart)
      mustKeep.add(i - 1)
    }
    runStart = i
  }

  const extraSet = new Set(extra.map((t) => clamp01(t)))
  const kept = new Set<number>(mustKeep)

  const syncCandidateIndex = (t: number): number => {
    const target = clamp01(t)
    const existing = indexOfTime(target, 1e-9)
    if (existing >= 0) return existing
    let insertAt = candidates.length
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i]! > target) {
        insertAt = i
        break
      }
    }
    candidates = [
      ...candidates.slice(0, insertAt),
      target,
      ...candidates.slice(insertAt),
    ]
    rots = [
      ...rots.slice(0, insertAt),
      rotationAt(target),
      ...rots.slice(insertAt),
    ]
    const nextKept = new Set<number>()
    for (const idx of kept) {
      nextKept.add(idx >= insertAt ? idx + 1 : idx)
    }
    kept.clear()
    for (const idx of nextKept) kept.add(idx)
    return insertAt
  }

  const offsetsFromKept = () =>
    [...kept]
      .sort((a, b) => a - b)
      .map((i) => candidates[i]!)

  // Never drop mandatory base (or pause) offsets — even if they exceed maxOffsets.
  // Heading densify only uses the remaining budget.
  if (kept.size >= maxOffsets) {
    const offsets = offsetsFromKept()
    const maxErrDeg = measureExportHeadingError(offsets, rotationAt)
    return {
      offsets,
      maxErrDeg,
      fidelityWarning: exceedsAngularTolerance(maxErrDeg, angularToleranceDeg)
        ? formatFacingFidelityWarningCss(
            maxErrDeg,
            angularToleranceDeg,
            maxOffsets,
          )
        : null,
    }
  }

  const refineCandidate = () => {
    const indices = [...kept].sort((a, b) => a - b)
    let bestIndex = -1
    let bestErr = 0
    for (let s = 0; s < indices.length - 1; s++) {
      const lo = indices[s]!
      const hi = indices[s + 1]!
      const { index, err } = segmentMaxError(candidates, rots, lo, hi)
      if (index < 0 || kept.has(index)) continue
      const prefer = extraSet.has(candidates[index]!) ? 1e-6 : 0
      if (err + prefer > bestErr) {
        bestErr = err
        bestIndex = index
      }
    }
    return { bestIndex, bestErr }
  }

  // Insert heading samples until the sampled error check passes or the
  // remaining budget (maxOffsets − mandatory) is exhausted.
  while (kept.size < maxOffsets) {
    const sample = measureExportHeadingErrorDetailed(
      offsetsFromKept(),
      rotationAt,
    )
    if (!exceedsAngularTolerance(sample.maxErrDeg, angularToleranceDeg)) break

    const current = offsetsFromKept()
    const nearExisting = current.some((t) => Math.abs(t - sample.atT) < 1e-6)
    if (!nearExisting) {
      kept.add(syncCandidateIndex(sample.atT))
      continue
    }

    const { bestIndex, bestErr } = refineCandidate()
    if (bestIndex >= 0 && bestErr > 1e-9) {
      kept.add(bestIndex)
      continue
    }
    break
  }

  const offsets = offsetsFromKept()
  const maxErrDeg = measureExportHeadingError(offsets, rotationAt)
  const fidelityWarning = exceedsAngularTolerance(
    maxErrDeg,
    angularToleranceDeg,
  )
    ? formatFacingFidelityWarningCss(
        maxErrDeg,
        angularToleranceDeg,
        maxOffsets,
      )
    : null

  return { offsets, maxErrDeg, fidelityWarning }
}
