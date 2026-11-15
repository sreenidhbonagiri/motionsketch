import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'

export const EASING_ACTOR_ID = 'easing-fixture-actor'

/** Straight path with a mid pause — good for easing + delay checks. */
export function buildEasingFixtureSamples(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 30; i++) {
    const u = i / 30
    samples.push({
      t: i * 40,
      x: 0.2 + u * 0.35,
      y: 0.5,
    })
  }
  const pauseStart = samples[samples.length - 1]!
  for (let i = 1; i <= 6; i++) {
    samples.push({
      t: pauseStart.t + i * 40,
      x: pauseStart.x,
      y: pauseStart.y,
    })
  }
  const end = samples[samples.length - 1]!
  for (let i = 1; i <= 24; i++) {
    samples.push({
      t: end.t + i * 35,
      x: end.x + i * 0.015,
      y: end.y,
    })
  }
  return samples
}

export function buildEasingFixtureProject(): Project {
  const samples = buildEasingFixtureSamples()
  const actor = createSceneActor({
    id: EASING_ACTOR_ID,
    name: 'Easing Actor',
    appearance: {
      kind: 'shape',
      width: 0.1,
      height: 0.1,
      borderRadius: 0.2,
      color: '#0f766e',
      image: null,
    },
    recording: {
      samples,
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    restPosition: { x: samples[0]!.x, y: samples[0]!.y },
    smoothing: 0,
    steadySpeed: 0,
    glide: 0,
    easing: 'linear',
    clip: {
      start: 0.1,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    },
  })
  return {
    version: 1,
    name: 'Easing fixture',
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
    playback: {
      durationMs: samples[samples.length - 1]!.t,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [actor],
  }
}

export function buildEasingFixtureJson(): string {
  return serializeSnapshot(buildSnapshot(buildEasingFixtureProject()))
}
