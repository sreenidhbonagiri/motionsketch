import { clamp, clamp01 } from './coords'
import type { TransformKeyframe, TransformTrack } from './types'

export const MIN_TRANSFORM_SCALE = 0.1
export const MAX_TRANSFORM_SCALE = 4
export const MAX_TRANSFORM_KEYFRAMES = 40
/** Times within this epsilon are treated as the same keyframe slot. */
export const TRANSFORM_TIME_EPS = 1e-4

export const DEFAULT_TRANSFORM: { rotationDeg: number; scale: number } = {
  rotationDeg: 0,
  scale: 1,
}

export function clampTransformScale(scale: number): number {
  return clamp(scale, MIN_TRANSFORM_SCALE, MAX_TRANSFORM_SCALE)
}

export function clampTransformTime(t: number): number {
  return clamp01(t)
}

export function emptyTransformTrack(): TransformTrack {
  return { keyframes: [] }
}

export function cloneTransformTrack(track: TransformTrack): TransformTrack {
  return {
    keyframes: track.keyframes.map((k) => ({ ...k })),
  }
}

function sortKeyframes(keyframes: TransformKeyframe[]): TransformKeyframe[] {
  return [...keyframes].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
}

let idCounter = 0
export function newTransformKeyframeId(): string {
  idCounter += 1
  return `xf-${Date.now().toString(36)}-${idCounter}`
}

export function normalizeTransformKeyframe(
  partial: Partial<TransformKeyframe> & {
    t: number
    rotationDeg: number
    scale: number
  },
): TransformKeyframe {
  return {
    id: partial.id && partial.id.length > 0 ? partial.id : newTransformKeyframeId(),
    t: clampTransformTime(partial.t),
    rotationDeg: Number.isFinite(partial.rotationDeg)
      ? partial.rotationDeg
      : 0,
    scale: clampTransformScale(
      Number.isFinite(partial.scale) ? partial.scale : 1,
    ),
  }
}

/**
 * Upsert a keyframe. Same-time slots (within epsilon) replace the existing
 * keyframe (keeps its id). Returns the next track and the written keyframe id.
 *
 * First keyframe with t > 0 also seeds {t:0, rotation:0, scale:1} so the actor
 * animates from its original appearance.
 */
export function upsertTransformKeyframe(
  track: TransformTrack,
  input: { t: number; rotationDeg: number; scale: number; id?: string },
): { track: TransformTrack; keyframeId: string } {
  const next = normalizeTransformKeyframe(input)
  let list = track.keyframes.map((k) => ({ ...k }))

  // Seed identity at zero when introducing the first non-zero key.
  if (
    list.length === 0 &&
    next.t > TRANSFORM_TIME_EPS
  ) {
    list.push(
      normalizeTransformKeyframe({
        t: 0,
        rotationDeg: DEFAULT_TRANSFORM.rotationDeg,
        scale: DEFAULT_TRANSFORM.scale,
      }),
    )
  }

  const dupIndex = list.findIndex(
    (k) => Math.abs(k.t - next.t) <= TRANSFORM_TIME_EPS,
  )
  if (dupIndex >= 0) {
    // Prefer the caller's id when moving an existing key onto this time.
    const movingId =
      input.id && list.some((k) => k.id === input.id) ? input.id : null
    const keptId = movingId ?? list[dupIndex].id
    const slotT = list[dupIndex].t
    list[dupIndex] = { ...next, id: keptId, t: slotT }
    // Drop other same-time keys and the mover's previous slot (if any).
    list = list.filter((k, i) => {
      if (i === dupIndex) return true
      if (movingId && k.id === movingId) return false
      return Math.abs(k.t - slotT) > TRANSFORM_TIME_EPS
    })
    const sorted = sortKeyframes(list).slice(0, MAX_TRANSFORM_KEYFRAMES)
    return { track: { keyframes: sorted }, keyframeId: keptId }
  }

  if (input.id) {
    const byId = list.findIndex((k) => k.id === input.id)
    if (byId >= 0) {
      list[byId] = { ...next, id: input.id }
      // If moved onto another keyframe's time, the other is removed.
      list = list.filter(
        (k) =>
          k.id === input.id || Math.abs(k.t - next.t) > TRANSFORM_TIME_EPS,
      )
      const sorted = sortKeyframes(list).slice(0, MAX_TRANSFORM_KEYFRAMES)
      return { track: { keyframes: sorted }, keyframeId: input.id }
    }
  }

  if (list.length >= MAX_TRANSFORM_KEYFRAMES) {
    // Replace nearest time if at capacity.
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < list.length; i++) {
      const d = Math.abs(list[i].t - next.t)
      if (d < best) {
        best = d
        nearest = i
      }
    }
    const keptId = list[nearest].id
    list[nearest] = { ...next, id: keptId }
    return {
      track: { keyframes: sortKeyframes(list) },
      keyframeId: keptId,
    }
  }

  list.push(next)
  return {
    track: { keyframes: sortKeyframes(list) },
    keyframeId: next.id,
  }
}

export function removeTransformKeyframe(
  track: TransformTrack,
  id: string,
): TransformTrack {
  return {
    keyframes: track.keyframes.filter((k) => k.id !== id),
  }
}

