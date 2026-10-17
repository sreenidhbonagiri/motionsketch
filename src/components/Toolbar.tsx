import { stopFromUi } from '../lib/recordingController'
import { useEditorStore } from '../state/store'

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode)
  const recording = useEditorStore((s) => s.project.recording)
  const armRecording = useEditorStore((s) => s.armRecording)
  const play = useEditorStore((s) => s.play)
  const pause = useEditorStore((s) => s.pause)
  const resetRecording = useEditorStore((s) => s.resetRecording)
  const setPlaybackHead = useEditorStore((s) => s.setPlaybackHead)

  const isRecordingLike = mode === 'armed' || mode === 'recording'

  return (
    <div
      data-testid="toolbar"
      className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur"
    >
      {isRecordingLike ? (
        <button
          type="button"
          data-testid="btn-stop"
          onClick={stopFromUi}
          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-600"
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
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          Record
        </button>
      )}

      {mode === 'playing' ? (
        <button
          type="button"
          data-testid="btn-pause"
          onClick={pause}
          disabled={!recording}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          data-testid="btn-play"
          onClick={() => {
            if (useEditorStore.getState().playbackHead >= 1) {
              setPlaybackHead(0)
            }
            play()
          }}
          disabled={!recording || isRecordingLike}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Play
        </button>
      )}

      <button
        type="button"
        data-testid="btn-reset"
        onClick={resetRecording}
        disabled={!recording && mode === 'idle'}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        Reset
      </button>

      {mode === 'armed' && (
        <span
          data-testid="armed-hint"
          className="hidden px-2 text-xs text-slate-500 sm:inline"
        >
          Ready — drag the tile
        </span>
      )}
    </div>
  )
}
