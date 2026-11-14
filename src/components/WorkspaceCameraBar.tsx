import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { Minus, Plus } from 'lucide-react'
import {
  formatZoomPercent,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
  parseZoomPercentInput,
} from '../core/camera'
import { useEditorStore } from '../state/store'

const control =
  'inline-flex h-8 min-h-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06] disabled:opacity-40'
const iconBtn =
  'inline-flex h-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-900/[0.06] hover:text-slate-900 disabled:opacity-40'
const zoomField =
  'ms-caption h-8 min-h-8 min-w-[2.75rem] max-w-[4.5rem] rounded-lg border border-transparent bg-transparent px-0.5 text-center tabular-nums text-slate-700 outline-none transition hover:bg-slate-900/[0.06] focus-visible:border-ms-primary focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-ms-primary/30 aria-[invalid=true]:border-ms-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-ms-danger/25'

interface WorkspaceCameraBarProps {
  zoomIn: () => void
  zoomOut: () => void
  fitStage: () => void
  /** Absolute zoom anchored at viewport center (same as +/−). */
  setZoomAtCenter: (zoom: number) => void
}

/**
 * Compact, screen-fixed workspace zoom controls (not inside the world transform).
 * Empty-canvas drag pans; hold H or middle-drag to pan over actors — no Hand toggle.
 * Click/tap the percentage to type an exact zoom.
 */
export function WorkspaceCameraBar({
  zoomIn,
  zoomOut,
  fitStage,
  setZoomAtCenter,
}: WorkspaceCameraBarProps) {
  const zoom = useEditorStore((s) => s.camera.zoom)
  const labelId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => formatZoomPercent(zoom))
  const [invalid, setInvalid] = useState(false)
  const skipBlurApplyRef = useRef(false)

  useEffect(() => {
    if (!editing) {
      setDraft(formatZoomPercent(zoom))
      setInvalid(false)
    }
  }, [zoom, editing])

  const beginEdit = () => {
    setDraft(formatZoomPercent(zoom))
    setInvalid(false)
    setEditing(true)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    })
  }

  const cancelEdit = () => {
    skipBlurApplyRef.current = true
    setEditing(false)
    setDraft(formatZoomPercent(zoom))
    setInvalid(false)
  }

  const applyDraft = (mode: 'enter' | 'blur'): boolean => {
    const parsed = parseZoomPercentInput(draft)
    if (parsed === null) {
      setInvalid(true)
      if (mode === 'blur') {
        // Reject without moving the camera; leave edit mode on the live value.
        setEditing(false)
        setDraft(formatZoomPercent(zoom))
        setInvalid(false)
      }
      return false
    }
    setInvalid(false)
    if (Math.abs(parsed - zoom) > 1e-9) {
      setZoomAtCenter(parsed)
    }
    setEditing(false)
    setDraft(formatZoomPercent(parsed))
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (applyDraft('enter')) {
        skipBlurApplyRef.current = true
        inputRef.current?.blur()
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelEdit()
      inputRef.current?.blur()
      return
    }
    // Keep workspace shortcuts from firing while typing (Space, ?, etc.).
    event.stopPropagation()
  }

  const onBlur = () => {
    if (skipBlurApplyRef.current) {
      skipBlurApplyRef.current = false
      return
    }
    if (!editing) return
    applyDraft('blur')
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value)
    if (invalid) setInvalid(false)
  }

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
      <span id={labelId} className="sr-only">
        Zoom percentage
      </span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-testid="zoom-percent-input"
          aria-labelledby={labelId}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${labelId}-error` : undefined}
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={zoomField}
        />
      ) : (
        <button
          type="button"
          data-testid="zoom-percent"
          aria-labelledby={labelId}
          aria-live="polite"
          title="Edit zoom percentage"
          onClick={beginEdit}
          className={zoomField}
        >
          {formatZoomPercent(zoom)}
        </button>
      )}
      {invalid ? (
        <span id={`${labelId}-error`} className="sr-only" role="alert">
          Enter a zoom between {Math.round(MIN_CAMERA_ZOOM * 100)}% and{' '}
          {Math.round(MAX_CAMERA_ZOOM * 100)}%.
        </span>
      ) : null}
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
