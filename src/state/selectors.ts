import { processMotion } from '../core/process'
import { evaluate } from '../core/playback'
import type { MotionSample, Project, Vec2 } from '../core/types'

export function selectProcessedPath(project: Project): MotionSample[] {
  const recording = project.recording
  if (!recording) return []
  return processMotion(
    recording.samples,
    project.playback.smoothing,
    project.playback.steadySpeed,
  )
}

export function selectActorPosition(
  project: Project,
  playbackHead: number,
  livePosition: Vec2,
  mode: string,
): Vec2 {
  if (mode === 'recording' || mode === 'armed') {
    return livePosition
  }

  const path = selectProcessedPath(project)
  if (path.length === 0) {
    return livePosition
  }

  return evaluate(path, playbackHead)
}
