import { localToProject } from '../core/clip'
import {
  CONTINUE_PATH_BAKE_NOTE,
  CONTINUE_PATH_HELP,
  continuePathAvailability,
  RESTORE_RECORDED_PATH_HELP,
} from '../core/continuePath'
import {
  isEndpointHandle,
  makeCornerAvailability,
  MAX_PATH_HANDLES,
  smoothBendAvailability,
} from '../core/edit'
import { traversalElapsedMs } from '../core/playback'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { useConfirm } from '../hooks/useConfirm'
import { resolveModeStatus } from '../lib/modeStatus'
import { stopFromUi } from '../lib/recordingController'
import { useEditorStore } from '../state/store'

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

/** Shared control height — filled primary, ghost secondary; icons for support. */
const control =
  'inline-flex h-8 min-h-8 shrink-0 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition disabled:opacity-40'
const btnPrimary = `${control} bg-slate-900 text-white hover:bg-slate-800`
const btnSecondary = `${control} text-slate-700 hover:bg-slate-900/[0.06]`
const btnQuiet = `${control} text-slate-500 hover:bg-slate-900/[0.05]`
/** Secondary to Play, but clearly stronger than disabled Undo/Redo. */
const btnReset = `${control} text-slate-800 hover:bg-slate-900/[0.08] hover:text-slate-950`
const btnIcon =
  'inline-flex h-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-900/[0.06] hover:text-slate-900 disabled:opacity-35'
