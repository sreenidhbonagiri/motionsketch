import { createSceneActor } from '../core/sceneActor'
import type {
  MotionSample,
  Project,
  Recording,
  TransformTrack,
} from '../core/types'
import { createMotionSketchMarkImage } from './assets'

/** Authored stage aspect for all bundled examples (independent of viewport). */
export const EXAMPLE_STAGE_ASPECT = 16 / 10

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
      id: `xf-${i}`,
      t: k.t,
      rotationDeg: k.rotationDeg,
      scale: k.scale,
    })),
  }
}

/** Logo slides in, rotates upright, and scales to its final pose. */
export function buildLogoEntranceProject(): Project {
  const durationMs = 1400
  const path = [
    { x: 0.5, y: 0.88 },
    { x: 0.48, y: 0.7 },
    { x: 0.5, y: 0.52 },
    { x: 0.5, y: 0.46 },
  ]
  return {
    version: 1,
    name: 'Logo entrance',
    stageAspect: EXAMPLE_STAGE_ASPECT,
    playback: { durationMs, loop: false, loopMode: 'repeat', trigger: 'page-load' },
    actors: [
      createSceneActor({
        id: 'ex-logo',
        name: 'Logo',
        appearance: {
          kind: 'image',
          width: 0.22,
          height: 0.22,
          borderRadius: 0.28,
          color: '#0f766e',
          image: createMotionSketchMarkImage(),
        },
        recording: recordingFromPath(path, durationMs),
        restPosition: { ...path[0] },
        smoothing: 0,
        steadySpeed: 0,
        transform: transformTrack([
          { t: 0, rotationDeg: -28, scale: 0.45 },
          { t: 0.55, rotationDeg: 8, scale: 1.08 },
          { t: 1, rotationDeg: 0, scale: 1 },
        ]),
        clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
      }),
    ],
  }
}

/** Three distinct tiles chase a shared path with staggered clips. */
export function buildFollowTheLeaderProject(): Project {
  const durationMs = 2200
  const leaderPath = [
    { x: 0.18, y: 0.7 },
    { x: 0.32, y: 0.35 },
    { x: 0.55, y: 0.55 },
    { x: 0.78, y: 0.28 },
    { x: 0.88, y: 0.62 },
  ]
  // Followers share the route with a slight lateral offset.
  const offsetPath = (dy: number) =>
    leaderPath.map((p) => ({
      x: p.x,
      y: Math.min(0.92, Math.max(0.08, p.y + dy)),
    }))

  return {
    version: 1,
    name: 'Follow the leader',
    stageAspect: EXAMPLE_STAGE_ASPECT,
    playback: { durationMs, loop: false, loopMode: 'repeat', trigger: 'page-load' },
    actors: [
      createSceneActor({
        id: 'ex-lead',
        name: 'Leader',
        appearance: {
          kind: 'shape',
          width: 0.11,
          height: 0.11,
          borderRadius: 0.95,
          color: '#0f766e',
          image: null,
        },
        recording: recordingFromPath(leaderPath, durationMs),
        restPosition: { ...leaderPath[0] },
        smoothing: 0.15,
        steadySpeed: 0.2,
        clip: { start: 0, end: 0.55, hideBeforeStart: false, hideAfterEnd: false },
      }),
      createSceneActor({
        id: 'ex-mid',
        name: 'Second',
        appearance: {
          kind: 'shape',
          width: 0.1,
          height: 0.1,
          borderRadius: 0.35,
          color: '#c2410c',
          image: null,
        },
        recording: recordingFromPath(offsetPath(0.06), durationMs),
        restPosition: { ...offsetPath(0.06)[0] },
        smoothing: 0.15,
        steadySpeed: 0.2,
        clip: { start: 0.2, end: 0.75, hideBeforeStart: false, hideAfterEnd: false },
      }),
      createSceneActor({
        id: 'ex-tail',
        name: 'Third',
        appearance: {
          kind: 'shape',
          width: 0.09,
          height: 0.09,
          borderRadius: 0.12,
          color: '#334155',
          image: null,
        },
        recording: recordingFromPath(offsetPath(-0.05), durationMs),
        restPosition: { ...offsetPath(-0.05)[0] },
        smoothing: 0.15,
        steadySpeed: 0.2,
        clip: { start: 0.4, end: 1, hideBeforeStart: false, hideAfterEnd: false },
      }),
    ],
  }
}

/** One tile orbits a stationary center; endpoints match for a clean loop. */
export function buildOrbitProject(): Project {
  const durationMs = 2000
  const cx = 0.5
  const cy = 0.5
  const radius = 0.28
  const steps = 48
  const orbit: Array<{ x: number; y: number }> = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / (steps - 1)) * Math.PI * 2
    orbit.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    })
  }
  // Enforce exact endpoint match for repeat loops.
  orbit[orbit.length - 1] = { ...orbit[0] }

  return {
    version: 1,
    name: 'Orbit',
    stageAspect: EXAMPLE_STAGE_ASPECT,
    playback: { durationMs, loop: true, loopMode: 'repeat', trigger: 'page-load' },
    actors: [
      createSceneActor({
        id: 'ex-hub',
        name: 'Center',
        appearance: {
          kind: 'shape',
          width: 0.14,
          height: 0.14,
          borderRadius: 1,
          color: '#1e293b',
          image: null,
        },
        recording: null,
        restPosition: { x: cx, y: cy },
        smoothing: 0,
        steadySpeed: 0,
        clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
      }),
      createSceneActor({
        id: 'ex-sat',
        name: 'Orbit',
        appearance: {
          kind: 'shape',
          width: 0.09,
          height: 0.09,
          borderRadius: 0.4,
          color: '#0ea5e9',
          image: null,
        },
        recording: recordingFromPath(orbit, durationMs),
        restPosition: { ...orbit[0] },
        smoothing: 0,
        steadySpeed: 0,
        // Matching endpoints so repeat does not jump in rotation/scale.
        transform: transformTrack([
          { t: 0, rotationDeg: 0, scale: 1 },
          { t: 0.5, rotationDeg: 180, scale: 1 },
          { t: 1, rotationDeg: 360, scale: 1 },
        ]),
        clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
      }),
    ],
  }
}
