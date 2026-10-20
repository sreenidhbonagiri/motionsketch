import { clamp, clamp01 } from './coords'
import { aspectDistance, clampStageAspect } from './stageAspect'
import type { GeometryEdit, MotionSample, Vec2 } from './types'

/** Default number of draggable handles along the path (including endpoints). */
export const DEFAULT_HANDLE_COUNT = 9

/**
 * Maximum editable handles (including the two endpoints).
 * Prevents overcrowding on the stage and oversized project JSON.
 */
export const MAX_PATH_HANDLES = 24

/**
 * Screen-space hit radius (CSS pixels) for “Add point” clicks/taps on the path.
 * Measured against the displayed stage, after layout/resize.
 */
export const PATH_ADD_HIT_TOLERANCE_PX = 16

/**
 * Screen-space radius for treating handles as overlapping (cycle on tap).
 * Matched to the visible handle size (~14px) plus a small touch cushion.
 */
export const HANDLE_OVERLAP_HIT_PX = 14

/** Pointer must move at least this far (CSS px) before a drag reshapes the path. */
export const HANDLE_DRAG_THRESHOLD_PX = 5

/** Screen-space hit radius (CSS px) for starting a Move path drag on the stroke. */
export const PATH_MOVE_HIT_TOLERANCE_PX = 18

/** Normalized nudge step for Move path arrow keys (Shift multiplies by 4). */
export const PATH_MOVE_NUDGE_STEP = 0.005
export const PATH_MOVE_NUDGE_STEP_SHIFT = 0.02

/** Co-located samples closer than this (aspect-aware) form a stationary run. */
const STATIONARY_EPS = 0.003

/** Active tool while the editor is in Edit path mode. */
export type PathEditTool = 'edit-points' | 'move-path'

/** Copy samples without sharing references. */
export function copyPath(samples: MotionSample[]): MotionSample[] {
  return samples.map((s) => ({ t: s.t, x: s.x, y: s.y }))
}

/** Deep-copy a geometry edit (samples + handle indices). */
export function copyGeometryEdit(edit: GeometryEdit): GeometryEdit {
  return {
    bakedSmoothing: edit.bakedSmoothing,
    samples: copyPath(edit.samples),
    handleIndices: normalizeHandleIndices(
      edit.samples.length,
      edit.handleIndices,
    ),
    ...(edit.timingBaked ? { timingBaked: true } : {}),
    ...(typeof edit.restoreSteadySpeed === 'number'
      ? { restoreSteadySpeed: edit.restoreSteadySpeed }
      : {}),
    ...(typeof edit.restoreGlide === 'number'
      ? { restoreGlide: edit.restoreGlide }
      : {}),
  }
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

  const count = Math.min(handleCount, sampleCount, MAX_PATH_HANDLES)
  const indices = new Set<number>()
  indices.add(0)
  indices.add(sampleCount - 1)
  for (let i = 1; i < count - 1; i++) {
    indices.add(Math.round((i / (count - 1)) * (sampleCount - 1)))
  }
  return [...indices].sort((a, b) => a - b)
}

/**
 * Validate/normalize persisted or live handle indices.
 * Always keeps endpoints; drops out-of-range duplicates; caps at MAX_PATH_HANDLES.
 */
export function normalizeHandleIndices(
  sampleCount: number,
  indices: number[] | null | undefined,
): number[] {
  if (sampleCount <= 0) return []
  if (sampleCount === 1) return [0]
  if (!indices || indices.length === 0) {
    return selectHandleIndices(sampleCount)
  }
  const set = new Set<number>()
  set.add(0)
  set.add(sampleCount - 1)
  for (const raw of indices) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const i = Math.round(raw)
    if (i > 0 && i < sampleCount - 1) set.add(i)
  }
  let sorted = [...set].sort((a, b) => a - b)
  if (sorted.length > MAX_PATH_HANDLES) {
    // Keep endpoints; thin interior evenly.
    const interior = sorted.slice(1, -1)
    const budget = MAX_PATH_HANDLES - 2
    const kept: number[] = []
    for (let i = 0; i < budget; i++) {
      const idx = Math.round((i / Math.max(1, budget - 1)) * (interior.length - 1))
      kept.push(interior[idx]!)
    }
    sorted = [0, ...new Set(kept), sampleCount - 1].sort((a, b) => a - b)
  }
  return sorted
}

export type GeometryEditOptions = {
  handleIndices?: number[] | null
  timingBaked?: boolean
  restoreSteadySpeed?: number
  restoreGlide?: number
}

/** Build a GeometryEdit with normalized handles (default even spacing when omitted). */
export function makeGeometryEdit(
  samples: MotionSample[],
  bakedSmoothing: number,
  handleIndices?: number[] | null,
  options?: Omit<GeometryEditOptions, 'handleIndices'>,
): GeometryEdit {
  return {
    samples: copyPath(samples),
    bakedSmoothing,
    handleIndices: normalizeHandleIndices(
      samples.length,
      handleIndices ?? null,
    ),
    ...(options?.timingBaked ? { timingBaked: true } : {}),
    ...(typeof options?.restoreSteadySpeed === 'number'
      ? { restoreSteadySpeed: options.restoreSteadySpeed }
      : {}),
    ...(typeof options?.restoreGlide === 'number'
      ? { restoreGlide: options.restoreGlide }
      : {}),
  }
}

