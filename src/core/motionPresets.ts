import { clamp, clamp01 } from './coords'
import { clampClip, cloneClip, fullClip, MIN_CLIP_SPAN } from './clip'
import { copyGeometryEdit, copyPath } from './edit'
import {
  cloneTransformTrack,
  emptyTransformTrack,
  normalizeTransformKeyframe,
} from './transform'
import {
  MIN_PLAYBACK_DURATION_MS,
  MIN_RECORDING_DURATION_MS,
  type ActorClip,
  type GeometryEdit,
  type MotionSample,
  type Recording,
  type SceneActor,
  type TransformTrack,
  type Vec2,
} from './types'

/** Curated motion recipes for the selected actor. */
export type MotionPresetId =
  | 'slide-in'
  | 'pop-in'
  | 'float'
  | 'attention-pulse'

/**
 * Motion fields a preset may replace. Appearance is never included —
 * presets only author path, transform, clip, and path-processing prefs.
 */
export type MotionPresetMotionState = {
  recording: Recording | null
  geometryEdit: GeometryEdit | null
  transform: TransformTrack
  clip: ActorClip
  restPosition: Vec2
  smoothing: number
  steadySpeed: number
  glide: number
  faceAlongPath: boolean
  directionOffsetDeg: number
}

/** Delay / duration for a preset preview (ms on the shared project timeline). */
export type MotionPresetTiming = {
  delayMs: number
  durationMs: number
}

export type MotionPresetDefinition = {
  id: MotionPresetId
  label: string
  /** One short line for the picker. */
  summary: string
  /** Shown during preview — what the motion does. */
  behavior: string
  /** True when Loop makes the motion continuous. */
  prefersLoop: boolean
}

export const MOTION_PRESETS: readonly MotionPresetDefinition[] = [
  {
    id: 'slide-in',
    label: 'Slide In',
    summary: 'Slides up with a soft scale-in',
    behavior:
      'Slides up into the rest position while scaling from smaller to full size. Turns on Hide before Start so a delayed sequence Start stays hidden until then.',
    prefersLoop: false,
  },
  {
    id: 'pop-in',
    label: 'Pop In',
    summary: 'Bouncy scale entrance at rest',
    behavior:
      'Stays at the rest position and pops in with a short scale overshoot. Turns on Hide before Start so a delayed sequence Start stays hidden until then.',
    prefersLoop: false,
  },
  {
    id: 'float',
    label: 'Float',
    summary: 'Gentle up-and-down drift',
    behavior:
      'Drifts gently above and below the rest position for the Move for length. With Loop off it plays once and holds; turn on Loop to repeat.',
    prefersLoop: true,
  },
  {
    id: 'attention-pulse',
    label: 'Attention Pulse',
    summary: 'Scale pulse to draw the eye',
    behavior:
      'Stays at the rest position and pulses scale to draw attention. With Loop off it pulses once and holds; turn on Loop to keep pulsing.',
    prefersLoop: true,
  },
] as const

export function getMotionPreset(
  id: MotionPresetId,
): MotionPresetDefinition | undefined {
  return MOTION_PRESETS.find((p) => p.id === id)
}

/** Minimum Move-for span in ms for a project Duration (matches MIN_CLIP_SPAN). */
export function minPresetDurationMs(projectDurationMs: number): number {
  const projectMs = Math.max(MIN_PLAYBACK_DURATION_MS, projectDurationMs)
  return Math.max(
    MIN_RECORDING_DURATION_MS,
    Math.ceil(MIN_CLIP_SPAN * projectMs),
  )
}

export function clampPresetTiming(
  timing: MotionPresetTiming,
  projectDurationMs: number,
): MotionPresetTiming {
  const projectMs = Math.max(MIN_PLAYBACK_DURATION_MS, projectDurationMs)
  const minDur = minPresetDurationMs(projectMs)
  let delayMs = clamp(Math.round(timing.delayMs), 0, Math.max(0, projectMs - minDur))
  let durationMs = clamp(
    Math.round(timing.durationMs),
    minDur,
    Math.max(minDur, projectMs - delayMs),
  )
  if (delayMs + durationMs > projectMs) {
    durationMs = Math.max(minDur, projectMs - delayMs)
  }
  if (delayMs + durationMs > projectMs) {
    delayMs = Math.max(0, projectMs - durationMs)
  }
  return { delayMs, durationMs }
}

