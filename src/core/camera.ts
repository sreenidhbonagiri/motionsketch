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

/** Fraction of the viewport used when fitting the stage (leaves a visible frame). */
export const FIT_VIEWPORT_PADDING = 0.9

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

/**
 * Layout size of the exported stage frame inside the viewport at zoom = 1.
 * Uses the project’s stored aspect — not the live window ratio — so the frame
 * matches export bounds. Resize recomputes this size; samples stay untouched.
 */
export function fitStageLayoutSize(
  viewport: ViewportSize,
  stageAspect: number,
  padding: number = FIT_VIEWPORT_PADDING,
): StageLayoutSize {
  const vw = Math.max(0, viewport.width)
  const vh = Math.max(0, viewport.height)
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

/** Centered Fit camera for the current viewport + stage layout size. */
export function fitCamera(
  viewport: ViewportSize,
  layout: StageLayoutSize,
): WorkspaceCamera {
  return {
    zoom: 1,
    panX: (viewport.width - layout.width) / 2,
    panY: (viewport.height - layout.height) / 2,
  }
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
 * True when Space should be ignored (typing / form controls), so pan does not
 * steal keys from inputs, textareas, selects, or contenteditable.
 */
export function isSpacePanBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest(
    'input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="spinbutton"]',
  )
  return el !== null
}

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
