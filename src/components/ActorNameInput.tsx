import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MAX_ACTOR_NAME_LENGTH } from '../core/sceneActor'

interface ActorNameInputProps {
  actorId: string
  committedName: string
  disabled?: boolean
  onCommit: (actorId: string, name: string) => void
}

/**
 * Local draft while editing so clearing the field does not snap back to the
 * default sanitized name on every keystroke. Commits on Enter/blur; Escape
 * cancels. Empty commit restores the baseline name for this edit session.
 */
export function ActorNameInput({
  actorId,
  committedName,
  disabled = false,
  onCommit,
}: ActorNameInputProps) {
  const [draft, setDraft] = useState(committedName)
  const baselineRef = useRef(committedName)
  const actorIdRef = useRef(actorId)
  const skipBlurCommitRef = useRef(false)

  // Reset draft when selection changes — never apply the previous draft.
  useEffect(() => {
    if (actorIdRef.current !== actorId) {
      skipBlurCommitRef.current = true
      actorIdRef.current = actorId
      baselineRef.current = committedName
      setDraft(committedName)
    }
  }, [actorId, committedName])

  // Keep baseline aligned after an external commit for the same actor, but do
  // not clobber an in-progress draft (e.g. empty while typing a replacement).
  useEffect(() => {
    if (actorIdRef.current !== actorId) return
    if (draft === baselineRef.current && committedName !== baselineRef.current) {
      baselineRef.current = committedName
      setDraft(committedName)
    }
  }, [committedName, actorId, draft])

  const commit = () => {
    const id = actorIdRef.current
    const trimmed = draft.trim().slice(0, MAX_ACTOR_NAME_LENGTH)
    const next = trimmed.length > 0 ? trimmed : baselineRef.current
    setDraft(next)
    baselineRef.current = next
    if (next !== committedName) {
      onCommit(id, next)
    }
  }

  const cancel = () => {
    setDraft(baselineRef.current)
    skipBlurCommitRef.current = true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commit()
      skipBlurCommitRef.current = true
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      event.currentTarget.blur()
    }
  }

  return (
    <input
      data-testid="actor-name-input"
      type="text"
      value={draft}
      maxLength={MAX_ACTOR_NAME_LENGTH}
      disabled={disabled}
      aria-label="Actor name"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false
          return
        }
        commit()
      }}
      className="w-full rounded-md border border-ms-border bg-white px-2 py-1 text-sm text-slate-800 disabled:opacity-40"
    />
  )
}
