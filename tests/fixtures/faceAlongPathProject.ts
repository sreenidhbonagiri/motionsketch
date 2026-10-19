import { makeGeometryEdit } from '../../src/core/edit'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'

/** Rightward then downward L — clear 0° then ~90° headings. */
export function buildLPathSamples(): MotionSample[] {
  const samples: MotionSample[] = []
  // Horizontal leg
  for (let i = 0; i < 20; i++) {
    samples.push({ t: i * 40, x: 0.2 + (i / 19) * 0.4, y: 0.3 })
  }
  // Pause at the corner
  for (let i = 0; i < 4; i++) {
    samples.push({ t: (20 + i) * 40, x: 0.6, y: 0.3 })
  }
  // Vertical leg (down)
  for (let i = 1; i <= 20; i++) {
    samples.push({
      t: (23 + i) * 40,
      x: 0.6,
      y: 0.3 + (i / 20) * 0.4,
    })
  }
  return samples
}

/** Smooth arc for continuous heading change. */
export function buildArcPathSamples(): MotionSample[] {
  const samples: MotionSample[] = []
  const n = 40
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const ang = Math.PI * u // 0 → 180° in math space
    samples.push({
      t: i * 40,
      x: 0.5 + 0.25 * Math.cos(ang),
      y: 0.5 - 0.25 * Math.sin(ang),
    })
  }
  return samples
}

export function buildFaceAlongLFixtureJson(
  savedAt = '2026-06-01T00:00:00.000Z',
  options?: { faceAlongPath?: boolean; directionOffsetDeg?: number },
): string {
  const samples = buildLPathSamples()
  const actor = createSceneActor({
    id: 'face-l',
    name: 'Face L',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit: makeGeometryEdit(samples, 0, [0, 20, samples.length - 1]),
    smoothing: 0,
    steadySpeed: 0,
    faceAlongPath: options?.faceAlongPath ?? true,
    directionOffsetDeg: options?.directionOffsetDeg ?? 0,
    transform: { keyframes: [] },
    clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
  })
  const project: Project = {
    version: 1,
    name: 'Face along L',
    actors: [actor],
    playback: {
      durationMs: 2000,
      loop: true,
      loopMode: 'alternate',
      trigger: 'page-load',
    },
    stageAspect: 1.6,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}

/** Multi-revolution spiral for additive facing / export progression checks. */
export function buildSpiralPathSamples(
  points = 180,
  turns = 3.5,
): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i < points; i++) {
    const u = i / (points - 1)
    const ang = turns * Math.PI * 2 * u
    const r = 0.08 + 0.22 * u
    samples.push({
      t: i * 20,
      x: 0.5 + r * Math.cos(ang),
      y: 0.5 + r * Math.sin(ang),
    })
  }
  return samples
}

export function buildFaceAlongSpiralFixtureJson(
  savedAt = '2026-06-01T00:00:00.000Z',
  options?: { points?: number; turns?: number },
): string {
  const samples = buildSpiralPathSamples(
    options?.points ?? 180,
    options?.turns ?? 3.5,
  )
  const actor = createSceneActor({
    id: 'face-spiral',
    name: 'Face spiral',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit: makeGeometryEdit(samples, 0),
    smoothing: 0,
    steadySpeed: 0,
    faceAlongPath: true,
    directionOffsetDeg: 0,
    transform: { keyframes: [] },
    clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
  })
  const project: Project = {
    version: 1,
    name: 'Face along spiral',
    actors: [actor],
    playback: {
      durationMs: 3600,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: 1.6,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}

/** Extreme spiral that exceeds the sampled 3° export fidelity budget. */
export function buildFaceAlongFidelityWarningFixtureJson(
  savedAt = '2026-06-01T00:00:00.000Z',
): string {
  return buildFaceAlongSpiralFixtureJson(savedAt, { points: 800, turns: 30 })
}

export function buildFaceAlongArcFixtureJson(
  savedAt = '2026-06-01T00:00:00.000Z',
): string {
  const samples = buildArcPathSamples()
  const actor = createSceneActor({
    id: 'face-arc',
    name: 'Face arc',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit: makeGeometryEdit(samples, 0),
    smoothing: 0,
    steadySpeed: 0,
    faceAlongPath: true,
    directionOffsetDeg: -90,
    transform: {
      keyframes: [
        { id: 'xf0', t: 0, rotationDeg: 0, scale: 1 },
        { id: 'xf1', t: 1, rotationDeg: 30, scale: 1 },
      ],
    },
    clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
  })
  const project: Project = {
    version: 1,
    name: 'Face along arc',
    actors: [actor],
    playback: {
      durationMs: 1600,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: 1.6,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}