/** Seed timing from the actor’s current Start at / Move for on the project timeline. */
export function defaultPresetTiming(
  actor: SceneActor,
  projectDurationMs: number,
): MotionPresetTiming {
  const projectMs = Math.max(MIN_PLAYBACK_DURATION_MS, projectDurationMs)
  const clip = clampClip(actor.clip ?? fullClip())
  return clampPresetTiming(
    {
      delayMs: clip.start * projectMs,
      durationMs: (clip.end - clip.start) * projectMs,
    },
    projectMs,
  )
}

export function clipFromPresetTiming(
  timing: MotionPresetTiming,
  projectDurationMs: number,
  flags: Pick<ActorClip, 'hideBeforeStart' | 'hideAfterEnd'>,
): ActorClip {
  const projectMs = Math.max(MIN_PLAYBACK_DURATION_MS, projectDurationMs)
  const t = clampPresetTiming(timing, projectMs)
  return clampClip({
    start: t.delayMs / projectMs,
    end: (t.delayMs + t.durationMs) / projectMs,
    hideBeforeStart: flags.hideBeforeStart,
    hideAfterEnd: flags.hideAfterEnd,
  })
}

export function captureMotionState(actor: SceneActor): MotionPresetMotionState {
  return {
    recording: actor.recording
      ? {
          recordedDurationMs: actor.recording.recordedDurationMs,
          samples: copyPath(actor.recording.samples),
        }
      : null,
    geometryEdit: actor.geometryEdit
      ? copyGeometryEdit(actor.geometryEdit)
      : null,
    transform: cloneTransformTrack(actor.transform),
    clip: cloneClip(actor.clip),
    restPosition: { ...actor.restPosition },
    smoothing: actor.smoothing,
    steadySpeed: actor.steadySpeed,
    glide: actor.glide,
    faceAlongPath: actor.faceAlongPath,
    directionOffsetDeg: actor.directionOffsetDeg,
  }
}

export function applyMotionStateToActor(
  actor: SceneActor,
  motion: MotionPresetMotionState,
): SceneActor {
  return {
    ...actor,
    recording: motion.recording
      ? {
          recordedDurationMs: motion.recording.recordedDurationMs,
          samples: copyPath(motion.recording.samples),
        }
      : null,
    geometryEdit: motion.geometryEdit
      ? copyGeometryEdit(motion.geometryEdit)
      : null,
    transform: cloneTransformTrack(motion.transform),
    clip: cloneClip(motion.clip),
    restPosition: { ...motion.restPosition },
    smoothing: motion.smoothing,
    steadySpeed: motion.steadySpeed,
    glide: motion.glide,
    faceAlongPath: motion.faceAlongPath,
    directionOffsetDeg: motion.directionOffsetDeg,
  }
}

/** Deep JSON snapshot of motion fields for exact undo comparisons. */
export function motionStateFingerprint(
  motion: MotionPresetMotionState,
): string {
  return JSON.stringify(motion)
}

function easeOutCubic(t: number): number {
  const u = clamp01(t)
  return 1 - (1 - u) ** 3
}

function clampPoint(p: Vec2): Vec2 {
  return { x: clamp01(p.x), y: clamp01(p.y) }
}

function buildRecording(
  durationMs: number,
  count: number,
  at: (u: number) => Vec2,
): Recording {
  const samples: MotionSample[] = []
  const n = Math.max(2, count)
  const ms = Math.max(MIN_RECORDING_DURATION_MS, durationMs)
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const p = clampPoint(at(u))
    samples.push({ t: u * ms, x: p.x, y: p.y })
  }
  return {
    samples,
    recordedDurationMs: ms,
  }
}

function staticRecording(durationMs: number, rest: Vec2): Recording {
  const p = clampPoint(rest)
  const ms = Math.max(MIN_RECORDING_DURATION_MS, durationMs)
  return {
    recordedDurationMs: ms,
    samples: [
      { t: 0, x: p.x, y: p.y },
      { t: ms, x: p.x, y: p.y },
    ],
  }
}

