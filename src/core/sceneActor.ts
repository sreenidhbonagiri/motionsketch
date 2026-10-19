import { cloneActor, coerceActor } from './actor'
import { copyPath, makeGeometryEdit } from './edit'
import { cloneClip, fullClip, parseActorClip } from './clip'
import {
  cloneTransformTrack,
  emptyTransformTrack,
  parseTransformTrack,
} from './transform'
import { clampDirectionOffsetDeg } from './faceAlongPath'
import {
  DEFAULT_ACTOR,
  DEFAULT_ACTOR_SMOOTHING,
  DEFAULT_ACTOR_STEADY_SPEED,
  type Actor,
  type GeometryEdit,
  type LoopMode,
  type MotionSample,
  type Project,
  type Recording,
  type SceneActor,
  type TransformTrack,
  type Vec2,
} from './types'

export const MAX_ACTORS = 8
export const MAX_ACTOR_NAME_LENGTH = 40

let actorIdCounter = 0

export function newActorId(): string {
  actorIdCounter += 1
  return `actor-${Date.now().toString(36)}-${actorIdCounter}`
}

export const DEFAULT_REST_POSITION: Vec2 = { x: 0.35, y: 0.5 }

export function createSceneActor(
  partial?: Omit<Partial<SceneActor>, 'clip'> & {
    name?: string
    clip?: { start: number; end: number; hideBeforeStart?: boolean; hideAfterEnd?: boolean }
  },
): SceneActor {
  const appearance = cloneActor(partial?.appearance ?? DEFAULT_ACTOR)
  return {
    id: partial?.id && partial.id.length > 0 ? partial.id : newActorId(),
    name: sanitizeActorName(partial?.name ?? 'Actor 1'),
    appearance,
    recording: partial?.recording
      ? {
          recordedDurationMs: partial.recording.recordedDurationMs,
          samples: copyPath(partial.recording.samples),
        }
      : null,
    restPosition: partial?.restPosition
      ? { ...partial.restPosition }
      : { ...DEFAULT_REST_POSITION },
    smoothing:
      typeof partial?.smoothing === 'number'
        ? clamp01Local(partial.smoothing)
        : DEFAULT_ACTOR_SMOOTHING,
    steadySpeed:
      typeof partial?.steadySpeed === 'number'
        ? clamp01Local(partial.steadySpeed)
        : DEFAULT_ACTOR_STEADY_SPEED,
    transform: cloneTransformTrack(
      partial?.transform ?? emptyTransformTrack(),
    ),
    geometryEdit: partial?.geometryEdit
      ? makeGeometryEdit(
          partial.geometryEdit.samples,
          partial.geometryEdit.bakedSmoothing,
          partial.geometryEdit.handleIndices,
        )
      : null,
    clip: cloneClip(partial?.clip ?? fullClip()),
    faceAlongPath: partial?.faceAlongPath === true,
    directionOffsetDeg: clampDirectionOffsetDeg(
      typeof partial?.directionOffsetDeg === 'number'
        ? partial.directionOffsetDeg
        : 0,
    ),
  }
}

export function cloneSceneActor(actor: SceneActor): SceneActor {
  return createSceneActor({
    ...actor,
    id: actor.id,
    name: actor.name,
    appearance: actor.appearance,
    recording: actor.recording,
    restPosition: actor.restPosition,
    smoothing: actor.smoothing,
    steadySpeed: actor.steadySpeed,
    transform: actor.transform,
    geometryEdit: actor.geometryEdit,
    clip: actor.clip,
    faceAlongPath: actor.faceAlongPath,
    directionOffsetDeg: actor.directionOffsetDeg,
  })
}

/** Duplicate for a new list entry — new id/name, shared image bytes by value. */
export function duplicateSceneActor(
  actor: SceneActor,
  name: string,
): SceneActor {
  return createSceneActor({
    name,
    appearance: cloneActor(actor.appearance),
    recording: actor.recording,
    restPosition: actor.restPosition,
    smoothing: actor.smoothing,
    steadySpeed: actor.steadySpeed,
    transform: actor.transform,
    geometryEdit: actor.geometryEdit,
    clip: actor.clip,
    faceAlongPath: actor.faceAlongPath,
    directionOffsetDeg: actor.directionOffsetDeg,
  })
}

export function sanitizeActorName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_ACTOR_NAME_LENGTH)
  return trimmed.length > 0 ? trimmed : 'Actor'
}

export function uniqueActorName(base: string, existing: string[]): string {
  const root = sanitizeActorName(base)
  if (!existing.includes(root)) return root
  for (let i = 2; i < 1000; i++) {
    const candidate = sanitizeActorName(`${root} ${i}`)
    if (!existing.includes(candidate)) return candidate
  }
  return sanitizeActorName(`${root} ${Date.now()}`)
}

