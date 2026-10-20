/**
 * Logical stage aspect = width / height.
 *
 * Coordinates are normalized to [0, 1] × [0, 1] in this logical space.
 * The editor shows that space inside a bounded stage frame (export aspect)
 * within a pannable/zoomable workspace. Resizing never rewrites stored
 * samples — see docs/stage-aspect.md.
 */

/** Historical MotionSketch stage (16:10). Used when migrating format v1 projects. */
export const LEGACY_STAGE_ASPECT = 16 / 10

export const MIN_STAGE_ASPECT = 0.4
export const MAX_STAGE_ASPECT = 3.5

export function clampStageAspect(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return LEGACY_STAGE_ASPECT
  return Math.min(MAX_STAGE_ASPECT, Math.max(MIN_STAGE_ASPECT, value))
}

/** Capture the available viewport ratio for a new project. */
export function captureViewportStageAspect(
  width = typeof window !== 'undefined' ? window.innerWidth : 0,
  height = typeof window !== 'undefined' ? window.innerHeight : 0,
): number {
  if (width <= 0 || height <= 0) return LEGACY_STAGE_ASPECT
  return clampStageAspect(width / height)
}

/**
 * Euclidean distance in logical stage units (width-weighted by aspect).
 * Matches physical distance when presentation aspect equals stageAspect.
 */
export function aspectDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  stageAspect: number,
): number {
  const aspect = clampStageAspect(stageAspect)
  return Math.hypot((ax - bx) * aspect, ay - by)
}

/** CSS `aspect-ratio` value from a stored width/height ratio. */
export function formatCssAspectRatio(stageAspect: number): string {
  const aspect = clampStageAspect(stageAspect)
  const known: Array<[number, number]> = [
    [16, 10],
    [16, 9],
    [4, 3],
    [3, 2],
    [1, 1],
    [9, 16],
    [10, 16],
    [3, 4],
    [2, 3],
  ]
  for (const [w, h] of known) {
    if (Math.abs(w / h - aspect) < 0.002) return `${w} / ${h}`
  }
  return `${aspect.toFixed(4)} / 1`
}
