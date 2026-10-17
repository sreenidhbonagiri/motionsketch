import { cloneActor, coerceActor } from '../actor'
import {
  clampStageAspect,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import {
  DEFAULT_ACTOR,
  DEFAULT_PLAYBACK,
  DEFAULT_STAGE_ASPECT,
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type GeometryEdit,
  type LoopMode,
  type MotionSample,
  type PlaybackSettings,
  type Project,
  type Recording,
} from '../types'

/**
 * Envelope version for localStorage / download files.
 * v1 → v2: adds project.stageAspect (migrated to 16/10 when missing).
 * v2 → v3: actor.kind / actor.image for custom image actors (coerced on older files).
 */
export const PERSIST_FORMAT_VERSION = 3 as const
export const PERSIST_FORMAT_VERSION_LEGACY = 1 as const
export const PERSIST_FORMAT_VERSION_V2 = 2 as const

export const STORAGE_KEY = 'motionsketch.project.v1'

export interface PersistedSnapshot {
  formatVersion: typeof PERSIST_FORMAT_VERSION
  savedAt: string
  project: Project
  /** Committed path edits only — not undo/redo or live drag preview. */
  geometryEdit: GeometryEdit | null
}

export type PersistParseOk = { ok: true; snapshot: PersistedSnapshot }
export type PersistParseErr = { ok: false; error: string }
export type PersistParseResult = PersistParseOk | PersistParseErr

export function buildSnapshot(
  project: Project,
  geometryEdit: GeometryEdit | null,
  savedAt: string = new Date().toISOString(),
): PersistedSnapshot {
  return {
    formatVersion: PERSIST_FORMAT_VERSION,
    savedAt,
    project: cloneProject(project),
    geometryEdit: geometryEdit ? cloneGeometryEdit(geometryEdit) : null,
  }
}

export function serializeSnapshot(snapshot: PersistedSnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

export function parseSnapshotJson(raw: string): PersistParseResult {
  let data: unknown
  try {
    data = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  return validateSnapshot(data)
}

export function validateSnapshot(data: unknown): PersistParseResult {
  if (!isRecord(data)) {
    return { ok: false, error: 'Project data must be an object.' }
  }

  if (!('formatVersion' in data)) {
    return { ok: false, error: 'Missing formatVersion.' }
  }

  if (typeof data.formatVersion !== 'number' || !Number.isFinite(data.formatVersion)) {
    return { ok: false, error: 'Invalid formatVersion.' }
  }

  const formatVersion = data.formatVersion
  if (
    formatVersion !== PERSIST_FORMAT_VERSION &&
    formatVersion !== PERSIST_FORMAT_VERSION_V2 &&
    formatVersion !== PERSIST_FORMAT_VERSION_LEGACY
  ) {
    return {
      ok: false,
      error: `Unsupported project format version ${formatVersion}. This app supports versions ${PERSIST_FORMAT_VERSION_LEGACY}–${PERSIST_FORMAT_VERSION}.`,
    }
  }

  if (typeof data.savedAt !== 'string' || data.savedAt.length === 0) {
    return { ok: false, error: 'Missing or invalid savedAt.' }
  }

  const projectResult = validateProject(data.project, formatVersion)
  if (!projectResult.ok) return projectResult

  const geometryResult = validateGeometryEdit(data.geometryEdit)
  if (!geometryResult.ok) return geometryResult

  // Edited path without a recording is inconsistent.
  if (geometryResult.value && !projectResult.value.recording) {
    return {
      ok: false,
      error: 'geometryEdit requires a recording.',
    }
  }

  return {
    ok: true,
    snapshot: {
      formatVersion: PERSIST_FORMAT_VERSION,
      savedAt: data.savedAt,
      project: projectResult.value,
      geometryEdit: geometryResult.value,
    },
  }
}

function validateProject(
  value: unknown,
  formatVersion: number,
): { ok: true; value: Project } | PersistParseErr {
  if (!isRecord(value)) {
    return { ok: false, error: 'Missing or invalid project.' }
  }

  if (value.version !== 1) {
    return {
      ok: false,
      error:
        typeof value.version === 'number'
          ? `Unsupported project.version ${value.version}.`
          : 'Missing or invalid project.version.',
    }
  }

  const recording = validateRecording(value.recording)
  if (!recording.ok) return recording

  const playback = validatePlayback(value.playback)
  if (!playback.ok) return playback

  const stageAspect = coerceStageAspect(value.stageAspect, formatVersion)
  if (!stageAspect.ok) return stageAspect

  // Actor is coerced with defaults so older / partial files still load.
  return {
    ok: true,
    value: {
      version: 1,
      actor: coerceActor(value.actor),
      recording: recording.value,
      playback: playback.value,
      stageAspect: stageAspect.value,
    },
  }
}

function coerceStageAspect(
  value: unknown,
  formatVersion: number,
): { ok: true; value: number } | PersistParseErr {
  // Missing on v1 (and tolerant v2) → historical 16:10 reference geometry.
  if (value === undefined || value === null) {
    return { ok: true, value: LEGACY_STAGE_ASPECT }
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    if (formatVersion === PERSIST_FORMAT_VERSION_LEGACY) {
      return { ok: true, value: LEGACY_STAGE_ASPECT }
    }
    return { ok: false, error: 'stageAspect must be a positive finite number.' }
  }
  return { ok: true, value: clampStageAspect(value) }
}

function validateRecording(
  value: unknown,
): { ok: true; value: Recording | null } | PersistParseErr {
  if (value === null) {
    return { ok: true, value: null }
  }
  if (!isRecord(value)) {
    return { ok: false, error: 'Invalid recording.' }
  }

  const recordedDurationMs = asFiniteNumber(value.recordedDurationMs)
  if (recordedDurationMs === null || recordedDurationMs < 0) {
    return { ok: false, error: 'Invalid recording.recordedDurationMs.' }
  }

  const samples = validateSamples(value.samples, 'recording.samples')
  if (!samples.ok) return samples
  if (samples.value.length < 2) {
    return { ok: false, error: 'recording.samples must have at least 2 points.' }
  }

  return {
    ok: true,
    value: {
      samples: samples.value,
      recordedDurationMs,
    },
  }
}

function validatePlayback(
  value: unknown,
): { ok: true; value: PlaybackSettings } | PersistParseErr {
  if (!isRecord(value)) {
    return { ok: false, error: 'Missing or invalid playback settings.' }
  }

  const durationMs = asFiniteNumber(value.durationMs)
  const smoothing = asFiniteNumber(value.smoothing)
  const steadySpeed = asFiniteNumber(value.steadySpeed)
  if (durationMs === null || smoothing === null || steadySpeed === null) {
    return { ok: false, error: 'Playback numeric fields must be finite numbers.' }
  }
  if (
    durationMs < MIN_PLAYBACK_DURATION_MS ||
    durationMs > MAX_PLAYBACK_DURATION_MS
  ) {
    return {
      ok: false,
      error: `durationMs must be between ${MIN_PLAYBACK_DURATION_MS} and ${MAX_PLAYBACK_DURATION_MS}.`,
    }
  }
  if (smoothing < 0 || smoothing > 1) {
    return { ok: false, error: 'smoothing must be in [0, 1].' }
  }
  if (steadySpeed < 0 || steadySpeed > 1) {
    return { ok: false, error: 'steadySpeed must be in [0, 1].' }
  }
  if (typeof value.loop !== 'boolean') {
    return { ok: false, error: 'loop must be a boolean.' }
  }

  // Older projects omit loopMode — default to Repeat when looping.
  const loopMode = coerceLoopMode(value.loopMode)

  return {
    ok: true,
    value: {
      durationMs,
      smoothing,
      steadySpeed,
      loop: value.loop,
      loopMode,
    },
  }
}

function coerceLoopMode(value: unknown): LoopMode {
  if (value === 'alternate' || value === 'repeat') return value
  return DEFAULT_PLAYBACK.loopMode
}

function validateGeometryEdit(
  value: unknown,
): { ok: true; value: GeometryEdit | null } | PersistParseErr {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }
  if (!isRecord(value)) {
    return { ok: false, error: 'Invalid geometryEdit.' }
  }

  const bakedSmoothing = asFiniteNumber(value.bakedSmoothing)
  if (bakedSmoothing === null || bakedSmoothing < 0 || bakedSmoothing > 1) {
    return { ok: false, error: 'geometryEdit.bakedSmoothing must be in [0, 1].' }
  }

  const samples = validateSamples(value.samples, 'geometryEdit.samples')
  if (!samples.ok) return samples
  if (samples.value.length < 2) {
    return {
      ok: false,
      error: 'geometryEdit.samples must have at least 2 points.',
    }
  }

  return {
    ok: true,
    value: {
      bakedSmoothing,
      samples: samples.value,
    },
  }
}

function validateSamples(
  value: unknown,
  label: string,
): { ok: true; value: MotionSample[] } | PersistParseErr {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} must be an array.` }
  }

  const samples: MotionSample[] = []
  for (let i = 0; i < value.length; i++) {
    const item = value[i]
    if (!isRecord(item)) {
      return { ok: false, error: `${label}[${i}] is invalid.` }
    }
    const t = asFiniteNumber(item.t)
    const x = asFiniteNumber(item.x)
    const y = asFiniteNumber(item.y)
    if (t === null || x === null || y === null) {
      return { ok: false, error: `${label}[${i}] must have finite t, x, y.` }
    }
    if (t < 0) {
      return { ok: false, error: `${label}[${i}].t must be >= 0.` }
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return { ok: false, error: `${label}[${i}] x/y must be in [0, 1].` }
    }
    if (i > 0 && t < samples[i - 1].t) {
      return { ok: false, error: `${label} timestamps must be non-decreasing.` }
    }
    samples.push({ t, x, y })
  }

  return { ok: true, value: samples }
}

function cloneProject(project: Project): Project {
  return {
    version: 1,
    actor: cloneActor(project.actor),
    recording: project.recording
      ? {
          recordedDurationMs: project.recording.recordedDurationMs,
          samples: project.recording.samples.map((s) => ({ ...s })),
        }
      : null,
    playback: { ...project.playback },
    stageAspect: clampStageAspect(project.stageAspect),
  }
}

function cloneGeometryEdit(edit: GeometryEdit): GeometryEdit {
  return {
    bakedSmoothing: edit.bakedSmoothing,
    samples: edit.samples.map((s) => ({ ...s })),
  }
}

export function createEmptyPersistableProject(
  stageAspect: number = DEFAULT_STAGE_ASPECT,
): Project {
  return {
    version: 1,
    actor: cloneActor(DEFAULT_ACTOR),
    recording: null,
    playback: { ...DEFAULT_PLAYBACK },
    stageAspect: clampStageAspect(stageAspect),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