export function findActor(
  actors: SceneActor[],
  id: string | null | undefined,
): SceneActor | null {
  if (!id) return null
  return actors.find((a) => a.id === id) ?? null
}

export function requireActor(
  actors: SceneActor[],
  id: string,
): SceneActor {
  const found = findActor(actors, id)
  if (!found) throw new Error(`Unknown actor id: ${id}`)
  return found
}

export function mapActor(
  actors: SceneActor[],
  id: string,
  updater: (actor: SceneActor) => SceneActor,
): SceneActor[] {
  return actors.map((a) => (a.id === id ? updater(a) : a))
}

export function restPositionFromRecording(
  recording: Recording | null,
  fallback: Vec2 = DEFAULT_REST_POSITION,
): Vec2 {
  if (!recording || recording.samples.length === 0) return { ...fallback }
  const s = recording.samples[0]
  return { x: s.x, y: s.y }
}

/**
 * Migrate a legacy single-actor project (v1–v4 shape) into one SceneActor.
 * Preserves appearance, recording, transform, and path processing settings.
 */
export function migrateLegacyProjectToActors(legacy: {
  actor: unknown
  recording: Recording | null
  playback: {
    durationMs: number
    smoothing?: number
    steadySpeed?: number
    loop: boolean
    loopMode: LoopMode
  }
  transform?: TransformTrack
  geometryEdit?: GeometryEdit | null
}): SceneActor {
  const appearance = coerceActor(legacy.actor)
  const recording = legacy.recording
  return createSceneActor({
    name: 'Actor 1',
    appearance,
    recording,
    restPosition: restPositionFromRecording(recording),
    smoothing: legacy.playback.smoothing ?? DEFAULT_ACTOR_SMOOTHING,
    steadySpeed: legacy.playback.steadySpeed ?? DEFAULT_ACTOR_STEADY_SPEED,
    transform: legacy.transform
      ? cloneTransformTrack(legacy.transform)
      : emptyTransformTrack(),
    geometryEdit: legacy.geometryEdit ?? null,
  })
}

export function projectHasAnyRecording(project: Project): boolean {
  return project.actors.some((a) => !!a.recording)
}

/**
 * @deprecated Unscoped names — use {@link scopedActorClass} from
 * `./export/sceneScope` via {@link resolveExportScope}.
 */
export function cssActorClass(index: number, actorCount = 2): string {
  if (actorCount <= 1) return 'ms-actor'
  return `ms-actor-${index + 1}`
}

/** @deprecated Use scopedAnimationName with resolveExportScope. */
export function cssAnimationName(index: number, actorCount = 2): string {
  if (actorCount <= 1) return 'ms-anim'
  return `ms-anim-a${index + 1}`
}

/** @deprecated Use scopedVisibilityAnimationName with resolveExportScope. */
export function cssVisibilityAnimationName(
  index: number,
  actorCount = 2,
): string {
  if (actorCount <= 1) return 'ms-vis'
  return `ms-vis-a${index + 1}`
}

function clamp01Local(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function coerceAppearance(value: unknown): Actor {
  return coerceActor(value)
}

export function parseSceneActor(
  value: unknown,
  index: number,
): { ok: true; value: SceneActor } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: `actors[${index}] must be an object.` }
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    return { ok: false, error: `actors[${index}].id must be a non-empty string.` }
  }
  if (typeof raw.name !== 'string') {
    return { ok: false, error: `actors[${index}].name must be a string.` }
  }

  const recording = parseRecording(raw.recording, index)
  if (!recording.ok) return recording

  const transform = parseTransformTrack(raw.transform)
  if (!transform.ok) {
    return {
      ok: false,
      error: `actors[${index}].transform: ${transform.error.replace(/^project\.transform\.?/, '')}`,
    }
  }

  const geometryEdit = parseGeometryEdit(raw.geometryEdit, index)
  if (!geometryEdit.ok) return geometryEdit

  const clip = parseActorClip(raw.clip, index)
  if (!clip.ok) return clip

  const rest = parseRestPosition(raw.restPosition, recording.value, index)
  if (!rest.ok) return rest

  const smoothing =
    typeof raw.smoothing === 'number' && Number.isFinite(raw.smoothing)
      ? clamp01Local(raw.smoothing)
      : DEFAULT_ACTOR_SMOOTHING
  const steadySpeed =
    typeof raw.steadySpeed === 'number' && Number.isFinite(raw.steadySpeed)
      ? clamp01Local(raw.steadySpeed)
      : DEFAULT_ACTOR_STEADY_SPEED

  // Appearance may use imageAssetId (resolved by caller) or inline image.
  const appearance = coerceActor(raw.appearance ?? raw)

  const faceAlongPath = raw.faceAlongPath === true
  const directionOffsetDeg = clampDirectionOffsetDeg(
    typeof raw.directionOffsetDeg === 'number' ? raw.directionOffsetDeg : 0,
  )

  return {
    ok: true,
    value: createSceneActor({
      id: raw.id,
      name: sanitizeActorName(raw.name),
      appearance,
      recording: recording.value,
      restPosition: rest.value,
      smoothing,
      steadySpeed,
      transform: transform.value,
      geometryEdit: geometryEdit.value,
      clip: clip.value,
      faceAlongPath,
      directionOffsetDeg,
    }),
  }
}

