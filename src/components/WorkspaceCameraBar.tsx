import { Minus, Plus } from 'lucide-react'
import {
  formatZoomPercent,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
} from '../core/camera'
import { useEditorStore } from '../state/store'

const control =
  'inline-flex h-8 min-h-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06] disabled:opacity-40'
const iconBtn =
  'inline-flex h-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-900/[0.06] hover:text-slate-900 disabled:opacity-40'

interface WorkspaceCameraBarProps {
  zoomIn: () => void
  zoomOut: () => void
  fitStage: () => void
}

/**
 * Compact, screen-fixed workspace zoom controls (not inside the world transform).
 * Empty-canvas drag pans; hold H or middle-drag to pan over actors — no Hand toggle.
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
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-ms-border bg-white p-0.5 shadow-[var(--ms-shadow-sm)]"
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
        <Minus className="size-3.5" aria-hidden strokeWidth={2} />
      </button>
      <span
        data-testid="zoom-percent"
        className="ms-caption min-w-[2.75rem] px-0.5 text-center tabular-nums text-slate-700"
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
        <Plus className="size-3.5" aria-hidden strokeWidth={2} />
      </button>
      <button
        type="button"
        data-testid="btn-fit-stage"
        aria-label="Fit stage"
        title="Fit stage. Center and show the full exported stage. Drag empty canvas to pan; hold H or middle-drag to pan over elements."
        onClick={fitStage}
        className={control}
      >
        <span className="sm:hidden">Fit</span>
        <span className="hidden sm:inline">Fit stage</span>
      </button>
    </div>
  )
}
