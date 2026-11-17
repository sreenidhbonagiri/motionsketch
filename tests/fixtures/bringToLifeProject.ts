import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import { compositionSizeFromAspect } from '../../src/core/stageResize'
import type { MotionSample, Project } from '../../src/core/types'

/** Rough logo entrance — shaky diagonal into center. */
export const BTL_LOGO_ID = 'btl-logo'
/** Curved flight — arc with trackpad wobble. */
export const BTL_CURVE_ID = 'btl-curve'
/** Quick flick — short burst with jitter. */
export const BTL_FLICK_ID = 'btl-flick'
/** Mid-path pause that must survive enhancement. */
export const BTL_PAUSED_ID = 'btl-paused'
/** Path that hugs a stage edge (restraint / clamp check). */
export const BTL_EDGE_ID = 'btl-edge'

function wobbleLine(
  n: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  dt: number,
  amp = 0.012,
): MotionSample[] {
  const out: MotionSample[] = []
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const wobble =
      i === 0 || i === n - 1
        ? 0
        : Math.sin(i * 1.9) * amp + Math.cos(i * 2.3) * amp * 0.6
    out.push({
      t: i * dt,
      x: from.x + (to.x - from.x) * u + wobble,
      y: from.y + (to.y - from.y) * u + (i % 2 === 0 ? wobble * 0.7 : -wobble),
    })
  }
  return out
}

function roughLogoEntrance(): MotionSample[] {
  return wobbleLine(42, { x: 0.12, y: 0.78 }, { x: 0.5, y: 0.42 }, 28, 0.014)
}

function curvedFlight(): MotionSample[] {
  const out: MotionSample[] = []
  const n = 56
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const wobble =
      i === 0 || i === n - 1 ? 0 : Math.sin(i * 2.4) * 0.011
    out.push({
      t: i * 32,
      x: 0.15 + u * 0.7 + wobble,
      y: 0.72 - Math.sin(u * Math.PI) * 0.42 + wobble * 0.5,
    })
  }
  return out
}

function quickFlick(): MotionSample[] {
  // Uneven dt + spatial jitter — a fast “flick” take.
  const out: MotionSample[] = []
  const n = 18
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const dt = i === 0 ? 0 : 8 + ((i * 7) % 17)
    const t = i === 0 ? 0 : out[i - 1]!.t + dt
    const wobble = i === 0 || i === n - 1 ? 0 : ((i % 3) - 1) * 0.01
    out.push({
      t,
      x: 0.2 + u * 0.55 + wobble,
      y: 0.55 + wobble * 0.4,
    })
  }
  return out
}

function pausedPath(): MotionSample[] {
  // Move, hold ~400ms, then finish — pause must remain after enhance.
  const head = wobbleLine(20, { x: 0.2, y: 0.65 }, { x: 0.45, y: 0.45 }, 30, 0.01)
  const pauseT0 = head[head.length - 1]!.t
  const pause: MotionSample[] = []
  for (let i = 1; i <= 10; i++) {
    pause.push({
      t: pauseT0 + i * 40,
      x: head[head.length - 1]!.x,
      y: head[head.length - 1]!.y,
    })
  }
  const resumeFrom = pause[pause.length - 1]!
  const tail = wobbleLine(
    18,
    { x: resumeFrom.x, y: resumeFrom.y },
    { x: 0.72, y: 0.35 },
    30,
    0.01,
  ).map((s, i) =>
    i === 0
      ? { ...resumeFrom }
      : { t: resumeFrom.t + s.t, x: s.x, y: s.y },
  )
  return [...head, ...pause.slice(1), ...tail.slice(1)]
}

function stageEdgePath(): MotionSample[] {
  // Travels along the left edge then into frame — enhancement must clamp.
  return wobbleLine(36, { x: 0.02, y: 0.85 }, { x: 0.02, y: 0.25 }, 30, 0.008).map(
    (s, i, arr) => {
      if (i < arr.length * 0.55) return s
      const u = (i - arr.length * 0.55) / (arr.length * 0.45)
      return {
        ...s,
        x: 0.02 + u * 0.35 + (i === arr.length - 1 ? 0 : Math.sin(i) * 0.006),
      }
    },
  )
}

function actorFromSamples(
  id: string,
  name: string,
  samples: MotionSample[],
  color: string,
  extra?: Partial<Parameters<typeof createSceneActor>[0]>,
) {
  const durationMs = samples[samples.length - 1]!.t
  return createSceneActor({
    id,
    name,
    appearance: {
      kind: 'shape',
      width: 72,
      height: 72,
      borderRadius: 12,
      color,
      image: null,
    },
    recording: { samples, recordedDurationMs: durationMs },
    restPosition: { x: samples[0]!.x, y: samples[0]!.y },
    clip: {
      start: 0,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    },
    ...extra,
  })
}

/** Five-actor fixture covering the Bring to life demo cases. */
export function buildBringToLifeFixtureProject(): Project {
  const logo = roughLogoEntrance()
  const curve = curvedFlight()
  const flick = quickFlick()
  const paused = pausedPath()
  const edge = stageEdgePath()
  const durationMs = Math.max(
    logo[logo.length - 1]!.t,
    curve[curve.length - 1]!.t,
    flick[flick.length - 1]!.t,
    paused[paused.length - 1]!.t,
    edge[edge.length - 1]!.t,
  )
  const aspect = 1.6
  const size = compositionSizeFromAspect(aspect)
  return {
    version: 1,
    name: 'Bring to life demos',
    stageAspect: aspect,
    stageWidth: size.width,
    stageHeight: size.height,
    playback: {
      durationMs,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [
      actorFromSamples(BTL_LOGO_ID, 'Rough logo', logo, '#1d4ed8', {
        transform: {
          keyframes: [
            { id: 'logo-rot-0', t: 0, rotationDeg: 0, scale: 0.85 },
            { id: 'logo-rot-1', t: 1, rotationDeg: 12, scale: 1 },
          ],
        },
      }),
      actorFromSamples(BTL_CURVE_ID, 'Curved flight', curve, '#0f766e'),
      actorFromSamples(BTL_FLICK_ID, 'Quick flick', flick, '#b45309'),
      actorFromSamples(BTL_PAUSED_ID, 'Paused path', paused, '#7c3aed'),
      actorFromSamples(BTL_EDGE_ID, 'Stage edge', edge, '#be123c'),
    ],
  }
}

export function buildBringToLifeFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  return serializeSnapshot(
    buildSnapshot(buildBringToLifeFixtureProject(), null, savedAt),
  )
}

export {
  roughLogoEntrance,
  curvedFlight,
  quickFlick,
  pausedPath,
  stageEdgePath,
}
