import { localToProject } from '../core/clip'
import { traversalElapsedMs } from '../core/playback'
import { stopFromUi } from '../lib/recordingController'
import { useEditorStore } from '../state/store'

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

const btnPrimary =
  'rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40'
const btnSecondary =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40'
const btnQuiet =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40'

export function PlaybackDock() {
  const mode = useEditorStore((s) => s.mode)
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const recording = selectedActor?.recording ?? null
  const actorClip = selectedActor?.clip ?? { start: 0, end: 1 }
  const hasAnyRecording = useEditorStore((s) =>
    s.project.actors.some((a) => !!a.recording),
  )
  const transformKeys = selectedActor?.transform.keyframes ?? []
  const selectedTransformId = useEditorStore((s) => s.selectedTransformId)
  const actorEditOrder = useEditorStore((s) => s.actorEditOrder)
  const actorEditRedoOrder = useEditorStore((s) => s.actorEditRedoOrder)
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const undoStack = useEditorStore((s) => s.undoStack)
  const redoStack = useEditorStore((s) => s.redoStack)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const loop = useEditorStore((s) => s.project.playback.loop)
  const loopMode = useEditorStore((s) => s.project.playback.loopMode)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const playbackDirection = useEditorStore((s) => s.playbackDirection)
  const scrubPlayback = useEditorStore((s) => s.scrubPlayback)
  const armRecording = useEditorStore((s) => s.armRecording)
  const play = useEditorStore((s) => s.play)
  const pause = useEditorStore((s) => s.pause)
  const restartPlayback = useEditorStore((s) => s.restartPlayback)
  const resetRecording = useEditorStore((s) => s.resetRecording)
  const setPlaybackHead = useEditorStore((s) => s.setPlaybackHead)
  const enterEditMode = useEditorStore((s) => s.enterEditMode)
  const exitEditMode = useEditorStore((s) => s.exitEditMode)
  const restoreRecordedPath = useEditorStore((s) => s.restoreRecordedPath)
  const undoEdit = useEditorStore((s) => s.undoEdit)
  const redoEdit = useEditorStore((s) => s.redoEdit)
  const undoActorEdit = useEditorStore((s) => s.undoActorEdit)
  const redoActorEdit = useEditorStore((s) => s.redoActorEdit)
  const selectTransformKeyframe = useEditorStore((s) => s.selectTransformKeyframe)

  const isRecordingLike = mode === 'armed' || mode === 'recording'
  const editing = mode === 'editing'
  const hasRecording = !!recording
  const playbackDisabled = !hasAnyRecording || isRecordingLike
  const editPathDisabled =
    !hasRecording || isRecordingLike || mode === 'playing'
  const resetDisabled = !recording || isRecordingLike
  const dockStatusId = 'dock-status'

  const elapsedMs = traversalElapsedMs(
    playbackHead,
    playbackDirection,
    durationMs,
  )
  const goingBack =
    loop && loopMode === 'alternate' && playbackDirection === -1
  const valueText = goingBack
    ? `${formatSeconds(elapsedMs)} of ${formatSeconds(durationMs)}, backward`
    : `${formatSeconds(elapsedMs)} of ${formatSeconds(durationMs)}`

  const actorLabel = selectedActor?.name?.trim() || 'the selected actor'

  // One contextual status for recording / selected-actor gaps. Empty-board Record
  // guidance stays on the existing stage tip (id=stage-empty-hint).
  let dockStatus: string | null = null
  if (!editing) {
    if (mode === 'armed') {
      dockStatus =
        'Ready — drag the actor to capture motion. Cancel exits without saving a take.'
    } else if (mode === 'recording') {
      dockStatus = 'Recording… release the pointer to finish, or press Stop.'
    } else if (hasAnyRecording && !hasRecording) {
      dockStatus = `“${actorLabel}” has no path yet. Record for this actor to edit or reset its take. Play still uses other actors’ takes.`
    } else if (mode === 'playing') {
      dockStatus = 'Pause before editing the path.'
    }
  }

  const emptyBoardHintId = 'stage-empty-hint'
  const playbackDescribedBy = playbackDisabled
    ? dockStatus
      ? dockStatusId
      : !hasAnyRecording
        ? emptyBoardHintId
        : undefined
    : undefined
  const editDescribedBy = editPathDisabled
    ? dockStatus
      ? dockStatusId
      : !hasAnyRecording
        ? emptyBoardHintId
        : undefined
    : undefined
  const resetDescribedBy = resetDisabled
    ? dockStatus
      ? dockStatusId
      : !hasAnyRecording
        ? emptyBoardHintId
        : undefined
    : undefined

  return (
    <div
      data-testid="playback-dock"
      className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-white/80 bg-white/92 px-3 py-2.5 shadow-[0_12px_36px_rgba(15,23,42,0.12)] backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {hasAnyRecording && !editing && (
        <div
          data-testid="playback-timeline"
          className="flex flex-col gap-1"
        >
          <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-slate-600">
            <span data-testid="playback-elapsed">
              {goingBack
                ? `← ${formatSeconds(elapsedMs)}`
                : formatSeconds(elapsedMs)}
            </span>
            <span data-testid="playback-total">
              {formatSeconds(durationMs)}
            </span>
          </div>
          {transformKeys.length > 0 && (
            <div
              data-testid="transform-markers"
              className="relative h-3 w-full"
              role="list"
              aria-label="Transform keyframes"
            >
              {transformKeys.map((kf) => {
                const selected = kf.id === selectedTransformId
                const projectT = localToProject(kf.t, actorClip)
                return (
                  <button
                    key={kf.id}
                    type="button"
                    role="listitem"
                    data-testid={`transform-marker-${kf.id}`}
                    data-transform-marker
                    data-selected={selected ? 'true' : 'false'}
                    aria-label={`Transform keyframe at ${Math.round(projectT * 100)} percent of the project, ${Math.round(kf.rotationDeg)} degrees, scale ${kf.scale.toFixed(2)}`}
                    aria-pressed={selected}
                    disabled={isRecordingLike}
                    onClick={() => selectTransformKeyframe(kf.id)}
                    className={`absolute top-0 size-3 -translate-x-1/2 rounded-sm border transition disabled:opacity-40 ${
                      selected
                        ? 'border-teal-800 bg-teal-600'
                        : 'border-slate-400 bg-slate-200 hover:bg-teal-200'
                    }`}
                    style={{ left: `${projectT * 100}%` }}
                  />
                )
              })}
            </div>
          )}
          <label className="sr-only" htmlFor="playback-scrubber">
            Playback position along the path (start to end). Scrubbing pauses
            and resumes forward from the chosen point.
          </label>
          <input
            id="playback-scrubber"
            data-testid="playback-scrubber"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={playbackHead}
            disabled={isRecordingLike}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Number(playbackHead.toFixed(3))}
            aria-valuetext={valueText}
            onChange={(e) => {
              selectTransformKeyframe(null)
              scrubPlayback(Number(e.target.value))
            }}
            className="w-full accent-teal-700 disabled:opacity-40"
          />
        </div>
      )}

      <div
        data-testid="toolbar"
        className="flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2"
      >
        {editing ? (
          <>
            <button
              type="button"
              data-testid="btn-done-edit"
              onClick={exitEditMode}
              className={btnPrimary}
            >
              Done
            </button>
            <button
              type="button"
              data-testid="btn-undo-edit"
              onClick={undoEdit}
              disabled={undoStack.length === 0}
              className={btnSecondary}
            >
              Undo
            </button>
            <button
              type="button"
              data-testid="btn-redo-edit"
              onClick={redoEdit}
              disabled={redoStack.length === 0}
              className={btnSecondary}
            >
              Redo
            </button>
            <button
              type="button"
              data-testid="btn-restore-path"
              onClick={restoreRecordedPath}
              className={btnQuiet}
            >
              Restore recorded path
            </button>
            <span className="hidden px-1 text-xs text-slate-500 sm:inline">
              Drag handles · arrows nudge
            </span>
          </>
        ) : (
          <>
            {isRecordingLike ? (
              <button
                type="button"
                data-testid="btn-stop"
                onClick={stopFromUi}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-600"
              >
                {mode === 'armed' ? 'Cancel' : 'Stop'}
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-record"
                onClick={() => {
                  if (recording) {
                    const ok = window.confirm(
                      `Re-record “${selectedActor?.name ?? 'this actor'}”? This replaces only that actor’s path and transform keyframes. Shared Duration stays the same.`,
                    )
                    if (!ok) return
                  }
                  setPlaybackHead(0)
                  armRecording()
                }}
                className={btnPrimary}
              >
                Record
              </button>
            )}

            {mode === 'playing' ? (
              <button
                type="button"
                data-testid="btn-pause"
                onClick={pause}
                className={btnSecondary}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-play"
                onClick={() => play()}
                disabled={playbackDisabled}
                aria-describedby={playbackDescribedBy}
                className={btnSecondary}
              >
                Play
              </button>
            )}

            <button
              type="button"
              data-testid="btn-restart"
              onClick={() => restartPlayback()}
              disabled={playbackDisabled}
              aria-describedby={playbackDescribedBy}
              className={btnSecondary}
            >
              Restart
            </button>

            <button
              type="button"
              data-testid="btn-edit-path"
              onClick={enterEditMode}
              disabled={editPathDisabled}
              aria-describedby={editDescribedBy}
              className={btnSecondary}
            >
              Edit path
            </button>

            <button
              type="button"
              data-testid="btn-undo-transform"
              onClick={() => undoActorEdit()}
              disabled={isRecordingLike || actorEditOrder.length === 0}
              className={btnQuiet}
              title="Undo transform or clip timing for the selected actor"
            >
              Undo
            </button>
            <button
              type="button"
              data-testid="btn-redo-transform"
              onClick={() => redoActorEdit()}
              disabled={isRecordingLike || actorEditRedoOrder.length === 0}
              className={btnQuiet}
              title="Redo transform or clip timing for the selected actor"
            >
              Redo
            </button>

            <button
              type="button"
              data-testid="btn-reset"
              onClick={() => {
                if (
                  recording &&
                  !window.confirm(
                    `Reset “${selectedActor?.name ?? 'this actor'}”? Clears that actor’s path, path edits, and transform — not other actors.`,
                  )
                ) {
                  return
                }
                resetRecording()
              }}
              disabled={resetDisabled}
              aria-describedby={resetDescribedBy}
              className={btnQuiet}
            >
              Reset actor
            </button>

            {geometryEdit && (
              <button
                type="button"
                data-testid="btn-restore-path"
                onClick={restoreRecordedPath}
                className={btnQuiet}
              >
                Restore recorded path
              </button>
            )}
          </>
        )}
      </div>

      {dockStatus && (
        <p
          id={dockStatusId}
          data-testid="dock-status"
          className="text-center text-xs leading-relaxed text-slate-500"
        >
          {dockStatus}
        </p>
      )}
    </div>
  )
}
