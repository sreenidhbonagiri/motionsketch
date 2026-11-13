import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import {
  clipToSeconds,
  isActorVisibleAt,
  validateClipStartMoveForDraft,
} from '../core/clip'
import type { ActorClip } from '../core/types'
import { MAX_PLAYBACK_DURATION_MS } from '../core/types'
import { useEditorStore } from '../state/store'
import { HelpDisclosure } from './HelpDisclosure'

const MAX_TIMING_SEC = MAX_PLAYBACK_DURATION_MS / 1000

/** Display / spinner precision for Start after and Move for (seconds). */
const SEQUENCE_TIME_STEP = 0.01

function formatSec(sec: number): string {
  return sec.toFixed(2)
}

function suppressNativeInvalid(event: FormEvent<HTMLInputElement>) {
  event.preventDefault()
}

function barColorForActor(actor: {
  appearance: { kind: string; color?: string }
}): string {
  if (actor.appearance.kind === 'shape' && actor.appearance.color) {
    return actor.appearance.color
  }
  return '#94a3b8'
}

export type TimingDialogProps = {
  open: boolean
  onClose: () => void
  /** Restored when the dialog closes (the Timing dock button). */
  returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * On-demand Timing editor for the selected element: Start after / Move for /
 * Apply / Cancel, plus a compact delay→movement preview.
 */
export function TimingDialog({
  open,
  onClose,
  returnFocusRef,
}: TimingDialogProps) {
  const actors = useEditorStore((s) => s.project.actors)
  const selectedActorId = useEditorStore((s) => s.selectedActorId)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const mode = useEditorStore((s) => s.mode)
  const commitActorClipSeconds = useEditorStore((s) => s.commitActorClipSeconds)

  const busy =
    mode === 'recording' || mode === 'armed' || mode === 'editing'
  const selected = actors.find((a) => a.id === selectedActorId) ?? actors[0]
  const durationSec = durationMs / 1000
  const selectedSecs = selected
    ? clipToSeconds(selected.clip, durationMs)
    : { startSec: 0, endSec: 0 }
  const selectedMoveFor = selectedSecs.endSec - selectedSecs.startSec

  const dialogRef = useRef<HTMLDialogElement>(null)
  const startInputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const startFieldId = useId()
  const moveForFieldId = useId()
  const titleId = useId()
  const draftHelpId = useId()
  const draftErrorId = useId()

  const [startDraft, setStartDraft] = useState('0.00')
  const [moveForDraft, setMoveForDraft] = useState('0.00')
  const [hideBeforeDraft, setHideBeforeDraft] = useState(false)
  const [hideAfterDraft, setHideAfterDraft] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const draftActorIdRef = useRef<string | null>(null)
  const focusedOnOpenRef = useRef(false)

  const committedHideBefore = !!selected?.clip.hideBeforeStart
  const committedHideAfter = !!selected?.clip.hideAfterEnd

  const syncDraftFromCommitted = useCallback(() => {
    setStartDraft(formatSec(selectedSecs.startSec))
    setMoveForDraft(formatSec(selectedMoveFor))
    setHideBeforeDraft(committedHideBefore)
    setHideAfterDraft(committedHideAfter)
    setDraftDirty(false)
    setDraftError(null)
  }, [
    selectedSecs.startSec,
    selectedMoveFor,
    committedHideBefore,
    committedHideAfter,
  ])

  // Reset drafts when opening or when the selected element changes while open.
  useEffect(() => {
    if (!open || !selectedActorId) return
    draftActorIdRef.current = selectedActorId
    syncDraftFromCommitted()
  }, [open, selectedActorId, syncDraftFromCommitted])

  useEffect(() => {
    if (!open || !selectedActorId || draftDirty) return
    if (draftActorIdRef.current !== selectedActorId) return
    setStartDraft(formatSec(selectedSecs.startSec))
    setMoveForDraft(formatSec(selectedMoveFor))
    setHideBeforeDraft(committedHideBefore)
    setHideAfterDraft(committedHideAfter)
  }, [
    open,
    selectedActorId,
    selectedSecs.startSec,
    selectedMoveFor,
    committedHideBefore,
    committedHideAfter,
    draftDirty,
  ])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!open) {
      focusedOnOpenRef.current = false
      if (dialog.open) dialog.close()
      return
    }

    returnFocus.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
    if (!dialog.open) dialog.showModal()
    // Focus Start after once on open — not again when draft helpers change.
    if (!focusedOnOpenRef.current) {
      focusedOnOpenRef.current = true
      requestAnimationFrame(() => startInputRef.current?.focus())
    }

    const onNativeCancel = (event: Event) => {
      event.preventDefault()
      syncDraftFromCommitted()
      onClose()
    }
    dialog.addEventListener('cancel', onNativeCancel)
    return () => dialog.removeEventListener('cancel', onNativeCancel)
  }, [open, onClose, returnFocusRef, syncDraftFromCommitted])

  useEffect(() => {
    if (open) return
    const target = returnFocus.current
    returnFocus.current = null
    if (target && document.contains(target)) {
      target.focus()
    }
  }, [open])

  const draftEndsAt = (() => {
    const start = Number(startDraft)
    const moveFor = Number(moveForDraft)
    if (!Number.isFinite(start) || !Number.isFinite(moveFor)) return null
    return start + moveFor
  })()

  const preview = (() => {
    const start = Number(startDraft)
    const moveFor = Number(moveForDraft)
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(moveFor) ||
      durationSec <= 0
    ) {
      return { startPct: 0, movePct: 0 }
    }
    const startPct = Math.max(0, Math.min(100, (start / durationSec) * 100))
    const movePct = Math.max(
      0,
      Math.min(100 - startPct, (moveFor / durationSec) * 100),
    )
    return { startPct, movePct }
  })()

  const applyDraft = useCallback(() => {
    if (!selected || busy) return false
    const parsed = validateClipStartMoveForDraft(
      startDraft,
      moveForDraft,
      durationMs,
    )
    if (!parsed.ok) {
      setDraftError(parsed.error)
      return false
    }
    const result = commitActorClipSeconds(
      selected.id,
      parsed.startSec,
      parsed.endSec,
      {
        hideBeforeStart: hideBeforeDraft,
        hideAfterEnd: hideAfterDraft,
      },
    )
    if (!result.ok) {
      setDraftError(result.error)
      return false
    }
    setDraftDirty(false)
    setDraftError(null)
    onClose()
    return true
  }, [
    selected,
    busy,
    startDraft,
    moveForDraft,
    hideBeforeDraft,
    hideAfterDraft,
    durationMs,
    commitActorClipSeconds,
    onClose,
  ])

  const requestCancel = () => {
    syncDraftFromCommitted()
    onClose()
  }

  const markVisibility = (
    patch: Partial<Pick<ActorClip, 'hideBeforeStart' | 'hideAfterEnd'>>,
  ) => {
    if (busy) return
    if (patch.hideBeforeStart !== undefined) {
      setHideBeforeDraft(patch.hideBeforeStart)
    }
    if (patch.hideAfterEnd !== undefined) {
      setHideAfterDraft(patch.hideAfterEnd)
    }
    setDraftDirty(true)
    setDraftError(null)
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyDraft()
    }
  }

  const markDraft = (start: string, moveFor: string) => {
    setStartDraft(start)
    setMoveForDraft(moveFor)
    setDraftDirty(true)
    setDraftError(null)
  }

  if (!selected) return null

  const draftDescribedBy = [draftHelpId, draftError ? draftErrorId : null]
    .filter(Boolean)
    .join(' ')
  const color = barColorForActor(selected)

  return (
    <dialog
      ref={dialogRef}
      data-testid="timing-dialog"
      aria-labelledby={titleId}
      className="timing-dialog fixed inset-0 z-[100] m-auto max-h-[min(90vh,32rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-ms-border bg-white p-0 text-slate-900 shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
      onClick={(e) => {
        if (e.target === dialogRef.current) requestCancel()
      }}
    >
      <div className="flex max-h-[min(90vh,32rem)] flex-col">
      <div
        data-testid="clip-times-section"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        <div className="space-y-1">
          <h2
            id={titleId}
            data-testid="timing-dialog-title"
            className="text-sm font-semibold text-slate-900"
          >
            Timing
          </h2>
          <p
            data-testid="timing-element-name"
            className="flex items-center gap-1.5 text-sm text-slate-700"
          >
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: color }}
              aria-hidden
            />
            <span className="min-w-0 truncate font-medium">{selected.name}</span>
          </p>
        </div>

        <div
          data-testid="timing-preview"
          className="space-y-1"
          aria-hidden
        >
          <div className="relative h-2.5 w-full overflow-hidden rounded-md bg-slate-100">
            {preview.startPct > 0 && (
              <div
                data-testid="timing-preview-delay"
                className="absolute inset-y-0 bg-slate-300/80"
                style={{ left: 0, width: `${preview.startPct}%` }}
              />
            )}
            <div
              data-testid="timing-preview-move"
              className="absolute inset-y-0 rounded-sm"
              style={{
                left: `${preview.startPct}%`,
                width: `${Math.max(preview.movePct, 0.5)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <p className="text-[11px] tabular-nums text-slate-500">
            Project {formatSec(durationSec)}s · delay then movement
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="text-xs text-slate-500">Start after</span>
            <input
              ref={startInputRef}
              id={startFieldId}
              data-testid="clip-start-input"
              type="number"
              inputMode="decimal"
              step={SEQUENCE_TIME_STEP}
              min={0}
              max={MAX_TIMING_SEC}
              disabled={busy}
              value={startDraft}
              aria-invalid={draftError ? true : undefined}
              aria-describedby={draftDescribedBy}
              onChange={(e) => markDraft(e.target.value, moveForDraft)}
              onKeyDown={onDraftKeyDown}
              onInvalid={suppressNativeInvalid}
              className="w-full rounded-md border border-ms-border bg-white px-2 py-1.5 text-sm tabular-nums text-slate-800 disabled:opacity-40"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-xs text-slate-500">Move for</span>
            <input
              id={moveForFieldId}
              data-testid="clip-move-for-input"
              type="number"
              inputMode="decimal"
              step={SEQUENCE_TIME_STEP}
              min={0}
              max={MAX_TIMING_SEC}
              disabled={busy}
              value={moveForDraft}
              aria-invalid={draftError ? true : undefined}
              aria-describedby={draftDescribedBy}
              onChange={(e) => markDraft(startDraft, e.target.value)}
              onKeyDown={onDraftKeyDown}
              onInvalid={suppressNativeInvalid}
              className="w-full rounded-md border border-ms-border bg-white px-2 py-1.5 text-sm tabular-nums text-slate-800 disabled:opacity-40"
            />
          </label>
        </div>

        <p
          data-testid="clip-ends-at"
          className="text-xs tabular-nums text-slate-600"
        >
          Ends at{' '}
          <span className="font-medium text-slate-800">
            {draftEndsAt !== null && Number.isFinite(draftEndsAt)
              ? `${formatSec(draftEndsAt)} s`
              : '—'}
          </span>
        </p>

        <p id={draftHelpId} data-testid="clip-times-help" className="sr-only">
          Apply or Enter commits Start after, Move for, and visibility together.
          Cancel or Escape discards unapplied changes without creating undo
          entries.
        </p>

        {draftError && (
          <p
            id={draftErrorId}
            data-testid="clip-times-error"
            role="alert"
            className="text-xs font-medium text-ms-warning-ink"
          >
            {draftError}
          </p>
        )}

        {!isActorVisibleAt(playbackHead, selected.clip) && (
          <p
            data-testid="clip-hidden-now-hint"
            className="text-xs font-medium text-ms-warning-ink"
          >
            Hidden at the current time.
          </p>
        )}

        <HelpDisclosure summary="More options">
          <fieldset
            data-testid="clip-visibility-options"
            className="mt-1 space-y-1.5"
            disabled={busy}
          >
            <legend className="sr-only">Before and after</legend>

            <div
              data-testid="sequence-before-movement"
              className="space-y-1"
              role="group"
              aria-label="Before movement"
            >
              <p className="text-xs font-medium text-slate-700">
                Before movement
              </p>
              <div className="flex flex-wrap gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ms-border bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-ms-play/40 has-[:checked]:bg-ms-selected">
                  <input
                    type="radio"
                    name={`before-${selected.id}`}
                    data-testid="clip-show-before"
                    className="accent-ms-play"
                    checked={!hideBeforeDraft}
                    disabled={busy}
                    onChange={() => markVisibility({ hideBeforeStart: false })}
                  />
                  Show starting pose
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ms-border bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-ms-play/40 has-[:checked]:bg-ms-selected">
                  <input
                    type="radio"
                    name={`before-${selected.id}`}
                    data-testid="clip-hide-before"
                    className="accent-ms-play"
                    checked={hideBeforeDraft}
                    disabled={busy}
                    onChange={() => markVisibility({ hideBeforeStart: true })}
                  />
                  Hide
                </label>
              </div>
            </div>

            <div
              data-testid="sequence-after-movement"
              className="space-y-1"
              role="group"
              aria-label="After movement"
            >
              <p className="text-xs font-medium text-slate-700">
                After movement
              </p>
              <div className="flex flex-wrap gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ms-border bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-ms-play/40 has-[:checked]:bg-ms-selected">
                  <input
                    type="radio"
                    name={`after-${selected.id}`}
                    data-testid="clip-hold-after"
                    className="accent-ms-play"
                    checked={!hideAfterDraft}
                    disabled={busy}
                    onChange={() => markVisibility({ hideAfterEnd: false })}
                  />
                  Hold final pose
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ms-border bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-ms-play/40 has-[:checked]:bg-ms-selected">
                  <input
                    type="radio"
                    name={`after-${selected.id}`}
                    data-testid="clip-hide-after"
                    className="accent-ms-play"
                    checked={hideAfterDraft}
                    disabled={busy}
                    onChange={() => markVisibility({ hideAfterEnd: true })}
                  />
                  Hide
                </label>
              </div>
            </div>
          </fieldset>
        </HelpDisclosure>
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-ms-border bg-white px-4 py-3">
        <button
          type="button"
          data-testid="btn-timing-cancel"
          onClick={requestCancel}
          className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-900/[0.06]"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="btn-apply-clip-times"
          disabled={busy || !draftDirty}
          onClick={() => applyDraft()}
          className="rounded-lg bg-ms-play px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-ms-play-hover disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      </div>
    </dialog>
  )
}
