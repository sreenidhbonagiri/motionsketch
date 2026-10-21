import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  clampClip,
  cloneClip,
  clipFromSeconds,
  clipToSeconds,
  isActorVisibleAt,
  moveClip,
  resizeClipEnd,
  resizeClipStart,
  validateClipSecondsDraft,
  validateClipStartMoveForDraft,
} from '../core/clip'
import type { ActorClip } from '../core/types'
import {
  readPanelOpenPref,
  SEQUENCE_PANEL_OPEN_KEY,
  writePanelOpenPref,
} from '../lib/panelOpenPref'
import { useEditorStore } from '../state/store'

type DragKind = 'move' | 'start' | 'end'

const SEQUENCE_HINT_KEY = 'motionsketch.sequenceHintDismissed'

/** Display / spinner precision for Start at and Move for (seconds). */
const SEQUENCE_TIME_STEP = 0.01

/**
 * Max height for the expanded Sequence sheet. The toolbar slot is already capped
 * at `100dvh - sheet-top` (header + after-path toast); Sequence shares that flex
 * column with the dock, so cap against the parent — do not subtract another dock
 * estimate or Collapse gets crushed on short viewports.
 */
const SEQUENCE_PANEL_MAX_HEIGHT = 'min(36rem, 100%)'

function formatSec(sec: number): string {
  return sec.toFixed(2)
}

/** Suppress native step/min tooltips; Apply uses our inline validation. */
function suppressNativeInvalid(event: FormEvent<HTMLInputElement>) {
  event.preventDefault()
}

/**
 * Collapsible Sequence panel: when each actor moves on the shared Duration.
 * Local Start at / Move for drafts commit together via Apply or Enter.
 */
