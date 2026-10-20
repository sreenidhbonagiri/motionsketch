import { useEffect } from 'react'
import {
  MOTION_PRESETS,
  getMotionPreset,
  minPresetDurationMs,
  type MotionPresetId,
} from '../core/motionPresets'
import { useEditorStore } from '../state/store'

function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

const PRESET_SHORT: Record<MotionPresetId, string> = {
  'slide-in': 'Slide',
  'pop-in': 'Pop',
  float: 'Float',
  'attention-pulse': 'Pulse',
}

/**
 * Compact Apply / Cancel bar while a Motion preset is previewing.
 * Switch presets and Original/Preset compare without touching the project.
 */
export function PresetPanel() {
  const session = useEditorStore((s) => s.presetSession)
  const projectDurationMs = useEditorStore((s) => s.project.playback.durationMs)
  const applyPreset = useEditorStore((s) => s.applyPreset)
  const cancelPreset = useEditorStore((s) => s.cancelPreset)
  const setPresetTiming = useEditorStore((s) => s.setPresetTiming)
  const setPresetCompareMode = useEditorStore((s) => s.setPresetCompareMode)
  const beginPresetPreview = useEditorStore((s) => s.beginPresetPreview)
  const loop = useEditorStore((s) => s.project.playback.loop)

  useEffect(() => {
    if (!session) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      e.stopPropagation()
      cancelPreset()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [session, cancelPreset])

  if (!session) return null

  const def = getMotionPreset(session.presetId)
  const label = def?.label ?? 'Preset'
  const behavior = def?.behavior ?? ''
  const showLoopHint = !!def?.prefersLoop && !loop
  const minDur = minPresetDurationMs(projectDurationMs)
  const maxDelay = Math.max(0, projectDurationMs - minDur)
  const maxDuration = Math.max(minDur, projectDurationMs - session.delayMs)
  const comparingOriginal = session.compareMode === 'original'

  return (
    <div
      data-testid="preset-panel"
      className="pointer-events-auto w-full max-w-2xl rounded-xl border border-slate-900/[0.08] bg-white/90 px-3 py-2.5 shadow-[var(--ms-shadow)] backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Preview: {label}
        </h2>
        <p
          data-testid="preset-panel-hint"
          className="text-xs text-slate-500"
        >
          {comparingOriginal
            ? 'Showing original — Apply still commits the selected preset'
            : 'Playing a temporary preview — project unchanged until Apply'}
        </p>
      </div>

      <div
        data-testid="preset-switcher"
        className="mt-2 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Motion preset"
      >
        {MOTION_PRESETS.map((preset) => {
          const active = session.presetId === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-switch-${preset.id}`}
              aria-pressed={active}
              aria-label={preset.label}
              title={preset.summary}
              onClick={() => beginPresetPreview(preset.id)}
              className={
                active
                  ? 'rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
                  : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
              }
            >
              {PRESET_SHORT[preset.id]}
            </button>
          )
        })}
      </div>

      <div
        data-testid="preset-compare"
        className="mt-2 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Compare with original motion"
      >
        <button
          type="button"
          data-testid="preset-compare-original"
          aria-pressed={comparingOriginal}
          onClick={() => setPresetCompareMode('original')}
          className={
            comparingOriginal
              ? 'rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
              : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
          }
        >
          Original
        </button>
        <button
          type="button"
          data-testid="preset-compare-preset"
          aria-pressed={!comparingOriginal}
          onClick={() => setPresetCompareMode('preset')}
          className={
            !comparingOriginal
              ? 'rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
              : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
          }
        >
          Preset
        </button>
      </div>

      <p
        data-testid="preset-panel-behavior"
        className="mt-1.5 text-xs leading-relaxed text-slate-600"
      >
        {behavior}
        {showLoopHint
          ? ' Turn on Loop in Timing for continuous playback.'
          : ''}
      </p>

      <div
        data-testid="preset-timing"
        className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs text-slate-600">
            <span>Start at</span>
            <span
              data-testid="preset-delay-value"
              className="tabular-nums text-slate-500"
            >
              {formatSec(session.delayMs)}
            </span>
          </span>
          <input
            id="preset-delay"
            data-testid="preset-delay"
            type="range"
            min={0}
            max={maxDelay}
            step={50}
            value={Math.min(session.delayMs, maxDelay)}
            onChange={(e) =>
              setPresetTiming({ delayMs: Number(e.target.value) })
            }
            className="w-full accent-teal-700"
            aria-valuemin={0}
            aria-valuemax={maxDelay}
            aria-valuenow={Math.min(session.delayMs, maxDelay)}
            aria-valuetext={formatSec(session.delayMs)}
            aria-describedby="preset-timing-help"
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs text-slate-600">
            <span>Move for</span>
            <span
              data-testid="preset-duration-value"
              className="tabular-nums text-slate-500"
            >
              {formatSec(session.durationMs)}
            </span>
          </span>
          <input
            id="preset-duration"
            data-testid="preset-duration"
            type="range"
            min={minDur}
            max={maxDuration}
            step={50}
            value={Math.min(session.durationMs, maxDuration)}
            onChange={(e) =>
              setPresetTiming({ durationMs: Number(e.target.value) })
            }
            className="w-full accent-teal-700"
            aria-valuemin={minDur}
            aria-valuemax={maxDuration}
            aria-valuenow={Math.min(session.durationMs, maxDuration)}
            aria-valuetext={formatSec(session.durationMs)}
            aria-describedby="preset-timing-help"
          />
        </label>
      </div>
      <p
        id="preset-timing-help"
        data-testid="preset-timing-help"
        className="mt-1 text-xs leading-relaxed text-slate-500"
      >
        Start at and Move for match Sequence for this actor — not the project
        Duration in Timing. Entrance presets turn on Hide before Start, so the
        actor stays hidden until Start at. Values stay shared when you switch
        presets.
      </p>

      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          data-testid="btn-preset-cancel"
          onClick={() => cancelPreset()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="btn-preset-apply"
          onClick={() => applyPreset()}
          title={
            comparingOriginal
              ? `Applies “${label}” (the selected preset), not the original motion on screen`
              : `Apply “${label}” to the selected actor`
          }
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Apply {label}
        </button>
      </div>
    </div>
  )
}
