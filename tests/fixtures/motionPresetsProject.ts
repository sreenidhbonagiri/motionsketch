import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { Project } from '../../src/core/types'
import { makeRecording } from '../unit/helpers/project'

/**
 * Recorded actor + 2s Duration for motion-preset e2e — skips Record / toast /
 * Adjust duration setup so Linux WebKit stays inside the 30s budget.
 */
export function buildMotionPresetsFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  const project: Project = {
    version: 1,
    name: 'Motion presets fixture',
    stageAspect: 1.6,
    actors: [
      createSceneActor({
        id: 'preset-actor',
        name: 'Actor 1',
        recording: makeRecording(16),
        appearance: {
          kind: 'shape',
          width: 0.1,
          height: 0.1,
          borderRadius: 0.2,
          color: '#0f766e',
          image: null,
          text: null,
        },
      }),
    ],
    playback: {
      durationMs: 2000,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}
