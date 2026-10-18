import { cloneActor, coerceActor } from '../actor'
import {
  clampStageAspect,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import {
  cloneSceneActor,
  createSceneActor,
  MAX_ACTORS,
  migrateLegacyProjectToActors,
  parseSceneActor,
  projectHasAnyRecording,
} from '../sceneActor'
import { emptyTransformTrack, parseTransformTrack } from '../transform'
import {
  DEFAULT_PLAYBACK,
  DEFAULT_STAGE_ASPECT,
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type ActorImage,
  type GeometryEdit,
  type LoopMode,
  type PlaybackSettings,
  type Project,
  type SceneActor,
} from '../types'

/**
 * Envelope version for localStorage / download files.
 * v1–v4: single-actor project (migrated to one SceneActor).
 * v5: multi-actor + shared timeline; image assets may be deduped.
 * v6: per-actor clip timing (start/end on shared timeline).
 */
export const PERSIST_FORMAT_VERSION = 6 as const
export const PERSIST_FORMAT_VERSION_LEGACY = 1 as const
export const PERSIST_FORMAT_VERSION_V2 = 2 as const
export const PERSIST_FORMAT_VERSION_V3 = 3 as const
export const PERSIST_FORMAT_VERSION_V4 = 4 as const
export const PERSIST_FORMAT_VERSION_V5 = 5 as const

export const STORAGE_KEY = 'motionsketch.project.v1'

/** Soft cap for serialized project JSON (localStorage + downloads). */
export const MAX_PROJECT_JSON_CHARS = 4_500_000

export interface PersistedSnapshot {
  formatVersion: typeof PERSIST_FORMAT_VERSION
  savedAt: string
  project: Project
  /**
   * Deduplicated image payloads referenced by appearance.image via matching
   * dataUrl. Present in downloads when any actor uses an image.
   */
  assets?: Record<string, ActorImage>
}

export type PersistParseOk = { ok: true; snapshot: PersistedSnapshot }
export type PersistParseErr = { ok: false; error: string }
export type PersistParseResult = PersistParseOk | PersistParseErr

export function buildSnapshot(
  project: Project,
  _geometryEditIgnored: GeometryEdit | null = null,
  savedAt: string = new Date().toISOString(),
): PersistedSnapshot {
  const cloned = cloneProject(project)
  const { project: wired, assets } = extractSharedAssets(cloned)
  return {
    formatVersion: PERSIST_FORMAT_VERSION,
    savedAt,
    project: wired,
    ...(Object.keys(assets).length > 0 ? { assets } : {}),
  }
}

export function serializeSnapshot(snapshot: PersistedSnapshot): string {
  // Always rebuild so shared images are deduped into `assets`.
  return serializeSnapshotForDownload(snapshot)
}

export function parseSnapshotJson(raw: string): PersistParseResult {
  if (raw.length > MAX_PROJECT_JSON_CHARS) {
    return {
      ok: false,
      error: `Project file is too large (max ${Math.round(MAX_PROJECT_JSON_CHARS / 1024)} KB).`,
    }
  }
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
  const supported = [
    PERSIST_FORMAT_VERSION,
    PERSIST_FORMAT_VERSION_V5,
    PERSIST_FORMAT_VERSION_V4,
    PERSIST_FORMAT_VERSION_V3,
    PERSIST_FORMAT_VERSION_V2,
    PERSIST_FORMAT_VERSION_LEGACY,
  ]
  if (!supported.includes(formatVersion as typeof PERSIST_FORMAT_VERSION)) {
    return {
      ok: false,
      error: `Unsupported project format version ${formatVersion}. This app supports versions ${PERSIST_FORMAT_VERSION_LEGACY}–${PERSIST_FORMAT_VERSION}.`,
    }
  }

  if (typeof data.savedAt !== 'string' || data.savedAt.length === 0) {
    return { ok: false, error: 'Missing or invalid savedAt.' }
  }

  const assets = parseAssets(data.assets)
  if (!assets.ok) return assets

  // v5–v6 multi-actor (v5 migrates missing clip → full timeline).
  if (formatVersion >= PERSIST_FORMAT_VERSION_V5) {
    const project = validateMultiActorProject(data.project, assets.value)
    if (!project.ok) return project
    // Reject leftover top-level geometryEdit that would be ignored silently.
    if (data.geometryEdit != null) {
      return {
        ok: false,
        error:
          'Multi-actor projects store path edits on each actor; unexpected top-level geometryEdit.',
      }
    }
    return {
      ok: true,
      snapshot: {
        formatVersion: PERSIST_FORMAT_VERSION,
        savedAt: data.savedAt,
        project: project.value,
        ...(Object.keys(assets.value).length > 0
          ? { assets: assets.value }
          : {}),
      },
    }
  }

  // v1–v4 single-actor migration
  const legacy = validateLegacyProject(data.project, formatVersion)
  if (!legacy.ok) return legacy

  let geometryEdit: GeometryEdit | null = null
  if (data.geometryEdit != null) {
    const ge = validateLegacyGeometryEdit(data.geometryEdit)
    if (!ge.ok) return ge
    if (!legacy.value.recording) {
      return { ok: false, error: 'geometryEdit requires a recording.' }
    }
    geometryEdit = ge.value
  }

  const actor = migrateLegacyProjectToActors({
    actor: legacy.value.actor,
    recording: legacy.value.recording,
    playback: legacy.value.playback,
    transform: legacy.value.transform,
    geometryEdit,
  })

  return {
    ok: true,
    snapshot: {
      formatVersion: PERSIST_FORMAT_VERSION,
      savedAt: data.savedAt,
      project: {
        version: 1,
        actors: [actor],
        playback: {
          durationMs: legacy.value.playback.durationMs,
          loop: legacy.value.playback.loop,
          loopMode: legacy.value.playback.loopMode,
        },
        stageAspect: legacy.value.stageAspect,
      },
    },
  }
}

function parseAssets(
  value: unknown,
): { ok: true; value: Record<string, ActorImage> } | PersistParseErr {
  if (value === undefined || value === null) {
    return { ok: true, value: {} }
  }
  if (!isRecord(value)) {
    return { ok: false, error: 'assets must be an object.' }
  }
  const out: Record<string, ActorImage> = {}
  for (const [id, asset] of Object.entries(value)) {
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, error: 'assets keys must be non-empty strings.' }
    }
    const coerced = coerceActor({ kind: 'image', image: asset, width: 0.12 })
    if (!coerced.image) {
      return { ok: false, error: `assets[${id}] is not a valid image.` }
    }
    out[id] = { ...coerced.image }
  }
  return { ok: true, value: out }
}

