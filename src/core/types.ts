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
  /** Fraction of stage min-side */
  width: number
  height: number
  /** 0..1 of min(width, height) in CSS terms */
  borderRadius: number
  color: string
}

export interface Recording {
  samples: MotionSample[]
  recordedDurationMs: number
}

export interface PlaybackSettings {
  durationMs: number
  /** 0..1 UI control */
  smoothing: number
  loop: boolean
}

export interface Project {
  version: 1
  actor: Actor
  recording: Recording | null
  playback: PlaybackSettings
}

export type EditorMode = 'idle' | 'armed' | 'recording' | 'playing'

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

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  durationMs: 1200,
  smoothing: 0.35,
  loop: false,
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
