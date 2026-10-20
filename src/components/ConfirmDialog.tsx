import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Prefer stronger styling for irreversible actions. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
  bodyTestId?: string
  /** Restored when the dialog closes (defaults to the pre-open active element). */
  returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Accessible modal confirmation using the native &lt;dialog&gt; element.
 * Escape and backdrop click cancel; focus returns to the prior control.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  testId = 'app-confirm',
  confirmTestId = 'btn-app-confirm',
  cancelTestId = 'btn-app-confirm-cancel',
  bodyTestId = 'app-confirm-copy',
  returnFocusRef,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!open) {
      if (dialog.open) dialog.close()
      return
    }

    returnFocus.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
    if (!dialog.open) dialog.showModal()
    // Prefer Cancel for safer default focus on destructive confirms.
    cancelBtnRef.current?.focus()

    const onNativeCancel = (event: Event) => {
      // Escape — route through onCancel; keep React as the source of close.
      event.preventDefault()
      onCancel()
    }
    dialog.addEventListener('cancel', onNativeCancel)
    return () => {
      dialog.removeEventListener('cancel', onNativeCancel)
    }
  }, [open, onCancel, returnFocusRef])

  useEffect(() => {
    if (open) return
    const target = returnFocus.current
    returnFocus.current = null
    if (target && document.contains(target)) {
      target.focus()
    }
  }, [open])

  const requestConfirm = () => {
    onConfirm()
  }

  const requestCancel = () => {
    onCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid={testId}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="confirm-dialog fixed inset-0 z-[100] m-auto w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-900/[0.08] bg-white p-0 text-slate-900 shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
      onClick={(e) => {
        if (e.target === dialogRef.current) requestCancel()
      }}
    >
      <div className="space-y-3 p-4">
        <h2 id={titleId} className="text-sm font-semibold text-slate-900">
          {title}
        </h2>
        <div
          id={bodyId}
          data-testid={bodyTestId}
          className="text-[11px] leading-relaxed text-slate-600"
        >
          {typeof body === 'string' ? <p>{body}</p> : body}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            data-testid={cancelTestId}
            onClick={requestCancel}
            className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-900/[0.06]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid={confirmTestId}
            onClick={requestConfirm}
            className={
              danger
                ? 'rounded-lg bg-red-700 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-800'
                : 'rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