export function moveTransformKeyframe(
  track: TransformTrack,
  id: string,
  t: number,
): TransformTrack {
  const kf = track.keyframes.find((k) => k.id === id)
  if (!kf) return cloneTransformTrack(track)
  const { track: next } = upsertTransformKeyframe(track, {
    id,
    t,
    rotationDeg: kf.rotationDeg,
    scale: kf.scale,
  })
  return next
}

export interface EvaluatedTransform {
  rotationDeg: number
  scale: number
}

/**
 * Evaluate the transform track at normalized playhead progress.
 * Empty track → identity. Outside the keyed range → hold nearest.
 * Between keys → linear interpolation (rotation is unwrapped degrees).
 */
export function evaluateTransform(
  track: TransformTrack,
  tNorm: number,
): EvaluatedTransform {
  const keys = sortKeyframes(track.keyframes)
  if (keys.length === 0) {
    return { ...DEFAULT_TRANSFORM }
  }
  const t = clamp01(tNorm)
  if (t <= keys[0].t) {
    return { rotationDeg: keys[0].rotationDeg, scale: keys[0].scale }
  }
  const last = keys[keys.length - 1]
  if (t >= last.t) {
    return { rotationDeg: last.rotationDeg, scale: last.scale }
  }

  let lo = 0
  let hi = keys.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (keys[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = keys[lo]
  const b = keys[hi]
  const span = b.t - a.t
  const u = span <= 0 ? 0 : (t - a.t) / span
  return {
    rotationDeg: a.rotationDeg + (b.rotationDeg - a.rotationDeg) * u,
    scale: a.scale + (b.scale - a.scale) * u,
  }
}

export type TransformParseResult =
  | { ok: true; value: TransformTrack }
  | { ok: false; error: string }

/**
 * Parse a persisted transform track.
 * Missing/null → empty track (older projects). Present but invalid → error
 * (never silently drop keyframes).
 */
export function parseTransformTrack(value: unknown): TransformParseResult {
  if (value === undefined || value === null) {
    return { ok: true, value: emptyTransformTrack() }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      error: 'project.transform must be an object with a keyframes array.',
    }
  }
  const record = value as Record<string, unknown>
  const raw = record.keyframes
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: 'project.transform.keyframes must be an array.',
    }
  }
  if (raw.length > MAX_TRANSFORM_KEYFRAMES) {
    return {
      ok: false,
      error: `project.transform.keyframes has ${raw.length} entries; maximum is ${MAX_TRANSFORM_KEYFRAMES}.`,
    }
  }

  const out: TransformKeyframe[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return {
        ok: false,
        error: `project.transform.keyframes[${i}] must be an object.`,
      }
    }
    const k = item as Record<string, unknown>
    const t = typeof k.t === 'number' && Number.isFinite(k.t) ? k.t : NaN
    const rotationDeg =
      typeof k.rotationDeg === 'number' && Number.isFinite(k.rotationDeg)
        ? k.rotationDeg
        : NaN
    const scale =
      typeof k.scale === 'number' && Number.isFinite(k.scale) ? k.scale : NaN

    if (!Number.isFinite(t) || t < 0 || t > 1) {
      return {
        ok: false,
        error: `project.transform.keyframes[${i}].t must be a finite number in [0, 1].`,
      }
    }
    if (!Number.isFinite(rotationDeg)) {
      return {
        ok: false,
        error: `project.transform.keyframes[${i}].rotationDeg must be a finite number.`,
      }
    }
    if (
      !Number.isFinite(scale) ||
      scale < MIN_TRANSFORM_SCALE ||
      scale > MAX_TRANSFORM_SCALE
    ) {
      return {
        ok: false,
        error: `project.transform.keyframes[${i}].scale must be in [${MIN_TRANSFORM_SCALE}, ${MAX_TRANSFORM_SCALE}].`,
      }
    }
    const id =
      typeof k.id === 'string' && k.id.length > 0
        ? k.id
        : newTransformKeyframeId()
    out.push({ id, t, rotationDeg, scale })
  }

  const sorted = sortKeyframes(out)
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].t - sorted[i - 1].t) <= TRANSFORM_TIME_EPS) {
      return {
        ok: false,
        error: `project.transform.keyframes has duplicate times near t=${sorted[i].t}.`,
      }
    }
  }
  return { ok: true, value: { keyframes: sorted } }
}

/** @deprecated Prefer parseTransformTrack for imports; soft empty on failure. */
export function coerceTransformTrack(value: unknown): TransformTrack {
  const parsed = parseTransformTrack(value)
  return parsed.ok ? parsed.value : emptyTransformTrack()
}

export function formatTransformCss(
  rotationDeg: number,
  scale: number,
): string {
  const r = Number.isFinite(rotationDeg) ? rotationDeg : 0
  const s = clampTransformScale(Number.isFinite(scale) ? scale : 1)
  return `rotate(${formatDeg(r)}deg) scale(${formatScale(s)})`
}

function formatDeg(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(3).replace(/\.?0+$/, '')
}

function formatScale(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(4).replace(/\.?0+$/, '')
}
