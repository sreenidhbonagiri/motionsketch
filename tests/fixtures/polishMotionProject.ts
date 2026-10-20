import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { GeometryEdit, MotionSample, Project } from '../../src/core/types'
import { compositionSizeFromAspect } from '../../src/core/stageResize'

type FixtureActor = {
  id: string
  name: string
  width: number
  height: number
  borderRadius: number
  color: string
  smoothing: number
  steadySpeed: number
  clip: Project['actors'][number]['clip']
  transform: Project['actors'][number]['transform']
  restPosition: { x: number; y: number }
  recording: { samples: MotionSample[]; recordedDurationMs: number } | null
  geometryEdit: GeometryEdit | null
}

type FixtureData = {
  version: 1
  name: string
  stageAspect: number
  playback: Project['playback']
  actors: FixtureActor[]
}

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'polishMotionProject.data.json',
)

export function loadPolishMotionFixtureData(): FixtureData {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureData
}

export function buildPolishMotionFixtureProject(): Project {
  const data = loadPolishMotionFixtureData()
  return {
    version: 1,
    name: data.name,
    stageAspect: data.stageAspect,
    stageWidth: compositionSizeFromAspect(data.stageAspect).width,
    stageHeight: compositionSizeFromAspect(data.stageAspect).height,
    playback: { ...data.playback },
    actors: data.actors.map((a) =>
      createSceneActor({
        id: a.id,
        name: a.name,
        appearance: {
          kind: 'shape',
          width: a.width,
          height: a.height,
          borderRadius: a.borderRadius,
          color: a.color,
          image: null,
        },
        recording: a.recording,
        geometryEdit: a.geometryEdit,
        smoothing: a.smoothing,
        steadySpeed: a.steadySpeed,
        transform: a.transform,
        clip: a.clip,
        restPosition: a.restPosition,
      }),
    ),
  }
}

export function buildPolishMotionFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  return serializeSnapshot(
    buildSnapshot(buildPolishMotionFixtureProject(), null, savedAt),
  )
}

/** Edited actor (geometry with deliberate late corners). */
export const POLISH_EDITED_ACTOR_ID = 'polish-edited'
/** Unedited trackpad-style recording. */
export const POLISH_RAW_ACTOR_ID = 'polish-raw'