export function ClipTimeline() {
  const actors = useEditorStore((s) => s.project.actors)
  const selectedActorId = useEditorStore((s) => s.selectedActorId)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const mode = useEditorStore((s) => s.mode)
  const selectActor = useEditorStore((s) => s.selectActor)
  const beginClipGesture = useEditorStore((s) => s.beginClipGesture)
  const previewActorClip = useEditorStore((s) => s.previewActorClip)
  const finishClipGesture = useEditorStore((s) => s.finishClipGesture)
  const commitActorClip = useEditorStore((s) => s.commitActorClip)

  // Fresh workspace: collapsed. Explicit toggles persist for this tab.
  const [open, setOpen] = useState(() =>
    readPanelOpenPref(SEQUENCE_PANEL_OPEN_KEY, false),
  )
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SEQUENCE_HINT_KEY) === '1'
    } catch {
      return false
    }
  })

  const busy =
    mode === 'recording' || mode === 'armed' || mode === 'editing'
  const hasAnyRecording = actors.some((a) => !!a.recording)
  const selected = actors.find((a) => a.id === selectedActorId) ?? actors[0]
  const durationSec = durationMs / 1000
  const selectedSecs = selected
    ? clipToSeconds(selected.clip, durationMs)
    : { startSec: 0, endSec: 0 }
  const selectedMoveFor = selectedSecs.endSec - selectedSecs.startSec
  const startFieldId = useId()
  const moveForFieldId = useId()
  const draftHelpId = useId()
  const draftErrorId = useId()

  const dragRef = useRef<{
    id: string
    kind: DragKind
    originX: number
    trackWidth: number
    baseline: ActorClip
  } | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)

  // Local Start at / Move for draft — commit only via Apply or Enter (not blur).
  const [startDraft, setStartDraft] = useState('0.00')
  const [moveForDraft, setMoveForDraft] = useState('0.00')
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const draftActorIdRef = useRef<string | null>(null)

  const syncDraftFromCommitted = useCallback(() => {
    setStartDraft(formatSec(selectedSecs.startSec))
    setMoveForDraft(formatSec(selectedMoveFor))
    setDraftDirty(false)
    setDraftError(null)
  }, [selectedSecs.startSec, selectedMoveFor])

  // Actor switch: discard any uncommitted draft (never apply to the new actor).
  useEffect(() => {
    if (!selected) return
    if (draftActorIdRef.current === selected.id) return
    draftActorIdRef.current = selected.id
    syncDraftFromCommitted()
  }, [selected?.id, syncDraftFromCommitted])

  // Keep drafts aligned with committed clip while the user is not editing.
  useEffect(() => {
    if (!selected || draftDirty) return
    if (draftActorIdRef.current !== selected.id) return
    setStartDraft(formatSec(selectedSecs.startSec))
    setMoveForDraft(formatSec(selectedMoveFor))
  }, [
    selected?.id,
    selectedSecs.startSec,
    selectedMoveFor,
    draftDirty,
  ])

  const draftEndsAt = (() => {
    const start = Number(startDraft)
    const moveFor = Number(moveForDraft)
    if (!Number.isFinite(start) || !Number.isFinite(moveFor)) return null
    return start + moveFor
  })()

  const dismissHint = () => {
    setHintDismissed(true)
    try {
      sessionStorage.setItem(SEQUENCE_HINT_KEY, '1')
    } catch {
      // ignore quota / private mode
    }
  }

  const onPointerDownClip = (
    actorId: string,
    kind: DragKind,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (busy) return
    event.preventDefault()
    event.stopPropagation()
    const track = (event.currentTarget.closest('[data-clip-track]') ||
      event.currentTarget) as HTMLElement
    const rect = track.getBoundingClientRect()
    const actor = actors.find((a) => a.id === actorId)
    if (!actor || rect.width <= 0) return
    beginClipGesture(actorId)
    dragRef.current = {
      id: actorId,
      kind,
      originX: event.clientX,
      trackWidth: rect.width,
      baseline: cloneClip(actor.clip),
    }
    setActiveDragId(actorId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMoveClip = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    const deltaNorm = (event.clientX - drag.originX) / drag.trackWidth
    let next = drag.baseline
    if (drag.kind === 'move') {
      next = moveClip(drag.baseline, deltaNorm)
    } else if (drag.kind === 'start') {
      next = resizeClipStart(drag.baseline, drag.baseline.start + deltaNorm)
    } else {
      next = resizeClipEnd(drag.baseline, drag.baseline.end + deltaNorm)
    }
    previewActorClip(drag.id, next)
  }

  const onPointerUpClip = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    setActiveDragId(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // already released
    }
    const actor = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === drag.id)
    if (actor) finishClipGesture(drag.id, actor.clip)
  }

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
    commitActorClip(
      selected.id,
      clipFromSeconds(
        parsed.startSec,
        parsed.endSec,
        durationMs,
        selected.clip,
      ),
    )
    setStartDraft(formatSec(parsed.startSec))
    setMoveForDraft(formatSec(parsed.endSec - parsed.startSec))
    setDraftDirty(false)
    setDraftError(null)
    return true
  }, [selected, busy, startDraft, moveForDraft, durationMs, commitActorClip])

  const restoreDraft = useCallback(() => {
    syncDraftFromCommitted()
  }, [syncDraftFromCommitted])

  const commitVisibility = (
    patch: Partial<Pick<ActorClip, 'hideBeforeStart' | 'hideAfterEnd'>>,
  ) => {
    if (!selected || busy) return
    commitActorClip(selected.id, clampClip({ ...selected.clip, ...patch }))
  }

  const nudgeSelected = (deltaStart: number, deltaEnd: number) => {
    if (!selected || busy) return
    const span = durationMs / 1000
    const secs = clipToSeconds(selected.clip, durationMs)
    const parsed = validateClipSecondsDraft(
      secs.startSec + deltaStart * span,
      secs.endSec + deltaEnd * span,
      durationMs,
    )
    if (!parsed.ok) return
    commitActorClip(
      selected.id,
      clipFromSeconds(
        parsed.startSec,
        parsed.endSec,
        durationMs,
        selected.clip,
      ),
    )
  }

  const onRowKeyDown = (actorId: string, event: KeyboardEvent<HTMLElement>) => {
    if (busy) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectActor(actorId)
      return
    }
    if (actorId !== selectedActorId) return
    const step = event.shiftKey ? 0.02 : 0.005
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      nudgeSelected(-step, -step)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      nudgeSelected(step, step)
    } else if (event.key === '[') {
      event.preventDefault()
      nudgeSelected(step, 0)
    } else if (event.key === ']') {
      event.preventDefault()
      nudgeSelected(0, -step)
    } else if (event.key === '{') {
      event.preventDefault()
      nudgeSelected(-step, 0)
    } else if (event.key === '}') {
      event.preventDefault()
      nudgeSelected(0, step)
    }
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyDraft()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      restoreDraft()
    }
  }

  const markDraft = (start: string, moveFor: string) => {
    setStartDraft(start)
    setMoveForDraft(moveFor)
    setDraftDirty(true)
    setDraftError(null)
  }

  if (!hasAnyRecording || !selected) return null

  const draftDescribedBy = [draftHelpId, draftError ? draftErrorId : null]
    .filter(Boolean)
    .join(' ')

  const rulerTicks = [0, 0.5, 1] as const

  const setOpenPref = (next: boolean) => {
    setOpen(next)
    writePanelOpenPref(SEQUENCE_PANEL_OPEN_KEY, next)
  }

  if (!open) {
    return (
      <div
        data-testid="clip-timeline"
        data-sequence-open="false"
        className="pointer-events-auto flex w-full justify-center"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          data-testid="btn-toggle-clip-timeline"
          aria-expanded={false}
          aria-controls="sequence-panel-body"
          onClick={() => setOpenPref(true)}
          className="inline-flex h-8 min-h-8 items-center gap-1.5 rounded-xl border border-slate-900/[0.08] bg-white/85 px-2.5 text-xs font-medium text-slate-700 shadow-[var(--ms-shadow-sm)] backdrop-blur-xl transition hover:bg-white"
        >
          <span>Sequence</span>
          <span className="sr-only">Expand</span>
          <span aria-hidden className="text-slate-400">
            ▸
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="clip-timeline"
      data-sequence-open="true"
      // min-h-10 keeps the Collapse row fully inside the panel. overflow-clip
      // (not hidden) blocks scrollIntoView from shifting the header out of the
      // clip — otherwise hits fall through to the stage canvas underneath.
      className="pointer-events-auto relative z-[1] flex w-full min-h-10 max-h-full flex-1 flex-col overflow-clip rounded-xl border border-slate-900/[0.08] bg-white/90 shadow-[var(--ms-shadow)] backdrop-blur-xl"
      style={{ maxHeight: SEQUENCE_PANEL_MAX_HEIGHT }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        data-testid="sequence-header"
        className="relative z-[1] flex shrink-0 items-stretch border-b border-slate-900/[0.05] bg-white/90"
      >
        <button
          type="button"
          data-testid="btn-toggle-clip-timeline"
          aria-expanded={true}
          aria-controls="sequence-panel-body"
          onClick={() => setOpenPref(false)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-1.5 text-left text-sm font-semibold tracking-tight text-slate-800"
        >
          <span>Sequence</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500">
            <span data-testid="sequence-collapse-label">Collapse</span>
            <span aria-hidden className="text-slate-400">
              ▾
            </span>
          </span>
        </button>
      </div>

      <div
          id="sequence-panel-body"
          data-testid="sequence-panel-body"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2.5 pb-2.5 pt-2"
        >
          <p
            data-testid="clip-timeline-help"
            className="text-xs text-slate-600"
          >
            Choose when each actor moves.
          </p>

          {!hintDismissed && (
            <div
              data-testid="sequence-first-use-hint"
              className="flex items-start gap-2 rounded-lg border border-teal-200/80 bg-teal-50/90 px-2.5 py-1.5 text-xs text-teal-950"
            >
              <p className="min-w-0 flex-1 leading-snug">
                Drag a bar to change its start. Drag an edge to change its
                duration.
              </p>
              <button
                type="button"
                data-testid="btn-dismiss-sequence-hint"
                aria-label="Dismiss sequence hint"
                onClick={dismissHint}
                className="shrink-0 rounded px-1.5 py-0.5 font-medium text-teal-900 hover:bg-teal-100"
              >
                ✕
              </button>
            </div>
          )}

          <div
            data-testid="sequence-ruler"
            className="relative mx-1 h-4 text-[11px] tabular-nums text-slate-500"
            aria-hidden
          >
            {rulerTicks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2"
                style={{ left: `${t * 100}%` }}
              >
                {formatSec(t * durationSec)}s
              </span>
            ))}
          </div>

          <div
            data-testid="clip-timeline-rows"
            className="space-y-1.5"
            role="list"
            aria-label="Actor sequence"
          >
            {actors.map((actor) => {
              const selectedRow = actor.id === selectedActorId
              const clip = clampClip(actor.clip)
              const left = clip.start * 100
              const width = (clip.end - clip.start) * 100
              const startSec = clip.start * durationSec
              const endSec = clip.end * durationSec
              const showTimes =
                selectedRow ||
                focusedRowId === actor.id ||
                activeDragId === actor.id
              const stationary = !actor.recording
              return (
                <div
                  key={actor.id}
                  role="listitem"
                  data-testid={`clip-row-${actor.id}`}
                  data-selected={selectedRow ? 'true' : 'false'}
                  data-stationary={stationary ? 'true' : 'false'}
                  tabIndex={0}
                  onClick={() => selectActor(actor.id)}
                  onFocus={() => setFocusedRowId(actor.id)}
                  onBlur={() =>
                    setFocusedRowId((id) => (id === actor.id ? null : id))
                  }
                  onKeyDown={(e) => onRowKeyDown(actor.id, e)}
                  className={`rounded-lg px-1.5 py-1 ${
                    selectedRow ? 'bg-slate-900/5 ring-1 ring-slate-300' : ''
                  }`}
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="min-w-0 truncate font-medium text-slate-800">
                      {actor.name}
                      {stationary && (
                        <span
                          data-testid={`sequence-stationary-${actor.id}`}
                          className="ml-1.5 font-normal text-slate-500"
                        >
                          Stationary
                        </span>
                      )}
                    </span>
                    {showTimes && (
                      <span
                        data-testid={`sequence-interval-${actor.id}`}
                        className="shrink-0 tabular-nums text-slate-600"
                      >
                        {formatSec(startSec)}s–{formatSec(endSec)}s
                      </span>
                    )}
                  </div>
                  <div
                    data-clip-track
                    data-testid={`clip-track-${actor.id}`}
                    className="relative h-6 w-full rounded-md bg-slate-100"
                  >
                    <div
                      className="absolute inset-y-0 w-px bg-teal-600/70"
                      style={{ left: `${playbackHead * 100}%` }}
                      aria-hidden
                    />
                    <div
                      data-testid={`clip-bar-${actor.id}`}
                      title={
                        stationary
                          ? 'Stationary — no recorded movement'
                          : 'Drag to change start time'
                      }
                      className={`absolute top-0.5 bottom-0.5 touch-none rounded ${
                        selectedRow ? 'bg-teal-600' : 'bg-slate-400'
                      } ${stationary ? 'opacity-70' : ''}`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      onPointerDown={(e) =>
                        onPointerDownClip(actor.id, 'move', e)
                      }
                      onPointerMove={onPointerMoveClip}
                      onPointerUp={onPointerUpClip}
                      onPointerCancel={onPointerUpClip}
                    >
                      <button
                        type="button"
                        data-testid={`clip-handle-start-${actor.id}`}
                        aria-label={`Change how long ${actor.name} moves (start edge)`}
                        disabled={busy}
                        title="Drag edge to change duration"
                        className="absolute inset-y-0 left-0 w-3.5 cursor-ew-resize touch-none rounded-l bg-black/25 sm:w-3"
                        onPointerDown={(e) =>
                          onPointerDownClip(actor.id, 'start', e)
                        }
                        onPointerMove={onPointerMoveClip}
                        onPointerUp={onPointerUpClip}
                        onPointerCancel={onPointerUpClip}
                      />
                      <button
                        type="button"
                        data-testid={`clip-handle-end-${actor.id}`}
                        aria-label={`Change how long ${actor.name} moves (end edge)`}
                        disabled={busy}
                        title="Drag edge to change duration"
                        className="absolute inset-y-0 right-0 w-3.5 cursor-ew-resize touch-none rounded-r bg-black/25 sm:w-3"
                        onPointerDown={(e) =>
                          onPointerDownClip(actor.id, 'end', e)
                        }
                        onPointerMove={onPointerMoveClip}
                        onPointerUp={onPointerUpClip}
                        onPointerCancel={onPointerUpClip}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <p
            data-testid="sequence-gesture-help"
            className="text-xs leading-snug text-slate-500"
          >
            Moving a bar changes its start. Resizing an edge changes Move for —
            it does not trim the recording. Arrows nudge; [ ] resize.
          </p>

          {selected && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-xs text-slate-500">Start at</span>
                  <input
                    id={startFieldId}
                    data-testid="clip-start-input"
                    type="number"
                    inputMode="decimal"
                    step={SEQUENCE_TIME_STEP}
                    min={0}
                    max={durationSec}
                    disabled={busy}
                    value={startDraft}
                    aria-invalid={draftError ? true : undefined}
                    aria-describedby={draftDescribedBy}
                    onChange={(e) => markDraft(e.target.value, moveForDraft)}
                    onKeyDown={onDraftKeyDown}
                    onInvalid={suppressNativeInvalid}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
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
                    max={durationSec}
                    disabled={busy}
                    value={moveForDraft}
                    aria-invalid={draftError ? true : undefined}
                    aria-describedby={draftDescribedBy}
                    onChange={(e) => markDraft(startDraft, e.target.value)}
                    onKeyDown={onDraftKeyDown}
                    onInvalid={suppressNativeInvalid}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
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

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="btn-apply-clip-times"
                  disabled={busy || !draftDirty}
                  onClick={() => applyDraft()}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  Apply
                </button>
                <p
                  id={draftHelpId}
                  data-testid="clip-times-help"
                  className="text-xs leading-snug text-slate-500"
                >
                  Apply or Enter commits Start at and Move for together. Escape
                  restores committed values.
                </p>
              </div>

              {draftError && (
                <p
                  id={draftErrorId}
                  data-testid="clip-times-error"
                  role="alert"
                  className="text-xs font-medium text-amber-900"
                >
                  {draftError}
                </p>
              )}

              <fieldset
                data-testid="clip-visibility-options"
                className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2"
                disabled={busy}
              >
                <legend className="px-0.5 text-xs font-medium text-slate-600">
                  Before and after
                </legend>

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
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-slate-400 has-[:checked]:bg-slate-100">
                      <input
                        type="radio"
                        name={`before-${selected.id}`}
                        data-testid="clip-show-before"
                        className="accent-teal-700"
                        checked={!selected.clip.hideBeforeStart}
                        disabled={busy}
                        onChange={() =>
                          commitVisibility({ hideBeforeStart: false })
                        }
                      />
                      Show starting pose
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-slate-400 has-[:checked]:bg-slate-100">
                      <input
                        type="radio"
                        name={`before-${selected.id}`}
                        data-testid="clip-hide-before"
                        className="accent-teal-700"
                        checked={!!selected.clip.hideBeforeStart}
                        disabled={busy}
                        onChange={() =>
                          commitVisibility({ hideBeforeStart: true })
                        }
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
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-slate-400 has-[:checked]:bg-slate-100">
                      <input
                        type="radio"
                        name={`after-${selected.id}`}
                        data-testid="clip-hold-after"
                        className="accent-teal-700"
                        checked={!selected.clip.hideAfterEnd}
                        disabled={busy}
                        onChange={() =>
                          commitVisibility({ hideAfterEnd: false })
                        }
                      />
                      Hold final pose
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 has-[:checked]:border-slate-400 has-[:checked]:bg-slate-100">
                      <input
                        type="radio"
                        name={`after-${selected.id}`}
                        data-testid="clip-hide-after"
                        className="accent-teal-700"
                        checked={!!selected.clip.hideAfterEnd}
                        disabled={busy}
                        onChange={() =>
                          commitVisibility({ hideAfterEnd: true })
                        }
                      />
                      Hide
                    </label>
                  </div>
                </div>

                {!isActorVisibleAt(playbackHead, selected.clip) && (
                  <p
                    data-testid="clip-hidden-now-hint"
                    className="text-xs font-medium text-amber-800"
                  >
                    Hidden at the current time.
                  </p>
                )}
              </fieldset>
            </div>
          )}
        </div>
    </div>
  )
}
