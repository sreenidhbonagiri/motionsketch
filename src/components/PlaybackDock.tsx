import { localToProject } from '../core/clip'
import { isEndpointHandle, MAX_PATH_HANDLES } from '../core/edit'
import { traversalElapsedMs } from '../core/playback'
import { useConfirm } from '../hooks/useConfirm'
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
  const pathAddMode = useEditorStore((s) => s.pathAddMode)
  const setPathAddMode = useEditorStore((s) => s.setPathAddMode)
  const removeSelectedPathHandle = useEditorStore(
    (s) => s.removeSelectedPathHandle,
  )
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)
  const editSession = useEditorStore((s) => s.editSession)
  const addPathHandleAt = useEditorStore((s) => s.addPathHandleAt)
  const pathAddCandidateIndex = useEditorStore((s) => s.pathAddCandidateIndex)
  const confirm = useConfirm()

  const isRecordingLike = mode === 'armed' || mode === 'recording'
  const editing = mode === 'editing'
  const canRemoveHandle =
    editing &&
    selectedHandleIndex !== null &&
    editSession !== null &&
    !isEndpointHandle(editSession.samples.length, selectedHandleIndex)
  const handleCount = editSession?.handleIndices.length ?? 0
  const canAddMoreHandles = handleCount < MAX_PATH_HANDLES
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
  if (editing) {
    if (pathAddMode) {
      dockStatus =
        'Add point: the ghost sits on the sample that will become the handle. Click near the path, or use ←/→ then Enter / Place here. Shape stays until you drag.'
    } else {
      dockStatus = `Drag to reshape · [ ] cycle points · arrows nudge · Delete removes an interior handle (shape stays) · Add point for local control. ${handleCount} of ${MAX_PATH_HANDLES} handles.`
    }
  } else if (mode === 'armed') {
    dockStatus =
      'Ready — drag the actor to capture motion. Cancel exits without saving a take.'
  } else if (mode === 'recording') {
    dockStatus = 'Recording… release the pointer to finish, or press Stop.'
  } else if (hasAnyRecording && !hasRecording) {
    dockStatus = `“${actorLabel}” has no path yet. Record for this actor to edit or reset its take. Play still uses other actors’ takes.`
  } else if (mode === 'playing') {
    dockStatus = 'Pause before editing the path.'
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
              data-testid="btn-path-add-mode"
              onClick={() => setPathAddMode(!pathAddMode)}
              disabled={!canAddMoreHandles}
              aria-pressed={pathAddMode}
              aria-describedby="path-add-help"
              title={
                canAddMoreHandles
                  ? `Add a handle (${handleCount} of ${MAX_PATH_HANDLES})`
                  : `Handle limit reached (${MAX_PATH_HANDLES}). Remove a handle first.`
              }
              className={
                pathAddMode
                  ? 'rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800'
                  : btnSecondary
              }
            >
              {pathAddMode ? 'Adding point…' : 'Add point'}
            </button>
            <button
              type="button"
              data-testid="btn-path-add-confirm"
              onClick={() => {
                const idx =
                  pathAddCandidateIndex ??
                  (editSession
                    ? Math.floor(editSession.samples.length / 2)
                    : null)
                if (idx === null) return
                addPathHandleAt(idx)
              }}
              disabled={!pathAddMode || pathAddCandidateIndex === null}
              className={btnSecondary}
            >
              Place here
            </button>
            <button
              type="button"
              data-testid="btn-path-remove-handle"
              onClick={() => removeSelectedPathHandle()}
              disabled={!canRemoveHandle}
              aria-describedby="path-remove-help"
              title={
                canRemoveHandle
                  ? 'Remove the selected interior handle (path shape stays)'
                  : selectedHandleIndex !== null &&
                      editSession &&
                      isEndpointHandle(
                        editSession.samples.length,
                        selectedHandleIndex,
                      )
                    ? 'Start and end points can’t be removed'
                    : 'Select an interior handle to remove'
              }
              className={btnQuiet}
            >
              Remove handle
            </button>
            <button
              type="button"
              data-testid="btn-restore-path"
              onClick={restoreRecordedPath}
              className={btnQuiet}
            >
              Restore recorded path
            </button>
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
                  void (async () => {
                    if (recording) {
                      const label = selectedActor?.name ?? 'this actor'
                      const ok = await confirm({
                        title: `Re-record “${label}”?`,
                        body: 'This replaces only that actor’s path and transform keyframes. Shared Duration stays the same.',
                        confirmLabel: 'Replace recording',
                        testId: 'rerecord-confirm',
                        confirmTestId: 'btn-rerecord-confirm',
                        cancelTestId: 'btn-rerecord-cancel',
                        bodyTestId: 'rerecord-confirm-copy',
                      })
                      if (!ok) return
                    }
                    setPlaybackHead(0)
                    armRecording()
                  })()
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
                void (async () => {
                  if (recording) {
                    const label = selectedActor?.name ?? 'this actor'
                    const ok = await confirm({
                      title: `Reset “${label}”?`,
                      body: 'Clears that actor’s path, path edits, and transform — not other actors.',
                      confirmLabel: 'Reset actor',
                      danger: true,
                      testId: 'reset-actor-confirm',
                      confirmTestId: 'btn-reset-actor-confirm',
                      cancelTestId: 'btn-reset-actor-cancel',
                      bodyTestId: 'reset-actor-confirm-copy',
                    })
                    if (!ok) return
                  }
                  resetRecording()
                })()
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
      {editing && (
        <>
          <p id="path-add-help" className="sr-only">
            Toggle Add point mode. The dashed ghost marks the exact sample that
            will become the handle. Click near the path or move the candidate with
            arrow keys and confirm with Place here or Enter. Maximum{' '}
            {MAX_PATH_HANDLES} handles. Currently {handleCount} of{' '}
            {MAX_PATH_HANDLES}.
          </p>
          <p id="path-remove-help" className="sr-only">
            Remove the selected interior handle. The path geometry and timestamps
            stay the same; only the editing control is removed. Start and end
            points cannot be removed — they keep the path anchored.
          </p>
          <p
            data-testid="handle-selection-status"
            className="sr-only"
            aria-live="polite"
          >
            {editing &&
            selectedHandleIndex !== null &&
            editSession &&
            editSession.handleIndices.includes(selectedHandleIndex)
              ? `Point ${editSession.handleIndices.indexOf(selectedHandleIndex) + 1} of ${editSession.handleIndices.length}${
                  isEndpointHandle(
                    editSession.samples.length,
                    selectedHandleIndex,
                  )
                    ? ' (endpoint)'
                    : ''
                }`
              : ''}
          </p>
        </>
      )}
    </div>
  )
}
