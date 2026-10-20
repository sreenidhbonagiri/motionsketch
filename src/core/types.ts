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

export type ActorKind = 'shape' | 'image' | 'text'

/** Portable embedded image (see core/imageAsset.ts for limits & SVG rules). */
export interface ActorImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
  label: string
}

export type ActorTextAlign = 'left' | 'center' | 'right'
/** Self-contained stacks; glyphs can differ across devices. */
export type ActorTextFont = 'system' | 'serif' | 'mono'

/** Authored text payload (see core/actorText.ts for limits). */
export interface ActorText {
  content: string
  /** Font size as a fraction of the stage’s shorter side (cqmin). */
  fontSize: number
  fontWeight: 400 | 700
  align: ActorTextAlign
  fontFamily: ActorTextFont
}

/** Visual appearance of one actor (shape, image, or text). */
export interface Actor {
  kind: ActorKind
  /**
   * Size control: fraction of the stage’s shorter side (cqmin) for the
   * actor bounding-box’s **longer** edge. Shape tiles are square.
   * Images are letterboxed inside that box (contain), preserving aspect ratio.
   * Text actors use this as the wrap-box width (height follows content).
   */
  width: number
  /** For shapes, equals width (square). Kept in sync by setters. */
  height: number
  /**
   * Corner roundness for shape actors: 0 = square, 1 = circle.
   * Preserved while kind is image/text so Shape settings survive a switch back.
   */
  borderRadius: number
  /**
   * Fill color for shapes; text color when kind === 'text'.
   * Preserved across kind switches.
   */
  color: string
  /** Present when an image has been loaded; may persist while kind !== 'image'. */
  image: ActorImage | null
  /**
   * Text settings; may persist while kind !== 'text' for easy switching.
   * Omitted/undefined on older in-memory literals — coerceActor normalizes to null.
   */
  text?: ActorText | null
}

export interface Recording {
  samples: MotionSample[]
  recordedDurationMs: number
}

/** How looping repeats when `loop` is true. */
export type LoopMode = 'repeat' | 'alternate'

/**
 * Shared timeline settings. Duration, loop, and loopMode apply to every actor.
 * Per-actor path cleanup lives on SceneActor (smoothing / steadySpeed).
 */
/**
 * When an exported CSS scene starts. Loop / alternate still apply after start.
 * @see src/core/export/triggers.ts
 */
export type PlaybackTrigger =
  | 'page-load'
  | 'click'
  | 'hover'
  | 'viewport'

export interface PlaybackSettings {
  durationMs: number
  loop: boolean
  /**
   * Used when `loop` is true.
   * - repeat: jump back to the start each cycle
   * - alternate: reverse at endpoints (ping-pong)
   */
  loopMode: LoopMode
  /**
   * Export-time activation. Editor playback is unchanged.
   * Missing / legacy → `page-load` (via coercePlaybackTrigger).
   */
  trigger?: PlaybackTrigger
}

/**
 * Rotation/scale keyframe. Time is normalized progress (0..1) along Duration
 * so changing Duration keeps relative placement. Steady Speed does not move these.
 */
export interface TransformKeyframe {
  id: string
  /** Normalized progress along playback [0, 1] */
  t: number
  /** Unwrapped degrees (0→360 is a full spin). */
  rotationDeg: number
  /** Uniform scale about the actor center; typically 0.1–4. */
  scale: number
}

export interface TransformTrack {
  keyframes: TransformKeyframe[]
}

/**
 * Active interval on the shared project timeline (normalized 0..1 progress).
 * Motion holds outside the interval; optional flags hide the actor strictly
 * before `start` and/or at-and-after `end` (visible at start; hidden at end
 * when hide-after is on). Default is the full timeline with both flags off.
 */
export interface ActorClip {
  start: number
  end: number
  /** When true, hidden for projectT < start (visible at start). */
  hideBeforeStart: boolean
  /** When true, hidden for projectT >= end (hidden at end and after). */
  hideAfterEnd: boolean
}

/**
 * One stage actor: appearance, optional motion take, path edits, and transform.
 * Array order in Project.actors is paint/stacking order (later = on top).
 */
export interface SceneActor {
  id: string
  name: string
  appearance: Actor
  recording: Recording | null
  /** Center when there is no recording (and idle rest). */
  restPosition: Vec2
  /** 0..1 path cleanup (spatial) — per actor */
  smoothing: number
  /** 0..1 soften accidental speed spikes — per actor */
  steadySpeed: number
  /**
   * 0..1 ease-in/out within moving segments (Glide). Applied after Steady Speed
   * in the shared playback/export path. Does not alter path geometry.
   */
  glide: number
  transform: TransformTrack
  /** Committed path edits; null → process live from recording */
  geometryEdit: GeometryEdit | null
  /**
   * Active motion/transform interval on the shared timeline.
   * Path and transform tracks use actor-local progress within this clip.
   */
  clip: ActorClip
  /**
   * When true, rotate the actor to follow its processed path heading.
   * Additive with {@link directionOffsetDeg} and the transform track.
   */
  faceAlongPath: boolean
  /**
   * Extra degrees added on top of path heading (image/shape facing alignment).
   * Ignored when {@link faceAlongPath} is off.
   */
  directionOffsetDeg: number
}

export interface Project {
  version: 1
  /** User-facing project title (local only; not an account). */
  name: string
  actors: SceneActor[]
  playback: PlaybackSettings
  /**
   * Logical stage width/height. Captured when the project is created and never
   * rewritten on window resize. Normalized sample coords refer to this space.
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
 *
 * `handleIndices` lists which samples show as editable controls. Adding or
 * removing a handle changes only this list — sample positions and timestamps
 * stay the same until the user drags or nudges a handle.
 */
export interface GeometryEdit {
  samples: MotionSample[]
  /** Smoothing value used when this geometry was baked. */
  bakedSmoothing: number
  /**
   * Sample indices used as editable handles (always includes endpoints).
   * Older projects omit this; loaders fill defaults via selectHandleIndices.
   */
  handleIndices: number[]
  /**
   * When true, `samples` already include live Steady Speed / Glide timing
   * (Continue path bake). Playback must not reapply those controls.
   */
  timingBaked?: boolean
  /**
   * Steady Speed to reinstate when Restore recorded path clears this edit
   * (set when Continue bakes live timing into `samples`).
   */
  restoreSteadySpeed?: number
  /**
   * Glide to reinstate when Restore recorded path clears this edit
   * (set when Continue bakes live timing into `samples`).
   */
  restoreGlide?: number
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
  text: null,
}

/** Fraction of the stage’s shorter side */
export const MIN_ACTOR_SIZE = 0.06
export const MAX_ACTOR_SIZE = 0.4

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  durationMs: 1200,
  loop: false,
  loopMode: 'repeat',
  trigger: 'page-load',
}

/** Default path-processing values for new actors (not shared timeline). */
export const DEFAULT_ACTOR_SMOOTHING = 0.35
export const DEFAULT_ACTOR_STEADY_SPEED = 0

/** Default logical stage for new in-memory projects before viewport capture. */
export const DEFAULT_STAGE_ASPECT = 16 / 10

export const DEFAULT_TRANSFORM_TRACK: TransformTrack = {
  keyframes: [],
}

export const MIN_RECORDING_SAMPLES = 2
export const MIN_RECORDING_DURATION_MS = 50
export const MIN_PLAYBACK_DURATION_MS = 200
export const MAX_PLAYBACK_DURATION_MS = 8000
export const CANONICAL_SAMPLE_COUNT = 120
export const CSS_MAX_KEYFRAMES = 60
