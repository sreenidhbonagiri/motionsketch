import { makeGeometryEdit } from '../../src/core/edit'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'

/** Straight horizontal path — screen midpoint math is unambiguous. */
export const PATH_HANDLES_SAMPLE_COUNT = 41

/**
 * Sparse default handles. Index 12 sits between 8 and 16 and is never a handle
 * until the add-handle test places one there.
 */
export const PATH_HANDLES_INDICES = [0, 8, 16, 24, 32, 40] as const

/** Known free interior sample used as the Add-point target. */
export const PATH_HANDLES_FREE_SAMPLE = 12

/** Existing interior handle used to assert duplicate rejection. */
export const PATH_HANDLES_EXISTING_INTERIOR = 16

export function buildPathHandlesFixtureSamples(): MotionSample[] {
  return Array.from({ length: PATH_HANDLES_SAMPLE_COUNT }, (_, i) => ({
    t: i * 25,
    x: 0.1 + (0.8 * i) / (PATH_HANDLES_SAMPLE_COUNT - 1),
    y: 0.5,
  }))
}

/** Serialized project JSON for localStorage / Open project. */
export function buildPathHandlesFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  const samples = buildPathHandlesFixtureSamples()
  const geometryEdit = makeGeometryEdit(samples, 0.3, [
    ...PATH_HANDLES_INDICES,
  ])
  const actor = createSceneActor({
    id: 'path-handles-fixture-actor',
    name: 'Path handles fixture',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit,
    smoothing: 0.3,
    steadySpeed: 0,
  })
  const project: Project = {
    version: 1,
    name: 'Path handles fixture',
    actors: [actor],
    playback: {
      durationMs: samples[samples.length - 1]!.t,
      loop: false,
      loopMode: 'repeat',
    },
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}
