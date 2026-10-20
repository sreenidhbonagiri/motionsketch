import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
export const GLIDE_ACTOR_ID = 'glide-fixture-actor'

/** Deterministic uneven path with a mid pause — good for Glide preview. */
export function buildGlideFixtureSamples(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 36; i++) {
    const u = i / 36
    const t = i === 0 ? 0 : samples[i - 1]!.t + (12 + ((i * 11) % 28))
    samples.push({
      t,
      x: 0.18 + u * 0.35,
      y: 0.42 + Math.sin(u * Math.PI) * 0.12,
    })
  }
  const pauseStart = samples[samples.length - 1]!.t
  for (let i = 1; i <= 6; i++) {
    samples.push({
      t: pauseStart + i * 40,
      x: samples[samples.length - 1]!.x,
      y: samples[samples.length - 1]!.y,
    })
  }
  const boltStart = samples[samples.length - 1]!
  for (let i = 1; i <= 24; i++) {
    samples.push({
      t: boltStart.t + i * 18,
      x: boltStart.x + i * 0.018,
      y: boltStart.y + Math.sin(i / 8) * 0.02,
    })
  }
  return samples
}

export function buildGlideFixtureProject(): Project {
  const samples = buildGlideFixtureSamples()
  const actor = createSceneActor({
    id: GLIDE_ACTOR_ID,
    name: 'Glide Actor',
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
    faceAlongPath: true,
    transform: {
      keyframes: [
        { id: 'g0', t: 0, rotationDeg: 0, scale: 1 },
        { id: 'g1', t: 0.5, rotationDeg: 0, scale: 1.25 },
        { id: 'g2', t: 1, rotationDeg: 0, scale: 1 },
      ],
    },
  })
  return {
    version: 1,
    name: 'Glide fixture',
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
    playback: {
      durationMs: samples[samples.length - 1]!.t,
      loop: true,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [actor],
  }
}

export function buildGlideFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  return serializeSnapshot(
    buildSnapshot(buildGlideFixtureProject(), null, savedAt),
  )
}
