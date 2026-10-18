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

function samplesDigest(samples: MotionSample[] | null | undefined): string {
  if (!samples || samples.length === 0) return '0'
  const n = samples.length
  const a = samples[0]
  const b = samples[n - 1]
  const m = samples[n >> 1]
  let acc = n
  const step = Math.max(1, Math.floor(n / 16))
  for (let i = 0; i < n; i += step) {
    const s = samples[i]
    acc =
      (Math.imul(acc, 33) +
        Math.round(s.t * 1000) +
        Math.round(s.x * 1e6) +
        Math.round(s.y * 1e6)) >>>
      0
  }
  return [
    n,
    a.t.toFixed(3),
    a.x.toFixed(5),
    a.y.toFixed(5),
    m.t.toFixed(3),
    m.x.toFixed(5),
    m.y.toFixed(5),
    b.t.toFixed(3),
    b.x.toFixed(5),
    b.y.toFixed(5),
    acc.toString(36),
  ].join(',')
}

function actorDigest(actor: SceneActor): string {
  const app = coerceActor(actor.appearance)
  const img =
    app.kind === 'image' && app.image
      ? `${app.image.label}:${app.image.naturalWidth}x${app.image.naturalHeight}:${app.image.dataUrl.length}`
      : ''
  const xf = (actor.transform?.keyframes ?? [])
    .map(
      (k) =>
        `${k.t.toFixed(4)}:${k.rotationDeg.toFixed(2)}:${k.scale.toFixed(4)}`,
    )
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
    app.width.toFixed(4),
    app.height.toFixed(4),
    app.borderRadius.toFixed(4),
    img,
    Number(actor.smoothing ?? 0).toFixed(4),
    Number(actor.steadySpeed ?? 0).toFixed(4),
    clip.start.toFixed(4),
    clip.end.toFixed(4),
    clip.hideBeforeStart ? '1' : '0',
    clip.hideAfterEnd ? '1' : '0',
    Number(actor.restPosition?.x ?? 0.5).toFixed(5),
    Number(actor.restPosition?.y ?? 0.5).toFixed(5),
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
    project.stageAspect.toFixed(6),
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
