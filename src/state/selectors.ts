import { projectToLocal } from '../core/clip'
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

  const spatial =
    view.editPreview ??
    view.editSession?.samples ??
    view.geometryEdit?.samples ??
    actor.geometryEdit?.samples ??
    null

  const aspect = project.stageAspect

  if (spatial) {
    return applySteadySpeed(spatial, actor.steadySpeed, aspect)
  }

  return processMotion(
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
  return processMotion(
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