function validateMultiActorProject(
  value: unknown,
  assets: Record<string, ActorImage>,
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

  const playback = validatePlayback(value.playback)
  if (!playback.ok) return playback

  const stageAspect = coerceStageAspect(value.stageAspect, PERSIST_FORMAT_VERSION)
  if (!stageAspect.ok) return stageAspect

  if (!Array.isArray(value.actors)) {
    return { ok: false, error: 'project.actors must be an array.' }
  }
  if (value.actors.length === 0) {
    return { ok: false, error: 'project.actors must contain at least one actor.' }
  }
  if (value.actors.length > MAX_ACTORS) {
    return {
      ok: false,
      error: `project.actors has ${value.actors.length} entries; maximum is ${MAX_ACTORS}.`,
    }
  }

  const actors: SceneActor[] = []
  const seenIds = new Set<string>()
  for (let i = 0; i < value.actors.length; i++) {
    const rawActor = value.actors[i]
    // Resolve imageAssetId before parseSceneActor if present.
    const resolved = resolveActorAppearance(rawActor, assets, i)
    if (!resolved.ok) return resolved
    const parsed = parseSceneActor(resolved.value, i)
    if (!parsed.ok) return parsed
    if (seenIds.has(parsed.value.id)) {
      return {
        ok: false,
        error: `Duplicate actor id “${parsed.value.id}”.`,
      }
    }
    seenIds.add(parsed.value.id)
    actors.push(parsed.value)
  }

  return {
    ok: true,
    value: {
      version: 1,
      actors,
      playback: playback.value,
      stageAspect: stageAspect.value,
    },
  }
}

function resolveActorAppearance(
  value: unknown,
  assets: Record<string, ActorImage>,
  index: number,
): { ok: true; value: unknown } | PersistParseErr {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: `actors[${index}] must be an object.` }
  }
  const actor = { ...(value as Record<string, unknown>) }
  const appearanceRaw = actor.appearance
  if (typeof appearanceRaw !== 'object' || appearanceRaw === null) {
    return { ok: true, value: actor }
  }
  const appearance = { ...(appearanceRaw as Record<string, unknown>) }
  const image = appearance.image
  if (typeof image === 'object' && image !== null && !Array.isArray(image)) {
    const img = image as Record<string, unknown>
    if (typeof img.assetId === 'string') {
      const asset = assets[img.assetId]
      if (!asset) {
        return {
          ok: false,
          error: `actors[${index}] references missing assets[${img.assetId}].`,
        }
      }
      appearance.image = { ...asset }
      actor.appearance = appearance
    }
  }
  return { ok: true, value: actor }
}

