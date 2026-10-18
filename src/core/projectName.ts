/** Display / persistence limits for the user-facing project title. */
export const MAX_PROJECT_NAME_LENGTH = 60

/** Assigned when migrating older files that have no name. */
export const DEFAULT_PROJECT_NAME = 'Untitled project'

/**
 * Trim, collapse internal whitespace, and enforce length.
 * Does not invent a fallback — empty string means “invalid for create”.
 */
export function sanitizeProjectName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_PROJECT_NAME_LENGTH)
}

/** True when the trimmed name is non-empty and within length. */
export function isValidProjectName(raw: string): boolean {
  return sanitizeProjectName(raw).length > 0
}

/**
 * Commit helper for rename drafts: empty input restores `fallback`
 * (previous committed name).
 */
export function commitProjectName(raw: string, fallback: string): string {
  const next = sanitizeProjectName(raw)
  if (next.length > 0) return next
  const prev = sanitizeProjectName(fallback)
  return prev.length > 0 ? prev : DEFAULT_PROJECT_NAME
}

/** Safe filename stem for downloads; never empty. */
export function filenameStemFromProjectName(name: string): string {
  const stem = sanitizeProjectName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return stem.length > 0 ? stem : 'motionsketch'
}

/** Escape text for HTML text nodes / attribute-safe titles (not CSS). */
export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
