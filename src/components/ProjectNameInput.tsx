import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  commitProjectName,
  MAX_PROJECT_NAME_LENGTH,
} from '../core/projectName'

interface ProjectNameInputProps {
  committedName: string
  onCommit: (name: string) => void
}

/**
 * Compact rename field for the editor header.
 * Local draft allows temporary empty input; Enter/blur commit; Escape cancels;
 * empty commit restores the previous name.
 */
export function ProjectNameInput({
  committedName,
  onCommit,
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

  const commit = () => {
    const next = commitProjectName(draft, baselineRef.current)
    setDraft(next)
    baselineRef.current = next
    setEditing(false)
    if (next !== committedName) onCommit(next)
  }

  const cancel = () => {
    setDraft(baselineRef.current)
    skipBlurRef.current = true
    setEditing(false)
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

  if (!editing) {
    return (
      <div className="min-w-0">
        <button
          type="button"
          data-testid="btn-rename-project"
          onClick={() => setEditing(true)}
          className="block max-w-[min(16rem,50vw)] truncate text-left text-sm font-semibold tracking-tight text-slate-900 underline-offset-2 hover:underline"
          title="Rename project"
        >
          {committedName}
        </button>
      </div>
    )
  }

  return (
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
      className="w-[min(16rem,50vw)] rounded-md border border-slate-200 bg-white px-2 py-0.5 text-sm font-semibold text-slate-900"
    />
  )
}