interface LegacyProject {
  actor: unknown
  recording: Project['actors'][0]['recording']
  playback: PlaybackSettings & { smoothing: number; steadySpeed: number }
  stageAspect: number
  transform: Project['actors'][0]['transform']
}

function validateLegacyProject(
  value: unknown,
  formatVersion: number,
): { ok: true; value: LegacyProject } | PersistParseErr {
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

  const recording = validateLegacyRecording(value.recording)
  if (!recording.ok) return recording

  const playback = validateLegacyPlayback(value.playback)
  if (!playback.ok) return playback

  const stageAspect = coerceStageAspect(value.stageAspect, formatVersion)
  if (!stageAspect.ok) return stageAspect

  const transform = parseTransformTrack(value.transform)
  if (!transform.ok) return transform

  return {
    ok: true,
    value: {
      actor: value.actor,
      recording: recording.value,
      playback: playback.value,
      stageAspect: stageAspect.value,
      transform: transform.value,
    },
  }
}

function validateLegacyRecording(
  value: unknown,
): { ok: true; value: LegacyProject['recording'] } | PersistParseErr {
  // Reuse scene actor parser via a shim
  const shim = parseSceneActor(
    {
      id: 'legacy',
      name: 'Actor 1',
      appearance: { kind: 'shape', width: 0.12, height: 0.12, borderRadius: 0, color: '#000', image: null },
      recording: value,
      transform: { keyframes: [] },
    },
    0,
  )
  if (!shim.ok) {
    return {
      ok: false,
      error: shim.error.replace(/^actors\[0\]\.recording/, 'recording'),
    }
  }
  return { ok: true, value: shim.value.recording }
}

function validateLegacyPlayback(
  value: unknown,
): { ok: true; value: LegacyProject['playback'] } | PersistParseErr {
  const base = validatePlayback(value)
  if (!base.ok) return base
  if (!isRecord(value)) {
    return { ok: false, error: 'Invalid playback.' }
  }
  const smoothing =
    typeof value.smoothing === 'number' && Number.isFinite(value.smoothing)
      ? clamp01(value.smoothing)
      : 0.35
  const steadySpeed =
    typeof value.steadySpeed === 'number' && Number.isFinite(value.steadySpeed)
      ? clamp01(value.steadySpeed)
      : 0
  return {
    ok: true,
    value: {
      ...base.value,
      smoothing,
      steadySpeed,
    },
  }
}

function validateLegacyGeometryEdit(
  value: unknown,
): { ok: true; value: GeometryEdit } | PersistParseErr {
  const shim = parseSceneActor(
    {
      id: 'legacy',
      name: 'Actor 1',
      appearance: DEFAULT_SHAPE_APPEARANCE,
      recording: null,
      geometryEdit: value,
      transform: emptyTransformTrack(),
    },
    0,
  )
  // parseSceneActor allows null recording with geometryEdit — tighten:
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'Invalid geometryEdit.' }
  }
  const actorLike = parseSceneActor(
    {
      id: 'legacy',
      name: 'A',
      appearance: DEFAULT_SHAPE_APPEARANCE,
      recording: {
        recordedDurationMs: 100,
        samples: [
          { t: 0, x: 0.2, y: 0.2 },
          { t: 100, x: 0.8, y: 0.8 },
        ],
      },
      geometryEdit: value,
      transform: emptyTransformTrack(),
    },
    0,
  )
  if (!actorLike.ok || !actorLike.value.geometryEdit) {
    return {
      ok: false,
      error:
        !actorLike.ok
          ? actorLike.error.replace(/^actors\[0\]\.geometryEdit/, 'geometryEdit')
          : 'Invalid geometryEdit.',
    }
  }
  void shim
  return { ok: true, value: actorLike.value.geometryEdit }
}

const DEFAULT_SHAPE_APPEARANCE = {
  kind: 'shape' as const,
  width: 0.12,
  height: 0.12,
  borderRadius: 0.28,
  color: '#4f46e5',
  image: null,
}

