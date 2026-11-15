import { clamp } from './coords'
import { clampStageAspect } from './stageAspect'

/** Editor-only view transform. Never persisted; never applied to samples/export. */
export type WorkspaceCamera = {
  /** Multiplier of the fitted stage size (1 = Fit). */
  zoom: number
  /** Viewport-pixel offset of the stage-frame’s top-left (pre-zoom origin). */
  panX: number
  panY: number
}

export type ViewportSize = { width: number; height: number }

export type StageLayoutSize = { width: number; height: number }

/**
 * Obstructed margins inside the stage viewport (floating cards, camera chrome).
 * Fit uses the remaining clear rectangle; open/close must not auto-fit.
 */
export type ViewportInsets = {
  left: number
  right: number
  top: number
  bottom: number
}

export const ZERO_VIEWPORT_INSETS: ViewportInsets = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
}

/** Fraction of the viewport used when fitting the stage (small margin for edges). */
export const FIT_VIEWPORT_PADDING = 0.96

export const MIN_CAMERA_ZOOM = 0.25
export const MAX_CAMERA_ZOOM = 4
export const CAMERA_ZOOM_STEP = 1.25

export const DEFAULT_CAMERA: WorkspaceCamera = {
  zoom: 1,
  panX: 0,
  panY: 0,
}

export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM)
}

function clampInset(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value
}

/** Sanitize insets and keep them from consuming the whole viewport. */
export function normalizeViewportInsets(
  insets: ViewportInsets | null | undefined,
  viewport: ViewportSize,
): ViewportInsets {
  const left = clampInset(insets?.left ?? 0)
  const right = clampInset(insets?.right ?? 0)
  const top = clampInset(insets?.top ?? 0)
  const bottom = clampInset(insets?.bottom ?? 0)
  const maxX = Math.max(0, viewport.width - 1)
  const maxY = Math.max(0, viewport.height - 1)
  const xSum = left + right
  const ySum = top + bottom
  const scaleX = xSum > maxX && xSum > 0 ? maxX / xSum : 1
  const scaleY = ySum > maxY && ySum > 0 ? maxY / ySum : 1
  return {
    left: left * scaleX,
    right: right * scaleX,
    top: top * scaleY,
    bottom: bottom * scaleY,
  }
}

/** Clear rectangle inside the full viewport after subtracting insets. */
export function clearViewportRect(
  viewport: ViewportSize,
  insets: ViewportInsets | null | undefined = ZERO_VIEWPORT_INSETS,
): { originX: number; originY: number; size: ViewportSize } {
  const safe = normalizeViewportInsets(insets, viewport)
  return {
    originX: safe.left,
    originY: safe.top,
    size: {
      width: Math.max(0, viewport.width - safe.left - safe.right),
      height: Math.max(0, viewport.height - safe.top - safe.bottom),
    },
  }
}

/** Axis-aligned rect overlap (any shared area). */
export function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  )
}

/**
 * Top inset from the camera bar only when it overlaps the proposed fitted
 * stage (viewport-local coords). Corner chrome that already clears the stage
 * contributes 0 — matching default layout vs explicit Fit.
 */
export function cameraBarTopInsetForProposedStage(
  barLocal: { left: number; right: number; top: number; bottom: number },
  proposedStageLocal: {
    left: number
    right: number
    top: number
    bottom: number
  },
): number {
  if (!rectsOverlap(barLocal, proposedStageLocal)) return 0
  return Math.max(0, barLocal.bottom + 4)
}

/**
 * Layout size of the exported stage frame inside the viewport at zoom = 1.
 * Uses the project’s stored aspect — not the live window ratio — so the frame
 * matches export bounds. Resize recomputes this size; samples stay untouched.
 * Optional insets shrink the fit target to the unobstructed workspace.
 */
export function fitStageLayoutSize(
  viewport: ViewportSize,
  stageAspect: number,
  padding: number = FIT_VIEWPORT_PADDING,
  insets: ViewportInsets | null | undefined = ZERO_VIEWPORT_INSETS,
): StageLayoutSize {
  const clear = clearViewportRect(viewport, insets).size
  const vw = Math.max(0, clear.width)
  const vh = Math.max(0, clear.height)
  if (vw <= 0 || vh <= 0) return { width: 0, height: 0 }
  const aspect = clampStageAspect(stageAspect)
  const pad = clamp(padding, 0.5, 1)
  const maxW = vw * pad
  const maxH = vh * pad
  if (maxW / maxH > aspect) {
    const height = maxH
    return { width: height * aspect, height }
  }
  const width = maxW
  return { width, height: width / aspect }
}

/**
 * Centered Fit camera for the current viewport + stage layout size at zoom 1.
 * Prefer {@link fitCameraIntoClear} when chrome insets may require zooming out.
 */
export function fitCamera(
  viewport: ViewportSize,
  layout: StageLayoutSize,
  insets: ViewportInsets | null | undefined = ZERO_VIEWPORT_INSETS,
): WorkspaceCamera {
  return fitCameraIntoClear(viewport, layout, insets)
}

