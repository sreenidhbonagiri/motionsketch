import { clamp01 } from './coords'
import { clampClip, cloneClip, MIN_CLIP_SPAN } from './clip'
import { copyPath, makeGeometryEdit } from './edit'
import { applyGlide } from './glide'
import {
  applyMotionStateToActor,
  captureMotionState,
  type MotionPresetMotionState,
} from './motionPresets'
import { applySteadySpeed, processMotion } from './process'
import { clampStageAspect } from './stageAspect'
import { cloneTransformTrack } from './transform'
import {
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  MIN_RECORDING_DURATION_MS,
  type GeometryEdit,
  type MotionSample,
  type Project,
  type Recording,
  type SceneActor,
  type TransformTrack,
  type Vec2,
} from './types'

/** Minimum time step when stitching so timestamps stay strictly increasing. */
const JOIN_EPS_MS = 1e-3

export type RecordingIntent = 'replace' | 'continue'

export type ContinuePathAvailability = {
  enabled: boolean
  /** Short reason when disabled (for title / aria-describedby). */
  reason: string | null
}

/**
 * Path the user currently sees (geometry edit → live process → Steady → Glide).
 * Continue joins onto this so earlier motion is not reprocessed after commit.
 */
export function displayedPathSamples(
  actor: SceneActor,
  stageAspect: number,
): MotionSample[] {
  const recording = actor.recording
  if (!recording || recording.samples.length < 2) return []
  const aspect = clampStageAspect(stageAspect)
  const ge = actor.geometryEdit
  const spatial = ge?.samples
  const timingBaked = ge?.timingBaked === true
  const steady = timingBaked ? 0 : actor.steadySpeed
  const glide = timingBaked ? 0 : (actor.glide ?? 0)
  const afterSteady = spatial
    ? applySteadySpeed(spatial, steady, aspect)
    : processMotion(recording.samples, actor.smoothing, steady, aspect)
  return applyGlide(afterSteady, glide, aspect).samples
}

/** @deprecated Use {@link displayedPathSamples} — kept for call-site clarity. */
export function committedPathSamples(actor: SceneActor): MotionSample[] {
  const spatial = actor.geometryEdit?.samples
  if (spatial && spatial.length >= 2) return spatial
  return actor.recording?.samples ?? []
}

export function pathEndpoint(samples: MotionSample[]): Vec2 | null {
  if (samples.length === 0) return null
  const last = samples[samples.length - 1]!
  return { x: last.x, y: last.y }
}

/**
 * Append `addition` onto `base` with no inserted pause at the seam.
 * The base prefix (including its endpoint) is left bit-identical so earlier
 * motion cannot drift. The addition’s first sample is dropped; later samples
 * are translated so the stroke attaches to the preserved endpoint (pointerdown
 * may not land exactly on it).
 */
export function joinPathSamples(
  base: MotionSample[],
  addition: MotionSample[],
): MotionSample[] {
  if (base.length === 0) return copyPath(addition)
  if (addition.length === 0) return copyPath(base)

  const out = copyPath(base)
  const seam = out[out.length - 1]!
  const origin = addition[0]!
  const dx = seam.x - origin.x
  const dy = seam.y - origin.y

  let lastT = seam.t
  for (let i = 1; i < addition.length; i++) {
    const sample = addition[i]!
    let t = seam.t + sample.t
    if (t <= lastT) t = lastT + JOIN_EPS_MS
    out.push({
      t,
      x: clamp01(sample.x + dx),
      y: clamp01(sample.y + dy),
    })
    lastT = t
  }
  return out
}

export function recordingFromSamples(samples: MotionSample[]): Recording | null {
  if (samples.length < 2) return null
  const recordedDurationMs = samples[samples.length - 1]!.t
  if (recordedDurationMs < MIN_RECORDING_DURATION_MS) return null
  return {
    samples: copyPath(samples),
    recordedDurationMs,
  }
}

/** True when the addition moved enough to count as a real stroke. */
export function additionHasMotion(addition: Recording): boolean {
  if (addition.samples.length < 2) return false
  if (addition.recordedDurationMs < MIN_RECORDING_DURATION_MS) return false
  const origin = addition.samples[0]!
  for (let i = 1; i < addition.samples.length; i++) {
    const s = addition.samples[i]!
    if (
      Math.abs(s.x - origin.x) > 1e-6 ||
      Math.abs(s.y - origin.y) > 1e-6
    ) {
      return true
    }
  }
  return false
}

