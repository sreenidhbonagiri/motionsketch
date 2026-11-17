import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  commitProjectName,
  MAX_PROJECT_NAME_LENGTH,
} from '../core/projectName'

interface ProjectNameInputProps {
  committedName: string
  onCommit: (name: string) => void
  /** Fires when rename editing begins or ends (header save-status chrome). */
  onEditingChange?: (editing: boolean) => void
}

/** Shared box so button ↔ input swap does not shift the header/stage. */
const NAME_FIELD_BOX =
  'box-border h-6 max-w-[min(10rem,36vw)] text-left text-sm font-semibold tracking-tight text-slate-900 sm:max-w-[min(16rem,50vw)]'

/**
 * Compact rename field for the editor header.
 * Local draft allows temporary empty input; Enter/blur commit; Escape cancels;
 * empty commit restores the previous name.
 */
export function ProjectNameInput({
  committedName,
  onCommit,
  onEditingChange,
}: ProjectNameInputProps) {
  const [draft, setDraft] = useState(committedName)
  const [editing, setEditing] = useState(false)
  const baselineRef = useRef(committedName)
  const skipBlurRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      baselineRef.current = committedName
      setDraft(committedName)
    }
  }, [committedName, editing])

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editing])

  const beginEditing = () => {
    setEditing(true)
    onEditingChange?.(true)
  }

  const endEditing = () => {
    setEditing(false)
    onEditingChange?.(false)
  }

  const commit = () => {
    const next = commitProjectName(draft, baselineRef.current)
    setDraft(next)
    baselineRef.current = next
    endEditing()
    if (next !== committedName) onCommit(next)
  }

  const cancel = () => {
    setDraft(baselineRef.current)
    skipBlurRef.current = true
    endEditing()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      skipBlurRef.current = true
      commit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  }

  return (
    <div
      data-testid="project-name-field"
      className="flex h-6 min-w-0 shrink-0 items-center"
    >
      {editing ? (
        <input
          ref={inputRef}
          data-testid="header-project-name-input"
          type="text"
          value={draft}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          aria-label="Project name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false
              return
            }
            commit()
          }}
          className={`${NAME_FIELD_BOX} w-[min(16rem,50vw)] rounded-md border border-ms-border bg-white/90 px-1.5 leading-none`}
        />
      ) : (
        <button
          type="button"
          data-testid="btn-rename-project"
          onClick={beginEditing}
          className={`${NAME_FIELD_BOX} block w-full select-none truncate rounded-md border border-transparent px-1.5 leading-none underline-offset-2 hover:underline`}
          title="Rename project"
          aria-label="Rename project"
        >
          {committedName}
        </button>
      )}
    </div>
  )
}
