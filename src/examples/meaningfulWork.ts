import { isFullClip } from '../core/clip'
import {
  DEFAULT_PROJECT_NAME,
  sanitizeProjectName,
} from '../core/projectName'
import { projectHasAnyRecording } from '../core/sceneActor'
import { DEFAULT_REST_POSITION } from '../core/sceneActor'
import {
  DEFAULT_ACTOR,
  DEFAULT_PLAYBACK,
  type Project,
} from '../core/types'

/**
 * True when replacing the project would discard user work beyond a blank
 * starter — renamed title, recordings, custom actors, appearance, rest pose,
 * clips, transforms, or non-default playback settings.
 * Stage aspect alone (viewport capture) does not count.
 */
export function projectHasMeaningfulWork(project: Project): boolean {
  if (sanitizeProjectName(project.name) !== DEFAULT_PROJECT_NAME) return true
  if (projectHasAnyRecording(project)) return true
  if (project.actors.length !== 1) return true

  const actor = project.actors[0]
  if (actor.name !== 'Actor 1') return true
  if (actor.appearance.kind !== 'shape') return true
  if (actor.appearance.image) return true
  if (actor.appearance.color.toLowerCase() !== DEFAULT_ACTOR.color.toLowerCase()) {
    return true
  }
  if (Math.abs(actor.appearance.width - DEFAULT_ACTOR.width) > 1e-6) return true
  if (
    Math.abs(actor.appearance.borderRadius - DEFAULT_ACTOR.borderRadius) > 1e-6
  ) {
    return true
  }
  if (Math.abs(actor.restPosition.x - DEFAULT_REST_POSITION.x) > 1e-6) return true
  if (Math.abs(actor.restPosition.y - DEFAULT_REST_POSITION.y) > 1e-6) return true
  if (actor.transform.keyframes.length > 0) return true
  if (actor.geometryEdit) return true
  if (!isFullClip(actor.clip)) return true

  if (project.playback.durationMs !== DEFAULT_PLAYBACK.durationMs) return true
  if (project.playback.loop !== DEFAULT_PLAYBACK.loop) return true
  if (project.playback.loopMode !== DEFAULT_PLAYBACK.loopMode) return true

  return false
}
