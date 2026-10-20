import { makeGeometryEdit } from '../../src/core/edit'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project, TransformTrack } from '../../src/core/types'

/** Curved path with a mid-path pause (stationary run) for Move path tests. */
export const PATH_MOVE_SAMPLE_COUNT = 33
export const PATH_MOVE_HANDLE_INDICES = [0, 8, 16, 24, 32] as const
/** Indices of the intentional pause blob (same x/y, advancing t). */
export const PATH_MOVE_PAUSE_INDICES = [14, 15, 16, 17] as const
const PATH_MOVE_PAUSE_SET = new Set<number>(PATH_MOVE_PAUSE_INDICES)

export function buildPathMoveFixtureSamples(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i < PATH_MOVE_SAMPLE_COUNT; i++) {
    const t = i * 40
    // Pause around the middle while time continues.
    if (PATH_MOVE_PAUSE_SET.has(i)) {
      samples.push({ t, x: 0.48, y: 0.42 })
      continue
    }
    const u = i / (PATH_MOVE_SAMPLE_COUNT - 1)
    samples.push({
      t,
      x: 0.18 + 0.55 * u,
      y: 0.62 - 0.28 * Math.sin(Math.PI * u),
    })
  }
  return samples
}

const TRANSFORM: TransformTrack = {
  keyframes: [
    {
      id: 'path-move-xf-1',
      t: 0.35,
      rotationDeg: 25,
      scale: 1.2,
    },
  ],
}

export function buildPathMoveFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
  options?: { secondActor?: boolean },
): string {
  const samples = buildPathMoveFixtureSamples()
  const geometryEdit = makeGeometryEdit(samples, 0.25, [
    ...PATH_MOVE_HANDLE_INDICES,
  ])
  const lead = createSceneActor({
    id: 'path-move-lead',
    name: 'Move lead',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit,
    smoothing: 0.25,
    steadySpeed: 0,
    transform: TRANSFORM,
    clip: {
      start: 0.1,
      end: 0.9,
      hideBeforeStart: true,
      hideAfterEnd: false,
    },
  })
  const actors = [lead]
  if (options?.secondActor) {
    const otherSamples = samples.map((s) => ({
      t: s.t,
      x: s.x + 0.05,
      y: s.y + 0.08,
    }))
    actors.push(
      createSceneActor({
        id: 'path-move-other',
        name: 'Other actor',
        recording: {
          samples: otherSamples,
          recordedDurationMs: otherSamples[otherSamples.length - 1]!.t,
        },
        geometryEdit: makeGeometryEdit(otherSamples, 0.25, [
          ...PATH_MOVE_HANDLE_INDICES,
        ]),
        smoothing: 0.25,
        steadySpeed: 0,
      }),
    )
  }
  const project: Project = {
    version: 1,
    name: 'Path move fixture',
    actors,
    playback: {
      durationMs: 2000,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}