/**
 * Place a fixed base stage layout in the unobstructed clear rect.
 * Keeps the same layout size as the default (full-viewport) letterbox; zooms
 * out only when that layout cannot fit clear of insets. Never zooms in past 1
 * on Fit — displayed % matches camera.zoom.
 */
export function fitCameraIntoClear(
  viewport: ViewportSize,
  layout: StageLayoutSize,
  insets: ViewportInsets | null | undefined = ZERO_VIEWPORT_INSETS,
  padding: number = FIT_VIEWPORT_PADDING,
): WorkspaceCamera {
  const clear = clearViewportRect(viewport, insets)
  if (layout.width <= 0 || layout.height <= 0) {
    return { ...DEFAULT_CAMERA }
  }
  if (clear.size.width <= 0 || clear.size.height <= 0) {
    return { ...DEFAULT_CAMERA }
  }
  const pad = clamp(padding, 0.5, 1)
  const availW = clear.size.width * pad
  const availH = clear.size.height * pad
  const scale = Math.min(availW / layout.width, availH / layout.height)
  // Fit never enlarges past the base letterbox (zoom 1).
  const zoom = clampCameraZoom(Math.min(1, scale))
  const scaledW = layout.width * zoom
  const scaledH = layout.height * zoom
  return {
    zoom,
    panX: clear.originX + (clear.size.width - scaledW) / 2,
    panY: clear.originY + (clear.size.height - scaledH) / 2,
  }
}

/**
 * Measure floating Elements/Inspector card bounds (expanded or collapsed) and
 * the camera bar relative to the stage viewport. Cards are siblings of the
 * camera root under `[data-testid="stage-viewport"]`, so search that host —
 * not only the camera root. Used only by explicit Fit — not on open/close.
 *
 * Proposes the visual stage from the same full-viewport base layout as the
 * default letterbox (camera zoom/pan into card/transport clear space). Camera
 * bar top inset is added only when that proposal overlaps the bar — so
 * unobstructed Fit keeps zoom 1 and matches the default size.
 */
export function measureWorkspaceFitInsets(
  viewportEl: HTMLElement,
  stageAspect: number,
): ViewportInsets {
  const host =
    viewportEl.closest('[data-testid="stage-viewport"]') ?? viewportEl
  const vr = viewportEl.getBoundingClientRect()
  if (vr.width <= 0 || vr.height <= 0) return { ...ZERO_VIEWPORT_INSETS }

  let left = 0
  let right = 0
  let top = 0
  let bottom = 0

  // Prefer the visible card chrome (expanded or collapsed), not the full-height
  // slot wrapper — collapse-to-header must shrink the measured obstruction.
  const elementsCard =
    host.querySelector(
      '[data-testid="actor-list-slot"] [data-testid="actor-list"]',
    ) ?? host.querySelector('[data-testid="actor-list-slot"]')
  if (elementsCard instanceof HTMLElement) {
    const r = elementsCard.getBoundingClientRect()
    const overlapLeft = Math.max(vr.left, r.left)
    const overlapRight = Math.min(vr.right, r.right)
    const overlapTop = Math.max(vr.top, r.top)
    const overlapBottom = Math.min(vr.bottom, r.bottom)
    if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
      left = Math.max(left, overlapRight - vr.left)
    }
  }

  const inspectorCard =
    host.querySelector(
      '[data-testid="inspector-slot"] [data-testid="inspector-panel"]',
    ) ?? host.querySelector('[data-testid="inspector-slot"]')
  if (inspectorCard instanceof HTMLElement) {
    const r = inspectorCard.getBoundingClientRect()
    const overlapLeft = Math.max(vr.left, r.left)
    const overlapRight = Math.min(vr.right, r.right)
    const overlapTop = Math.max(vr.top, r.top)
    const overlapBottom = Math.min(vr.bottom, r.bottom)
    if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
      right = Math.max(right, vr.right - overlapLeft)
    }
  }

  // Transport lives outside the stage viewport cell; if a dock ever overlays
  // the cell, reserve the intersecting bottom band.
  const transport = document.querySelector('[data-testid="dock-transport"]')
  if (transport instanceof HTMLElement) {
    const r = transport.getBoundingClientRect()
    const overlapTop = Math.max(vr.top, r.top)
    const overlapBottom = Math.min(vr.bottom, r.bottom)
    if (overlapBottom > overlapTop) {
      bottom = Math.max(bottom, vr.bottom - overlapTop)
    }
  }

  const vp: ViewportSize = { width: vr.width, height: vr.height }
  const baseLayout = fitStageLayoutSize(vp, stageAspect)
  const baseInsets = normalizeViewportInsets(
    { left, right, top: 0, bottom },
    vp,
  )
  const proposedCam = fitCameraIntoClear(vp, baseLayout, baseInsets)
  const proposedStage =
    baseLayout.width > 0 && baseLayout.height > 0
      ? {
          left: proposedCam.panX,
          top: proposedCam.panY,
          right: proposedCam.panX + baseLayout.width * proposedCam.zoom,
          bottom: proposedCam.panY + baseLayout.height * proposedCam.zoom,
        }
      : null

  const cameraBar = host.querySelector('[data-testid="workspace-camera-bar"]')
  if (cameraBar instanceof HTMLElement && proposedStage) {
    const r = cameraBar.getBoundingClientRect()
    const barLocal = {
      left: r.left - vr.left,
      right: r.right - vr.left,
      top: r.top - vr.top,
      bottom: r.bottom - vr.top,
    }
    top = Math.max(
      top,
      cameraBarTopInsetForProposedStage(barLocal, proposedStage),
    )
  }

  return normalizeViewportInsets({ left, right, top, bottom }, vp)
}

