import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
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
  /** When true, skip the heavy dim overlay so playback looks like the real scene. */
  softHighlight?: boolean
  /** Export panel open — park the card clear of the sheet. */
  exportOpen?: boolean
  showNext: boolean
  nextIsFinish?: boolean
  onSkip: () => void
  onNext?: () => void
}

const CARD_MAX = 320

function placeCard(opts: {
  vw: number
  exportOpen: boolean
  headerBottom: number
}): CSSProperties {
  const { vw, exportOpen, headerBottom } = opts
  const width = Math.min(CARD_MAX, vw - 24)
  // Prefer left column under the header — clear of Fit/zoom (top-right) and dock.
  let top = Math.max(headerBottom + 8, 72)
  let left = 12

  if (vw < 640) {
    if (exportOpen) {
      // Narrow + Export sheet: pin under the header so Finish/Skip stay above the sheet body.
      top = Math.max(headerBottom + 6, 8)
      left = 12
    } else {
      // Narrow: under header — clears Fit (top-right) and leaves plane/Record free below.
      top = Math.max(headerBottom + 8, 64)
      left = 12
    }
  } else if (exportOpen) {
    // Desktop + Export (right sheet): keep card on the left, below header.
    top = Math.max(headerBottom + 8, 88)
    left = 16
  } else {
    top = Math.max(headerBottom + 8, 88)
    left = 16
  }

  return {
    top,
    left,
    width,
    maxWidth: width,
  }
}

/**
 * Non-layout coach: stationary card + optional highlight ring.
 * Card placement is independent of the highlighted control (does not follow the plane).
 */
export function TutorialCoach({
  step,
  body,
  highlightTestId,
  softHighlight = false,
  exportOpen = false,
  showNext,
  nextIsFinish = false,
  onSkip,
  onNext,
}: TutorialCoachProps) {
  const reducedMotion = usePrefersReducedMotion()
  const titleId = useId()
  const bodyId = useId()
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const [cardStyle, setCardStyle] = useState<CSSProperties>(() =>
    placeCard({
      vw: typeof window !== 'undefined' ? window.innerWidth : 1280,
      exportOpen: false,
      headerBottom: 72,
    }),
  )
  const [enterClass, setEnterClass] = useState(
    reducedMotion ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
  )
  const prevStepRef = useRef<TutorialStep | null>(null)

  // Stationary card: remeasure only on viewport change or Export clearance.
  useLayoutEffect(() => {
    const update = () => {
      const header = document.querySelector('header')
      const headerBottom =
        header instanceof HTMLElement
          ? header.getBoundingClientRect().bottom
          : 72
      setCardStyle(
        placeCard({
          vw: window.innerWidth,
          exportOpen,
          headerBottom,
        }),
      )
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [exportOpen])

  // Highlight ring only — does not move the card.
  useLayoutEffect(() => {
    if (!highlightTestId) {
      setRect(null)
      return
    }
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const el = document.querySelector(`[data-testid="${highlightTestId}"]`)
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
    }
    measure()
    const el = document.querySelector(`[data-testid="${highlightTestId}"]`)
    const ro = new ResizeObserver(measure)
    if (el instanceof HTMLElement) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      cancelled = true
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [highlightTestId])

  // Entrance only on first mount and real step changes — not body / playhead churn.
  useEffect(() => {
    const prev = prevStepRef.current
    const stepChanged = prev !== step
    prevStepRef.current = step
    if (!stepChanged) return
    if (reducedMotion) {
      setEnterClass('opacity-100 translate-y-0')
      return
    }
    setEnterClass('opacity-0 translate-y-2')
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        setEnterClass(
          'opacity-100 translate-y-0 transition-[opacity,transform] duration-200 ease-out',
        )
      })
    })
    return () => {
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
    }
  }, [step, reducedMotion])

  useEffect(() => {
    const skip = document.querySelector('[data-testid="btn-tutorial-skip"]')
    if (skip instanceof HTMLElement) skip.focus()
  }, [step])

  const stepLabel =
    step === 'draw'
      ? 'Step 1 of 3'
      : step === 'play'
        ? 'Step 2 of 3'
        : 'Step 3 of 3'

  // Above chrome sheets (z-50) so Finish/Skip stay usable beside Export.
  const layerZ = exportOpen ? 'z-[55]' : 'z-[45]'

  return (
    <div
      data-testid="tutorial-coach"
      data-tutorial-step={step}
      className={`pointer-events-none fixed inset-0 ${layerZ}`}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      {rect && (
        <div
          data-testid="tutorial-highlight"
          aria-hidden
          className={`pointer-events-none absolute rounded-xl ring-2 ring-ms-primary ring-offset-2 ring-offset-ms-canvas ${
            reducedMotion || softHighlight ? '' : 'animate-pulse'
          }`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: softHighlight
              ? '0 0 0 2px rgb(48 72 184 / 0.35)'
              : '0 0 0 9999px rgb(23 33 58 / 0.22)',
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="false"
        data-testid="tutorial-coach-card"
        className={`pointer-events-auto absolute rounded-xl border border-ms-border bg-white/95 px-3 py-2.5 shadow-[var(--ms-shadow)] backdrop-blur-xl ${enterClass}`}
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
          className="mt-1 min-h-[2.75rem] text-sm leading-snug text-slate-800"
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
              data-testid={
                nextIsFinish ? 'btn-tutorial-finish' : 'btn-tutorial-next'
              }
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