/**
 * Snapshot for one continue commit. Undo restores the continued actor’s motion
 * and Duration, then remaps every other actor by absolute wall-clock time so
 * interleaved edits to those actors are not overwritten.
 */
export type ContinuePathSnapshot = {
  actorId: string
  beforeDurationMs: number
  afterDurationMs: number
  beforeMotion: MotionPresetMotionState
  afterMotion: MotionPresetMotionState
}

export function captureContinuePathSnapshot(args: {
  actorId: string
  before: Project
  after: Project
}): ContinuePathSnapshot | null {
  const beforeActor = args.before.actors.find((a) => a.id === args.actorId)
  const afterActor = args.after.actors.find((a) => a.id === args.actorId)
  if (!beforeActor || !afterActor) return null
  return {
    actorId: args.actorId,
    beforeDurationMs: args.before.playback.durationMs,
    afterDurationMs: args.after.playback.durationMs,
    beforeMotion: captureMotionState(beforeActor),
    afterMotion: captureMotionState(afterActor),
  }
}

function remapClipAbsolute(
  clip: SceneActor['clip'],
  fromDurationMs: number,
  toDurationMs: number,
): SceneActor['clip'] {
  const absStart = clip.start * fromDurationMs
  const absEnd = clip.end * fromDurationMs
  return clampClip({
    ...cloneClip(clip),
    start: absStart / toDurationMs,
    end: Math.max(
      absStart / toDurationMs + MIN_CLIP_SPAN,
      absEnd / toDurationMs,
    ),
  })
}

/**
 * Transform keys are clip-local. When a clip’s absolute length changes,
 * scale local key times so they keep the same absolute wall-clock times.
 */
function remapTransformForClipLength(
  track: TransformTrack,
  fromClipLenMs: number,
  toClipLenMs: number,
): TransformTrack {
  if (
    fromClipLenMs <= 0 ||
    toClipLenMs <= 0 ||
    Math.abs(fromClipLenMs - toClipLenMs) < 1e-9
  ) {
    return cloneTransformTrack(track)
  }
  const scale = fromClipLenMs / toClipLenMs
  return {
    keyframes: track.keyframes.map((k) => ({
      ...k,
      t: clamp01(k.t * scale),
    })),
  }
}

/**
 * Apply a continue snapshot forward (redo) or backward (undo).
 * Other actors keep their current absolute clip/transform times.
 */
export function applyContinuePathSnapshot(
  project: Project,
  snapshot: ContinuePathSnapshot,
  direction: 'undo' | 'redo',
): Project {
  const targetDuration =
    direction === 'undo' ? snapshot.beforeDurationMs : snapshot.afterDurationMs
  const fromDuration = project.playback.durationMs
  const motion =
    direction === 'undo' ? snapshot.beforeMotion : snapshot.afterMotion

  return {
    ...project,
    playback: {
      ...project.playback,
      durationMs: targetDuration,
    },
    actors: project.actors.map((a) => {
      if (a.id === snapshot.actorId) {
        return applyMotionStateToActor(a, motion)
      }
      // Clip abs times remapped with Duration; transform keys stay clip-local
      // so they keep the same absolute times when the abs clip window is fixed.
      return {
        ...a,
        clip: remapClipAbsolute(a.clip, fromDuration, targetDuration),
      }
    }),
  }
}

/** @deprecated Legacy whole-project snapshot helpers (tests may still import). */
export type ContinueTimelineSnapshot = {
  durationMs: number
  actors: Array<{ id: string; motion: MotionPresetMotionState }>
}

export function captureContinueTimelineSnapshot(
  project: Project,
): ContinueTimelineSnapshot {
  return {
    durationMs: project.playback.durationMs,
    actors: project.actors.map((a) => ({
      id: a.id,
      motion: captureMotionState(a),
    })),
  }
}