function trackFromKeys(
  keys: Array<{ t: number; scale: number; rotationDeg?: number }>,
): TransformTrack {
  return {
    keyframes: keys.map((k) =>
      normalizeTransformKeyframe({
        t: k.t,
        scale: k.scale,
        rotationDeg: k.rotationDeg ?? 0,
      }),
    ),
  }
}

function isEntrancePreset(id: MotionPresetId): boolean {
  return id === 'slide-in' || id === 'pop-in'
}

/**
 * Build proposed motion for a preset. Anchors to the actor’s rest position.
 * Delay → sequence Start; Duration → Move for (clip end − start).
 */
export function buildMotionPresetState(
  id: MotionPresetId,
  actor: SceneActor,
  projectDurationMs: number,
  timingInput?: Partial<MotionPresetTiming>,
): MotionPresetMotionState {
  const rest = clampPoint(actor.restPosition)
  const baseTiming = defaultPresetTiming(actor, projectDurationMs)
  const timing = clampPresetTiming(
    {
      delayMs: timingInput?.delayMs ?? baseTiming.delayMs,
      durationMs: timingInput?.durationMs ?? baseTiming.durationMs,
    },
    projectDurationMs,
  )
  const existing = actor.clip ?? fullClip()
  const clip = clipFromPresetTiming(timing, projectDurationMs, {
    hideBeforeStart: isEntrancePreset(id) ? true : !!existing.hideBeforeStart,
    hideAfterEnd: !!existing.hideAfterEnd,
  })
  const motionMs = timing.durationMs

  switch (id) {
    case 'slide-in': {
      const fromY = clamp01(rest.y + 0.14)
      const recording = buildRecording(motionMs, 36, (u) => {
        const travel = u < 0.72 ? easeOutCubic(u / 0.72) : 1
        return {
          x: rest.x,
          y: fromY + (rest.y - fromY) * travel,
        }
      })
      return {
        recording,
        geometryEdit: null,
        transform: trackFromKeys([
          { t: 0, scale: 0.78 },
          { t: 0.55, scale: 1 },
          { t: 1, scale: 1 },
        ]),
        clip,
        restPosition: { ...rest },
        smoothing: 0,
        steadySpeed: 0,
        glide: 0,
        faceAlongPath: false,
        directionOffsetDeg: 0,
      }
    }
    case 'pop-in': {
      return {
        recording: staticRecording(motionMs, rest),
        geometryEdit: null,
        transform: trackFromKeys([
          { t: 0, scale: 0.18 },
          { t: 0.32, scale: 1.14 },
          { t: 0.52, scale: 0.94 },
          { t: 0.72, scale: 1.02 },
          { t: 1, scale: 1 },
        ]),
        clip,
        restPosition: { ...rest },
        smoothing: 0,
        steadySpeed: 0,
        glide: 0,
        faceAlongPath: false,
        directionOffsetDeg: 0,
      }
    }
    case 'float': {
      const amp = 0.045
      // Exact cycles so Loop-off end pose matches start (no jump if Loop is on).
      const cycles = 2
      const recording = buildRecording(motionMs, 48, (u) => ({
        x: rest.x,
        y: rest.y + Math.sin(u * cycles * Math.PI * 2) * amp,
      }))
      return {
        recording,
        geometryEdit: null,
        transform: emptyTransformTrack(),
        clip,
        restPosition: { ...rest },
        smoothing: 0,
        steadySpeed: 0,
        glide: 0,
        faceAlongPath: false,
        directionOffsetDeg: 0,
      }
    }
    case 'attention-pulse': {
      return {
        recording: staticRecording(motionMs, rest),
        geometryEdit: null,
        transform: trackFromKeys([
          { t: 0, scale: 1 },
          { t: 0.18, scale: 1.16 },
          { t: 0.38, scale: 1 },
          { t: 0.55, scale: 1.1 },
          { t: 0.78, scale: 1 },
          { t: 1, scale: 1 },
        ]),
        clip,
        restPosition: { ...rest },
        smoothing: 0,
        steadySpeed: 0,
        glide: 0,
        faceAlongPath: false,
        directionOffsetDeg: 0,
      }
    }
    default: {
      const _exhaustive: never = id
      throw new Error(`Unknown motion preset: ${_exhaustive}`)
    }
  }
}
