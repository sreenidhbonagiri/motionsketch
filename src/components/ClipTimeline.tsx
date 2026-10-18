import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  MIN_CLIP_SPAN,
  clampClip,
  cloneClip,
  clipFromSeconds,
  clipToSeconds,
  isActorVisibleAt,
  moveClip,
  resizeClipEnd,
  resizeClipStart,
} from '../core/clip'
import type { ActorClip } from '../core/types'
import { useEditorStore } from '../state/store'

type DragKind = 'move' | 'start' | 'end'

/**
 * Collapsible per-actor clip rows on the shared project timeline.
 * Timing controls when each actor moves; optional visibility hides outside the clip.
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

  // Collapsed by default so the dock stays reachable; expand on demand.
  const [open, setOpen] = useState(false)

  const busy =
    mode === 'recording' || mode === 'armed' || mode === 'editing'
  const hasAnyRecording = actors.some((a) => !!a.recording)
  const selected = actors.find((a) => a.id === selectedActorId) ?? actors[0]
  const selectedSecs = selected
    ? clipToSeconds(selected.clip, durationMs)
    : { startSec: 0, endSec: 0 }
  const startFieldId = useId()
  const endFieldId = useId()

  const dragRef = useRef<{
    id: string
    kind: DragKind
    originX: number
    trackWidth: number
    baseline: ActorClip
  } | null>(null)

  // Draft numeric fields follow selection; commit on blur/Enter.
  const [startDraft, setStartDraft] = useState('0.00')
  const [endDraft, setEndDraft] = useState('0.00')
  useEffect(() => {
    if (!selected) return
    setStartDraft(selectedSecs.startSec.toFixed(2))
    setEndDraft(selectedSecs.endSec.toFixed(2))
  }, [selected?.id, selectedSecs.startSec, selectedSecs.endSec])

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

  const commitSeconds = useCallback(
    (startSec: number, endSec: number) => {
      if (!selected || busy) return
      commitActorClip(
        selected.id,
        clipFromSeconds(startSec, endSec, durationMs, selected.clip),
      )
    },
    [selected, busy, commitActorClip, durationMs],
  )

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
    commitSeconds(secs.startSec + deltaStart * span, secs.endSec + deltaEnd * span)
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

  if (!hasAnyRecording || !selected) return null

  return (
    <div
      data-testid="clip-timeline"
      className="pointer-events-auto w-full rounded-2xl border border-white/80 bg-white/92 shadow-[0_12px_36px_rgba(15,23,42,0.12)] backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="btn-toggle-clip-timeline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800"
      >
        <span>Clips</span>
        <span aria-hidden className="text-slate-400">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 px-2.5 pb-2.5 pt-2">
          <p
            data-testid="clip-timeline-help"
            className="text-[10px] leading-relaxed text-slate-500"
          >
            Timing controls when each actor moves on the shared timeline.
            Outside its clip the actor holds its first or last pose unless you
            hide it below. Minimum clip length is{' '}
            {Math.round(MIN_CLIP_SPAN * 100)}% of the project. Arrow keys nudge
            the selected clip; [ ] resize ends.
          </p>

          <div
            data-testid="clip-timeline-rows"
            className="max-h-40 space-y-1.5 overflow-auto"
            role="list"
            aria-label="Actor clips"
          >
            {actors.map((actor) => {
              const selectedRow = actor.id === selectedActorId
              const clip = clampClip(actor.clip)
              const left = clip.start * 100
              const width = (clip.end - clip.start) * 100
              return (
                <div
                  key={actor.id}
                  role="listitem"
                  data-testid={`clip-row-${actor.id}`}
                  data-selected={selectedRow ? 'true' : 'false'}
                  tabIndex={0}
                  onClick={() => selectActor(actor.id)}
                  onKeyDown={(e) => onRowKeyDown(actor.id, e)}
                  className={`rounded-lg px-1.5 py-1 ${
                    selectedRow ? 'bg-slate-900/5 ring-1 ring-slate-300' : ''
                  }`}
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span className="min-w-0 truncate font-medium text-slate-800">
                      {actor.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {(clip.start * (durationMs / 1000)).toFixed(2)}s–
                      {(clip.end * (durationMs / 1000)).toFixed(2)}s
                    </span>
                  </div>
                  <div
                    data-clip-track
                    data-testid={`clip-track-${actor.id}`}
                    className="relative h-5 w-full rounded-md bg-slate-100"
                  >
                    <div
                      className="absolute inset-y-0 w-px bg-teal-600/70"
                      style={{ left: `${playbackHead * 100}%` }}
                      aria-hidden
                    />
                    <div
                      data-testid={`clip-bar-${actor.id}`}
                      className={`absolute top-0.5 bottom-0.5 rounded ${
                        selectedRow ? 'bg-teal-600' : 'bg-slate-400'
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      onPointerDown={(e) => onPointerDownClip(actor.id, 'move', e)}
                      onPointerMove={onPointerMoveClip}
                      onPointerUp={onPointerUpClip}
                      onPointerCancel={onPointerUpClip}
                    >
                      <button
                        type="button"
                        data-testid={`clip-handle-start-${actor.id}`}
                        aria-label={`Resize start of ${actor.name}`}
                        disabled={busy}
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-black/20"
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
                        aria-label={`Resize end of ${actor.name}`}
                        disabled={busy}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-black/20"
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

          {selected && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[11px] text-slate-500">Start (s)</span>
                  <input
                    id={startFieldId}
                    data-testid="clip-start-input"
                    type="number"
                    inputMode="decimal"
                    step={0.05}
                    min={0}
                    max={durationMs / 1000}
                    disabled={busy}
                    value={startDraft}
                    onChange={(e) => setStartDraft(e.target.value)}
                    onBlur={() => {
                      const start = Number(startDraft)
                      const end = Number(endDraft)
                      if (!Number.isFinite(start) || !Number.isFinite(end)) {
                        setStartDraft(selectedSecs.startSec.toFixed(2))
                        setEndDraft(selectedSecs.endSec.toFixed(2))
                        return
                      }
                      commitSeconds(start, end)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[11px] text-slate-500">End (s)</span>
                  <input
                    id={endFieldId}
                    data-testid="clip-end-input"
                    type="number"
                    inputMode="decimal"
                    step={0.05}
                    min={0}
                    max={durationMs / 1000}
                    disabled={busy}
                    value={endDraft}
                    onChange={(e) => setEndDraft(e.target.value)}
                    onBlur={() => {
                      const start = Number(startDraft)
                      const end = Number(endDraft)
                      if (!Number.isFinite(start) || !Number.isFinite(end)) {
                        setStartDraft(selectedSecs.startSec.toFixed(2))
                        setEndDraft(selectedSecs.endSec.toFixed(2))
                        return
                      }
                      commitSeconds(start, end)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
                  />
                </label>
              </div>

              <fieldset
                data-testid="clip-visibility-options"
                className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2"
                disabled={busy}
              >
                <legend className="px-0.5 text-[11px] font-medium text-slate-600">
                  Visibility
                </legend>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Off by default (holds the first/last pose). Hide-before hides
                  until the start time (visible at start). Hide-after hides from
                  the end time onward (hidden at end).
                </p>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    data-testid="clip-hide-before"
                    className="mt-0.5"
                    checked={!!selected.clip.hideBeforeStart}
                    disabled={busy}
                    onChange={(e) =>
                      commitVisibility({ hideBeforeStart: e.target.checked })
                    }
                  />
                  <span>Hide before clip starts</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    data-testid="clip-hide-after"
                    className="mt-0.5"
                    checked={!!selected.clip.hideAfterEnd}
                    disabled={busy}
                    onChange={(e) =>
                      commitVisibility({ hideAfterEnd: e.target.checked })
                    }
                  />
                  <span>Hide after clip ends</span>
                </label>
                {!isActorVisibleAt(playbackHead, selected.clip) && (
                  <p
                    data-testid="clip-hidden-now-hint"
                    className="text-[10px] font-medium text-amber-800"
                  >
                    Hidden at the current time.
                  </p>
                )}
              </fieldset>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