/**
 * Cumulative aspect-aware arc length at each sample (s[0] === 0).
 * Stationary runs contribute ~0 length between co-located samples.
 */
export function cumulativeArcLengths(
  samples: MotionSample[],
  stageAspect = 1,
): number[] {
  const aspect = clampStageAspect(stageAspect)
  if (samples.length === 0) return []
  const lengths = new Array<number>(samples.length)
  lengths[0] = 0
  for (let i = 1; i < samples.length; i++) {
    const d = aspectDistance(
      samples[i - 1]!.x,
      samples[i - 1]!.y,
      samples[i]!.x,
      samples[i]!.y,
      aspect,
    )
    lengths[i] = lengths[i - 1]! + d
  }
  return lengths
}

/**
 * Cosine falloff by sample-index distance (legacy).
 * Kept for tests / zero-length path fallback.
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

/**
 * Cosine falloff by arc-length distance along the path.
 * Co-located samples (zero arc delta) share the handle’s full weight — a pause
 * blob moves together when any of its samples is the active handle.
 */
export function influenceWeightArc(
  arcLengths: number[],
  sampleIndex: number,
  handleIndex: number,
  radius: number,
): number {
  if (
    sampleIndex < 0 ||
    handleIndex < 0 ||
    sampleIndex >= arcLengths.length ||
    handleIndex >= arcLengths.length
  ) {
    return 0
  }
  if (radius <= 1e-9) {
    return sampleIndex === handleIndex ? 1 : 0
  }
  const d = Math.abs(arcLengths[sampleIndex]! - arcLengths[handleIndex]!)
  if (d >= radius) return 0
  const u = d / radius
  return 0.5 * (1 + Math.cos(Math.PI * u))
}

export function defaultInfluenceRadius(sampleCount: number): number {
  // Index fallback: ~1/8 of the path.
  return Math.max(6, Math.round(sampleCount / 8))
}

export function defaultArcInfluenceRadius(arcLengths: number[]): number {
  if (arcLengths.length === 0) return 0
  const total = arcLengths[arcLengths.length - 1]!
  if (total <= 1e-9) return 0
  return Math.max(total / 8, total * 0.02)
}

export type HandleDeltaOptions = {
  /** Logical stage aspect for arc-length metric (default 1). */
  stageAspect?: number
  /**
   * Override influence radius in the active metric:
   * arc length when using arc falloff, sample-index steps when forced/index fallback.
   */
  radius?: number
  /** Force legacy index-based falloff (tests / zero diagnostics). */
  forceIndex?: boolean
}

/**
 * Move a handle by delta, deforming nearby samples with arc-length cosine falloff.
 * Timestamps are preserved exactly so duration/timing stay intact.
 * Falls back to index-based influence when the path has ~zero length.
 */
