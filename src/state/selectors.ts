import { applySteadySpeed, processMotion } from '../core/process'
import { evaluate } from '../core/playback'
import type { GeometryEdit, MotionSample, Project, Vec2 } from '../core/types'

export interface PathViewState {
  geometryEdit: GeometryEdit | null
  editSession: GeometryEdit | null
  editPreview: MotionSample[] | null
}

/**
 * Path used for display, playback, and CSS export.
 *
 * Priority: drag preview → edit session → committed geometry edit → live process.
 * Spatial smoothing is not re-run over baked/edited samples (predictable handles).
 * Steady Speed may still retime whatever spatial path wins.
 */
export function selectProcessedPath(
  project: Project,
  view: PathViewState = {
    geometryEdit: null,
    editSession: null,
    editPreview: null,
  },
): MotionSample[] {
  const recording = project.recording
  if (!recording) return []

  const spatial =
    view.editPreview ??
    view.editSession?.samples ??
    view.geometryEdit?.samples ??
    null

  if (spatial) {
    return applySteadySpeed(spatial, project.playback.steadySpeed)
  }

  return processMotion(
    recording.samples,
    project.playback.smoothing,
    project.playback.steadySpeed,
  )
}

/** Spatial-only bake used when entering edit mode (Steady Speed applied later). */
export function bakeEditablePath(project: Project): MotionSample[] {
  const recording = project.recording
  if (!recording) return []
  return processMotion(recording.samples, project.playback.smoothing, 0)
}

export function selectActorPosition(
  project: Project,
  playbackHead: number,
  livePosition: Vec2,
  mode: string,
  view?: PathViewState,
): Vec2 {
  if (mode === 'recording' || mode === 'armed') {
    return livePosition
  }

  // Hide actor playhead drive while editing — path handles own the interaction.
  if (mode === 'editing') {
    const path = selectProcessedPath(project, view)
    if (path.length === 0) return livePosition
    return evaluate(path, playbackHead)
  }

  const path = selectProcessedPath(project, view)
  if (path.length === 0) {
    return livePosition
  }

  return evaluate(path, playbackHead)
}
