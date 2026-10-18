import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useEditorStore } from '../state/store'

export type ChromePanel = 'project' | 'adjust' | 'appearance' | 'export'

interface FloatingPanelProps {
  id: ChromePanel
  title: string
  open: boolean
  onClose: () => void
  /** Anchor side for desktop placement */
  align?: 'left' | 'right'
  children: ReactNode
  /** Optional summary line under the title (e.g. duration). */
  summary?: ReactNode
}

/**
 * Compact anchored panel. Pointer events stay inside the panel bounds so the
 * stage beneath remains interactive. Escape / Close dismiss without hitting the canvas.
 */
export function FloatingPanel({
  id,
  title,
  open,
  onClose,
  align = 'right',
  children,
  summary,
}: FloatingPanelProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Prefer the chrome trigger (aria-controls). After a pointer click, WebKit
    // often leaves document.activeElement on body before this effect runs.
    const trigger = document.querySelector(
      `[aria-controls="${id}-panel-root"]`,
    )
    returnFocusRef.current =
      trigger instanceof HTMLElement
        ? trigger
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
    // Move focus into the panel without jumping straight to Close.
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      // Path edit gestures / Add point own Escape first.
      const editor = useEditorStore.getState()
      if (editor.polishSession) return
      if (
        editor.mode === 'editing' &&
        (editor.pathGestureActive ||
          editor.editPreview !== null ||
          editor.pathAddMode)
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const restore = returnFocusRef.current
      returnFocusRef.current = null
      // Defer restore until after unmount paint — WebKit needs two frames.
      // Skip if the panel remounted (React Strict Mode cleanup).
      const panelDomId = `${id}-panel-root`
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (
            restore &&
            document.contains(restore) &&
            !document.getElementById(panelDomId)
          ) {
            restore.focus()
          }
        })
      })
    }
  }, [open, onClose, id])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      id={`${id}-panel-root`}
      data-testid={`${id}-panel-root`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`pointer-events-auto absolute top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-md outline-none max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[max(5.5rem,env(safe-area-inset-bottom))] max-sm:mt-0 max-sm:w-auto ${
        align === 'left' ? 'left-0 max-sm:left-3' : 'right-0 max-sm:right-3'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-sm font-semibold text-slate-900"
          >
            {title}
          </h2>
          {summary && (
            <div className="mt-0.5 text-xs text-slate-500">{summary}</div>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          data-testid={`btn-close-${id}`}
          onClick={onClose}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      <div className="max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  )
}
