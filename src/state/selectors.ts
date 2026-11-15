import { projectToLocal } from '../core/clip'
import { applyEasing, type MotionEasing } from '../core/easing'
import { applyGlide } from '../core/glide'
import {
  cachedApplyEasing,
  cachedApplyGlide,
  cachedApplySteadySpeed,
  cachedProcessMotion,
} from '../core/pathCache'
import { applySteadySpeed, processMotion } from '../core/process'
import { evaluate } from '../core/playback'
import { findActor } from '../core/sceneActor'
import type {
  GeometryEdit,
  MotionSample,
  Project,
  SceneActor,
  Vec2,
} from '../core/types'

export interface PathViewState {
  geometryEdit: GeometryEdit | null
  editSession: GeometryEdit | null
  editPreview: MotionSample[] | null
  /**
   * When set, overrides {@link SceneActor.glide} for preview (Glide session).
   * `undefined` → use the actor field.
   */
  glideOverride?: number
  /**
   * When set, overrides {@link SceneActor.easing} for preview.
   * `undefined` → use the actor field.
   */
  easingOverride?: MotionEasing
}

/**
 * Path used for display, playback, and CSS export for one actor.
 *
 * Priority: drag preview → edit session → committed geometry edit → live process.
 * Unchanged recording/geometry inputs reuse a bounded processed-path cache so
 * playback-head updates only evaluate the path (no re-smoothing).
 */
export function selectProcessedPathForActor(
  project: Project,
  actor: SceneActor,
  view: PathViewState = {
    geometryEdit: null,
    editSession: null,
    editPreview: null,
  },
): MotionSample[] {
  const recording = actor.recording
  if (!recording) return []

  const aspect = project.stageAspect
  const glideAmount =
    typeof view.glideOverride === 'number'
      ? view.glideOverride
      : (actor.glide ?? 0)
  const easingKind: MotionEasing =
    view.easingOverride ?? actor.easing ?? 'linear'

  // Live drag preview changes every pointer move — do not fill the LRU
  // (steady, glide, or easing). Committed paths use identity-keyed caches.
  if (view.editPreview) {
    const steady = applySteadySpeed(
      view.editPreview,
      actor.steadySpeed,
      aspect,
    )
    const glided =
      glideAmount <= 0
        ? steady
        : applyGlide(steady, glideAmount, aspect).samples
    if (easingKind === 'linear') return glided
    return applyEasing(glided, easingKind, aspect).samples
  }

  const spatialEdit =
    view.editSession ?? view.geometryEdit ?? actor.geometryEdit ?? null
  const spatial = spatialEdit?.samples ?? null
  // Continue path bakes Steady/Glide into samples; do not retime the prefix.
  const timingBaked = spatialEdit?.timingBaked === true
  const steadyAmount = timingBaked ? 0 : actor.steadySpeed
  const glideForPath = timingBaked ? 0 : glideAmount
  const easingForPath: MotionEasing = timingBaked ? 'linear' : easingKind

  const processed = spatial
    ? cachedApplySteadySpeed(spatial, steadyAmount, aspect)
    : cachedProcessMotion(
        recording.samples,
        actor.smoothing,
        actor.steadySpeed,
        aspect,
      )

  const glided = cachedApplyGlide(processed, glideForPath, aspect)
  return cachedApplyEasing(glided, easingForPath, aspect)
}

/** @deprecated Use selectProcessedPathForActor — kept for transitional call sites. */
export function selectProcessedPath(
  project: Project,
  view: PathViewState = {
    geometryEdit: null,
    editSession: null,
    editPreview: null,
  },
  actorId?: string | null,
): MotionSample[] {
  const actor =
    (actorId ? findActor(project.actors, actorId) : null) ??
    project.actors[0]
  if (!actor) return []
  return selectProcessedPathForActor(project, actor, view)
}

export function bakeEditablePathForActor(
  project: Project,
  actor: SceneActor,
): MotionSample[] {
  const recording = actor.recording
  if (!recording) return []
  // Bake uses steadySpeed 0; share the same cache key space as processMotion.
  return cachedProcessMotion(
    recording.samples,
    actor.smoothing,
    0,
    project.stageAspect,
  )
}

/** @deprecated */
export function bakeEditablePath(
  project: Project,
  actorId?: string | null,
): MotionSample[] {
  const actor =
    (actorId ? findActor(project.actors, actorId) : null) ??
    project.actors[0]
  if (!actor) return []
  return bakeEditablePathForActor(project, actor)
}

export function selectActorPositionForActor(
  project: Project,
  actor: SceneActor,
  playbackHead: number,
  livePosition: Vec2,
  mode: string,
  view?: PathViewState,
  isSelected = false,
): Vec2 {
  if (isSelected && (mode === 'recording' || mode === 'armed')) {
    return livePosition
  }

  const path = selectProcessedPathForActor(project, actor, view)
  if (path.length === 0) {
    // Unrecorded selected actor: follow livePosition during idle drag;
    // livePosition tracks rest when not dragging.
    if (isSelected && mode === 'idle') {
      return livePosition
    }
    return actor.restPosition
  }

  const localT = projectToLocal(playbackHead, actor.clip)
  return evaluate(path, localT)
}

/** @deprecated */
export function selectActorPosition(
  project: Project,
  playbackHead: number,
  livePosition: Vec2,
  mode: string,
  view?: PathViewState,
  actorId?: string | null,
): Vec2 {
  const actor =
    (actorId ? findActor(project.actors, actorId) : null) ??
    project.actors[0]
  if (!actor) return livePosition
  return selectActorPositionForActor(
    project,
    actor,
    playbackHead,
    livePosition,
    mode,
    view,
    true,
  )
}

/** Escape hatch when callers need an uncached process (tests / tooling). */
export function processMotionUncached(
  samples: MotionSample[],
  smoothing: number,
  steadySpeed: number,
  stageAspect: number,
): MotionSample[] {
  return processMotion(samples, smoothing, steadySpeed, stageAspect)
}
