import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react'
import { EDITOR_SHORTCUTS } from '../lib/editorShortcuts'

interface ShortcutSheetProps {
  open: boolean
  onClose: () => void
  /** Prefer this opener (e.g. Help → Keyboard shortcuts) over document.activeElement. */
  returnFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function focusOpener(el: HTMLElement | null | undefined) {
  if (!el?.isConnected) return
  el.focus({ preventScroll: true })
}

/**
 * Accessible list of working editor shortcuts. Opened by ? or Help.
 * Native modal dialog + Tab cycle keeps focus inside; Close/Escape restore
 * the opener when it is still mounted.
 */
export function ShortcutSheet({
  open,
  onClose,
  returnFocusRef,
}: ShortcutSheetProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const localReturnRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!open) {
      if (dialog.open) dialog.close()
      return
    }

    const preferred = returnFocusRef?.current
    const active = document.activeElement
    if (preferred?.isConnected) {
      localReturnRef.current = preferred
    } else if (
      !localReturnRef.current &&
      active instanceof HTMLElement &&
      active !== dialog &&
      !dialog.contains(active)
    ) {
      localReturnRef.current = active
    }
    if (!dialog.open) dialog.showModal()
    closeRef.current?.focus()
  }, [open, returnFocusRef])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return

    const restoreAfterClose = () => {
      const restore =
        localReturnRef.current ?? returnFocusRef?.current ?? null
      localReturnRef.current = null
      if (returnFocusRef) returnFocusRef.current = null
      // WebKit finishes its own dialog focus handoff after `close`.
      focusOpener(restore)
      window.setTimeout(() => focusOpener(restore), 0)
    }

    const onNativeCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true' &&
          (el.offsetWidth > 0 ||
            el.offsetHeight > 0 ||
            el.getClientRects().length > 0),
      )
      if (focusable.length === 0) return
      const active = document.activeElement
      const index =
        active instanceof HTMLElement ? focusable.indexOf(active) : -1
      event.preventDefault()
      if (event.shiftKey) {
        const prev =
          index <= 0 ? focusable[focusable.length - 1]! : focusable[index - 1]!
        prev.focus()
      } else {
        const next =
          index >= focusable.length - 1
            ? focusable[0]!
            : focusable[index + 1]!
        next.focus()
      }
    }
    dialog.addEventListener('close', restoreAfterClose)
    dialog.addEventListener('cancel', onNativeCancel)
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('close', restoreAfterClose)
      dialog.removeEventListener('cancel', onNativeCancel)
      dialog.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, returnFocusRef])

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="shortcut-sheet"
      className="shortcut-sheet fixed inset-0 z-[80] m-auto mt-[min(12vh,5rem)] h-fit max-h-[min(80vh,32rem)] w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ms-border bg-white/95 p-0 text-slate-900 shadow-[var(--ms-shadow)] open:flex open:flex-col backdrop:bg-slate-900/25 backdrop:backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ms-border px-4 py-3">
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
          onClick={() => {
            const restore =
              localReturnRef.current ?? returnFocusRef?.current ?? null
            onClose()
            // Ensure restore even if dialog `close` ordering differs (WebKit).
            window.setTimeout(() => focusOpener(restore), 0)
          }}
          className="inline-flex h-7 min-h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-900/[0.06] hover:text-slate-700"
        >
          Close
        </button>
      </div>
      <ul
        data-testid="shortcut-sheet-list"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-0 overflow-y-auto p-2 outline-none"
      >
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
    </dialog>
  )
}
