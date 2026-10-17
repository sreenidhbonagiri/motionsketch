import {
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
} from '../core/types'
import { useEditorStore } from '../state/store'
import { ExportPanel } from './ExportPanel'

export function Inspector() {
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const smoothing = useEditorStore((s) => s.project.playback.smoothing)
  const loop = useEditorStore((s) => s.project.playback.loop)
  const showPathComparison = useEditorStore((s) => s.showPathComparison)
  const hasRecording = useEditorStore((s) => !!s.project.recording)
  const setDurationMs = useEditorStore((s) => s.setDurationMs)
  const setSmoothing = useEditorStore((s) => s.setSmoothing)
  const setLoop = useEditorStore((s) => s.setLoop)
  const setShowPathComparison = useEditorStore((s) => s.setShowPathComparison)

  return (
    <aside
      data-testid="inspector"
      className="w-full space-y-5 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Timing</h2>
        <p className="mt-1 text-xs text-slate-500">
          Adjust playback without losing the original take.
        </p>
      </div>

      <label className="block space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Duration</span>
          <span data-testid="duration-value">{(durationMs / 1000).toFixed(1)}s</span>
        </div>
        <input
          data-testid="duration-slider"
          type="range"
          min={MIN_PLAYBACK_DURATION_MS}
          max={MAX_PLAYBACK_DURATION_MS}
          step={50}
          value={durationMs}
          disabled={!hasRecording}
          onChange={(e) => setDurationMs(Number(e.target.value))}
          className="w-full accent-indigo-600 disabled:opacity-40"
        />
      </label>

      <label className="block space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Smoothing</span>
          <span data-testid="smoothing-value">{Math.round(smoothing * 100)}%</span>
        </div>
        <input
          data-testid="smoothing-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={smoothing}
          disabled={!hasRecording}
          onChange={(e) => setSmoothing(Number(e.target.value))}
          className="w-full accent-indigo-600 disabled:opacity-40"
        />
      </label>

      <label className="flex items-center justify-between text-xs text-slate-600">
        <span>Loop</span>
        <input
          data-testid="loop-toggle"
          type="checkbox"
          checked={loop}
          disabled={!hasRecording}
          onChange={(e) => setLoop(e.target.checked)}
          className="size-4 accent-indigo-600 disabled:opacity-40"
        />
      </label>

      <label className="flex items-center justify-between text-xs text-slate-600">
        <span>Compare paths</span>
        <input
          data-testid="path-compare-toggle"
          type="checkbox"
          checked={showPathComparison}
          disabled={!hasRecording}
          onChange={(e) => setShowPathComparison(e.target.checked)}
          className="size-4 accent-indigo-600 disabled:opacity-40"
        />
      </label>
      {showPathComparison && hasRecording && (
        <p
          data-testid="path-compare-legend"
          className="text-[11px] leading-relaxed text-slate-500"
        >
          Dashed gray: original recording. Solid indigo: smoothed playback path.
        </p>
      )}

      <ExportPanel />
    </aside>
  )
}
