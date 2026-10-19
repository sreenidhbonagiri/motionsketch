import { useEffect } from 'react'
import { useEditorStore } from '../state/store'

/**
 * Glide timing preview. Softens starts/stops in moving sections without
 * changing path geometry. Apply writes actor.glide; Cancel discards.
 */
export function GlidePanel() {
  const session = useEditorStore((s) => s.glideSession)
  const committedGlide = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id)?.glide ?? 0
  })
  const setGlideCompareMode = useEditorStore((s) => s.setGlideCompareMode)
  const setGlideStrength = useEditorStore((s) => s.setGlideStrength)
  const applyGlide = useEditorStore((s) => s.applyGlide)
  const cancelGlide = useEditorStore((s) => s.cancelGlide)

  useEffect(() => {
    if (!session) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      e.stopPropagation()
      cancelGlide()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [session, cancelGlide])

  if (!session) return null

  const strengthPct = Math.round(session.strength * 100)

  return (
    <div
      data-testid="glide-panel"
      className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-white/80 bg-white/95 px-3 py-2.5 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Glide</h2>
        <p
          data-testid="glide-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          Softens starts and stops while keeping your path and pauses.
        </p>
      </div>

      <div
        data-testid="glide-compare"
        className="mt-2 flex flex-wrap gap-2"
        role="group"
        aria-label="Compare timing"
      >
        <button
          type="button"
          data-testid="glide-compare-original"
          aria-pressed={session.compareMode === 'original'}
          onClick={() => setGlideCompareMode('original')}
          className={
            session.compareMode === 'original'
              ? 'rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
              : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
          }
        >
          Original
        </button>
        <button
          type="button"
          data-testid="glide-compare-glide"
          aria-pressed={session.compareMode === 'glide'}
          onClick={() => setGlideCompareMode('glide')}
          className={
            session.compareMode === 'glide'
              ? 'rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
              : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
          }
        >
          Glide
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        <label
          htmlFor="glide-strength"
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Strength</span>
          <span data-testid="glide-strength-value" className="tabular-nums">
            {strengthPct}%
          </span>
        </label>
        <input
          id="glide-strength"
          data-testid="glide-strength"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={session.strength}
          onChange={(e) => setGlideStrength(Number(e.target.value))}
          className="w-full accent-teal-700"
          aria-describedby="glide-strength-help"
        />
        <p
          id="glide-strength-help"
          data-testid="glide-strength-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          Ease-in/out inside moving sections after Steady Speed. Path shape,
          corners, pauses, and duration stay the same. Transform keyframes keep
          their times — where they land on the path can shift when speed
          changes. Face along path follows the retimed motion.
        </p>
      </div>

      <p
        data-testid="glide-status"
        className="mt-2 text-xs leading-relaxed text-slate-600"
        role="status"
      >
        {session.changed
          ? `Preview ready (${session.segmentsAdjusted} moving section${
              session.segmentsAdjusted === 1 ? '' : 's'
            }). Watch the actor — not just the path.`
          : (session.reason ?? 'Nothing to glide at this strength.')}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          data-testid="btn-glide-cancel"
          onClick={() => cancelGlide()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="btn-glide-apply"
          onClick={() => applyGlide()}
          disabled={Math.abs(session.strength - committedGlide) < 1e-9}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
