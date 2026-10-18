import { clamp01 } from './coords'
import type { ActorClip } from './types'

/**
 * Minimum clip length as a fraction of the shared project timeline.
 * Enforced on edit/import so Start/End stay ordered and exportable.
 */
export const MIN_CLIP_SPAN = 0.05

export const DEFAULT_ACTOR_CLIP: ActorClip = Object.freeze({
  start: 0,
  end: 1,
})

export function cloneClip(clip: ActorClip): ActorClip {
  return { start: clip.start, end: clip.end }
}

export function fullClip(): ActorClip {
  return { start: 0, end: 1 }
}

/** True when the clip covers the entire shared timeline. */
export function isFullClip(clip: ActorClip): boolean {
  return clip.start <= 1e-9 && clip.end >= 1 - 1e-9
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
 * Prefer preserving the requested span when possible.
 */
export function clampClip(clip: ActorClip): ActorClip {
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
  return { start, end }
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
  return clampClip({ start, end })
}

/** Resize by setting a new start (keeps end); enforces minimum span. */
export function resizeClipStart(clip: ActorClip, start: number): ActorClip {
  const end = clamp01(clip.end)
  const nextStart = Math.min(clamp01(start), end - MIN_CLIP_SPAN)
  return clampClip({ start: Math.max(0, nextStart), end })
}

/** Resize by setting a new end (keeps start); enforces minimum span. */
export function resizeClipEnd(clip: ActorClip, end: number): ActorClip {
  const start = clamp01(clip.start)
  const nextEnd = Math.max(clamp01(end), start + MIN_CLIP_SPAN)
  return clampClip({ start, end: Math.min(1, nextEnd) })
}

export function clipFromSeconds(
  startSec: number,
  endSec: number,
  durationMs: number,
): ActorClip {
  const durationSec = Math.max(durationMs / 1000, 1e-6)
  return clampClip({
    start: startSec / durationSec,
    end: endSec / durationSec,
  })
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
  const clamped = clampClip({ start: raw.start, end: raw.end })
  if (clamped.end - clamped.start < MIN_CLIP_SPAN - 1e-9) {
    return {
      ok: false,
      error: `actors[${index}].clip must span at least ${MIN_CLIP_SPAN * 100}% of the timeline.`,
    }
  }
  return { ok: true, value: clamped }
}
