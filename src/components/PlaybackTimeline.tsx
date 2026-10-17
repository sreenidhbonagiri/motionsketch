import { traversalElapsedMs } from '../core/playback'
import { useEditorStore } from '../state/store'

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

export function PlaybackTimeline() {
  const mode = useEditorStore((s) => s.mode)
  const recording = useEditorStore((s) => s.project.recording)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const loop = useEditorStore((s) => s.project.playback.loop)
  const loopMode = useEditorStore((s) => s.project.playback.loopMode)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const playbackDirection = useEditorStore((s) => s.playbackDirection)
  const scrubPlayback = useEditorStore((s) => s.scrubPlayback)

  if (!recording || mode === 'editing') return null

  const isRecordingLike = mode === 'armed' || mode === 'recording'
  const disabled = isRecordingLike
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
      data-testid="playback-timeline"
      className="flex w-full max-w-xl flex-col gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-slate-600">
        <span data-testid="playback-elapsed">
          {goingBack ? `← ${formatSeconds(elapsedMs)}` : formatSeconds(elapsedMs)}
        </span>
        <span data-testid="playback-total">{formatSeconds(durationMs)}</span>
      </div>
      <label className="sr-only" htmlFor="playback-scrubber">
        Playback position along the path (start to end). Scrubbing pauses and
        resumes forward from the chosen point.
      </label>
      <input
        id="playback-scrubber"
        data-testid="playback-scrubber"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={playbackHead}
        disabled={disabled}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(playbackHead.toFixed(3))}
        aria-valuetext={valueText}
        onChange={(e) => scrubPlayback(Number(e.target.value))}
        className="w-full accent-indigo-600 disabled:opacity-40"
      />
    </div>
  )
}
