/**
 * MotionSketch premium chrome palette.
 * Keep in sync with `:root` / `@theme` tokens in `src/index.css`.
 * Editor path overlays use these values; actor appearance / export CSS do not.
 */
export const msPalette = {
  primary: '#3048B8',
  primaryHover: '#2539A0',
  primaryPressed: '#1E2F85',
  canvas: '#F8F9FC',
  panel: '#FFFFFF',
  ink: '#17213A',
  muted: '#647089',
  selected: '#EBEFFF',
  border: '#DFE4EE',
  danger: '#D93645',
  /** Darkened for hover/pressed — not in approved set; preserves state without relying on color alone. */
  dangerHover: '#C22F3C',
  success: '#18794E',
  successSurface: '#ECF8F0',
  /** Soft comparison path (neutral slate; not brand chrome). */
  pathCompare: '#94A3B8',
} as const

export type MsPalette = typeof msPalette
