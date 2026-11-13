/**
 * MotionSketch premium chrome palette.
 * Keep in sync with `:root` / `@theme` tokens in `src/index.css`.
 * Editor path overlays use these values; actor appearance / export CSS do not.
 */
export const msPalette = {
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryPressed: '#1E40AF',
  play: '#2563EB',
  record: '#E11D48',
  motion: '#7C3AED',
  export: '#0D9488',
  canvas: '#F8F9FC',
  panel: '#FFFFFF',
  ink: '#17213A',
  muted: '#647089',
  selected: '#EFF6FF',
  border: '#E2E8F0',
  danger: '#E11D48',
  /** Darkened for hover/pressed — preserves state without relying on color alone. */
  dangerHover: '#BE123C',
  success: '#18794E',
  successSurface: '#ECF8F0',
  warningInk: '#92400E',
  /** Soft comparison path (neutral slate; not brand chrome). */
  pathCompare: '#94A3B8',
} as const

export type MsPalette = typeof msPalette
