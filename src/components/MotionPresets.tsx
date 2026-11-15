import {
  MOTION_PRESETS,
  type MotionPresetId,
} from '../core/motionPresets'
import { useEditorStore } from '../state/store'
import { HelpDisclosure } from './HelpDisclosure'

const tileBase =
  'flex h-auto min-h-0 w-full min-w-0 flex-col items-start rounded-xl border px-2 py-2 text-left transition disabled:opacity-40'
const tileIdle = `${tileBase} border-ms-border bg-white/70 hover:bg-slate-900/[0.03]`
const tileActive = `${tileBase} border-ms-primary/30 bg-ms-selected`

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
      <h3 className="text-sm font-semibold text-slate-800">Motion presets</h3>
      <ul
        data-testid="motion-presets-grid"
        className="grid grid-cols-2 gap-2"
        role="list"
      >
        {MOTION_PRESETS.map((preset) => {
          const active = presetSession?.presetId === preset.id
          const helpId = `motion-preset-help-${preset.id}`
          return (
            <li key={preset.id} className="min-w-0">
              <button
                type="button"
                data-testid={`motion-preset-${preset.id}`}
                aria-pressed={active}
                aria-describedby={helpId}
                disabled={blocked}
                title={preset.behavior}
                onClick={() => onPick(preset.id)}
                className={active ? tileActive : tileIdle}
              >
                <span className="w-full whitespace-normal text-sm font-medium leading-snug text-slate-800">
                  {preset.label}
                </span>
                <span
                  data-testid={`motion-preset-summary-${preset.id}`}
                  className={
                    active
                      ? 'ms-caption ms-caption-lg mt-0.5 w-full whitespace-normal leading-snug text-slate-700'
                      : 'ms-caption ms-caption-lg mt-0.5 w-full whitespace-normal leading-snug'
                  }
                >
                  {preset.summary}
                  {preset.prefersLoop ? ' · Loop' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <HelpDisclosure
        testId="motion-presets-help"
        summary="About Motion presets"
      >
        <div className="space-y-1.5">
          {MOTION_PRESETS.map((preset) => (
            <p
              key={preset.id}
              id={`motion-preset-help-${preset.id}`}
              data-testid={`motion-preset-help-${preset.id}`}
            >
              <span className="font-medium text-slate-700">{preset.label}</span>
              {': '}
              {preset.behavior}
              {preset.prefersLoop
                ? ' Loop recommended for continuous motion.'
                : null}
            </p>
          ))}
        </div>
      </HelpDisclosure>
    </div>
  )
}
