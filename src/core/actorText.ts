import { clamp } from './coords'
import { escapeHtmlText } from './projectName'
import {
  MAX_ACTOR_SIZE,
  MIN_ACTOR_SIZE,
  type Actor,
  type ActorText,
  type ActorTextAlign,
  type ActorTextFont,
} from './types'

/** Soft cap for authored / imported text content. */
export const MAX_ACTOR_TEXT_LENGTH = 240

/** Font size as a fraction of the stage’s shorter side (cqmin). */
export const MIN_ACTOR_TEXT_FONT_SIZE = 0.028
export const MAX_ACTOR_TEXT_FONT_SIZE = 0.18
export const DEFAULT_ACTOR_TEXT_FONT_SIZE = 0.055

/** Matches editor / CSS export `line-height: 1.25`. */
export const TEXT_LAYOUT_LINE_HEIGHT = 1.25

/**
 * Underestimate average glyph advance (em) so wrap-line counts are never below
 * real `pre-wrap` + `break-word` layout. Used only for conservative bounds
 * (stage-resize content-fit), not for painting.
 */
const CONSERVATIVE_CHAR_ADVANCE_EM = 0.34

/** Extra height factor for glyph/metric variance across system font stacks. */
const CONSERVATIVE_HEIGHT_PAD = 1.12

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

/**
 * Count visual lines for `white-space: pre-wrap` + `word-break: break-word`
 * using a conservative (narrow) glyph advance so height is never underestimated.
 */
export function countConservativeTextLines(
  content: string,
  wrapWidthPx: number,
  fontSizePx: number,
): number {
  if (!(wrapWidthPx > 0) || !(fontSizePx > 0)) return 1
  const charW = fontSizePx * CONSERVATIVE_CHAR_ADVANCE_EM
  const charsPerLine = Math.max(1, Math.floor(wrapWidthPx / charW))
  const paragraphs = content.split('\n')
  let lines = 0
  for (const para of paragraphs) {
    if (para.length === 0) {
      lines += 1
      continue
    }
    // break-word: hard-wrap by character capacity (spaces do not reduce wraps
    // in this underestimate — that only makes the box taller, which is safer).
    lines += Math.max(1, Math.ceil(para.length / charsPerLine))
  }
  return Math.max(1, lines)
}

/**
 * Conservative axis-aligned text box in stage pixels for content-fit checks.
 * Width is the authored wrap box; height follows multiline / wrapped lines
 * (never the one-line nominal from {@link actorDisplaySizePx}).
 *
 * Returns null when the actor is not text (caller should use shape/image sizing).
 */
export function estimateTextLayoutSizePx(
  stageWidth: number,
  stageHeight: number,
  actor: Actor,
): { width: number; height: number } | null {
  if (actor.kind !== 'text' || !actor.text) return null
  const minSide = Math.min(stageWidth, stageHeight)
  if (!(minSide > 0)) return null
  const wrapWidth = clamp(actor.width, MIN_ACTOR_SIZE, MAX_ACTOR_SIZE) * minSide
  const fontPx = clampActorTextFontSize(actor.text.fontSize) * minSide
  const lineCount = countConservativeTextLines(
    actor.text.content,
    wrapWidth,
    fontPx,
  )
  const height =
    lineCount * fontPx * TEXT_LAYOUT_LINE_HEIGHT * CONSERVATIVE_HEIGHT_PAD
  return { width: wrapWidth, height }
}
