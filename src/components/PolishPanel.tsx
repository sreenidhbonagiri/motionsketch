import { useEffect } from 'react'
import { useEditorStore } from '../state/store'

/**
 * Compact Polish motion controls. Preview lives in polishSession only —
 * Apply writes geometry; Cancel / Escape discards without touching the project.
 */
export function PolishPanel() {
  const session = useEditorStore((s) => s.polishSession)
  const setPolishStrength = useEditorStore((s) => s.setPolishStrength)
  const setPolishAllowRounding = useEditorStore(
    (s) => s.setPolishAllowRounding,
  )
  const applyPolish = useEditorStore((s) => s.applyPolish)
  const cancelPolish = useEditorStore((s) => s.cancelPolish)

  useEffect(() => {
    if (!session) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      e.stopPropagation()
      cancelPolish()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [session, cancelPolish])

  if (!session) return null

  const strengthPct = Math.round(session.strength * 100)
  const roundingEnabled = session.roundingUnavailableReason === null
  const showRoundingControl = session.roundingTargetIndex !== null

  return (
    <div
      data-testid="polish-panel"
      className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-white/80 bg-white/95 px-3 py-2.5 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Polish motion</h2>
        <p
          data-testid="polish-compare-legend"
          className="text-xs text-slate-500"
        >
          <span className="font-medium text-slate-600">Dashed</span> Original
          {' · '}
          <span className="font-medium text-teal-800">Solid</span> Polished
          {session.allowRoundingAtPoint && (
            <>
              {' · '}
              <span className="font-medium text-amber-800">Amber</span> Rounding
            </>
          )}
        </p>
      </div>

      <div className="mt-2 space-y-1.5">
        <label
          htmlFor="polish-strength"
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Strength</span>
          <span data-testid="polish-strength-value" className="tabular-nums">
            {strengthPct}%
          </span>
        </label>
        <input
          id="polish-strength"
          data-testid="polish-strength"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={session.strength}
          onChange={(e) => setPolishStrength(Number(e.target.value))}
          className="w-full accent-teal-700"
          aria-describedby="polish-strength-help"
        />
        <p
          id="polish-strength-help"
          data-testid="polish-strength-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          Higher strength eases wobble on open curves and may even out speed in
          moving sections. Pauses, sharp corners, and path handles stay put by
          default. Total duration is unchanged. Transform keyframes keep the
          same times even if speed along the path shifts.
        </p>
      </div>

      {showRoundingControl && (
        <div
          data-testid="polish-rounding-control"
          className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2"
        >
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              data-testid="polish-allow-rounding"
              className="mt-0.5 accent-teal-700"
              checked={session.allowRoundingAtPoint}
              disabled={!roundingEnabled}
              onChange={(e) => setPolishAllowRounding(e.target.checked)}
              aria-describedby="polish-rounding-help"
            />
            <span>
              Allow rounding at this point
              <span
                id="polish-rounding-help"
                data-testid="polish-rounding-help"
                className="mt-0.5 block text-xs font-normal leading-relaxed text-slate-500"
              >
                {roundingEnabled
                  ? 'May move this point slightly to soften the turn.'
                  : (session.roundingUnavailableReason ??
                    'Rounding unavailable at this point.')}
              </span>
            </span>
          </label>
          {session.allowRoundingAtPoint && roundingEnabled && (
            <p
              data-testid="polish-rounding-timing-note"
              className="text-xs leading-relaxed text-amber-900/90"
            >
              Timing stays unchanged while rounding this point.
            </p>
          )}
        </div>
      )}

      <p
        data-testid="polish-status"
        className="mt-2 text-xs leading-relaxed text-slate-600"
        role="status"
      >
        {session.changed
          ? session.allowRoundingAtPoint
            ? 'Preview ready. Selected turn may soften within the safe bound. Timing stays unchanged while rounding this point.'
            : session.timingAdjusted
              ? 'Preview ready. Applying may redistribute speed within moving sections.'
              : 'Preview ready. Geometry cleanup within the safe bound.'
          : (session.reason ?? 'Nothing to polish at this strength.')}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          data-testid="btn-polish-cancel"
          onClick={() => cancelPolish()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="btn-polish-apply"
          onClick={() => applyPolish()}
          disabled={!session.changed}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
