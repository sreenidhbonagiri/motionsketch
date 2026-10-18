import { clamp01 } from './coords'
import type { ActorClip } from './types'

/**
 * Minimum movement interval as a fraction of the shared project timeline.
 * Enforced on edit/import so Start at / Move for stay ordered and exportable.
 */
export const MIN_CLIP_SPAN = 0.05

export const DEFAULT_ACTOR_CLIP: ActorClip = Object.freeze({
  start: 0,
  end: 1,
  hideBeforeStart: false,
  hideAfterEnd: false,
})

/** Accept incomplete clip literals (tests / builders) and fill visibility defaults. */
export type ActorClipInput = {
  start: number
  end: number
  hideBeforeStart?: boolean
  hideAfterEnd?: boolean
}

export function cloneClip(clip: ActorClipInput): ActorClip {
  return {
    start: clip.start,
    end: clip.end,
    hideBeforeStart: !!clip.hideBeforeStart,
    hideAfterEnd: !!clip.hideAfterEnd,
  }
}

export function fullClip(): ActorClip {
  return {
    start: 0,
    end: 1,
    hideBeforeStart: false,
    hideAfterEnd: false,
  }
}

/** True when the clip covers the entire shared timeline. */
export function isFullClip(clip: ActorClip): boolean {
  return clip.start <= 1e-9 && clip.end >= 1 - 1e-9
}

/**
 * Visibility on the shared project timeline (exportable half-open end):
 * - Hide before: hidden for t < start; visible at start.
 * - Hide after: hidden for t >= end (at end and after).
 * - Flags off: holds first/last pose (always visible for paint).
 */
export function isActorVisibleAt(
  projectT: number,
  clip: ActorClip,
): boolean {
  const t = clamp01(projectT)
  const c = clampClip(clip)
  if (c.hideBeforeStart && t < c.start) return false
  if (c.hideAfterEnd && t >= c.end) return false
  return true
}

export function clipsEqual(a: ActorClip, b: ActorClip): boolean {
  return (
    Math.abs(a.start - b.start) < 1e-9 &&
    Math.abs(a.end - b.end) < 1e-9 &&
    !!a.hideBeforeStart === !!b.hideBeforeStart &&
    !!a.hideAfterEnd === !!b.hideAfterEnd
  )
}

/**
 * Map shared project progress → actor-local progress in [0, 1].
 * Before the interval → 0 (initial hold); after → 1 (final hold).
 */
export function projectToLocal(
  projectT: number,
  clip: ActorClip,
): number {
  const t = clamp01(projectT)
  const start = clamp01(clip.start)
  const end = Math.max(start + MIN_CLIP_SPAN, clamp01(clip.end))
  if (t <= start) return 0
  if (t >= end) return 1
  const span = end - start
  return span <= 0 ? 0 : (t - start) / span
}

/** Map actor-local progress → shared project progress. */
export function localToProject(localT: number, clip: ActorClip): number {
  const u = clamp01(localT)
  const start = clamp01(clip.start)
  const end = Math.max(start + MIN_CLIP_SPAN, clamp01(clip.end))
  return start + u * (end - start)
}

export function clipSpan(clip: ActorClip): number {
  return Math.max(0, clamp01(clip.end) - clamp01(clip.start))
}

/**
 * Clamp a clip into [0,1] with start < end and at least MIN_CLIP_SPAN.
 * Prefer preserving the requested span when possible. Visibility flags pass through.
 */
export function clampClip(clip: ActorClipInput): ActorClip {
  let start = clamp01(clip.start)
  let end = clamp01(clip.end)
  if (!(end > start)) {
    end = Math.min(1, start + MIN_CLIP_SPAN)
    if (end - start < MIN_CLIP_SPAN) {
      start = Math.max(0, end - MIN_CLIP_SPAN)
    }
  }
  if (end - start < MIN_CLIP_SPAN) {
    if (start + MIN_CLIP_SPAN <= 1) {
      end = start + MIN_CLIP_SPAN
    } else {
      end = 1
      start = Math.max(0, 1 - MIN_CLIP_SPAN)
    }
  }
  return {
    start,
    end,
    hideBeforeStart: !!clip.hideBeforeStart,
    hideAfterEnd: !!clip.hideAfterEnd,
  }
}

/** Move a clip by delta in normalized project time, preserving length. */
export function moveClip(clip: ActorClip, delta: number): ActorClip {
  const c = clampClip(clip)
  const span = c.end - c.start
  let start = c.start + delta
  let end = start + span
  if (start < 0) {
    start = 0
    end = span
  }
  if (end > 1) {
    end = 1
    start = 1 - span
  }
  return clampClip({ ...c, start, end })
}

/** Resize by setting a new start (keeps end); enforces minimum span. */
export function resizeClipStart(clip: ActorClip, start: number): ActorClip {
  const c = clampClip(clip)
  const end = c.end
  const nextStart = Math.min(clamp01(start), end - MIN_CLIP_SPAN)
  return clampClip({ ...c, start: Math.max(0, nextStart), end })
}

/** Resize by setting a new end (keeps start); enforces minimum span. */
export function resizeClipEnd(clip: ActorClip, end: number): ActorClip {
  const c = clampClip(clip)
  const start = c.start
  const nextEnd = Math.max(clamp01(end), start + MIN_CLIP_SPAN)
  return clampClip({ ...c, start, end: Math.min(1, nextEnd) })
}

