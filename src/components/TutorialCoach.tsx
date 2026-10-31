import {
  useEffect,
  useLayoutEffect,
  useId,
  useState,
  type CSSProperties,
} from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import {
  TUTORIAL_FINISH_LABEL,
  TUTORIAL_NEXT_LABEL,
  TUTORIAL_SKIP_LABEL,
  type TutorialStep,
} from '../lib/tutorial'

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

interface TutorialCoachProps {
  step: TutorialStep
  body: string
  highlightTestId: string | null
  showNext: boolean
  nextIsFinish?: boolean
  onSkip: () => void
  onNext?: () => void
}

/**
 * Non-layout coach: fixed card + optional ring around a measured control.
 * Does not change --ms-sheet-top, dock, or Fit/zoom placement.
 */
export function TutorialCoach({
  step,
  body,
  highlightTestId,
  showNext,
  nextIsFinish = false,
  onSkip,
  onNext,
}: TutorialCoachProps) {
  const reducedMotion = usePrefersReducedMotion()
  const titleId = useId()
  const bodyId = useId()
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const [cardStyle, setCardStyle] = useState<CSSProperties>({
    top: 96,
    left: 16,
    right: 16,
    maxWidth: 360,
  })

  useLayoutEffect(() => {
    if (!highlightTestId) {
      setRect(null)
      return
    }
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const el = document.querySelector(
        `[data-testid="${highlightTestId}"]`,
      )
      if (!(el instanceof HTMLElement)) {
        setRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      const pad = 6
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      })

      const vw = window.innerWidth
      const vh = window.innerHeight
      const cardMax = Math.min(360, vw - 24)
      const preferBelow = r.bottom + 12 + 140 < vh
      const top = preferBelow
        ? Math.min(r.bottom + 12, vh - 160)
        : Math.max(12, r.top - 148)
      let left = Math.min(
        Math.max(12, r.left + r.width / 2 - cardMax / 2),
        vw - cardMax - 12,
      )
      // Keep clear of the right edge on narrow screens.
      if (vw < 420) {
        left = 12
      }
      setCardStyle({
        top,
        left,
        width: cardMax,
        maxWidth: cardMax,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    const el = document.querySelector(`[data-testid="${highlightTestId}"]`)
    if (el instanceof HTMLElement) ro.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const id = window.setInterval(measure, 250)
    return () => {
      cancelled = true
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.clearInterval(id)
    }
  }, [highlightTestId, step, body])

  useEffect(() => {
    const root = document.querySelector('[data-testid="tutorial-coach"]')
    if (root instanceof HTMLElement) {
      const skip = root.querySelector(
        '[data-testid="btn-tutorial-skip"]',
      )
      if (skip instanceof HTMLElement) skip.focus()
    }
  }, [step])

  const stepLabel =
    step === 'draw' ? 'Step 1 of 3' : step === 'play' ? 'Step 2 of 3' : 'Step 3 of 3'

  return (
    <div
      data-testid="tutorial-coach"
      data-tutorial-step={step}
      className="pointer-events-none fixed inset-0 z-[45]"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      {rect && (
        <div
          data-testid="tutorial-highlight"
          aria-hidden
          className={`pointer-events-none absolute rounded-xl ring-2 ring-ms-primary ring-offset-2 ring-offset-ms-canvas ${
            reducedMotion ? '' : 'motion-safe:animate-pulse'
          }`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgb(23 33 58 / 0.28)',
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="false"
        className="pointer-events-auto absolute rounded-xl border border-ms-border bg-white/95 px-3 py-2.5 shadow-[var(--ms-shadow)] backdrop-blur-xl"
        style={cardStyle}
      >
        <p
          id={titleId}
          data-testid="tutorial-step-label"
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400"
        >
          {stepLabel}
        </p>
        <p
          id={bodyId}
          data-testid="tutorial-coach-body"
          className="mt-1 text-sm leading-snug text-slate-800"
        >
          {body}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="btn-tutorial-skip"
            onClick={onSkip}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-900/[0.05] hover:text-slate-900"
          >
            {TUTORIAL_SKIP_LABEL}
          </button>
          {showNext && onNext && (
            <button
              type="button"
              data-testid="btn-tutorial-next"
              onClick={onNext}
              className="rounded-lg bg-ms-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-ms-primary-hover active:bg-ms-primary-pressed"
            >
              {nextIsFinish ? TUTORIAL_FINISH_LABEL : TUTORIAL_NEXT_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
