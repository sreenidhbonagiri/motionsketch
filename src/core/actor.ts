import {
  coerceActorImage,
  imageAspectRatio,
  type ActorImageAsset,
} from './imageAsset'
import {
  cloneActorText,
  coerceActorText,
  DEFAULT_ACTOR_TEXT,
  clampActorTextFontSize,
} from './actorText'
import {
  DEFAULT_ACTOR,
  MAX_ACTOR_SIZE,
  MIN_ACTOR_SIZE,
  type Actor,
  type ActorKind,
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
 * Pixel size of the actor’s axis-aligned bounding box on the stage.
 *
 * Rule: `sizeNorm` (actor.width) is a fraction of min(stageW, stageH) for the
 * **longer** edge of the box. Shapes are square. Images preserve aspect ratio
 * inside that box (CSS object-fit: contain semantics). Text uses width as the
 * wrap box; height in the live editor/export is `auto` (browser layout). This
 * helper returns a one-line nominal height for non-DOM callers only.
 */
export function actorDisplaySizePx(
  stageWidth: number,
  stageHeight: number,
  actor: Actor,
): { width: number; height: number } {
  const minSide = Math.min(stageWidth, stageHeight)
  const box = clampActorSize(actor.width) * minSide
  if (actor.kind === 'image' && actor.image) {
    const aspect = imageAspectRatio(actor.image)
    if (aspect >= 1) {
      return { width: box, height: box / aspect }
    }
    return { width: box * aspect, height: box }
  }
  if (actor.kind === 'text' && actor.text) {
    const fontPx = clampActorTextFontSize(actor.text.fontSize) * minSide
    return { width: box, height: fontPx * 1.25 }
  }
  return { width: box, height: box }
}

/** Intrinsic aspect (w/h) for export; 1 for shapes and text (text uses height: auto). */
export function actorContentAspect(actor: Actor): number {
  if (actor.kind === 'image' && actor.image) {
    return imageAspectRatio(actor.image)
  }
  return 1
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

  // Prefer width; shapes stay square.
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

  const image = coerceActorImage(record.image)
  const text = coerceActorText(record.text)

  let kind: ActorKind =
    record.kind === 'image' ||
    record.kind === 'shape' ||
    record.kind === 'text'
      ? record.kind
      : image
        ? 'image'
        : 'shape'

  // Image kind without a valid asset falls back to shape.
  if (kind === 'image' && !image) {
    kind = 'shape'
  }
  // Text kind without settings gets defaults (never fail the load).
  const resolvedText =
    kind === 'text' ? (text ?? { ...DEFAULT_ACTOR_TEXT }) : text

  return {
    kind,
    width: size,
    height: size,
    borderRadius: clampActorBorderRadius(radiusRaw),
    color,
    // Keep a valid image payload even when kind !== 'image' so switching back
    // after save/load still works (same idea as preserving color/corners).
    image,
    text: resolvedText,
  }
}

/** CSS border-radius percent matching editor circle semantics (0→0%, 1→50%). */
export function actorBorderRadiusCssPercent(borderRadius: number): number {
  return clampActorBorderRadius(borderRadius) * 50
}

export function cloneActor(actor: Actor): Actor {
  return {
    kind: actor.kind,
    width: actor.width,
    height: actor.height,
    borderRadius: actor.borderRadius,
    color: actor.color,
    image: actor.image ? { ...actor.image } : null,
    text: actor.text ? cloneActorText(actor.text) : null,
  }
}

/** Normalize optional text field after spreads / fixtures. */
export function withNormalizedText(actor: Actor): Actor {
  return {
    ...actor,
    text: actor.text ? cloneActorText(actor.text) : null,
  }
}

/** Ensure a text payload exists (for switching to Text). */
export function ensureActorText(actor: Actor): Actor {
  if (actor.text) return actor
  return {
    ...actor,
    text: { ...DEFAULT_ACTOR_TEXT },
  }
}

export type { ActorImageAsset }
