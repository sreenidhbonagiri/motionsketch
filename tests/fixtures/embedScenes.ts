import { createSceneActor } from '../../src/core/sceneActor'
import type {
  MotionSample,
  Project,
  Recording,
  TransformTrack,
} from '../../src/core/types'
import { createMotionSketchMarkImage } from '../../src/examples/assets'
import { EXAMPLE_STAGE_ASPECT } from '../../src/examples/buildScenes'

/** Stable export ids for multi-scene embed fixtures. */
export const EMBED_SCENE_A_OPTIONS = {
  instancePrefix: 'embed-a-',
  sceneId: 'mark-in',
} as const

export const EMBED_SCENE_B_OPTIONS = {
  instancePrefix: 'embed-b-',
  sceneId: 'pulse',
} as const

function recordingFromPath(
  points: Array<{ x: number; y: number }>,
  durationMs: number,
): Recording {
  const n = Math.max(2, points.length)
  const samples: MotionSample[] = points.map((p, i) => ({
    t: (i / (n - 1)) * durationMs,
    x: p.x,
    y: p.y,
  }))
  return { samples, recordedDurationMs: durationMs }
}

function transformTrack(
  keys: Array<{ t: number; rotationDeg: number; scale: number }>,
): TransformTrack {
  return {
    keyframes: keys.map((k, i) => ({
      id: `embed-xf-${i}`,
      t: k.t,
      rotationDeg: k.rotationDeg,
      scale: k.scale,
    })),
  }
}

/**
 * Multi-actor entrance used by export-embed integration tests.
 * Distinct from starter examples: mark image + two supporting shapes with
 * hide-before clip timing (not offered as an in-app example to avoid overlap
 * with Logo entrance / Follow the leader).
 */
export function buildEmbedMarkProject(): Project {
  const durationMs = 2000
  const markPath = [
    { x: 0.2, y: 0.78 },
    { x: 0.28, y: 0.58 },
    { x: 0.36, y: 0.5 },
    { x: 0.38, y: 0.48 },
  ]
  const accentPath = [
    { x: 0.78, y: 0.28 },
    { x: 0.68, y: 0.34 },
    { x: 0.6, y: 0.38 },
    { x: 0.56, y: 0.4 },
  ]
  const barPath = [
    { x: 0.5, y: 0.88 },
    { x: 0.5, y: 0.78 },
    { x: 0.5, y: 0.7 },
  ]

  return {
    version: 1,
    name: 'Mark entrance',
    stageAspect: EXAMPLE_STAGE_ASPECT,
    playback: { durationMs, loop: false, loopMode: 'repeat' },
    actors: [
      createSceneActor({
        id: 'sc-mark',
        name: 'Mark',
        appearance: {
          kind: 'image',
          width: 0.24,
          height: 0.24,
          borderRadius: 0.28,
          color: '#0f766e',
          image: createMotionSketchMarkImage(),
        },
        recording: recordingFromPath(markPath, durationMs),
        restPosition: { ...markPath[0] },
        smoothing: 0.1,
        steadySpeed: 0.15,
        transform: transformTrack([
          { t: 0, rotationDeg: -22, scale: 0.42 },
          { t: 0.55, rotationDeg: 6, scale: 1.06 },
          { t: 1, rotationDeg: 0, scale: 1 },
        ]),
        clip: {
          start: 0.06,
          end: 0.72,
          hideBeforeStart: true,
          hideAfterEnd: false,
        },
      }),
      createSceneActor({
        id: 'sc-accent',
        name: 'Accent',
        appearance: {
          kind: 'shape',
          width: 0.08,
          height: 0.08,
          borderRadius: 1,
          color: '#0ea5e9',
          image: null,
        },
        recording: recordingFromPath(accentPath, durationMs),
        restPosition: { ...accentPath[0] },
        smoothing: 0.05,
        steadySpeed: 0,
        transform: transformTrack([
          { t: 0, rotationDeg: 0, scale: 0.35 },
          { t: 1, rotationDeg: 0, scale: 1 },
        ]),
        clip: {
          start: 0.28,
          end: 0.88,
          hideBeforeStart: true,
          hideAfterEnd: false,
        },
      }),
      createSceneActor({
        id: 'sc-bar',
        name: 'Bar',
        appearance: {
          kind: 'shape',
          width: 0.42,
          height: 0.055,
          borderRadius: 0.9,
          color: '#334155',
          image: null,
        },
        recording: recordingFromPath(barPath, durationMs),
        restPosition: { ...barPath[0] },
        smoothing: 0,
        steadySpeed: 0,
        transform: transformTrack([
          { t: 0, rotationDeg: 0, scale: 0.7 },
          { t: 1, rotationDeg: 0, scale: 1 },
        ]),
        clip: {
          start: 0.42,
          end: 1,
          hideBeforeStart: true,
          hideAfterEnd: false,
        },
      }),
    ],
  }
}

/** Compact second scene for coexistence checks beside the mark embed. */
export function buildEmbedCompanionProject(): Project {
  const durationMs = 1200
  const path = [
    { x: 0.3, y: 0.55 },
    { x: 0.5, y: 0.35 },
    { x: 0.7, y: 0.55 },
    { x: 0.5, y: 0.7 },
    { x: 0.3, y: 0.55 },
  ]
  return {
    version: 1,
    name: 'Companion pulse',
    stageAspect: 1,
    playback: { durationMs, loop: true, loopMode: 'alternate' },
    actors: [
      createSceneActor({
        id: 'cp-dot',
        name: 'Pulse',
        appearance: {
          kind: 'shape',
          width: 0.22,
          height: 0.22,
          borderRadius: 1,
          color: '#c2410c',
          image: null,
        },
        recording: recordingFromPath(path, durationMs),
        restPosition: { ...path[0] },
        smoothing: 0,
        steadySpeed: 0,
        transform: transformTrack([
          { t: 0, rotationDeg: 0, scale: 0.85 },
          { t: 0.5, rotationDeg: 0, scale: 1.15 },
          { t: 1, rotationDeg: 0, scale: 0.85 },
        ]),
        clip: {
          start: 0,
          end: 1,
          hideBeforeStart: false,
          hideAfterEnd: false,
        },
      }),
    ],
  }
}
