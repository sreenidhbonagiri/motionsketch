import { useEffect } from 'react'
import { useEditorStore } from '../state/store'
import { HelpDisclosure } from './HelpDisclosure'

/**
 * Compact Bring to life preview. Primary controls stay in the header so they
 * remain reachable with Play on short phones; secondary copy lives in the
 * disclosure.
 */
export function BringToLifePanel() {
  const session = useEditorStore((s) => s.bringToLifeSession)
  const setCompareMode = useEditorStore((s) => s.setBringToLifeCompareMode)
  const apply = useEditorStore((s) => s.applyBringToLife)
  const cancel = useEditorStore((s) => s.cancelBringToLife)

  useEffect(() => {
    if (!session) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [session, cancel])

  if (!session) return null

  return (
    <div
      data-testid="bring-to-life-panel"
      tabIndex={-1}
      className="pointer-events-auto w-full max-w-xl rounded-xl border border-ms-border bg-white/90 px-3 py-2 shadow-[var(--ms-shadow)] outline-none backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Bring to life</h2>
          <p
            data-testid="bring-to-life-help"
            className="text-xs leading-relaxed text-slate-500"
          >
            Cleaner path and smoother arrival.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-testid="btn-bring-to-life-cancel"
            onClick={() => cancel()}
            className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-900/[0.06]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="btn-bring-to-life-apply"
            onClick={() => apply()}
            disabled={!session.changed}
            className="inline-flex h-8 items-center rounded-lg bg-ms-primary px-3 text-sm font-medium text-white transition hover:bg-ms-primary-hover disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>

      <div
        data-testid="bring-to-life-compare"
        className="mt-2 flex flex-wrap gap-2"
        role="group"
        aria-label="Compare motion"
      >
        <button
          type="button"
          data-testid="bring-to-life-compare-original"
          aria-pressed={session.compareMode === 'original'}
          onClick={() => setCompareMode('original')}
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
          data-testid="bring-to-life-compare-enhanced"
          aria-pressed={session.compareMode === 'enhanced'}
          onClick={() => setCompareMode('enhanced')}
          className={
            session.compareMode === 'enhanced'
              ? 'inline-flex h-7 items-center rounded-lg bg-ms-primary px-2.5 text-xs font-medium text-white'
              : 'inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-900/[0.06]'
          }
        >
          Enhanced
        </button>
      </div>

      <p
        data-testid="bring-to-life-status"
        className="mt-1.5 text-xs leading-relaxed text-slate-600"
        role="status"
      >
        {session.changed
          ? session.notes.preservesTransformKeyframes
            ? 'Preview ready. Transform keyframes keep their times.'
            : 'Preview ready.'
          : (session.reason ?? 'Nothing to enhance.')}
      </p>

      <div className="mt-1.5">
        <HelpDisclosure testId="bring-to-life-about" summary="What this changes">
          Softens path wobble. Steady Speed, Glide, and Ease out run once at
          playback for a smoother arrival — Apply replaces those three settings;
          Cancel or Undo restores them. Pauses and the final position stay.
          Duration and the raw recording stay. Dashed path = Original; solid =
          Enhanced. Squash and stretch are not part of this version.
        </HelpDisclosure>
      </div>
    </div>
  )
}