export function clipFromSeconds(
  startSec: number,
  endSec: number,
  durationMs: number,
  visibility?: Pick<ActorClip, 'hideBeforeStart' | 'hideAfterEnd'>,
): ActorClip {
  const durationSec = Math.max(durationMs / 1000, 1e-6)
  return clampClip({
    start: startSec / durationSec,
    end: endSec / durationSec,
    hideBeforeStart: visibility?.hideBeforeStart ?? false,
    hideAfterEnd: visibility?.hideAfterEnd ?? false,
  })
}

export type ClipSecondsDraftResult =
  | { ok: true; startSec: number; endSec: number }
  | { ok: false; error: string }

function parseDraftNumber(
  raw: string | number,
  emptyError: string,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw === 'string' && raw.trim() === '') {
    return { ok: false, error: emptyError }
  }
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    return { ok: false, error: emptyError }
  }
  return { ok: true, value }
}

/**
 * Validate Start at + Move for drafts for explicit Apply (no silent clamping).
 * Returns normalized start/end seconds on success.
 */
export function validateClipStartMoveForDraft(
  startRaw: string | number,
  moveForRaw: string | number,
  durationMs: number,
): ClipSecondsDraftResult {
  const empty =
    'Enter valid Start at and Move for times in seconds.'
  const startParsed = parseDraftNumber(startRaw, empty)
  if (!startParsed.ok) return startParsed
  const moveParsed = parseDraftNumber(moveForRaw, empty)
  if (!moveParsed.ok) return moveParsed

  const startSec = startParsed.value
  const moveForSec = moveParsed.value
  const durationSec = durationMs / 1000
  if (!(durationSec > 0)) {
    return { ok: false, error: 'Project duration must be greater than zero.' }
  }
  if (startSec < 0) {
    return { ok: false, error: 'Start at cannot be negative.' }
  }
  if (moveForSec <= 0) {
    return {
      ok: false,
      error: 'Move for must be greater than zero.',
    }
  }
  if (startSec > durationSec + 1e-9) {
    return {
      ok: false,
      error: `Start at must be within 0–${durationSec.toFixed(2)} s.`,
    }
  }
  const endSec = startSec + moveForSec
  if (endSec > durationSec + 1e-9) {
    return {
      ok: false,
      error: `Ends at would be ${endSec.toFixed(2)} s — keep Start at + Move for within 0–${durationSec.toFixed(2)} s.`,
    }
  }
  const minSpanSec = MIN_CLIP_SPAN * durationSec
  if (moveForSec < minSpanSec - 1e-9) {
    return {
      ok: false,
      error: `Move for must be at least ${minSpanSec.toFixed(2)} s (${Math.round(MIN_CLIP_SPAN * 100)}% of Duration).`,
    }
  }
  return { ok: true, startSec, endSec }
}

/**
 * Validate absolute start/end seconds (keyboard nudge / legacy helpers).
 * Same bounds as Start at / Move for; no silent clamping.
 */
export function validateClipSecondsDraft(
  startRaw: string | number,
  endRaw: string | number,
  durationMs: number,
): ClipSecondsDraftResult {
  const empty = 'Enter valid Start at and Move for times in seconds.'
  const startParsed = parseDraftNumber(startRaw, empty)
  if (!startParsed.ok) return startParsed
  const endParsed = parseDraftNumber(endRaw, empty)
  if (!endParsed.ok) return endParsed
  return validateClipStartMoveForDraft(
    startParsed.value,
    endParsed.value - startParsed.value,
    durationMs,
  )
}

export function clipToSeconds(
  clip: ActorClip,
  durationMs: number,
): { startSec: number; endSec: number } {
  const durationSec = Math.max(durationMs / 1000, 0)
  const c = clampClip(clip)
  return {
    startSec: c.start * durationSec,
    endSec: c.end * durationSec,
  }
}

/**
 * Parse/validate a clip from persisted JSON. Missing clip → full timeline.
 * Missing visibility flags (pre-v8) → both off.
 */
export function parseActorClip(
  value: unknown,
  index: number,
): { ok: true; value: ActorClip } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: fullClip() }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `actors[${index}].clip must be an object.` }
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.start !== 'number' || !Number.isFinite(raw.start)) {
    return {
      ok: false,
      error: `actors[${index}].clip.start must be a finite number.`,
    }
  }
  if (typeof raw.end !== 'number' || !Number.isFinite(raw.end)) {
    return {
      ok: false,
      error: `actors[${index}].clip.end must be a finite number.`,
    }
  }
  if (raw.end <= raw.start) {
    return {
      ok: false,
      error: `actors[${index}].clip.end must be greater than start.`,
    }
  }

  let hideBeforeStart = false
  if (raw.hideBeforeStart !== undefined && raw.hideBeforeStart !== null) {
    if (typeof raw.hideBeforeStart !== 'boolean') {
      return {
        ok: false,
        error: `actors[${index}].clip.hideBeforeStart must be a boolean.`,
      }
    }
    hideBeforeStart = raw.hideBeforeStart
  }

  let hideAfterEnd = false
  if (raw.hideAfterEnd !== undefined && raw.hideAfterEnd !== null) {
    if (typeof raw.hideAfterEnd !== 'boolean') {
      return {
        ok: false,
        error: `actors[${index}].clip.hideAfterEnd must be a boolean.`,
      }
    }
    hideAfterEnd = raw.hideAfterEnd
  }

  const clamped = clampClip({
    start: raw.start,
    end: raw.end,
    hideBeforeStart,
    hideAfterEnd,
  })
  if (clamped.end - clamped.start < MIN_CLIP_SPAN - 1e-9) {
    return {
      ok: false,
      error: `actors[${index}].clip must span at least ${MIN_CLIP_SPAN * 100}% of the timeline.`,
    }
  }
  return { ok: true, value: clamped }
}
