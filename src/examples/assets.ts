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