export function applyContinueTimelineSnapshot(
  project: Project,
  snapshot: ContinueTimelineSnapshot,
): Project {
  const byId = new Map(snapshot.actors.map((e) => [e.id, e.motion]))
  return {
    ...project,
    playback: {
      ...project.playback,
      durationMs: snapshot.durationMs,
    },
    actors: project.actors.map((a) => {
      const motion = byId.get(a.id)
      return motion ? applyMotionStateToActor(a, motion) : a
    }),
  }
}

export type ContinueCommitPlan = {
  /** Joined displayed path — stored as geometryEdit (recording stays original). */
  geometryEdit: GeometryEdit
  /** Live Steady/Glide must be cleared so the baked prefix is not retimed. */
  steadySpeed: number
  glide: number
  durationMs: number
  bakedLiveTiming: boolean
  actors: Array<{
    id: string
    clip: SceneActor['clip']
    transform: TransformTrack
    geometryEdit?: GeometryEdit
    steadySpeed?: number
    glide?: number
  }>
}

/**
 * Build the post-continue project plan.
 *
 * Joins onto the *displayed* path (Steady/Glide/smoothing already applied),
 * stores the result as geometryEdit, keeps the original recording for
 * “Restore recorded path”, and zeroes Steady/Glide so earlier motion cannot
 * be silently retimed. Sequence/Duration grow so prior section speed matches.
 */
export function planContinuePathCommit(args: {
  project: Project
  actorId: string
  addition: Recording
}): ContinueCommitPlan | { error: string } {
  const actor = args.project.actors.find((a) => a.id === args.actorId)
  if (!actor?.recording) {
    return { error: 'Select an actor with a path before continuing.' }
  }
  if (actor.faceAlongPath) {
    return {
      error:
        'Continue path is unavailable while Face along path is on. Facing uses the whole stroke, so continuing would change earlier facing.',
    }
  }
  if (!additionHasMotion(args.addition)) {
    return { error: 'zero-motion' }
  }

  const baseSamples = displayedPathSamples(actor, args.project.stageAspect)
  if (baseSamples.length < 2) {
    return { error: 'Select an actor with a path before continuing.' }
  }

  const joined = joinPathSamples(baseSamples, args.addition.samples)
  const joinedRecording = recordingFromSamples(joined)
  if (!joinedRecording) {
    return { error: 'zero-motion' }
  }

  const priorSteady = actor.steadySpeed
  const priorGlide = actor.glide ?? 0
  const bakedLiveTiming = priorSteady > 0 || priorGlide > 0
  // Prefer prior restore hints when continuing an already-baked path so
  // Restore still returns the pre-continue Steady/Glide, not zeros.
  const restoreSteady =
    typeof actor.geometryEdit?.restoreSteadySpeed === 'number'
      ? actor.geometryEdit.restoreSteadySpeed
      : priorSteady
  const restoreGlide =
    typeof actor.geometryEdit?.restoreGlide === 'number'
      ? actor.geometryEdit.restoreGlide
      : priorGlide
  const geometryEdit = makeGeometryEdit(joined, actor.smoothing, null, {
    timingBaked: true,
    restoreSteadySpeed: restoreSteady,
    restoreGlide,
  })

  const oldPathMs = Math.max(
    MIN_RECORDING_DURATION_MS,
    baseSamples[baseSamples.length - 1]!.t,
  )
  const newPathMs = joinedRecording.recordedDurationMs
  const oldDuration = Math.max(
    MIN_PLAYBACK_DURATION_MS,
    args.project.playback.durationMs,
  )
  const clip = clampClip(actor.clip)
  const oldClipAbsStart = clip.start * oldDuration
  const oldClipAbsEnd = clip.end * oldDuration
  const oldClipLen = Math.max(oldClipAbsEnd - oldClipAbsStart, 1e-6)

  // Keep path-speed invariant: pathMs / clipLen unchanged for the prefix.
  // Multiply-then-divide so (delta / newClipLen) * newPathMs matches
  // (delta / oldClipLen) * oldPathMs as closely as float allows.
  const newClipLen = (oldClipLen * newPathMs) / oldPathMs
  const newClipAbsEnd = oldClipAbsStart + newClipLen
  // Persist rounds Duration to whole ms — keep in-memory commits integer too
  // so save/reopen cannot silently retime absolute probes.
  let newDuration = Math.max(oldDuration, newClipAbsEnd)

  if (newDuration > MAX_PLAYBACK_DURATION_MS + 1e-9) {
    return {
      error: `Continuing would need more than ${MAX_PLAYBACK_DURATION_MS / 1000}s of project Duration. Shorten the path or Sequence, or Reset motion.`,
    }
  }

  newDuration = Math.min(
    MAX_PLAYBACK_DURATION_MS,
    Math.max(MIN_PLAYBACK_DURATION_MS, Math.ceil(newDuration - 1e-9)),
  )

  let contStart = oldClipAbsStart / newDuration
  let contEnd = newClipAbsEnd / newDuration
  if (contEnd - contStart < MIN_CLIP_SPAN) {
    contEnd = Math.min(1, contStart + MIN_CLIP_SPAN)
    if (contEnd - contStart < MIN_CLIP_SPAN - 1e-9) {
      return {
        error:
          'Not enough Sequence room to continue at the current speed. Lengthen Duration or shorten this actor’s clip.',
      }
    }
  }
  const continuedClip = clampClip({
    ...clip,
    start: contStart,
    end: contEnd,
  })

  const actors = args.project.actors.map((a) => {
    if (a.id === args.actorId) {
      return {
        id: a.id,
        clip: continuedClip,
        transform: remapTransformForClipLength(
          a.transform,
          oldClipLen,
          newClipLen,
        ),
        geometryEdit,
        steadySpeed: 0,
        glide: 0,
      }
    }
    return {
      id: a.id,
      clip: remapClipAbsolute(a.clip, oldDuration, newDuration),
      // Clip-local transform keys: abs clip window is preserved, so keys stay.
      transform: cloneTransformTrack(a.transform),
    }
  })

  return {
    geometryEdit,
    steadySpeed: 0,
    glide: 0,
    durationMs: newDuration,
    bakedLiveTiming,
    actors,
  }
}