function parseRecording(
  value: unknown,
  index: number,
): { ok: true; value: Recording | null } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `actors[${index}].recording is invalid.` }
  }
  const raw = value as Record<string, unknown>
  const duration = raw.recordedDurationMs
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
    return {
      ok: false,
      error: `actors[${index}].recording.recordedDurationMs must be a non-negative number.`,
    }
  }
  if (!Array.isArray(raw.samples) || raw.samples.length < 2) {
    return {
      ok: false,
      error: `actors[${index}].recording.samples must have at least 2 points.`,
    }
  }
  const samples: MotionSample[] = []
  for (let i = 0; i < raw.samples.length; i++) {
    const s = raw.samples[i]
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      return {
        ok: false,
        error: `actors[${index}].recording.samples[${i}] is invalid.`,
      }
    }
    const rec = s as Record<string, unknown>
    const t = typeof rec.t === 'number' && Number.isFinite(rec.t) ? rec.t : NaN
    const x = typeof rec.x === 'number' && Number.isFinite(rec.x) ? rec.x : NaN
    const y = typeof rec.y === 'number' && Number.isFinite(rec.y) ? rec.y : NaN
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        ok: false,
        error: `actors[${index}].recording.samples[${i}] has invalid t/x/y.`,
      }
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return {
        ok: false,
        error: `actors[${index}].recording.samples[${i}] x/y must be in [0, 1].`,
      }
    }
    if (i > 0 && t < samples[i - 1].t) {
      return {
        ok: false,
        error: `actors[${index}].recording.samples timestamps must be non-decreasing.`,
      }
    }
    samples.push({ t, x, y })
  }
  return { ok: true, value: { recordedDurationMs: duration, samples } }
}

function parseGeometryEdit(
  value: unknown,
  index: number,
): { ok: true; value: GeometryEdit | null } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `actors[${index}].geometryEdit is invalid.` }
  }
  const raw = value as Record<string, unknown>
  const baked = raw.bakedSmoothing
  if (typeof baked !== 'number' || !Number.isFinite(baked) || baked < 0 || baked > 1) {
    return {
      ok: false,
      error: `actors[${index}].geometryEdit.bakedSmoothing must be in [0, 1].`,
    }
  }
  if (!Array.isArray(raw.samples) || raw.samples.length < 2) {
    return {
      ok: false,
      error: `actors[${index}].geometryEdit.samples must have at least 2 points.`,
    }
  }
  const samples: MotionSample[] = []
  for (let i = 0; i < raw.samples.length; i++) {
    const s = raw.samples[i]
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      return {
        ok: false,
        error: `actors[${index}].geometryEdit.samples[${i}] is invalid.`,
      }
    }
    const rec = s as Record<string, unknown>
    const t = typeof rec.t === 'number' && Number.isFinite(rec.t) ? rec.t : NaN
    const x = typeof rec.x === 'number' && Number.isFinite(rec.x) ? rec.x : NaN
    const y = typeof rec.y === 'number' && Number.isFinite(rec.y) ? rec.y : NaN
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        ok: false,
        error: `actors[${index}].geometryEdit.samples[${i}] has invalid t/x/y.`,
      }
    }
    samples.push({ t, x, y })
  }
  let handleIndices: number[] | undefined
  if (raw.handleIndices !== undefined && raw.handleIndices !== null) {
    if (!Array.isArray(raw.handleIndices)) {
      return {
        ok: false,
        error: `actors[${index}].geometryEdit.handleIndices must be an array.`,
      }
    }
    const parsed: number[] = []
    for (let i = 0; i < raw.handleIndices.length; i++) {
      const v = raw.handleIndices[i]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return {
          ok: false,
          error: `actors[${index}].geometryEdit.handleIndices[${i}] is invalid.`,
        }
      }
      parsed.push(Math.round(v))
    }
    handleIndices = parsed
  }
  return {
    ok: true,
    value: makeGeometryEdit(samples, baked, handleIndices),
  }
}

function parseRestPosition(
  value: unknown,
  recording: Recording | null,
  index: number,
): { ok: true; value: Vec2 } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: restPositionFromRecording(recording) }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `actors[${index}].restPosition is invalid.` }
  }
  const raw = value as Record<string, unknown>
  const x = typeof raw.x === 'number' && Number.isFinite(raw.x) ? raw.x : NaN
  const y = typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : NaN
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return {
      ok: false,
      error: `actors[${index}].restPosition x/y must be in [0, 1].`,
    }
  }
  return { ok: true, value: { x, y } }
}
