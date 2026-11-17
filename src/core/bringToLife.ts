/**
 * Bring to life — deterministic polish of one recorded entrance.
 *
 * Combines path cleanup (polishMotion), mild steady timing, and smoother
 * arrival via Glide + easeOut at playback. Raw recording samples are never
 * rewritten; Apply stores a geometryEdit (flagged bringToLife) plus processing
 * prefs. Squash/stretch is deferred (needs a new transform model).
 *
 * Idempotency: geometryEdit.bringToLife marks an unchanged applied result.
 * Cleared automatically when path geometry is replaced (new recording, Restore
 * recorded path, Edit path, Polish, Continue path, etc.).
 */
import { copyGeometryEdit, makeGeometryEdit } from './edit'
import { applyGlide } from './glide'
import {
  captureMotionState,
  type MotionPresetMotionState,
} from './motionPresets'
import { polishMotion } from './polish'
import { applySteadySpeed } from './process'
import { clampStageAspect } from './stageAspect'
import type { MotionSample, SceneActor } from './types'

/** Fixed polish strength for this first version (no gesture-speed inference). */
export const BRING_TO_LIFE_POLISH_STRENGTH = 0.55
/** Mild arc-length steadying after cleanup. */
export const BRING_TO_LIFE_STEADY = 0.28
/** Soften starts/stops in moving sections. */
export const BRING_TO_LIFE_GLIDE = 0.42
/** Arrival curve applied at playback (not baked into geometry). */
export const BRING_TO_LIFE_EASING = 'easeOut' as const

/** Shown when the current geometry is already an unchanged Bring to life apply. */
export const BRING_TO_LIFE_ALREADY_APPLIED =
  'Already applied. Record again, restore the recorded path, or edit the path to enhance again.'

export type BringToLifeAvailability = {
  enabled: boolean
  /** Concise reason when the action must stay off or is a no-op reopen. */
  message: string | null
}

export type BringToLifeNotes = {
  /** Existing transform keyframes kept; times unchanged. */
  preservesTransformKeyframes: boolean
  /** Squash/stretch deferred — not approximated with a scale pulse. */
  squashStretchDeferred: true
  /** Apply will replace Easing, Glide, and Steady Speed. */
  replacesTimingPrefs: true
}

export type BringToLifeResult =
  | {
      ok: true
      /** Spatial path used for dashed/solid compare (after cleanup). */
      previewSamples: MotionSample[]
      /** Full motion snapshot to Apply (recording unchanged). */
      proposed: MotionPresetMotionState
      notes: BringToLifeNotes
      changed: boolean
      reason: string | null
    }
  | {
      ok: false
      reason: string
    }

/**
 * Whether Bring to life can run for this actor.
 * Timing-baked Continue-path edits already include Steady/Glide/Easing —
 * re-enhancing would break those guarantees.
 *
 * An unchanged prior Bring to life apply stays openable (to explain) but
 * buildBringToLife reports changed: false — no geometry or history write.
 */
export function bringToLifeAvailability(
  actor: SceneActor | null | undefined,
): BringToLifeAvailability {
  if (!actor?.recording || actor.recording.samples.length < 3) {
    return {
      enabled: false,
      message: 'Record a path first.',
    }
  }
  const edit = actor.geometryEdit
  if (edit?.timingBaked) {
    return {
      enabled: false,
      message:
        'This path already has Steady Speed, Glide, and Easing baked in (Continue path). Restore the recorded path first, or leave it as authored.',
    }
  }
  if (edit?.bringToLife) {
    return {
      enabled: true,
      message: BRING_TO_LIFE_ALREADY_APPLIED,
    }
  }
  return { enabled: true, message: null }
}

/**
 * Build the enhanced motion proposal for one actor.
 * Deterministic. Does not mutate the actor.
 */
