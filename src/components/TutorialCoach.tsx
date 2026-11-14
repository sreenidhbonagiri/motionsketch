import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import {
  TUTORIAL_FINISH_LABEL,
  TUTORIAL_NEXT_LABEL,
  TUTORIAL_SKIP_LABEL,
  tutorialProgressLabel,
  type TutorialStep,
} from '../lib/tutorial'
import {
  placeTutorialCard,
  readElementRect,
  resolvePlacementAnchor,
} from '../lib/tutorialPlacement'

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

interface TutorialCoachProps {
  step: TutorialStep
  title: string
  body: string
  highlightTestId: string | null
  /** When true, skip the heavy dim overlay so playback looks like the real scene. */
  softHighlight?: boolean
  /** Export panel open — associate the card with the panel, clear of its actions. */
  exportOpen?: boolean
  showNext: boolean
  nextIsFinish?: boolean
  onSkip: (returnFocus?: HTMLElement | null) => void
  onNext?: (returnFocus?: HTMLElement | null) => void
}

/**
 * Spectrum-inspired contextual coach: compact card beside the relevant control.
 * Placement updates on step / Export open / resize only — never follows the plane.
 */
export function TutorialCoach({
  step,
  title,
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
  const cardRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const [cardStyle, setCardStyle] = useState<CSSProperties>(() => ({
    top: 88,
    left: 16,
    width: 280,
    maxWidth: 280,
  }))
  const [enterClass, setEnterClass] = useState(
    reducedMotion ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
  )
  const prevStepRef = useRef<TutorialStep | null>(null)

  // Contextual placement: step, Export panel, and viewport only.
  useLayoutEffect(() => {
    const update = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const anchorEl = resolvePlacementAnchor(step, exportOpen)
      const anchor = readElementRect(anchorEl)
      const panelEl = exportOpen
        ? document.querySelector('[data-testid="export-panel-root"]')
        : null
      const panel = readElementRect(panelEl)
      const fit = readElementRect(
        document.querySelector('[data-testid="btn-fit-stage"]'),
      )
      const cameraBar = readElementRect(
        document.querySelector('[data-testid="workspace-camera-bar"]'),
      )
      const plane = readElementRect(
        document.querySelector('[data-testid="actor"]'),
      )
      const motionTab = readElementRect(
        document.querySelector('[data-testid="btn-inspector-motion"]'),
      )
      const styleTab = readElementRect(
        document.querySelector('[data-testid="btn-inspector-style"]'),
      )
      const exportBtn = readElementRect(
        document.querySelector('[data-testid="btn-export"]'),
      )
      const header = readElementRect(document.querySelector('header'))
      // Do not avoid the whole playback dock — the coach anchors next to Record/Play.
      const avoidExtra = [
        fit,
        cameraBar,
        plane,
        motionTab,
        styleTab,
        exportBtn,
      ].filter(Boolean) as NonNullable<ReturnType<typeof readElementRect>>[]

      if (exportOpen) {
        for (const id of [
          'btn-download-web-package',
          'btn-download-react-package',
          'export-website-path-tabs',
          'btn-close-export',
        ]) {
          const r = readElementRect(
            document.querySelector(`[data-testid="${id}"]`),
          )
          if (r) avoidExtra.push(r)
        }
      }

      // Closed Export: clear the whole header row + camera bar (measured).
      const chromeClearanceTop = Math.max(
        header?.bottom ?? 0,
        cameraBar?.bottom ?? 0,
        motionTab?.bottom ?? 0,
        styleTab?.bottom ?? 0,
        exportBtn?.bottom ?? 0,
      )

      const measuredH = cardRef.current?.offsetHeight
      setCardStyle(
        placeTutorialCard({
          step,
          exportOpen,
          vw,
          vh,
          cardHeight: measuredH && measuredH > 40 ? measuredH : 132,
          anchor,
          panel,
          avoidExtra,
          chromeClearanceTop:
            step === 'export' && !exportOpen ? chromeClearanceTop : undefined,
        }),
      )
    }
    update()
    // Remeasure once after layout so measured card height is accurate.
    const raf = window.requestAnimationFrame(update)
    window.addEventListener('resize', update)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
    }
  }, [step, exportOpen])

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
  // Survive React Strict Mode: cancelled rAF must not leave the card at opacity 0.
  useEffect(() => {
    if (reducedMotion) {
      prevStepRef.current = step
      setEnterClass('opacity-100 translate-y-0')
      return
    }
    const prev = prevStepRef.current
    if (prev === step) {
      setEnterClass((current) =>
        current.includes('opacity-0')
          ? 'opacity-100 translate-y-0'
          : current,
      )
      return
    }
    prevStepRef.current = step
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

  // Focus the step’s primary control — not Skip. Skip + Space opened Keep, and
  // ConfirmDialog then focused “Start fresh”, so a second Space discarded the flight.
  // Depend on step only so Play→Pause body updates do not steal focus mid-flight.
  useEffect(() => {
    const preferredId =
      step === 'play'
        ? 'btn-play'
        : step === 'export'
          ? 'btn-export'
          : step === 'draw'
            ? 'btn-record'
            : null
    const el = preferredId
      ? document.querySelector(`[data-testid="${preferredId}"]`)
      : null
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true })
    }
  }, [step])

  const progress = tutorialProgressLabel(step)
  // Above portaled Help/Export sheets (z-40) so Finish/Skip stay hittable.
  const layerZ = exportOpen ? 'z-[60]' : 'z-[45]'

  return createPortal(
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
          data-tutorial-highlight={
            highlightTestId === 'btn-export' ? 'export' : 'default'
          }
          aria-hidden
          className={
            highlightTestId === 'btn-export'
              ? 'pointer-events-none absolute rounded-xl'
              : 'pointer-events-none absolute rounded-xl ring-2 ring-ms-primary ring-offset-2 ring-offset-ms-canvas'
          }
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            // Export: 3px white gap, 3px cobalt outline, restrained outer halo (no pulse).
            boxShadow:
              highlightTestId === 'btn-export'
                ? '0 0 0 3px #ffffff, 0 0 0 6px #2563eb, 0 0 16px rgb(37 99 235 / 0.35)'
                : softHighlight
                  ? '0 0 0 2px rgb(48 72 184 / 0.35)'
                  : '0 0 0 9999px rgb(23 33 58 / 0.22)',
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        data-testid="tutorial-coach-card"
        className={`pointer-events-auto absolute rounded-xl border border-ms-border bg-white/95 px-3 py-2.5 shadow-[var(--ms-shadow)] backdrop-blur-xl ${enterClass}`}
        style={cardStyle}
      >
        <p
          data-testid="tutorial-step-label"
          className="text-sm font-medium text-ms-muted"
        >
          {progress}
        </p>
        <p
          id={titleId}
          data-testid="tutorial-coach-title"
          className="mt-0.5 text-sm font-semibold leading-snug text-slate-900"
        >
          {title}
        </p>
        <p
          id={bodyId}
          data-testid="tutorial-coach-body"
          className="mt-1 min-h-[2.5rem] text-sm leading-snug text-ms-ink"
        >
          {body}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="btn-tutorial-skip"
            onClick={(e) => onSkip(e.currentTarget)}
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
              onClick={(e) => onNext(e.currentTarget)}
              className="rounded-lg bg-ms-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-ms-primary-hover active:bg-ms-primary-pressed"
            >
              {nextIsFinish ? TUTORIAL_FINISH_LABEL : TUTORIAL_NEXT_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