export function panCamera(
  camera: WorkspaceCamera,
  dx: number,
  dy: number,
): WorkspaceCamera {
  return {
    ...camera,
    panX: camera.panX + dx,
    panY: camera.panY + dy,
  }
}

/**
 * Zoom around a point in viewport-local pixels (origin = viewport top-left).
 * Keeps the world point under that location stable.
 */
export function zoomCameraAt(
  camera: WorkspaceCamera,
  nextZoom: number,
  viewportX: number,
  viewportY: number,
): WorkspaceCamera {
  const zoom = clampCameraZoom(nextZoom)
  if (zoom === camera.zoom) return camera
  const worldX = (viewportX - camera.panX) / camera.zoom
  const worldY = (viewportY - camera.panY) / camera.zoom
  return {
    zoom,
    panX: viewportX - worldX * zoom,
    panY: viewportY - worldY * zoom,
  }
}

/** Zoom around the viewport center (button controls). */
export function zoomCameraAtCenter(
  camera: WorkspaceCamera,
  nextZoom: number,
  viewport: ViewportSize,
): WorkspaceCamera {
  return zoomCameraAt(
    camera,
    nextZoom,
    viewport.width / 2,
    viewport.height / 2,
  )
}

/**
 * After the fitted layout size changes (browser resize), keep the same
 * normalized stage point under the viewport center. Geometry is untouched.
 */
export function preserveCameraCenterOnLayoutChange(
  camera: WorkspaceCamera,
  oldLayout: StageLayoutSize,
  newLayout: StageLayoutSize,
  oldViewport: ViewportSize,
  newViewport: ViewportSize,
): WorkspaceCamera {
  if (
    oldLayout.width <= 0 ||
    oldLayout.height <= 0 ||
    newLayout.width <= 0 ||
    newLayout.height <= 0
  ) {
    return fitCamera(newViewport, newLayout)
  }
  const oldCx = oldViewport.width / 2
  const oldCy = oldViewport.height / 2
  const normX = (oldCx - camera.panX) / (camera.zoom * oldLayout.width)
  const normY = (oldCy - camera.panY) / (camera.zoom * oldLayout.height)
  const cx = newViewport.width / 2
  const cy = newViewport.height / 2
  return {
    zoom: clampCameraZoom(camera.zoom),
    panX: cx - normX * camera.zoom * newLayout.width,
    panY: cy - normY * camera.zoom * newLayout.height,
  }
}

/** CSS transform for the workspace world layer (origin top-left). */
export function cameraCssTransform(camera: WorkspaceCamera): string {
  return `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`
}

export function formatZoomPercent(zoom: number): string {
  return `${Math.round(clampCameraZoom(zoom) * 100)}%`
}

/**
 * Parse a typed zoom field ("150", "150%", " 75 % ").
 * Returns null for empty, non-numeric, or out-of-range values — callers must
 * not change the camera when null.
 */
export function parseZoomPercentInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = /^([+-]?\d+(?:\.\d+)?)\s*%?$/.exec(trimmed)
  if (!match) return null
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return null
  const zoom = percent / 100
  if (zoom < MIN_CAMERA_ZOOM - 1e-12 || zoom > MAX_CAMERA_ZOOM + 1e-12) {
    return null
  }
  return clampCameraZoom(zoom)
}

/** Re-export: form/button targets that must keep native Space / typing. */
export { isWorkspaceShortcutBlockedTarget as isSpacePanBlockedTarget } from '../lib/editorShortcuts'

/**
 * True when the event target is empty workspace/stage canvas — not an actor,
 * path handle, Move path stroke, or camera chrome.
 */
export function isBackgroundPanTarget(
  target: EventTarget | null,
  options?: { excludeStageFrame?: boolean },
): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-testid="workspace-camera-bar"]')) return false
  if (
    target.closest(
      '[data-testid="actor"], [data-testid^="actor-"], [data-testid="path-handles"], [data-testid^="path-handle-"], [data-testid="path-add-candidate"], [data-testid="path-move-overlay"]',
    )
  ) {
    return false
  }
  if (target.closest('button, a, input, textarea, select, [role="slider"]')) {
    return false
  }
  if (
    options?.excludeStageFrame &&
    target.closest('[data-testid="stage-frame"]')
  ) {
    return false
  }
  return target.closest('[data-testid="stage"]') !== null
}