const surfaceChrome =
  'rounded-xl border border-slate-900/[0.08] bg-white/90 shadow-[var(--ms-shadow)] backdrop-blur-xl'

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
  const armContinuePath = useEditorStore((s) => s.armContinuePath)
  const recordingIntent = useEditorStore((s) => s.recordingIntent)
  const play = useEditorStore((s) => s.play)
  const pause = useEditorStore((s) => s.pause)
  const restartPlayback = useEditorStore((s) => s.restartPlayback)
  const resetRecording = useEditorStore((s) => s.resetRecording)
  const setPlaybackHead = useEditorStore((s) => s.setPlaybackHead)
  const enterEditMode = useEditorStore((s) => s.enterEditMode)
  const exitEditMode = useEditorStore((s) => s.exitEditMode)
  const beginPolishSession = useEditorStore((s) => s.beginPolishSession)
  const beginGlideSession = useEditorStore((s) => s.beginGlideSession)
  const polishSession = useEditorStore((s) => s.polishSession)
  const glideSession = useEditorStore((s) => s.glideSession)
  const presetSession = useEditorStore((s) => s.presetSession)
  const snapToGrid = useEditorStore((s) => s.snapToGrid)
  const setSnapToGrid = useEditorStore((s) => s.setSnapToGrid)
  const restoreRecordedPath = useEditorStore((s) => s.restoreRecordedPath)
  const undoEdit = useEditorStore((s) => s.undoEdit)
  const redoEdit = useEditorStore((s) => s.redoEdit)
  const undoActorEdit = useEditorStore((s) => s.undoActorEdit)
  const redoActorEdit = useEditorStore((s) => s.redoActorEdit)
  const selectTransformKeyframe = useEditorStore((s) => s.selectTransformKeyframe)
  const pathAddMode = useEditorStore((s) => s.pathAddMode)
  const pathTool = useEditorStore((s) => s.pathTool)
  const setPathAddMode = useEditorStore((s) => s.setPathAddMode)
  const setPathTool = useEditorStore((s) => s.setPathTool)
  const removeSelectedPathHandle = useEditorStore(
    (s) => s.removeSelectedPathHandle,
  )
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)
  const editSession = useEditorStore((s) => s.editSession)
  const addPathHandleAt = useEditorStore((s) => s.addPathHandleAt)
  const pathAddCandidateIndex = useEditorStore((s) => s.pathAddCandidateIndex)
  const smoothSelectedBend = useEditorStore((s) => s.smoothSelectedBend)
  const makeSelectedCorner = useEditorStore((s) => s.makeSelectedCorner)
  const stageAspect = useEditorStore((s) => s.project.stageAspect)
  const pathGestureActive = useEditorStore((s) => s.pathGestureActive)
  const confirm = useConfirm()
  const coarsePointer = useCoarsePointer()

  const onRestoreRecordedPath = async () => {
    const ok = await confirm({
      title: 'Restore recorded path?',
      body: RESTORE_RECORDED_PATH_HELP,
      confirmLabel: 'Restore recorded path',
      danger: true,
      testId: 'restore-path-confirm',
      confirmTestId: 'btn-restore-path-confirm',
    })
    if (ok) restoreRecordedPath()
  }

  const isRecordingLike = mode === 'armed' || mode === 'recording'
  const editing = mode === 'editing'
  const canRemoveHandle =
    editing &&
    selectedHandleIndex !== null &&
    editSession !== null &&
    !isEndpointHandle(editSession.samples.length, selectedHandleIndex)
  const handleCount = editSession?.handleIndices.length ?? 0
  const canAddMoreHandles = handleCount < MAX_PATH_HANDLES
  const smoothAvail =
    editing && editSession
      ? smoothBendAvailability(
          editSession.samples,
          editSession.handleIndices,
          selectedHandleIndex,
          stageAspect,
        )
      : { enabled: false, reason: null, message: 'Select an interior handle first.' }
  const cornerAvail =
    editing && editSession
      ? makeCornerAvailability(
          editSession.samples,
          editSession.handleIndices,
          selectedHandleIndex,
          stageAspect,
        )
      : { enabled: false, reason: null, message: 'Select an interior handle first.' }
  const hasRecording = !!recording
  const playbackDisabled =
    (!hasAnyRecording && !presetSession) || isRecordingLike
  const editPathDisabled =
    !hasRecording ||
    isRecordingLike ||
    mode === 'playing' ||
    !!polishSession ||
    !!glideSession ||
    !!presetSession
  const polishDisabled =
    !hasRecording ||
    isRecordingLike ||
    mode === 'playing' ||
    !!polishSession ||
    !!glideSession ||
    !!presetSession ||
    pathGestureActive
  const glideDisabled = polishDisabled
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

  // Compact label + instruction in the dock. Empty-board Record guidance stays on
  // the stage tip (id=stage-empty-hint). Selected-point copy stays in
  // handle-selection-status.
  const continueAvail = continuePathAvailability({
    actor: selectedActor,
    mode,
    polishSession,
    glideSession,
    presetSession,
    pathGestureActive,
  })

  const modeStatus = resolveModeStatus({
    mode,
    pathTool,
    pathAddMode,
    pathGestureActive,
    coarsePointer,
    hasAnyRecording,
    hasSelectedRecording: hasRecording,
    actorLabel,
    recordingIntent,
  })

  const emptyBoardHintId = 'stage-empty-hint'
  const playbackDescribedBy = playbackDisabled
    ? modeStatus
      ? dockStatusId
      : !hasAnyRecording
        ? emptyBoardHintId
        : undefined
    : undefined
  const editDescribedBy = editPathDisabled
    ? modeStatus
      ? dockStatusId
      : !hasAnyRecording
        ? emptyBoardHintId
        : undefined
    : undefined
  const resetDescribedBy = resetDisabled
    ? modeStatus
      ? dockStatusId
      : !hasAnyRecording
        ? emptyBoardHintId
        : undefined
    : undefined

  return (
    <div
      data-testid="playback-dock"
      className={`pointer-events-auto flex w-full max-w-xl shrink-0 flex-col gap-1 ${surfaceChrome} px-2 py-1.5 sm:max-w-2xl sm:px-2.5 sm:py-2`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {hasAnyRecording && !editing && (
        <div
          data-testid="playback-timeline"
          className="flex flex-col gap-0.5"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-slate-500">
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
        className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-1.5"
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
            <div
              data-testid="path-tool-toggle"
              className="flex h-8 items-center rounded-lg bg-slate-900/[0.04] p-0.5"
              role="group"
              aria-label="Path edit tool"
            >
              <button
                type="button"
                data-testid="btn-path-tool-points"
                onClick={() => setPathTool('edit-points')}
                aria-pressed={pathTool === 'edit-points'}
                className={
                  pathTool === 'edit-points'
                    ? 'h-7 rounded-md bg-slate-900 px-2.5 text-sm font-medium text-white'
                    : 'h-7 rounded-md px-2.5 text-sm font-medium text-slate-600 hover:bg-white/70'
                }
              >
                Edit points
              </button>
              <button
                type="button"
                data-testid="btn-path-tool-move"
                onClick={() => {
                  setPathTool('move-path')
                  requestAnimationFrame(() => {
                    document
                      .querySelector<HTMLElement>('[data-testid="path-move-overlay"]')
                      ?.focus()
                  })
                }}
                aria-pressed={pathTool === 'move-path'}
                aria-describedby="path-move-help"
                className={
                  pathTool === 'move-path'
                    ? 'h-7 rounded-md bg-teal-700 px-2.5 text-sm font-medium text-white'
                    : 'h-7 rounded-md px-2.5 text-sm font-medium text-slate-600 hover:bg-white/70'
                }
              >
                Move path
              </button>
            </div>
            <button
              type="button"
              data-testid="btn-path-add-mode"
              onClick={() => setPathAddMode(!pathAddMode)}
              disabled={pathTool === 'move-path' || !canAddMoreHandles}
              aria-pressed={pathAddMode}
              aria-describedby="path-add-help"
              title={
                pathTool === 'move-path'
                  ? 'Switch to Edit points to add handles'
                  : canAddMoreHandles
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
              disabled={
                pathTool === 'move-path' ||
                !pathAddMode ||
                pathAddCandidateIndex === null
              }
              className={btnSecondary}
            >
              Place here
            </button>
            <button
              type="button"
              data-testid="btn-path-remove-handle"
              onClick={() => removeSelectedPathHandle()}
              disabled={pathTool === 'move-path' || !canRemoveHandle}
              aria-describedby="path-remove-help"
              title={
                pathTool === 'move-path'
                  ? 'Switch to Edit points to remove handles'
                  : canRemoveHandle
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
              data-testid="btn-smooth-bend"
              onClick={() => smoothSelectedBend()}
              disabled={pathTool === 'move-path' || !smoothAvail.enabled}
              aria-describedby="path-smooth-help"
              title={
                pathTool === 'move-path'
                  ? 'Switch to Edit points to smooth a bend'
                  : smoothAvail.enabled
                    ? 'Smooth the bend near the selected point (S)'
                    : (smoothAvail.message ?? 'Smooth bend unavailable')
              }
              className={btnSecondary}
            >
              Smooth bend
            </button>
            <button
              type="button"
              data-testid="btn-make-corner"
              onClick={() => makeSelectedCorner()}
              disabled={pathTool === 'move-path' || !cornerAvail.enabled}
              aria-describedby="path-corner-help"
              title={
                pathTool === 'move-path'
                  ? 'Switch to Edit points to sharpen a corner'
                  : cornerAvail.enabled
                    ? 'Sharpen the corner at the selected point (C)'
                    : (cornerAvail.message ?? 'Make corner unavailable')
              }
              className={btnSecondary}
            >
              Make corner
            </button>
            <button
              type="button"
              data-testid="btn-polish-motion"
              onClick={() => beginPolishSession()}
              disabled={polishDisabled || pathTool === 'move-path'}
              title={
                pathTool === 'move-path'
                  ? 'Switch to Edit points to polish motion'
                  : selectedHandleIndex !== null
                    ? 'Preview a gentler path; optional rounding uses the selected point'
                    : 'Preview a gentler path while keeping pauses and corners'
              }
              className={btnSecondary}
            >
              Polish motion
            </button>
            <button
              type="button"
              data-testid="btn-glide"
              onClick={() => beginGlideSession()}
              disabled={glideDisabled || pathTool === 'move-path'}
              title="Softens starts and stops while keeping your path and pauses"
              className={btnSecondary}
            >
              Glide
            </button>
            <button
              type="button"
              data-testid="btn-restore-path"
              onClick={() => {
                void onRestoreRecordedPath()
              }}
              title={RESTORE_RECORDED_PATH_HELP}
              aria-describedby="restore-path-help-edit"
              className={btnQuiet}
            >
              Restore recorded path
            </button>
            <span id="restore-path-help-edit" className="sr-only">
              {RESTORE_RECORDED_PATH_HELP}
            </span>
          </>
        ) : (
          <>
            {isRecordingLike ? (
              <button
                type="button"
                data-testid="btn-stop"
                onClick={stopFromUi}
                aria-label={
                  mode === 'armed' ? 'Cancel record' : 'Stop recording'
                }
                aria-describedby={
                  mode === 'armed' && modeStatus ? dockStatusId : undefined
                }
                className={`${control} bg-red-500 text-white hover:bg-red-600`}
              >
                {mode === 'armed' ? 'Cancel' : 'Stop'}
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-record"
                aria-describedby={
                  !hasAnyRecording ? emptyBoardHintId : undefined
                }
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
                // Empty board: Record is the primary action. After a path exists,
                // Play takes the primary style so preview/export stays front-of-mind.
                className={hasAnyRecording ? btnSecondary : btnPrimary}
              >
                Record
              </button>
            )}

            {hasRecording && !isRecordingLike && (
              <button
                type="button"
                data-testid="btn-continue-path"
                onClick={() => {
                  armContinuePath()
                }}
                disabled={!continueAvail.enabled}
                title={continueAvail.reason ?? CONTINUE_PATH_HELP}
                aria-describedby="continue-path-help"
                className={btnSecondary}
              >
                Continue path
              </button>
            )}

            {mode === 'playing' ? (
              <button
                type="button"
                data-testid="btn-pause"
                onClick={pause}
                className={btnPrimary}
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
                className={hasAnyRecording ? btnPrimary : btnSecondary}
              >
                Play
              </button>
            )}

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
              data-testid="btn-reset"
              onClick={() => {
                void (async () => {
                  if (recording) {
                    const label = selectedActor?.name ?? 'this actor'
                    const ok = await confirm({
                      title: `Reset motion for “${label}”?`,
                      body: 'Clears this actor’s recorded path, path edits, and transform keyframes. Appearance, other actors, and project Duration / Loop stay the same.',
                      confirmLabel: 'Reset motion',
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
              className={btnReset}
            >
              Reset motion
            </button>

            <span
              aria-hidden
              className="mx-0.5 hidden h-4 w-px bg-slate-900/10 sm:inline-block"
            />

            <button
              type="button"
              data-testid="btn-restart"
              onClick={() => restartPlayback()}
              disabled={playbackDisabled}
              aria-label="Restart"
              aria-describedby={playbackDescribedBy}
              title="Restart from the beginning"
              className={btnIcon}
            >
              <span aria-hidden>↻</span>
            </button>

            <button
              type="button"
              data-testid="btn-undo-transform"
              onClick={() => undoActorEdit()}
              disabled={isRecordingLike || actorEditOrder.length === 0}
              className={btnIcon}
              aria-label="Undo"
              title="Undo placement, transform, sequence timing, Glide, continue path, or a motion preset for the selected actor"
            >
              <span aria-hidden>↶</span>
            </button>
            <button
              type="button"
              data-testid="btn-redo-transform"
              onClick={() => redoActorEdit()}
              disabled={isRecordingLike || actorEditRedoOrder.length === 0}
              className={btnIcon}
              aria-label="Redo"
              title="Redo placement, transform, sequence timing, Glide, continue path, or a motion preset for the selected actor"
            >
              <span aria-hidden>↷</span>
            </button>

            <details
              data-testid="refine-motion"
              className="w-full min-w-0 sm:w-auto"
            >
              <summary
                data-testid="refine-motion-summary"
                className={`${control} cursor-pointer list-none gap-1 text-xs text-slate-600 hover:bg-slate-900/[0.05] sm:text-sm [&::-webkit-details-marker]:hidden`}
              >
                <span
                  aria-hidden
                  className="text-slate-400 [[open]_&]:rotate-90"
                >
                  ▸
                </span>
                Refine motion
              </summary>
              <div
                data-testid="refine-motion-tools"
                className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-1 sm:justify-start"
              >
                <button
                  type="button"
                  data-testid="btn-polish-motion"
                  onClick={() => beginPolishSession()}
                  disabled={polishDisabled}
                  title="Preview a gentler path while keeping pauses and corners"
                  className={btnSecondary}
                >
                  Polish motion
                </button>

                <button
                  type="button"
                  data-testid="btn-glide"
                  onClick={() => beginGlideSession()}
                  disabled={glideDisabled}
                  title="Softens starts and stops while keeping your path and pauses"
                  className={btnSecondary}
                >
                  Glide
                </button>

                {!isRecordingLike && (
                  <button
                    type="button"
                    data-testid="snap-to-grid-toggle"
                    aria-pressed={snapToGrid}
                    aria-describedby="snap-to-grid-help"
                    title="Align placement and path edits to the dots. Recording stays freehand."
                    onClick={() => setSnapToGrid(!snapToGrid)}
                    className={
                      snapToGrid ? btnPrimary : btnSecondary
                    }
                  >
                    {snapToGrid ? 'Snap on' : 'Snap to grid'}
                  </button>
                )}

                {geometryEdit && (
                  <>
                    <button
                      type="button"
                      data-testid="btn-restore-path"
                      onClick={() => {
                        void onRestoreRecordedPath()
                      }}
                      title={RESTORE_RECORDED_PATH_HELP}
                      aria-describedby="restore-path-help"
                      className={btnQuiet}
                    >
                      Restore recorded path
                    </button>
                    <span
                      id="restore-path-help"
                      data-testid="restore-path-help"
                      className="basis-full text-xs leading-snug text-slate-500"
                    >
                      {RESTORE_RECORDED_PATH_HELP}
                    </span>
                  </>
                )}
              </div>
            </details>
          </>
        )}

        {editing && !isRecordingLike && (
          <button
            type="button"
            data-testid="snap-to-grid-toggle"
            aria-pressed={snapToGrid}
            aria-describedby="snap-to-grid-help"
            title="Align placement and path edits to the dots. Recording stays freehand."
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={snapToGrid ? btnPrimary : btnSecondary}
          >
            {snapToGrid ? 'Snap on' : 'Snap to grid'}
          </button>
        )}
      </div>

      {hasRecording && !editing && !isRecordingLike && (
        <p
          id="continue-path-help"
          data-testid="continue-path-help"
          className={
            continueAvail.enabled
              ? 'max-w-xl text-center text-[11px] leading-snug text-slate-500'
              : 'sr-only'
          }
        >
          {continueAvail.reason ?? CONTINUE_PATH_BAKE_NOTE}
        </p>
      )}

      {!isRecordingLike && (
        <p
          id="snap-to-grid-help"
          data-testid="snap-to-grid-help"
          className={
            editing
              ? 'max-w-xl text-center text-[11px] leading-snug text-slate-500'
              : 'sr-only'
          }
        >
          Align placement and path edits to the dots. Recording stays freehand.
        </p>
      )}

      {modeStatus && (
        <div
          id={dockStatusId}
          data-testid="dock-status"
          data-mode-status={modeStatus.kind}
          role="status"
          className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs leading-snug"
        >
          {modeStatus.kind === 'recording' ? (
            <span
              data-testid="mode-status-label"
              className="inline-flex items-center gap-1.5 font-semibold text-red-700"
            >
              <span
                aria-hidden="true"
                className="inline-block size-2 shrink-0 rounded-full bg-red-600"
              />
              {modeStatus.label}
            </span>
          ) : modeStatus.kind === 'armed' ? (
            <span
              data-testid="mode-status-label"
              className="font-semibold text-slate-700"
            >
              Ready
            </span>
          ) : modeStatus.label ? (
            <span
              data-testid="mode-status-label"
              className="font-semibold text-slate-700"
            >
              {modeStatus.label}
            </span>
          ) : null}
          {modeStatus.kind === 'armed' && modeStatus.instruction ? (
            <>
              <span aria-hidden="true" className="text-slate-500">
                {' — '}
              </span>
              <span
                data-testid="mode-status-instruction"
                className="text-slate-500"
              >
                {modeStatus.instruction}
              </span>
            </>
          ) : modeStatus.instruction ? (
            <span
              data-testid="mode-status-instruction"
              className="text-slate-500"
            >
              {modeStatus.instruction}
            </span>
          ) : null}
        </div>
      )}
      {editing && (
        <>
          <p id="path-move-help" className="sr-only">
            Move path translates every sample by one shared delta. Drag the path
            on the stage, or focus it and use arrow keys to nudge. Hold Shift for
            a larger step. Escape or pointer cancel restores the baseline without
            an undo entry. Stage bounds keep every sample center on stage when
            the path starts in bounds; the actor’s rotated or scaled appearance
            may still extend past the stage.
          </p>
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
          <p id="path-smooth-help" className="sr-only">
            Smooth bend eases abrupt direction changes near the selected
            interior handle. The handle stays put; neighboring handles and
            pauses outside the bend are protected. Keyboard shortcut S.
            {smoothAvail.message ? ` ${smoothAvail.message}` : ''}
          </p>
          <p id="path-corner-help" className="sr-only">
            Make corner pulls the path toward sharper incoming and outgoing
            segments at the selected interior handle without moving that point.
            Straight segments cannot be sharpened. Keyboard shortcut C.
            {cornerAvail.message ? ` ${cornerAvail.message}` : ''}
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
