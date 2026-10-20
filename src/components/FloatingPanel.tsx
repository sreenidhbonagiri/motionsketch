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
 * Compact anchored contextual panel — shared treatment for Adjust / Appearance /
 * Project / Export. On narrow viewports this becomes a bounded sheet between the
 * measured header and the safe-area bottom, with a sticky title/Close and one
 * scrollable body. Escape / Close dismiss without hitting the canvas.
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
    const trigger = document.querySelector(
      `[aria-controls="${id}-panel-root"]`,
    )
    returnFocusRef.current =
      trigger instanceof HTMLElement
        ? trigger
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      const editor = useEditorStore.getState()
      if (editor.polishSession || editor.glideSession) return
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
      className={`pointer-events-auto absolute top-full z-50 mt-1.5 flex max-h-[min(32rem,calc(100dvh-12rem))] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-900/[0.08] bg-white/92 shadow-[var(--ms-shadow)] backdrop-blur-xl outline-none max-sm:fixed max-sm:inset-x-3 max-sm:top-[var(--ms-sheet-top,4.5rem)] max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:mt-0 max-sm:max-h-none max-sm:w-auto ${
        align === 'left' ? 'left-0 max-sm:left-3' : 'right-0 max-sm:right-3'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 border-b border-slate-900/[0.06] py-2 pl-3 pr-14">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-sm font-semibold tracking-tight text-slate-800"
          >
            {title}
          </h2>
          {summary && (
            <div className="mt-0.5 text-xs text-slate-500">{summary}</div>
          )}
        </div>
      </div>
      <div
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
      >
        {children}
      </div>
      <button
        ref={closeRef}
        type="button"
        data-testid={`btn-close-${id}`}
        onClick={onClose}
        className="absolute top-2 right-2.5 inline-flex h-7 min-h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-900/[0.06] hover:text-slate-700"
      >
        Close
      </button>
    </div>
  )
}