export function buildBringToLife(
  actor: SceneActor,
  stageAspect: number,
): BringToLifeResult {
  const avail = bringToLifeAvailability(actor)
  if (!avail.enabled) {
    return { ok: false, reason: avail.message ?? 'Unavailable.' }
  }

  const recording = actor.recording!
  const aspect = clampStageAspect(stageAspect)
  const baselineMotion = captureMotionState(actor)
  const notes: BringToLifeNotes = {
    preservesTransformKeyframes: actor.transform.keyframes.length > 0,
    squashStretchDeferred: true,
    replacesTimingPrefs: true,
  }

  // Unchanged prior apply — do not re-run polish (would compound).
  if (actor.geometryEdit?.bringToLife) {
    return {
      ok: true,
      previewSamples: actor.geometryEdit.samples.map((s) => ({ ...s })),
      proposed: baselineMotion,
      notes,
      changed: false,
      reason: BRING_TO_LIFE_ALREADY_APPLIED,
    }
  }

  // Spatial source: committed geometry if present, else raw recording.
  // Path edits / Polish write geometry without bringToLife, so they re-enable.
  const sourceSamples = actor.geometryEdit
    ? actor.geometryEdit.samples
    : recording.samples

  const polished = polishMotion(sourceSamples, {
    strength: BRING_TO_LIFE_POLISH_STRENGTH,
    stageAspect: aspect,
    anchorIndices: actor.geometryEdit?.handleIndices,
  })

  let spatial = polished.samples
  let changed = polished.changed

  // Mild steady-speed on the cleaned path (duration preserved).
  const steadied = applySteadySpeed(spatial, BRING_TO_LIFE_STEADY, aspect)
  if (steadied.length === spatial.length) {
    let timingDelta = 0
    for (let i = 0; i < steadied.length; i++) {
      timingDelta = Math.max(
        timingDelta,
        Math.abs(steadied[i]!.t - spatial[i]!.t),
      )
    }
    if (timingDelta > 1e-4) changed = true
    spatial = steadied
  }

  // Smoother arrival from Glide + easeOut at playback (not baked into path).
  const glideProbe = applyGlide(spatial, BRING_TO_LIFE_GLIDE, aspect)
  if (glideProbe.changed) changed = true

  // Prefs differ from current → still a meaningful Apply even if path is clean.
  if (
    actor.steadySpeed !== BRING_TO_LIFE_STEADY ||
    actor.glide !== BRING_TO_LIFE_GLIDE ||
    actor.easing !== BRING_TO_LIFE_EASING
  ) {
    changed = true
  }

  if (!changed) {
    return {
      ok: true,
      previewSamples: spatial,
      proposed: baselineMotion,
      notes,
      changed: false,
      reason: 'Motion is already clean — nothing meaningful to enhance.',
    }
  }

  // Pin duration + endpoints to the source.
  spatial[0] = {
    t: 0,
    x: sourceSamples[0]!.x,
    y: sourceSamples[0]!.y,
  }
  const last = spatial.length - 1
  const srcLast = sourceSamples[sourceSamples.length - 1]!
  spatial[last] = {
    t: srcLast.t,
    x: srcLast.x,
    y: srcLast.y,
  }

  const geometryEdit = makeGeometryEdit(
    spatial,
    actor.geometryEdit?.bakedSmoothing ?? actor.smoothing,
    actor.geometryEdit?.handleIndices ?? null,
    { bringToLife: true },
  )

  const proposed: MotionPresetMotionState = {
    ...baselineMotion,
    recording: baselineMotion.recording
      ? {
          recordedDurationMs: baselineMotion.recording.recordedDurationMs,
          samples: baselineMotion.recording.samples.map((s) => ({ ...s })),
        }
      : null,
    geometryEdit: copyGeometryEdit(geometryEdit),
    transform: baselineMotion.transform,
    clip: baselineMotion.clip,
    restPosition: { ...baselineMotion.restPosition },
    faceAlongPath: baselineMotion.faceAlongPath,
    directionOffsetDeg: baselineMotion.directionOffsetDeg,
    smoothing: actor.geometryEdit?.bakedSmoothing ?? actor.smoothing,
    steadySpeed: BRING_TO_LIFE_STEADY,
    glide: BRING_TO_LIFE_GLIDE,
    easing: BRING_TO_LIFE_EASING,
  }

  return {
    ok: true,
    previewSamples: spatial,
    proposed,
    notes,
    changed: true,
    reason: null,
  }
}
