import { useEffect, useId, useRef, useState } from 'react'
import {
  isValidProjectName,
  MAX_PROJECT_NAME_LENGTH,
  sanitizeProjectName,
} from '../core/projectName'

interface ProjectNameDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  initialName?: string
  onCancel: () => void
  onConfirm: (name: string) => void
}

/**
 * Modal name prompt for create / new / example flows.
 * Requires a trimmed non-empty name; cancel leaves the caller unchanged.
 */
export function ProjectNameDialog({
  open,
  title,
  description,
  confirmLabel,
  initialName = '',
  onCancel,
  onConfirm,
}: ProjectNameDialogProps) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(initialName)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(initialName)
    setError(null)
  }, [open, initialName])

  useEffect(() => {
    if (!open) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [open, initialName])

  if (!open) return null

  const submit = () => {
    if (!isValidProjectName(draft)) {
      setError('Enter a project name (at least one character).')
      return
    }
    onConfirm(sanitizeProjectName(draft))
  }

  return (
    <div
      data-testid="project-name-dialog-root"
      className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="project-name-dialog"
        className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
      >
        <h2
          id={titleId}
          className="text-sm font-semibold text-slate-900"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            {description}
          </p>
        )}
        <label className="mt-3 block space-y-1">
          <span className="text-[11px] font-medium text-slate-600">
            Project name
          </span>
          <input
            ref={inputRef}
            data-testid="project-name-input"
            type="text"
            value={draft}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'project-name-error' : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
              }
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900"
          />
        </label>
        {error && (
          <p
            id="project-name-error"
            data-testid="project-name-error"
            className="mt-1.5 text-[11px] text-red-700"
          >
            {error}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500">
          Up to {MAX_PROJECT_NAME_LENGTH} characters. Saved only in this browser.
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-testid="btn-project-name-cancel"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="btn-confirm-project-name"
            onClick={submit}
            className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
