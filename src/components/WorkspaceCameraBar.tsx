import {
  formatZoomPercent,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
} from '../core/camera'
import { useEditorStore } from '../state/store'

const control =
  'inline-flex h-8 min-h-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06] disabled:opacity-40'
const iconBtn =
  'inline-flex h-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-sm text-slate-600 transition hover:bg-slate-900/[0.06] hover:text-slate-900 disabled:opacity-40'

interface WorkspaceCameraBarProps {
  zoomIn: () => void
  zoomOut: () => void
  fitStage: () => void
}

/**
 * Compact, screen-fixed workspace zoom controls (not inside the world transform).
 * Empty-canvas drag pans; Space temporarily pans over actors — no Hand toggle.
 */
export function WorkspaceCameraBar({
  zoomIn,
  zoomOut,
  fitStage,
}: WorkspaceCameraBarProps) {
  const zoom = useEditorStore((s) => s.camera.zoom)

  return (
    <div
      data-testid="workspace-camera-bar"
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-ms-border bg-white/90 p-0.5 shadow-[var(--ms-shadow-sm)] backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="btn-zoom-out"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= MIN_CAMERA_ZOOM + 1e-6}
        onClick={zoomOut}
        className={iconBtn}
      >
        <span aria-hidden>−</span>
      </button>
      <span
        data-testid="zoom-percent"
        className="min-w-[2.75rem] px-0.5 text-center text-xs tabular-nums text-slate-600"
        aria-live="polite"
      >
        {formatZoomPercent(zoom)}
      </span>
      <button
        type="button"
        data-testid="btn-zoom-in"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= MAX_CAMERA_ZOOM - 1e-6}
        onClick={zoomIn}
        className={iconBtn}
      >
        <span aria-hidden>+</span>
      </button>
      <button
        type="button"
        data-testid="btn-fit-stage"
        aria-label="Fit stage"
        title="Fit stage — center and show the full exported stage. Drag empty canvas to pan; hold Space to pan over actors."
        onClick={fitStage}
        className={control}
      >
        <span className="sm:hidden">Fit</span>
        <span className="hidden sm:inline">Fit stage</span>
      </button>
    </div>
  )
}
