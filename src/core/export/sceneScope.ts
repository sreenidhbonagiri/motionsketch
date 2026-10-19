import { coerceActor } from '../actor'
import type { MotionSample, Project, SceneActor } from '../types'

/**
 * Options for scoping an exported scene so multiple embeds can coexist.
 *
 * - `sceneId`: override the content fingerprint (must be CSS-safe: `[a-zA-Z0-9_-]+`).
 * - `instancePrefix`: prepended to the scene root class and keyframe names so two
 *   independently controlled copies of the same scene do not collide. Prefer a
 *   short token ending with `-` (e.g. `hero-`). Unsafe characters are stripped.
 */
export interface ExportCssOptions {
  sceneId?: string
  instancePrefix?: string
}

export interface ExportScope {
  /** Sanitized instance prefix (may be empty). */
  instancePrefix: string
  /** Deterministic scene fingerprint (or override). */
  sceneId: string
  /** Root wrapper class, e.g. `ms-scene-a1b2c3d4` or `hero-ms-scene-a1b2c3d4`. */
  rootClass: string
  /** Stage element class (always `ms-stage`; scoped under root). */
  stageClass: string
  /** Class added to the root to opt into motion under reduced-motion. */
  motionOkClass: string
  actorCount: number
}

const SCENE_ID_RE = /^[a-zA-Z0-9_-]+$/

/** Class toggled on the scene root to allow motion when reduced-motion is on. */
export const MS_MOTION_OK_CLASS = 'ms-motion-ok'

export function sanitizeInstancePrefix(raw: string | undefined): string {
  if (!raw) return ''
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!cleaned) return ''
  // Keep a trailing hyphen when the caller used one, for readable joins.
  if (raw.endsWith('-') && !cleaned.endsWith('-')) return `${cleaned}-`
  return cleaned
}

export function sanitizeSceneId(raw: string | undefined): string | null {
  if (!raw || !SCENE_ID_RE.test(raw)) return null
  return raw
}

function hashString(input: string): string {
  // FNV-1a 32-bit → 8 hex chars (deterministic, not cryptographic).
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Exact digest of every sample. Uses String(number) — no rounding / stride
 * sampling — so a mid-path edit always changes the scene fingerprint.
 * Export-time only (never on the playback hot path).
 */
function samplesDigest(samples: MotionSample[] | null | undefined): string {
  if (!samples || samples.length === 0) return '0'
  const parts: string[] = [String(samples.length)]
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    parts.push(String(s.t), String(s.x), String(s.y))
  }
  return hashString(parts.join('\0'))
}

function actorDigest(actor: SceneActor): string {
  const app = coerceActor(actor.appearance)
  const img =
    app.kind === 'image' && app.image
      ? [
          app.image.label,
          String(app.image.naturalWidth),
          String(app.image.naturalHeight),
          app.image.mimeType,
          hashString(app.image.dataUrl),
        ].join(':')
      : ''
  const xf = (actor.transform?.keyframes ?? [])
    .map((k) => [String(k.t), String(k.rotationDeg), String(k.scale)].join(':'))
    .join('|')
  const clip = actor.clip ?? {
    start: 0,
    end: 1,
    hideBeforeStart: false,
    hideAfterEnd: false,
  }
  return [
    actor.id,
    app.kind,
    app.color,
    String(app.width),
    String(app.height),
    String(app.borderRadius),
    img,
    String(actor.smoothing ?? 0),
    String(actor.steadySpeed ?? 0),
    String(actor.glide ?? 0),
    actor.faceAlongPath ? '1' : '0',
    String(actor.directionOffsetDeg ?? 0),
    String(clip.start),
    String(clip.end),
    clip.hideBeforeStart ? '1' : '0',
    clip.hideAfterEnd ? '1' : '0',
    String(actor.restPosition?.x ?? 0.5),
    String(actor.restPosition?.y ?? 0.5),
    samplesDigest(actor.recording?.samples),
    samplesDigest(actor.geometryEdit?.samples),
    xf,
  ].join(';')
}

/**
 * Deterministic fingerprint of export-relevant project content.
 * Does not use the project display name alone (names can collide).
 */
export function fingerprintProjectScene(project: Project): string {
  const parts = [
    String(project.playback.durationMs),
    project.playback.loop ? '1' : '0',
    project.playback.loopMode,
    project.playback.trigger ?? 'page-load',
    String(project.stageAspect),
    String(project.actors.length),
    ...project.actors.map(actorDigest),
  ]
  return hashString(parts.join('\n'))
}

export function resolveExportScope(
  project: Project,
  options: ExportCssOptions = {},
): ExportScope {
  const instancePrefix = sanitizeInstancePrefix(options.instancePrefix)
  const sceneId =
    sanitizeSceneId(options.sceneId) ?? fingerprintProjectScene(project)
  const rootClass = `${instancePrefix}ms-scene-${sceneId}`
  return {
    instancePrefix,
    sceneId,
    rootClass,
    stageClass: 'ms-stage',
    motionOkClass: MS_MOTION_OK_CLASS,
    actorCount: project.actors.length,
  }
}

/** Actor element class (not including the scene root). */
export function scopedActorClass(index: number, actorCount: number): string {
  if (actorCount <= 1) return 'ms-actor'
  return `ms-actor-${index + 1}`
}

/** Motion keyframes name — unique per scene (+ optional instance prefix). */
export function scopedAnimationName(
  scope: ExportScope,
  index: number,
): string {
  const base = `${scope.instancePrefix}ms-${scope.sceneId}`
  if (scope.actorCount <= 1) return base
  return `${base}-a${index + 1}`
}

/** Visibility keyframes name — unique per scene (+ optional instance prefix). */
export function scopedVisibilityAnimationName(
  scope: ExportScope,
  index: number,
): string {
  const base = `${scope.instancePrefix}ms-${scope.sceneId}-vis`
  if (scope.actorCount <= 1) return base
  return `${base}-a${index + 1}`
}

/** Full selector for an actor inside its scene root. */
export function scopedActorSelector(
  scope: ExportScope,
  index: number,
): string {
  return `.${scope.rootClass} .${scopedActorClass(index, scope.actorCount)}`
}

export function scopedStageSelector(scope: ExportScope): string {
  return `.${scope.rootClass} .${scope.stageClass}`
}
