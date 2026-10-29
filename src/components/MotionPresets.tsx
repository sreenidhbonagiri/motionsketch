import {
  MOTION_PRESETS,
  type MotionPresetId,
} from '../core/motionPresets'
import { useEditorStore } from '../state/store'

/**
 * Compact curated preset picker. Preview is non-destructive; Apply lives in
 * PresetPanel so this stays a short list — not a settings sheet.
 */
export function MotionPresets() {
  const mode = useEditorStore((s) => s.mode)
  const presetSession = useEditorStore((s) => s.presetSession)
  const beginPresetPreview = useEditorStore((s) => s.beginPresetPreview)
  const blocked =
    mode === 'recording' || mode === 'armed' || mode === 'editing'

  const onPick = (id: MotionPresetId) => {
    beginPresetPreview(id)
  }

  return (
    <div data-testid="motion-presets" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Motion presets</h3>
        <p className="text-xs text-slate-500">Preview, then Apply</p>
      </div>
      <ul className="space-y-1.5" role="list">
        {MOTION_PRESETS.map((preset) => {
          const active = presetSession?.presetId === preset.id
          return (
            <li key={preset.id}>
              <button
                type="button"
                data-testid={`motion-preset-${preset.id}`}
                aria-pressed={active}
                disabled={blocked}
                title={preset.behavior}
                onClick={() => onPick(preset.id)}
                className={
                  active
                    ? 'flex w-full flex-col items-start rounded-xl border border-ms-primary/30 bg-ms-selected px-2.5 py-2 text-left'
                    : 'flex w-full flex-col items-start rounded-xl border border-ms-border bg-white/70 px-2.5 py-2 text-left transition hover:bg-slate-900/[0.03] disabled:opacity-40'
                }
              >
                <span className="text-sm font-medium text-slate-800">
                  {preset.label}
                </span>
                <span className="mt-0.5 text-xs leading-snug text-slate-500">
                  {preset.summary}
                  {preset.prefersLoop ? ' · Loop recommended' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
