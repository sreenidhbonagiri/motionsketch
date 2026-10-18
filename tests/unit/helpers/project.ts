import { createSceneActor } from '../../../src/core/sceneActor'
import type {
  Actor,
  MotionSample,
  Project,
  Recording,
  SceneActor,
} from '../../../src/core/types'

export function makeSamples(count = 20): MotionSample[] {
  return Array.from({ length: count }, (_, i) => ({
    t: i * 40,
    x: 0.2 + i * 0.02,
    y: 0.4 + (i % 3) * 0.01,
  }))
}

export function makeRecording(count = 20): Recording {
  const samples = makeSamples(count)
  return {
    samples,
    recordedDurationMs: samples[samples.length - 1].t,
  }
}

export function makeActor(
  overrides?: Partial<SceneActor> & { appearance?: Partial<Actor> },
): SceneActor {
  const base = createSceneActor({
    name: overrides?.name ?? 'Actor 1',
    recording: overrides?.recording ?? makeRecording(),
    ...overrides,
  })
  if (overrides?.appearance) {
    return {
      ...base,
      appearance: { ...base.appearance, ...overrides.appearance },
    }
  }
  return base
}

export function makeProject(overrides?: Partial<Project>): Project {
  const actor = makeActor()
  return {
    version: 1,
    name: overrides?.name ?? 'Test project',
    actors: overrides?.actors ?? [actor],
    playback: overrides?.playback ?? {
      durationMs: 1200,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: overrides?.stageAspect ?? 1.6,
  }
}
