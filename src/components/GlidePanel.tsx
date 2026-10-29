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
      className="pointer-events-auto w-full max-w-2xl rounded-xl border border-ms-border bg-white/90 px-3 py-2.5 shadow-[var(--ms-shadow)] backdrop-blur-xl"
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
              ? 'inline-flex h-7 items-center rounded-lg bg-ms-primary px-2.5 text-xs font-medium text-white'
              : 'inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-900/[0.06]'
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
              ? 'inline-flex h-7 items-center rounded-lg bg-ms-primary px-2.5 text-xs font-medium text-white'
              : 'inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-900/[0.06]'
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
          className="w-full accent-ms-primary"
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
          className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-900/[0.06]"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="btn-glide-apply"
          onClick={() => applyGlide()}
          disabled={Math.abs(session.strength - committedGlide) < 1e-9}
          className="inline-flex h-8 items-center rounded-lg bg-ms-primary px-3 text-sm font-medium text-white transition hover:bg-ms-primary-hover disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
