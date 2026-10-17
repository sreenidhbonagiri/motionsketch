export interface Vec2 {
  x: number
  y: number
}

export interface MotionSample {
  /** Milliseconds from recording start; first sample t === 0 */
  t: number
  /** Normalized canvas x in [0, 1] */
  x: number
  /** Normalized canvas y in [0, 1] */
  y: number
}

export interface Actor {
  /** Fraction of stage min-side (cqmin); width/height stay equal for a square tile */
  width: number
  height: number
  /**
   * Corner roundness: 0 = square, 1 = circle.
   * Editor uses 50% of min(side) at 1; CSS export uses the same as border-radius %.
   */
  borderRadius: number
  color: string
}

export interface Recording {
  samples: MotionSample[]
  recordedDurationMs: number
}

/** How looping repeats when `loop` is true. */
export type LoopMode = 'repeat' | 'alternate'

export interface PlaybackSettings {
  durationMs: number
  /** 0..1 path cleanup (spatial) */
  smoothing: number
  /** 0..1 soften accidental speed spikes; preserves pauses */
  steadySpeed: number
  loop: boolean
  /**
   * Used when `loop` is true.
   * - repeat: jump back to the start each cycle
   * - alternate: reverse at endpoints (ping-pong)
   * Older projects without this field default to `repeat`.
   */
  loopMode: LoopMode
}

export interface Project {
  version: 1
  actor: Actor
  recording: Recording | null
  playback: PlaybackSettings
}

export type EditorMode =
  | 'idle'
  | 'armed'
  | 'recording'
  | 'playing'
  | 'editing'

/**
 * Baked editable geometry. Created when entering Edit path mode.
 * Original recording.samples stay untouched. While this exists, spatial
 * smoothing is not reapplied (so handle moves are not erased); Steady Speed
 * may still retime the path for playback/export.
 */
export interface GeometryEdit {
  samples: MotionSample[]
  /** Smoothing value used when this geometry was baked. */
  bakedSmoothing: number
}

export interface Keyframe {
  /** 0..1 along the animation */
  offset: number
  x: number
  y: number
}

export const DEFAULT_ACTOR: Actor = {
  width: 0.12,
  height: 0.12,
  borderRadius: 0.28,
  color: '#4f46e5',
}

/** Fraction of the stage’s shorter side */
export const MIN_ACTOR_SIZE = 0.06
export const MAX_ACTOR_SIZE = 0.4

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  durationMs: 1200,
  smoothing: 0.35,
  steadySpeed: 0,
  loop: false,
  loopMode: 'repeat',
}

export const DEFAULT_PROJECT: Project = {
  version: 1,
  actor: DEFAULT_ACTOR,
  recording: null,
  playback: DEFAULT_PLAYBACK,
}

export const MIN_RECORDING_SAMPLES = 2
export const MIN_RECORDING_DURATION_MS = 50
export const MIN_PLAYBACK_DURATION_MS = 200
export const MAX_PLAYBACK_DURATION_MS = 8000
export const CANONICAL_SAMPLE_COUNT = 120
export const CSS_MAX_KEYFRAMES = 60
