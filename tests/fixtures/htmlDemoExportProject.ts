import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { Project } from '../../src/core/types'
import { makeRecording } from '../unit/helpers/project'

/**
 * Seeded project for the HTML-demo smoke path: duration / loop-alternate /
 * actor color already set so the test can go straight to Export.
 * Name stays "Untitled project" for the download filename assertion.
 */
export function buildHtmlDemoExportFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  const project: Project = {
    version: 1,
    name: 'Untitled project',
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
    actors: [
      createSceneActor({
        id: 'html-demo-actor',
        name: 'Actor 1',
        recording: makeRecording(12),
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
      durationMs: 800,
      loop: true,
      loopMode: 'alternate',
      trigger: 'page-load',
    },
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}