function validatePlayback(
  value: unknown,
): { ok: true; value: PlaybackSettings } | PersistParseErr {
  if (!isRecord(value)) {
    return { ok: false, error: 'Missing or invalid playback.' }
  }
  const durationMs = asFiniteNumber(value.durationMs)
  if (
    durationMs === null ||
    durationMs < MIN_PLAYBACK_DURATION_MS ||
    durationMs > MAX_PLAYBACK_DURATION_MS
  ) {
    return {
      ok: false,
      error: `playback.durationMs must be in [${MIN_PLAYBACK_DURATION_MS}, ${MAX_PLAYBACK_DURATION_MS}].`,
    }
  }
  if (typeof value.loop !== 'boolean') {
    return { ok: false, error: 'playback.loop must be a boolean.' }
  }
  const loopMode = coerceLoopMode(value.loopMode)
  return {
    ok: true,
    value: {
      durationMs: Math.round(durationMs),
      loop: value.loop,
      loopMode,
    },
  }
}

function coerceLoopMode(value: unknown): LoopMode {
  return value === 'alternate' ? 'alternate' : 'repeat'
}

function coerceStageAspect(
  value: unknown,
  formatVersion: number,
): { ok: true; value: number } | PersistParseErr {
  if (value === undefined || value === null) {
    if (formatVersion <= PERSIST_FORMAT_VERSION_LEGACY) {
      return { ok: true, value: LEGACY_STAGE_ASPECT }
    }
    return { ok: true, value: LEGACY_STAGE_ASPECT }
  }
  const n = asFiniteNumber(value)
  if (n === null || n <= 0) {
    return { ok: false, error: 'project.stageAspect must be a positive number.' }
  }
  return { ok: true, value: clampStageAspect(n) }
}

function extractSharedAssets(project: Project): {
  project: Project
  assets: Record<string, ActorImage>
} {
  const assets: Record<string, ActorImage> = {}
  const urlToId = new Map<string, string>()
  let n = 0

  const actors = project.actors.map((actor) => {
    const appearance = cloneActor(actor.appearance)
    if (appearance.kind === 'image' && appearance.image) {
      const url = appearance.image.dataUrl
      let id = urlToId.get(url)
      if (!id) {
        n += 1
        id = `img-${n}`
        urlToId.set(url, id)
        assets[id] = { ...appearance.image }
      }
      // Keep full image in memory snapshot project for runtime; assets map
      // carries deduped payloads for the file. Wire format uses assetId only
      // in JSON via replacer below — here we stash assetId on a clone for serialize.
      ;(appearance as ActorWithAssetRef).image = {
        ...appearance.image,
        assetId: id,
      } as ActorImage & { assetId: string }
    }
    return { ...cloneSceneActor(actor), appearance }
  })

  return { project: { ...project, actors }, assets }
}

type ActorWithAssetRef = {
  image: (ActorImage & { assetId?: string }) | null
}

/**
 * JSON.stringify replacer: write image as { assetId } when assetId is present.
 */
export function serializeSnapshotForDownload(snapshot: PersistedSnapshot): string {
  const built = buildSnapshot(snapshot.project, null, snapshot.savedAt)
  const raw = JSON.stringify(
    built,
    (key, value) => {
      if (
        key === 'image' &&
        value &&
        typeof value === 'object' &&
        'assetId' in value &&
        typeof (value as { assetId: unknown }).assetId === 'string'
      ) {
        return { assetId: (value as { assetId: string }).assetId }
      }
      return value
    },
    2,
  )
  if (raw.length > MAX_PROJECT_JSON_CHARS) {
    throw new Error(
      `Project is too large to save (${Math.round(raw.length / 1024)} KB). Remove or replace large images.`,
    )
  }
  return raw
}

function cloneProject(project: Project): Project {
  return {
    version: 1,
    actors: project.actors.map((a) => cloneSceneActor(a)),
    playback: { ...project.playback },
    stageAspect: clampStageAspect(project.stageAspect),
  }
}

export function createEmptyPersistableProject(
  stageAspect: number = DEFAULT_STAGE_ASPECT,
): Project {
  return {
    version: 1,
    actors: [createSceneActor({ name: 'Actor 1' })],
    playback: { ...DEFAULT_PLAYBACK },
    stageAspect: clampStageAspect(stageAspect),
  }
}

export function snapshotHasAnimation(snapshot: PersistedSnapshot): boolean {
  return projectHasAnyRecording(snapshot.project)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
