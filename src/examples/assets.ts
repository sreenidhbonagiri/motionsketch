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
 * Original paper plane — transparent canvas, nose along +x for Face along path.
 * Tight viewBox so the actor box hugs the artwork (no padded “card”).
 * See ./ASSETS.md for attribution.
 */
const PAPER_PLANE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="112" height="80" viewBox="0 0 112 80" role="img" aria-label="Paper plane">
  <path fill="#0f766e" d="M4 40 L108 8 L64 40 L108 72 Z"/>
  <path fill="#115e59" d="M4 40 L64 40 L40 54 Z"/>
  <path fill="#14b8a6" fill-opacity="0.92" d="M64 40 L108 8 L86 40 Z"/>
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
