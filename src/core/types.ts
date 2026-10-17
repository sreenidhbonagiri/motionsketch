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

export type ActorKind = 'shape' | 'image'

/** Portable embedded image (see core/imageAsset.ts for limits & SVG rules). */
export interface ActorImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
  label: string
}

export interface Actor {
  kind: ActorKind
  /**
   * Size control: fraction of the stage’s shorter side (cqmin) for the
   * actor bounding-box’s **longer** edge. Shape tiles are square.
   * Images are letterboxed inside that box (contain), preserving aspect ratio.
   */
  width: number
  /** For shapes, equals width (square). Kept in sync by setters. */
  height: number
  /**
   * Corner roundness for shape actors: 0 = square, 1 = circle.
   * Preserved while kind === 'image' so Shape settings survive a switch back.
   */
  borderRadius: number
  /** Fill color for shape actors; preserved while kind === 'image'. */
  color: string
  /** Present when kind === 'image'; null for shapes. */
  image: ActorImage | null
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
  /**
   * Logical stage width/height. Captured when the project is created and never
   * rewritten on window resize. Normalized sample coords refer to this space.
   * Older projects without the field migrate to 16/10 (LEGACY_STAGE_ASPECT).
   */
  stageAspect: number
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
  kind: 'shape',
  width: 0.12,
  height: 0.12,
  borderRadius: 0.28,
  color: '#4f46e5',
  image: null,
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

/** Default logical stage for new in-memory projects before viewport capture. */
export const DEFAULT_STAGE_ASPECT = 16 / 10

export const DEFAULT_PROJECT: Project = {
  version: 1,
  actor: DEFAULT_ACTOR,
  recording: null,
  playback: DEFAULT_PLAYBACK,
  stageAspect: DEFAULT_STAGE_ASPECT,
}

export const MIN_RECORDING_SAMPLES = 2
export const MIN_RECORDING_DURATION_MS = 50
export const MIN_PLAYBACK_DURATION_MS = 200
export const MAX_PLAYBACK_DURATION_MS = 8000
export const CANONICAL_SAMPLE_COUNT = 120
export const CSS_MAX_KEYFRAMES = 60
