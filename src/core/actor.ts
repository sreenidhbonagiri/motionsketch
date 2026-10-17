import {
  DEFAULT_ACTOR,
  MAX_ACTOR_SIZE,
  MIN_ACTOR_SIZE,
  type Actor,
} from './types'
import { clamp } from './coords'

const HEX6 = /^#([0-9a-fA-F]{6})$/
const HEX3 = /^#([0-9a-fA-F]{3})$/

/** Normalize #rgb / #rrggbb to lowercase #rrggbb; null if unsupported. */
export function normalizeActorColor(value: string): string | null {
  const trimmed = value.trim()
  const m6 = HEX6.exec(trimmed)
  if (m6) return `#${m6[1].toLowerCase()}`
  const m3 = HEX3.exec(trimmed)
  if (m3) {
    const [r, g, b] = m3[1].toLowerCase().split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

export function clampActorSize(size: number): number {
  return clamp(size, MIN_ACTOR_SIZE, MAX_ACTOR_SIZE)
}

export function clampActorBorderRadius(value: number): number {
  return clamp(value, 0, 1)
}

/**
 * Build a validated actor from partial / legacy data.
 * Missing or invalid fields fall back to defaults instead of failing the load.
 */
export function coerceActor(value: unknown): Actor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_ACTOR }
  }
  const record = value as Record<string, unknown>

  const widthRaw =
    typeof record.width === 'number' && Number.isFinite(record.width)
      ? record.width
      : DEFAULT_ACTOR.width
  const heightRaw =
    typeof record.height === 'number' && Number.isFinite(record.height)
      ? record.height
      : widthRaw

  // Prefer width; keep the tile square (export uses aspect-ratio: 1).
  const size = clampActorSize(
    widthRaw > 0 && widthRaw <= 1
      ? widthRaw
      : heightRaw > 0 && heightRaw <= 1
        ? heightRaw
        : DEFAULT_ACTOR.width,
  )

  const radiusRaw =
    typeof record.borderRadius === 'number' &&
    Number.isFinite(record.borderRadius)
      ? record.borderRadius
      : DEFAULT_ACTOR.borderRadius

  const color =
    typeof record.color === 'string'
      ? normalizeActorColor(record.color) ?? DEFAULT_ACTOR.color
      : DEFAULT_ACTOR.color

  return {
    width: size,
    height: size,
    borderRadius: clampActorBorderRadius(radiusRaw),
    color,
  }
}

/** CSS border-radius percent matching editor circle semantics (0→0%, 1→50%). */
export function actorBorderRadiusCssPercent(borderRadius: number): number {
  return clampActorBorderRadius(borderRadius) * 50
}
