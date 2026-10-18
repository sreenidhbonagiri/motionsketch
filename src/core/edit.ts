import { clamp01 } from './coords'
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

/** Co-located samples closer than this (aspect-aware) form a stationary run. */
const STATIONARY_EPS = 0.003

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

/** Build a GeometryEdit with normalized handles (default even spacing when omitted). */
export function makeGeometryEdit(
  samples: MotionSample[],
  bakedSmoothing: number,
  handleIndices?: number[] | null,
): GeometryEdit {
  return {
    samples: copyPath(samples),
    bakedSmoothing,
    handleIndices: normalizeHandleIndices(samples.length, handleIndices),
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
