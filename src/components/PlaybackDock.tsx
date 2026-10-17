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
  const recording = useEditorStore((s) => s.project.recording)
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

  const isRecordingLike = mode === 'armed' || mode === 'recording'
  const editing = mode === 'editing'
  const hasRecording = !!recording
  const playbackDisabled = !hasRecording || isRecordingLike

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

  return (
    <div
      data-testid="playback-dock"
      className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-white/80 bg-white/92 px-3 py-2.5 shadow-[0_12px_36px_rgba(15,23,42,0.12)] backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {hasRecording && !editing && (
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
            onChange={(e) => scrubPlayback(Number(e.target.value))}
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
                disabled={playbackDisabled}
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
              className={btnSecondary}
            >
              Restart
            </button>

            <button
              type="button"
              data-testid="btn-edit-path"
              onClick={enterEditMode}
              disabled={!hasRecording || isRecordingLike || mode === 'playing'}
              className={btnSecondary}
            >
              Edit path
            </button>

            <button
              type="button"
              data-testid="btn-reset"
              onClick={resetRecording}
              disabled={!recording && mode === 'idle'}
              className={btnQuiet}
            >
              Reset
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

            {mode === 'armed' && (
              <span
                data-testid="armed-hint"
                className="hidden px-2 text-xs text-slate-500 sm:inline"
              >
                Ready — drag the tile
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
