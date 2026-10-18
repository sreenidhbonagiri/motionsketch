import { projectToLocal } from '../core/clip'
import {
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

  // Live drag preview changes every pointer move — do not fill the LRU.
  if (view.editPreview) {
    return applySteadySpeed(view.editPreview, actor.steadySpeed, aspect)
  }

  const spatial =
    view.editSession?.samples ??
    view.geometryEdit?.samples ??
    actor.geometryEdit?.samples ??
    null

  if (spatial) {
    return cachedApplySteadySpeed(spatial, actor.steadySpeed, aspect)
  }

  return cachedProcessMotion(
    recording.samples,
    actor.smoothing,
    actor.steadySpeed,
    aspect,
  )
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
