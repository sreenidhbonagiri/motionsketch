import type { ActorImage } from '../core/types'

/**
 * Original MotionSketch mark — geometric “M” on a rounded tile.
 * See ./ASSETS.md for attribution.
 */
const MOTIONSKETCH_MARK_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="MotionSketch mark">
  <rect x="8" y="8" width="112" height="112" rx="28" fill="#0f766e"/>
  <path d="M34 92 V36 L64 72 L94 36 V92" fill="none" stroke="#ecfdf5" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

/**
 * Original notebook-paper plane — off-white ruled sheet, red margin, fold shade.
 * Transparent canvas; nose along +x for Face along path (no direction offset).
 * Tight viewBox so the actor box hugs the silhouette.
 * See ./ASSETS.md for attribution.
 */
const PAPER_PLANE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="112" height="80" viewBox="0 0 112 80" role="img" aria-label="Paper plane">
  <!-- Body (nose +x): off-white notebook paper -->
  <path fill="#f7f4ec" stroke="#d6d0c4" stroke-width="1.2" stroke-linejoin="round" d="M6 40 L106 10 L62 40 L106 70 Z"/>
  <!-- Blue ruled lines on the upper face (kept inside the silhouette) -->
  <path fill="none" stroke="#9db7d4" stroke-width="1.15" stroke-linecap="round" d="M24 26 L78 20 M22 34 L84 28 M20 42 L80 38"/>
  <!-- Restrained red margin -->
  <path fill="none" stroke="#d97777" stroke-width="1.5" stroke-linecap="round" d="M30 22 L36 48"/>
  <!-- Fold shading -->
  <path fill="#e8e2d6" d="M6 40 L62 40 L40 52 Z"/>
  <path fill="#ddd6c8" d="M62 40 L106 10 L88 40 Z"/>
  <path fill="none" stroke="#c9c2b4" stroke-width="1" stroke-linecap="round" d="M6 40 L62 40"/>
</svg>`

function toSvgDataUrl(svg: string): string {
  // Percent-encoded data URL — works in browser and Node without Buffer.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Fresh image asset each call — never share a mutable object across loads. */
export function createMotionSketchMarkImage(): ActorImage {
  return {
    mimeType: 'image/svg+xml',
    dataUrl: toSvgDataUrl(MOTIONSKETCH_MARK_SVG),
    naturalWidth: 128,
    naturalHeight: 128,
    label: 'MotionSketch mark',
  }
}

/** Fresh paper-plane image each call — never share a mutable object across loads. */
export function createPaperPlaneImage(): ActorImage {
  return {
    mimeType: 'image/svg+xml',
    dataUrl: toSvgDataUrl(PAPER_PLANE_SVG),
    naturalWidth: 112,
    naturalHeight: 80,
    label: 'Paper plane',
  }
}
