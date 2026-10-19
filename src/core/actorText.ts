import { clamp } from './coords'
import { escapeHtmlText } from './projectName'
import type { ActorText, ActorTextAlign, ActorTextFont } from './types'

/** Soft cap for authored / imported text content. */
export const MAX_ACTOR_TEXT_LENGTH = 240

/** Font size as a fraction of the stage’s shorter side (cqmin). */
export const MIN_ACTOR_TEXT_FONT_SIZE = 0.028
export const MAX_ACTOR_TEXT_FONT_SIZE = 0.18
export const DEFAULT_ACTOR_TEXT_FONT_SIZE = 0.055

export const DEFAULT_ACTOR_TEXT: ActorText = {
  content: 'Text',
  fontSize: DEFAULT_ACTOR_TEXT_FONT_SIZE,
  fontWeight: 700,
  align: 'center',
  fontFamily: 'system',
}

/** Self-contained stacks — exact glyphs vary by OS/browser. */
export const ACTOR_TEXT_FONT_STACKS: Record<ActorTextFont, string> = {
  system:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

export function clampActorTextFontSize(value: number): number {
  return clamp(value, MIN_ACTOR_TEXT_FONT_SIZE, MAX_ACTOR_TEXT_FONT_SIZE)
}

export function sanitizeActorTextContent(value: string): string {
  // Normalize newlines; strip NULs; cap length.
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let cleaned = ''
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i)
    if (code !== 0) cleaned += normalized[i]
  }
  if (cleaned.length <= MAX_ACTOR_TEXT_LENGTH) return cleaned
  return cleaned.slice(0, MAX_ACTOR_TEXT_LENGTH)
}

export function coerceActorTextAlign(value: unknown): ActorTextAlign {
  if (value === 'left' || value === 'center' || value === 'right') return value
  return DEFAULT_ACTOR_TEXT.align
}

export function coerceActorTextFont(value: unknown): ActorTextFont {
  if (value === 'system' || value === 'serif' || value === 'mono') return value
  return DEFAULT_ACTOR_TEXT.fontFamily
}

export function coerceActorTextWeight(value: unknown): 400 | 700 {
  if (value === 700 || value === '700' || value === 'bold') return 700
  if (value === 400 || value === '400' || value === 'normal') return 400
  return DEFAULT_ACTOR_TEXT.fontWeight
}

/**
 * Validate / migrate text settings. Invalid or missing → null (caller decides
 * whether to fall back to shape). Empty string content is preserved.
 */
export function coerceActorText(value: unknown): ActorText | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  // Missing content → default label; present empty string is intentional and kept.
  const content =
    typeof record.content === 'string'
      ? sanitizeActorTextContent(record.content)
      : DEFAULT_ACTOR_TEXT.content

  const fontSizeRaw =
    typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)
      ? record.fontSize
      : DEFAULT_ACTOR_TEXT.fontSize

  return {
    content,
    fontSize: clampActorTextFontSize(fontSizeRaw),
    fontWeight: coerceActorTextWeight(record.fontWeight),
    align: coerceActorTextAlign(record.align),
    fontFamily: coerceActorTextFont(record.fontFamily),
  }
}

/**
 * Neutralize sequences that would end a CSS block comment early or close an
 * HTML style element when the stylesheet is embedded in a page.
 */
export function sanitizeCssCommentText(value: string): string {
  return value
    .replace(/\*\//g, '*∕')
    .replace(/<\/style/gi, '&lt;/style')
}

export function cloneActorText(text: ActorText): ActorText {
  return {
    content: text.content,
    fontSize: text.fontSize,
    fontWeight: text.fontWeight,
    align: text.align,
    fontFamily: text.fontFamily,
  }
}

export function actorTextFontCss(fontFamily: ActorTextFont): string {
  return ACTOR_TEXT_FONT_STACKS[fontFamily] ?? ACTOR_TEXT_FONT_STACKS.system
}

/** Escape text content for HTML element bodies (keeps newlines for pre-wrap). */
export function actorTextHtmlInner(content: string): string {
  return escapeHtmlText(content)
}