export function continuePathAvailability(args: {
  actor: SceneActor | null | undefined
  mode: string
  polishSession: unknown
  glideSession: unknown
  presetSession: unknown
  pathGestureActive?: boolean
}): ContinuePathAvailability {
  const { actor } = args
  if (!actor?.recording || actor.recording.samples.length < 2) {
    return {
      enabled: false,
      reason: 'Record a path for this actor before continuing.',
    }
  }
  if (
    args.mode === 'armed' ||
    args.mode === 'recording' ||
    args.mode === 'editing' ||
    args.mode === 'playing'
  ) {
    return {
      enabled: false,
      reason: 'Finish or cancel the current mode before continuing the path.',
    }
  }
  if (args.polishSession) {
    return {
      enabled: false,
      reason: 'Apply or cancel Polish before continuing the path.',
    }
  }
  if (args.glideSession) {
    return {
      enabled: false,
      reason: 'Apply or cancel Glide before continuing the path.',
    }
  }
  if (args.presetSession) {
    return {
      enabled: false,
      reason: 'Apply or cancel the motion preset before continuing the path.',
    }
  }
  if (args.pathGestureActive) {
    return {
      enabled: false,
      reason: 'Finish the path gesture before continuing.',
    }
  }

  if (!pathEndpoint(committedPathSamples(actor))) {
    return {
      enabled: false,
      reason: 'This path has no endpoint to continue from.',
    }
  }

  if (actor.faceAlongPath) {
    return {
      enabled: false,
      reason:
        'Continue path is unavailable while Face along path is on. Facing uses the whole stroke, so continuing would change earlier facing.',
    }
  }

  return { enabled: true, reason: null }
}

/** Default title / help when Continue is available. */
export const CONTINUE_PATH_HELP =
  'Add another stroke from the path’s end. Existing smoothing, Steady Speed, and Glide become part of the continued path so earlier motion stays the same. Extends Sequence and Duration to keep prior speed.'

export const CONTINUE_PATH_BAKE_NOTE =
  'Continues from the path you see — smoothing and timing become part of the stroke.'

export const RESTORE_RECORDED_PATH_HELP =
  'Removes every continuation and path edit for this actor and returns to the original recording, including its Steady Speed and Glide settings.'

export const CONTINUE_PATH_INSTRUCTION =
  'Drag the actor to continue its path.'

export const CONTINUE_PATH_ANNOUNCEMENT = `Ready — ${CONTINUE_PATH_INSTRUCTION}`