export function applyHandleDelta(
  samples: MotionSample[],
  handleIndex: number,
  delta: Vec2,
  options: HandleDeltaOptions = {},
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

  const stageAspect = options.stageAspect ?? 1
  const arcs = cumulativeArcLengths(samples, stageAspect)
  const total = arcs[arcs.length - 1] ?? 0
  const useArc = !options.forceIndex && total > 1e-9
  const r = useArc
    ? (options.radius ?? defaultArcInfluenceRadius(arcs))
    : (options.radius ?? defaultInfluenceRadius(samples.length))

  return samples.map((sample, i) => {
    const w = useArc
      ? influenceWeightArc(arcs, i, handleIndex, r)
      : influenceWeight(i, handleIndex, r)
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
  options: HandleDeltaOptions = {},
): MotionSample[] {
  return applyHandleDelta(samples, handleIndex, step, options)
}

/** True when every sample timestamp matches (geometry-only edit). */
export function timestampsPreserved(
  before: MotionSample[],
  after: MotionSample[],
): boolean {
  if (before.length !== after.length) return false
  for (let i = 0; i < before.length; i++) {
    if (before[i]!.t !== after[i]!.t) return false
  }
  return true
}

/** Axis-aligned bounds of path sample centers (normalized stage space). */
export function pathSampleBounds(samples: MotionSample[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  if (samples.length === 0) {
    return { minX: 0.5, maxX: 0.5, minY: 0.5, maxY: 0.5 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const sample of samples) {
    if (sample.x < minX) minX = sample.x
    if (sample.x > maxX) maxX = sample.x
    if (sample.y < minY) minY = sample.y
    if (sample.y > maxY) maxY = sample.y
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Limit a shared path translation so sample centers stay on stage when the
 * baseline already fits. Actor size, rotation, and scale are ignored — only
 * sample centers count.
 *
 * In-bounds baseline (every sample in [0,1]):
 *   dx ∈ [-minX, 1−maxX], dy ∈ [-minY, 1−maxY]
 *
 * Imported / overflowing geometry:
 * - Zero delta is returned unchanged (no silent reshape).
 * - Translation may reduce overflow but must not increase left or right
 *   overflow on an axis (same for top/bottom).
 * - Paths wider or taller than the stage already overflow both sides; the
 *   allowed interval collapses to {0} so the path is not silently forced
 *   onto the stage (no inverted clamp).
 */
export function limitPathTranslationDelta(
  samples: MotionSample[],
  delta: Vec2,
): Vec2 {
  if (samples.length === 0) return { x: 0, y: 0 }
  if (delta.x === 0 && delta.y === 0) return { x: 0, y: 0 }

  const { minX, maxX, minY, maxY } = pathSampleBounds(samples)

  const limitAxis = (min: number, max: number, d: number): number => {
    // Keep per-side overflow from growing. For a fully in-bounds path this is
    // exactly d ∈ [-min, 1-max]. For oversized paths (max-min > 1) both sides
    // already overflow and the interval is {0}.
    const lo = min >= 0 ? -min : 0
    const hi = max <= 1 ? 1 - max : 0
    if (lo > hi) return 0
    return clamp(d, lo, hi)
  }

  return {
    x: limitAxis(minX, maxX, delta.x),
    y: limitAxis(minY, maxY, delta.y),
  }
}

/**
 * Translate every sample by the same delta. Preserves timestamps, count, and
 * relative shape. Does not clamp per-sample (use {@link limitPathTranslationDelta}
 * first when enforcing sample-center stage bounds).
 */
export function translatePathSamples(
  samples: MotionSample[],
  delta: Vec2,
): MotionSample[] {
  if (samples.length === 0) return []
  if (delta.x === 0 && delta.y === 0) return copyPath(samples)
  return samples.map((sample) => ({
    t: sample.t,
    x: sample.x + delta.x,
    y: sample.y + delta.y,
  }))
}

/** Apply a bounds-limited whole-path translation from a gesture baseline. */
export function applyPathTranslation(
  baseline: MotionSample[],
  delta: Vec2,
): MotionSample[] {
  return translatePathSamples(baseline, limitPathTranslationDelta(baseline, delta))
}

/** Max aspect-aware displacement to treat two paths as identical (no-op). */
export const LOCAL_BEND_NOOP_EPS = 1e-6

/** True when sample arrays match within an epsilon (geometry no-op check). */
export function samplesMatch(
  a: MotionSample[],
  b: MotionSample[],
  eps = LOCAL_BEND_NOOP_EPS,
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.t !== b[i]!.t) return false
    if (Math.abs(a[i]!.x - b[i]!.x) > eps) return false
    if (Math.abs(a[i]!.y - b[i]!.y) > eps) return false
  }
  return true
}

export type PathHit = {
  /**
   * Sample index chosen for a new handle (geometry unchanged).
   * The Add-point ghost must render at this sample’s coordinates — never at the
   * intermediate projection onto the segment.
   */
  sampleIndex: number
  /** Index of the polyline segment that won the hit test. */
  segmentIndex: number
  /** Screen-space distance from the pointer to the path (CSS px). */
  distancePx: number
  /** Normalized position of {@link sampleIndex} (for ghost placement checks). */
  sampleX: number
  sampleY: number
}

/**
 * Midpoint sample of a stationary run containing `index`.
 * Keeps pause handles centered so arc-length influence is symmetric.
 */
export function stationaryRunCenterIndex(
  samples: MotionSample[],
  index: number,
  stageAspect = 1,
): number {
  if (samples.length === 0) return 0
  const aspect = clampStageAspect(stageAspect)
  const origin = samples[index]!
  let lo = index
  let hi = index
  while (
    lo > 0 &&
    aspectDistance(
      samples[lo - 1]!.x,
      samples[lo - 1]!.y,
      origin.x,
      origin.y,
      aspect,
    ) <= STATIONARY_EPS
  ) {
    lo -= 1
  }
  while (
    hi < samples.length - 1 &&
    aspectDistance(
      samples[hi + 1]!.x,
      samples[hi + 1]!.y,
      origin.x,
      origin.y,
      aspect,
    ) <= STATIONARY_EPS
  ) {
    hi += 1
  }
  return Math.round((lo + hi) / 2)
}

/**
 * Nearest editable sample on the displayed polyline (screen space).
 *
 * 1. Find the closest segment (earlier segment wins ties / crossings).
 * 2. Choose the closer **sample endpoint** of that segment by screen distance
 *    to the pointer (not the projected point on the segment).
 * 3. Snap to the center of a stationary run so the ghost sits on the sample
 *    that will become the handle.
 */
export function findNearestPathHit(
  samples: MotionSample[],
  clientX: number,
  clientY: number,
  stageWidth: number,
  stageHeight: number,
  stageAspect = 1,
): PathHit | null {
  if (samples.length < 2 || stageWidth <= 0 || stageHeight <= 0) return null

  let bestDist = Infinity
  let bestSegment = 0
  let bestSample = 0

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!
    const b = samples[i + 1]!
    const ax = a.x * stageWidth
    const ay = a.y * stageHeight
    const bx = b.x * stageWidth
    const by = b.y * stageHeight
    const abx = bx - ax
    const aby = by - ay
    const apx = clientX - ax
    const apy = clientY - ay
    const abLen2 = abx * abx + aby * aby
    let t = 0
    if (abLen2 > 1e-9) {
      t = clamp01((apx * abx + apy * aby) / abLen2)
    }
    const qx = ax + abx * t
    const qy = ay + aby * t
    const dist = Math.hypot(clientX - qx, clientY - qy)
    // Prefer earlier segment on ties (crossings).
    if (
      dist < bestDist - 1e-6 ||
      (Math.abs(dist - bestDist) <= 1e-6 && i < bestSegment)
    ) {
      bestDist = dist
      bestSegment = i
      // Pick the sample endpoint nearer the pointer in screen space — that is
      // where the ghost / new handle will appear (not qx,qy on the segment).
      const distA = Math.hypot(clientX - ax, clientY - ay)
      const distB = Math.hypot(clientX - bx, clientY - by)
      bestSample = distA <= distB + 1e-6 ? i : i + 1
    }
  }

  const centered = stationaryRunCenterIndex(samples, bestSample, stageAspect)
  const sample = samples[centered]!
  return {
    sampleIndex: centered,
    segmentIndex: bestSegment,
    distancePx: bestDist,
    sampleX: sample.x,
    sampleY: sample.y,
  }
}

/**
 * Handles whose screen positions fall within {@link HANDLE_OVERLAP_HIT_PX} of
 * the pointer, sorted in path order (ascending sample index).
 */
export function findNearbyHandleIndices(
  samples: MotionSample[],
  handleIndices: number[],
  clientX: number,
  clientY: number,
  stageWidth: number,
  stageHeight: number,
  radiusPx: number = HANDLE_OVERLAP_HIT_PX,
): number[] {
  if (stageWidth <= 0 || stageHeight <= 0) return []
  const hits: Array<{ index: number; dist: number }> = []
  for (const index of handleIndices) {
    const sample = samples[index]
    if (!sample) continue
    const sx = sample.x * stageWidth
    const sy = sample.y * stageHeight
    const dist = Math.hypot(clientX - sx, clientY - sy)
    if (dist <= radiusPx) hits.push({ index, dist })
  }
  hits.sort((a, b) => a.index - b.index || a.dist - b.dist)
  return hits.map((h) => h.index)
}

/** Next/previous handle index in path order (wraps). */
export function cycleHandleIndex(
  handleIndices: number[],
  current: number | null,
  direction: 1 | -1,
): number | null {
  if (handleIndices.length === 0) return null
  if (current === null || !handleIndices.includes(current)) {
    return direction === 1
      ? handleIndices[0]!
      : handleIndices[handleIndices.length - 1]!
  }
  const at = handleIndices.indexOf(current)
  const next =
    (at + direction + handleIndices.length) % handleIndices.length
  return handleIndices[next]!
}

/** Cycle within an overlap cluster (path order), wrapping. */
export function cycleWithinHandles(
  clusterPathOrder: number[],
  current: number | null,
): number {
  if (clusterPathOrder.length === 0) return 0
  if (current === null || !clusterPathOrder.includes(current)) {
    return clusterPathOrder[0]!
  }
  const at = clusterPathOrder.indexOf(current)
  return clusterPathOrder[(at + 1) % clusterPathOrder.length]!
}

/** 1-based ordinal of a sample index among handleIndices, or null. */
export function handleOrdinal(
  handleIndices: number[],
  sampleIndex: number,
): number | null {
  const at = handleIndices.indexOf(sampleIndex)
  return at >= 0 ? at + 1 : null
}

export function formatHandleSelectionAnnouncement(
  handleIndices: number[],
  sampleIndex: number,
  sampleCount: number,
): string {
  const ordinal = handleOrdinal(handleIndices, sampleIndex)
  const total = handleIndices.length
  if (ordinal === null || total === 0) return 'No point selected.'
  const endpoint = isEndpointHandle(sampleCount, sampleIndex)
  const base = `Point ${ordinal} of ${total}`
  return endpoint ? `${base} (endpoint — can’t remove).` : `${base}.`
}

export type AddHandleResult =
  | { ok: true; handleIndices: number[]; sampleIndex: number }
  | { ok: false; reason: 'duplicate' | 'max' | 'endpoint' | 'invalid' }

/**
 * Add an editable handle at an existing sample index.
 * Does not modify sample geometry or timestamps.
 */
export function addHandleIndex(
  sampleCount: number,
  current: number[],
  sampleIndex: number,
): AddHandleResult {
  if (sampleCount < 2) return { ok: false, reason: 'invalid' }
  if (
    !Number.isFinite(sampleIndex) ||
    sampleIndex < 0 ||
    sampleIndex >= sampleCount
  ) {
    return { ok: false, reason: 'invalid' }
  }
  if (sampleIndex === 0 || sampleIndex === sampleCount - 1) {
    return { ok: false, reason: 'endpoint' }
  }
  const normalized = normalizeHandleIndices(sampleCount, current)
  if (normalized.includes(sampleIndex)) {
    return { ok: false, reason: 'duplicate' }
  }
  if (normalized.length >= MAX_PATH_HANDLES) {
    return { ok: false, reason: 'max' }
  }
  const next = normalizeHandleIndices(sampleCount, [...normalized, sampleIndex])
  return { ok: true, handleIndices: next, sampleIndex }
}

export type RemoveHandleResult =
  | { ok: true; handleIndices: number[] }
  | { ok: false; reason: 'endpoint' | 'missing' | 'invalid' }

/**
 * Remove an interior handle. Geometry samples are unchanged.
 */
export function removeHandleIndex(
  sampleCount: number,
  current: number[],
  sampleIndex: number,
): RemoveHandleResult {
  if (sampleCount < 2) return { ok: false, reason: 'invalid' }
  if (sampleIndex === 0 || sampleIndex === sampleCount - 1) {
    return { ok: false, reason: 'endpoint' }
  }
  const normalized = normalizeHandleIndices(sampleCount, current)
  if (!normalized.includes(sampleIndex)) {
    return { ok: false, reason: 'missing' }
  }
  const next = normalized.filter((i) => i !== sampleIndex)
  return { ok: true, handleIndices: normalizeHandleIndices(sampleCount, next) }
}

export function isEndpointHandle(
  sampleCount: number,
  sampleIndex: number,
): boolean {
  return sampleIndex === 0 || sampleIndex === sampleCount - 1
}

/**
 * Turning / bulge thresholds (aspect-aware units and radians).
 * Below these, Smooth bend / Make corner report no meaningful effect.
 */
const LOCAL_BEND_STRAIGHT_ANGLE = 0.12 // ~7°
const LOCAL_BEND_MIN_BULGE = 0.004
const LOCAL_SMOOTH_MIN_ROUGHNESS = 0.0025
const LOCAL_SMOOTH_ITERATIONS = 3
const LOCAL_SMOOTH_BLEND = 0.55
const LOCAL_CORNER_BLEND = 0.85

export type LocalBendFailReason =
  | 'endpoint'
  | 'missing'
  | 'no-selection'
  | 'zero-neighborhood'
  | 'no-effect'
  | 'straight'

export type LocalBendResult =
  | { ok: true; samples: MotionSample[] }
  | { ok: false; reason: LocalBendFailReason }

export type LocalBendAvailability = {
  enabled: boolean
  reason: LocalBendFailReason | null
  /** Short accessible explanation when disabled. */
  message: string | null
}

export type LocalBendNeighborhood = {
  /** Inclusive left boundary (previous handle or start). */
  lo: number
  /** Inclusive right boundary (next handle or end). */
  hi: number
  handleIndex: number
  arcs: number[]
  stageAspect: number
}

function failMessage(reason: LocalBendFailReason): string {
  switch (reason) {
    case 'endpoint':
      return 'Select an interior point — start and end stay anchored.'
    case 'missing':
    case 'no-selection':
      return 'Select an interior handle first.'
    case 'zero-neighborhood':
      return 'Not enough room between neighboring handles.'
    case 'straight':
      return 'Path is already straight here — nothing to sharpen.'
    case 'no-effect':
      return 'No meaningful change at this point.'
    default:
      return 'Action unavailable.'
  }
}

/**
 * Hard neighborhood for local bend edits: between the previous and next
 * handle along the path (endpoints count as boundaries). Samples at those
 * boundaries are never moved.
 */
export function localBendNeighborhood(
  samples: MotionSample[],
  handleIndices: number[],
  handleIndex: number,
  stageAspect = 1,
): LocalBendNeighborhood | null {
  if (
    samples.length < 3 ||
    handleIndex <= 0 ||
    handleIndex >= samples.length - 1
  ) {
    return null
  }
  const handles = normalizeHandleIndices(samples.length, handleIndices)
  if (!handles.includes(handleIndex)) return null
  const at = handles.indexOf(handleIndex)
  const lo = handles[at - 1] ?? 0
  const hi = handles[at + 1] ?? samples.length - 1
  if (hi - lo < 2) return null
  return {
    lo,
    hi,
    handleIndex,
    arcs: cumulativeArcLengths(samples, stageAspect),
    stageAspect: clampStageAspect(stageAspect),
  }
}

function stationaryRunBounds(
  samples: MotionSample[],
  index: number,
  stageAspect: number,
): { lo: number; hi: number } {
  const aspect = clampStageAspect(stageAspect)
  const origin = samples[index]!
  let lo = index
  let hi = index
  while (
    lo > 0 &&
    aspectDistance(
      samples[lo - 1]!.x,
      samples[lo - 1]!.y,
      origin.x,
      origin.y,
      aspect,
    ) <= STATIONARY_EPS
  ) {
    lo -= 1
  }
  while (
    hi < samples.length - 1 &&
    aspectDistance(
      samples[hi + 1]!.x,
      samples[hi + 1]!.y,
      origin.x,
      origin.y,
      aspect,
    ) <= STATIONARY_EPS
  ) {
    hi += 1
  }
  return { lo, hi }
}

/**
 * Samples that must not move: neighborhood boundaries, every handle, and
 * intentional pauses that do not contain the active handle.
 */
function protectedSampleMask(
  samples: MotionSample[],
  neighborhood: LocalBendNeighborhood,
  handleIndices: number[],
): boolean[] {
  const n = samples.length
  const protectedMask = new Array<boolean>(n).fill(false)
  const handles = normalizeHandleIndices(n, handleIndices)
  for (const h of handles) protectedMask[h] = true
  protectedMask[neighborhood.lo] = true
  protectedMask[neighborhood.hi] = true
  protectedMask[0] = true
  protectedMask[n - 1] = true

  const activeRun = stationaryRunBounds(
    samples,
    neighborhood.handleIndex,
    neighborhood.stageAspect,
  )
  for (let i = neighborhood.lo; i <= neighborhood.hi; i++) {
    if (protectedMask[i]) continue
    const run = stationaryRunBounds(samples, i, neighborhood.stageAspect)
    if (run.hi > run.lo) {
      // Pause blob that is not the active handle’s run stays put.
      if (run.hi < activeRun.lo || run.lo > activeRun.hi) {
        for (let j = run.lo; j <= run.hi; j++) protectedMask[j] = true
      }
    }
  }
  return protectedMask
}

function neighborhoodWindowWeight(
  arcs: number[],
  index: number,
  handleIndex: number,
  lo: number,
  hi: number,
): number {
  const sH = arcs[handleIndex]!
  const sI = arcs[index]!
  if (index === handleIndex) return 0
  if (index <= lo || index >= hi) return 0
  const sideMax =
    index < handleIndex
      ? Math.abs(sH - arcs[lo]!)
      : Math.abs(arcs[hi]! - sH)
  if (sideMax <= 1e-9) {
    // Zero-length side: fall back to index span.
    const span =
      index < handleIndex ? handleIndex - lo : hi - handleIndex
    if (span <= 0) return 0
    const u = Math.abs(index - handleIndex) / span
    return 0.5 * (1 + Math.cos(Math.PI * u))
  }
  const u = Math.abs(sI - sH) / sideMax
  if (u >= 1) return 0
  return 0.5 * (1 + Math.cos(Math.PI * u))
}

function pathMaxDelta(
  a: MotionSample[],
  b: MotionSample[],
  stageAspect: number,
): number {
  const n = Math.min(a.length, b.length)
  let max = 0
  for (let i = 0; i < n; i++) {
    const d = aspectDistance(a[i]!.x, a[i]!.y, b[i]!.x, b[i]!.y, stageAspect)
    if (d > max) max = d
  }
  return max
}

function pointLineBulge(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  stageAspect: number,
): number {
  const aspect = clampStageAspect(stageAspect)
  const abx = (bx - ax) * aspect
  const aby = by - ay
  const apx = (px - ax) * aspect
  const apy = py - ay
  const abLen2 = abx * abx + aby * aby
  if (abLen2 <= 1e-12) {
    return aspectDistance(px, py, ax, ay, aspect)
  }
  let t = (apx * abx + apy * aby) / abLen2
  t = clamp01(t)
  const qx = ax + (bx - ax) * t
  const qy = ay + (by - ay) * t
  return aspectDistance(px, py, qx, qy, aspect)
}

function turningAngleAt(
  samples: MotionSample[],
  index: number,
  stageAspect: number,
): number {
  if (index <= 0 || index >= samples.length - 1) return 0
  const aspect = clampStageAspect(stageAspect)
  const a = samples[index - 1]!
  const b = samples[index]!
  const c = samples[index + 1]!
  const inX = (b.x - a.x) * aspect
  const inY = b.y - a.y
  const outX = (c.x - b.x) * aspect
  const outY = c.y - b.y
  const inLen = Math.hypot(inX, inY)
  const outLen = Math.hypot(outX, outY)
  if (inLen < 1e-9 || outLen < 1e-9) return 0
  const dot = (inX * outX + inY * outY) / (inLen * outLen)
  return Math.acos(Math.min(1, Math.max(-1, dot)))
}

function maxNeighborhoodBulge(
  samples: MotionSample[],
  neighborhood: LocalBendNeighborhood,
): number {
  const { lo, hi, handleIndex, stageAspect } = neighborhood
  const apex = samples[handleIndex]!
  const left = samples[lo]!
  const right = samples[hi]!
  let max = 0
  for (let i = lo + 1; i < handleIndex; i++) {
    const s = samples[i]!
    const bulge = pointLineBulge(
      s.x,
      s.y,
      left.x,
      left.y,
      apex.x,
      apex.y,
      stageAspect,
    )
    if (bulge > max) max = bulge
  }
  for (let i = handleIndex + 1; i < hi; i++) {
    const s = samples[i]!
    const bulge = pointLineBulge(
      s.x,
      s.y,
      apex.x,
      apex.y,
      right.x,
      right.y,
      stageAspect,
    )
    if (bulge > max) max = bulge
  }
  return max
}

function neighborhoodRoughness(
  samples: MotionSample[],
  neighborhood: LocalBendNeighborhood,
  protectedMask: boolean[],
): number {
  const { lo, hi, handleIndex, stageAspect } = neighborhood
  let sum = 0
  let count = 0
  for (let i = lo + 1; i < hi; i++) {
    if (i === handleIndex || protectedMask[i]) continue
    const angle = turningAngleAt(samples, i, stageAspect)
    // Deviation from straight (π would be reverse; 0 is straight ahead).
    sum += angle
    count += 1
  }
  // Also include apex turning — noisy bends often peak there.
  sum += turningAngleAt(samples, handleIndex, stageAspect)
  count += 1
  return count === 0 ? 0 : sum / count
}

function projectToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Vec2 {
  const abx = bx - ax
  const aby = by - ay
  const abLen2 = abx * abx + aby * aby
  if (abLen2 <= 1e-12) return { x: ax, y: ay }
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / abLen2)
  return { x: ax + abx * t, y: ay + aby * t }
}

function lerpSamplePos(
  from: MotionSample,
  toX: number,
  toY: number,
  t: number,
): { x: number; y: number } {
  return {
    x: clamp01(from.x + (toX - from.x) * t),
    y: clamp01(from.y + (toY - from.y) * t),
  }
}

/**
 * Availability for Smooth bend: needs an interior handle, room between
 * neighbors, and enough local roughness to improve.
 */
export function smoothBendAvailability(
  samples: MotionSample[],
  handleIndices: number[],
  handleIndex: number | null,
  stageAspect = 1,
): LocalBendAvailability {
  if (handleIndex === null) {
    return {
      enabled: false,
      reason: 'no-selection',
      message: failMessage('no-selection'),
    }
  }
  if (isEndpointHandle(samples.length, handleIndex)) {
    return {
      enabled: false,
      reason: 'endpoint',
      message: failMessage('endpoint'),
    }
  }
  const nb = localBendNeighborhood(
    samples,
    handleIndices,
    handleIndex,
    stageAspect,
  )
  if (!nb) {
    return {
      enabled: false,
      reason: 'zero-neighborhood',
      message: failMessage('zero-neighborhood'),
    }
  }
  const mask = protectedSampleMask(samples, nb, handleIndices)
  const activeRun = stationaryRunBounds(samples, handleIndex, stageAspect)
  for (let i = activeRun.lo; i <= activeRun.hi; i++) mask[i] = true
  let movable = 0
  for (let i = nb.lo + 1; i < nb.hi; i++) {
    if (!mask[i]) movable += 1
  }
  if (movable === 0) {
    return {
      enabled: false,
      reason: 'zero-neighborhood',
      message: failMessage('zero-neighborhood'),
    }
  }
  const roughness = neighborhoodRoughness(samples, nb, mask)
  if (roughness < LOCAL_SMOOTH_MIN_ROUGHNESS) {
    return {
      enabled: false,
      reason: 'no-effect',
      message: 'Bend is already smooth here.',
    }
  }
  return { enabled: true, reason: null, message: null }
}

/**
 * Availability for Make corner: needs a real bend or rounded bulge — not a
 * straight segment through the handle.
 */
export function makeCornerAvailability(
  samples: MotionSample[],
  handleIndices: number[],
  handleIndex: number | null,
  stageAspect = 1,
): LocalBendAvailability {
  if (handleIndex === null) {
    return {
      enabled: false,
      reason: 'no-selection',
      message: failMessage('no-selection'),
    }
  }
  if (isEndpointHandle(samples.length, handleIndex)) {
    return {
      enabled: false,
      reason: 'endpoint',
      message: failMessage('endpoint'),
    }
  }
  const nb = localBendNeighborhood(
    samples,
    handleIndices,
    handleIndex,
    stageAspect,
  )
  if (!nb) {
    return {
      enabled: false,
      reason: 'zero-neighborhood',
      message: failMessage('zero-neighborhood'),
    }
  }
  const mask = protectedSampleMask(samples, nb, handleIndices)
  const activeRun = stationaryRunBounds(samples, handleIndex, stageAspect)
  for (let i = activeRun.lo; i <= activeRun.hi; i++) mask[i] = true
  let movable = 0
  for (let i = nb.lo + 1; i < nb.hi; i++) {
    if (!mask[i]) movable += 1
  }
  if (movable === 0) {
    return {
      enabled: false,
      reason: 'zero-neighborhood',
      message: failMessage('zero-neighborhood'),
    }
  }
  const turn = turningAngleAt(samples, handleIndex, stageAspect)
  const bulge = maxNeighborhoodBulge(samples, nb)
  const nearlyStraight =
    turn < LOCAL_BEND_STRAIGHT_ANGLE && bulge < LOCAL_BEND_MIN_BULGE
  if (nearlyStraight) {
    return {
      enabled: false,
      reason: 'straight',
      message: failMessage('straight'),
    }
  }
  return { enabled: true, reason: null, message: null }
}

/**
 * Smooth bend: constrained Laplacian on the local neighborhood.
 * Preserves the selected handle position, neighboring handles, endpoints,
 * timestamps, and protected stationary runs.
 */
export function smoothBendAtHandle(
  samples: MotionSample[],
  handleIndices: number[],
  handleIndex: number,
  stageAspect = 1,
): LocalBendResult {
  const availability = smoothBendAvailability(
    samples,
    handleIndices,
    handleIndex,
    stageAspect,
  )
  if (!availability.enabled) {
    return {
      ok: false,
      reason: availability.reason ?? 'no-effect',
    }
  }
  const nb = localBendNeighborhood(
    samples,
    handleIndices,
    handleIndex,
    stageAspect,
  )!
  const protectedMask = protectedSampleMask(samples, nb, handleIndices)
  // Force-preserve the apex sample (and its pause run).
  const activeRun = stationaryRunBounds(samples, handleIndex, stageAspect)
  for (let i = activeRun.lo; i <= activeRun.hi; i++) {
    protectedMask[i] = true
  }

  let current = copyPath(samples)
  for (let iter = 0; iter < LOCAL_SMOOTH_ITERATIONS; iter++) {
    const next = copyPath(current)
    for (let i = nb.lo + 1; i < nb.hi; i++) {
      if (protectedMask[i]) continue
      const w = neighborhoodWindowWeight(
        nb.arcs,
        i,
        handleIndex,
        nb.lo,
        nb.hi,
      )
      if (w <= 1e-6) continue
      const prev = current[i - 1]!
      const succ = current[i + 1]!
      const targetX = (prev.x + succ.x) * 0.5
      const targetY = (prev.y + succ.y) * 0.5
      const blend = LOCAL_SMOOTH_BLEND * w
      const pos = lerpSamplePos(current[i]!, targetX, targetY, blend)
      next[i] = { t: current[i]!.t, x: pos.x, y: pos.y }
    }
    current = next
  }

  // Re-assert apex / pause run / boundaries exactly.
  const apex = samples[handleIndex]!
  for (let i = activeRun.lo; i <= activeRun.hi; i++) {
    current[i] = { t: samples[i]!.t, x: apex.x, y: apex.y }
  }
  current[nb.lo] = { ...samples[nb.lo]! }
  current[nb.hi] = { ...samples[nb.hi]! }
  for (const h of normalizeHandleIndices(samples.length, handleIndices)) {
    current[h] = { t: samples[h]!.t, x: samples[h]!.x, y: samples[h]!.y }
  }

  if (pathMaxDelta(samples, current, stageAspect) < LOCAL_BEND_NOOP_EPS) {
    return { ok: false, reason: 'no-effect' }
  }
  return { ok: true, samples: current }
}

/**
 * Make corner: pull each side of the neighborhood toward the chords through
 * the selected handle so incoming/outgoing sections meet more sharply.
 * Does not move the handle. No-ops on straight local geometry.
 */
export function makeCornerAtHandle(
  samples: MotionSample[],
  handleIndices: number[],
  handleIndex: number,
  stageAspect = 1,
): LocalBendResult {
  const availability = makeCornerAvailability(
    samples,
    handleIndices,
    handleIndex,
    stageAspect,
  )
  if (!availability.enabled) {
    return {
      ok: false,
      reason: availability.reason ?? 'no-effect',
    }
  }
  const nb = localBendNeighborhood(
    samples,
    handleIndices,
    handleIndex,
    stageAspect,
  )!
  const protectedMask = protectedSampleMask(samples, nb, handleIndices)
  const activeRun = stationaryRunBounds(samples, handleIndex, stageAspect)
  for (let i = activeRun.lo; i <= activeRun.hi; i++) {
    protectedMask[i] = true
  }

  const next = copyPath(samples)
  const apex = samples[handleIndex]!
  const left = samples[nb.lo]!
  const right = samples[nb.hi]!

  for (let i = nb.lo + 1; i < handleIndex; i++) {
    if (protectedMask[i]) continue
    const w = neighborhoodWindowWeight(
      nb.arcs,
      i,
      handleIndex,
      nb.lo,
      nb.hi,
    )
    if (w <= 1e-6) continue
    const onChord = projectToSegment(
      samples[i]!.x,
      samples[i]!.y,
      left.x,
      left.y,
      apex.x,
      apex.y,
    )
    const pos = lerpSamplePos(
      samples[i]!,
      onChord.x,
      onChord.y,
      LOCAL_CORNER_BLEND * w,
    )
    next[i] = { t: samples[i]!.t, x: pos.x, y: pos.y }
  }
  for (let i = handleIndex + 1; i < nb.hi; i++) {
    if (protectedMask[i]) continue
    const w = neighborhoodWindowWeight(
      nb.arcs,
      i,
      handleIndex,
      nb.lo,
      nb.hi,
    )
    if (w <= 1e-6) continue
    const onChord = projectToSegment(
      samples[i]!.x,
      samples[i]!.y,
      apex.x,
      apex.y,
      right.x,
      right.y,
    )
    const pos = lerpSamplePos(
      samples[i]!,
      onChord.x,
      onChord.y,
      LOCAL_CORNER_BLEND * w,
    )
    next[i] = { t: samples[i]!.t, x: pos.x, y: pos.y }
  }

  for (let i = activeRun.lo; i <= activeRun.hi; i++) {
    next[i] = { t: samples[i]!.t, x: apex.x, y: apex.y }
  }
  next[nb.lo] = { ...samples[nb.lo]! }
  next[nb.hi] = { ...samples[nb.hi]! }
  for (const h of normalizeHandleIndices(samples.length, handleIndices)) {
    next[h] = { t: samples[h]!.t, x: samples[h]!.x, y: samples[h]!.y }
  }

  if (pathMaxDelta(samples, next, stageAspect) < LOCAL_BEND_NOOP_EPS) {
    return { ok: false, reason: 'no-effect' }
  }
  return { ok: true, samples: next }
}
