import { useEffect, useId, useRef } from 'react'
import { EDITOR_SHORTCUTS } from '../lib/editorShortcuts'

interface ShortcutSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * Accessible list of working editor shortcuts. Opened by ? or Help.
 * Escape closes; focus returns to the opener when possible.
 */
export function ShortcutSheet({ open, onClose }: ShortcutSheetProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeRef.current?.focus()
    return () => {
      const restore = returnFocusRef.current
      returnFocusRef.current = null
      requestAnimationFrame(() => {
        if (restore?.isConnected) restore.focus()
      })
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/25 p-4 pt-[min(12vh,5rem)] backdrop-blur-[2px]"
      data-testid="shortcut-sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="shortcut-sheet"
        className="w-full max-w-md rounded-xl border border-ms-border bg-white/95 shadow-[var(--ms-shadow)] outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ms-border px-4 py-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-sm font-semibold tracking-tight text-slate-800"
            >
              Keyboard shortcuts
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Only shortcuts that work in the editor.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="btn-close-shortcuts"
            onClick={onClose}
            className="inline-flex h-7 min-h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-900/[0.06] hover:text-slate-700"
          >
            Close
          </button>
        </div>
        <ul className="max-h-[min(24rem,60vh)] space-y-0 overflow-y-auto p-2">
          {EDITOR_SHORTCUTS.map((row) => (
            <li
              key={row.id}
              data-testid={`shortcut-row-${row.id}`}
              className="flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-2"
            >
              <span className="text-sm text-slate-700">{row.action}</span>
              <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
