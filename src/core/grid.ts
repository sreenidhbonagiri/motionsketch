import { clamp01 } from './coords'
import type { Vec2 } from './types'

/**
 * Editor grid in stable normalized project coordinates ([0, 1]²).
 * One shared lattice for drawing dots and snap targets — independent of
 * viewport size, DPR, and stretch. Resizing the window does not change
 * the lattice or already-saved geometry.
 *
 * Step 0.05 → 21 lines per axis (0 … 1 inclusive). Dense enough to aim,
 * sparse enough to stay readable on phone and desktop stages.
 */
export const GRID_STEP = 0.05

/** Screen-pixel distance to acquire a snap target (from pointer/center). */
export const SNAP_ACQUIRE_PX = 10

/** Screen-pixel distance to release the current target (hysteresis). */
export const SNAP_RELEASE_PX = 14

/** Keyboard nudge while Snap to grid is on (Shift = two cells). */
export const GRID_KEYBOARD_STEP = GRID_STEP
export const GRID_KEYBOARD_STEP_SHIFT = GRID_STEP * 2

/** Axis coordinates for the shared lattice (0, step, …, 1). */
export function gridLineCoords(step: number = GRID_STEP): number[] {
  const safe = step > 0 && Number.isFinite(step) ? step : GRID_STEP
  const n = Math.max(1, Math.round(1 / safe))
  const lines: number[] = []
  for (let i = 0; i <= n; i++) {
    lines.push(i === n ? 1 : clamp01(i * (1 / n)))
  }
  return lines
}

/** Snap one normalized axis value onto the lattice. */
export function snapGridAxis(value: number, step: number = GRID_STEP): number {
  const safe = step > 0 && Number.isFinite(step) ? step : GRID_STEP
  const n = Math.max(1, Math.round(1 / safe))
  const i = Math.round(clamp01(value) * n)
  // Divide by n (not i*step) so 0.15 etc. stay as close as IEEE allows.
  return clamp01(Math.min(n, Math.max(0, i)) / n)
}

/** Nearest lattice intersection to a normalized point. */
export function nearestGridPoint(point: Vec2, step: number = GRID_STEP): Vec2 {
  return {
    x: snapGridAxis(point.x, step),
    y: snapGridAxis(point.y, step),
  }
}

/** CSS-pixel size of one grid cell on the current stage (may differ per axis). */
export function gridCellSizePx(
  stageWidth: number,
  stageHeight: number,
  step: number = GRID_STEP,
): { x: number; y: number } {
  const safe = step > 0 && Number.isFinite(step) ? step : GRID_STEP
  return {
    x: Math.max(0, stageWidth) * safe,
    y: Math.max(0, stageHeight) * safe,
  }
}

/** Euclidean distance in CSS pixels between two normalized points. */
export function normalizedDistancePx(
  a: Vec2,
  b: Vec2,
  stageWidth: number,
  stageHeight: number,
): number {
  const dx = (a.x - b.x) * stageWidth
  const dy = (a.y - b.y) * stageHeight
  return Math.hypot(dx, dy)
}

export type SnapResolveResult = {
  /** Lattice point when engaged; null when free (outside acquire radius). */
  snapped: Vec2 | null
  engaged: boolean
}

/**
 * Resolve snap with release hysteresis in screen pixels so the target does
 * not flicker between neighboring intersections. While Snap is on, the
 * result is always a lattice point (no mid-cell free zone).
 *
 * Hold the previous cell until the pointer is farther than `releasePx`, then
 * switch to the nearest cell. `acquirePx` is accepted for API stability and
 * currently matches the release threshold when provided alone.
 */
export function resolveSnapTarget(
  raw: Vec2,
  stageWidth: number,
  stageHeight: number,
  previousSnapped: Vec2 | null,
  options?: {
    step?: number
    acquirePx?: number
    releasePx?: number
  },
): SnapResolveResult {
  const step = options?.step ?? GRID_STEP
  const releasePx = options?.releasePx ?? SNAP_RELEASE_PX
  void options?.acquirePx
  const nearest = nearestGridPoint(raw, step)

  if (previousSnapped) {
    const distPrev = normalizedDistancePx(
      raw,
      previousSnapped,
      stageWidth,
      stageHeight,
    )
    if (distPrev <= releasePx) {
      return { snapped: previousSnapped, engaged: true }
    }
  }

  return { snapped: nearest, engaged: true }
}

/**
 * Snap a point when enabled. Without hysteresis (keyboard / one-shot).
 * Returns the lattice point (always when enabled) — callers that need
 * free movement near mid-cells should use {@link resolveSnapTarget}.
 */
export function snapPointIfEnabled(
  point: Vec2,
  enabled: boolean,
  step: number = GRID_STEP,
): Vec2 {
  if (!enabled) return { x: point.x, y: point.y }
  return nearestGridPoint(point, step)
}

/**
 * Translation that moves `anchor` onto the nearest lattice point, then
 * limited by `limitDelta`. Returns the applied delta and the actual
 * reachable anchor (may differ from the ideal snap when bounds clip).
 */
export function snapTranslationForAnchor(
  anchor: Vec2,
  rawDelta: Vec2,
  limitDelta: (delta: Vec2) => Vec2,
  enabled: boolean,
  stageWidth: number,
  stageHeight: number,
  previousSnapped: Vec2 | null,
): {
  delta: Vec2
  /** Ideal or held snap target when engaged; null when free. */
  idealSnap: Vec2 | null
  /** Anchor after limited delta — use for the on-stage marker. */
  actualAnchor: Vec2
} {
  if (!enabled) {
    const delta = limitDelta(rawDelta)
    return {
      delta,
      idealSnap: null,
      actualAnchor: { x: anchor.x + delta.x, y: anchor.y + delta.y },
    }
  }

  const rawAnchor = { x: anchor.x + rawDelta.x, y: anchor.y + rawDelta.y }
  const resolved = resolveSnapTarget(
    rawAnchor,
    stageWidth,
    stageHeight,
    previousSnapped,
  )
  const target = resolved.snapped ?? nearestGridPoint(rawAnchor)
  const desired = { x: target.x - anchor.x, y: target.y - anchor.y }
  const delta = limitDelta(desired)
  const actualAnchor = { x: anchor.x + delta.x, y: anchor.y + delta.y }
  return {
    delta,
    idealSnap: target,
    actualAnchor,
  }
}
