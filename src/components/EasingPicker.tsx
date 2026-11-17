import { useEffect, useRef, type KeyboardEvent } from 'react'
import {
  bounceProgress,
  easeInOutSmoothstep,
  easeOutCubic,
  MOTION_EASING_LABELS,
  MOTION_EASING_VALUES,
  springProgress,
  type MotionEasing,
} from '../core/easing'
import { useEditorStore } from '../state/store'

function curvePath(kind: MotionEasing): string {
  const fn = (u: number): number => {
    switch (kind) {
      case 'linear':
        return u
      case 'easeOut':
        return easeOutCubic(u)
      case 'easeInOut':
        return easeInOutSmoothstep(u)
      case 'spring':
        return springProgress(u)
      case 'bounce':
        return bounceProgress(u)
    }
  }
  const w = 32
  const h = 18
  const pad = 2
  const pts: string[] = []
  for (let i = 0; i <= 24; i++) {
    const u = i / 24
    const yRaw = fn(u)
    const yClamped = Math.min(1.25, Math.max(-0.05, yRaw))
    const x = pad + u * (w - pad * 2)
    const y = h - pad - (yClamped / 1.25) * (h - pad * 2)
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return pts.join(' ')
}

function EasingThumb({ kind, selected }: { kind: MotionEasing; selected: boolean }) {
  return (
    <svg
      width="32"
      height="18"
      viewBox="0 0 32 18"
      aria-hidden="true"
      className={selected ? 'text-ms-primary' : 'text-slate-500'}
    >
      <path
        d={curvePath(kind)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Discrete per-element easing picker. Lives under Duration in Motion.
 * Column count follows the Inspector container width (not the viewport),
 * so a ~260px floating card does not force a cramped five-column row.
 */
export function EasingPicker({
  describedBy,
}: {
  describedBy?: string
}) {
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const setEasing = useEditorStore((s) => s.setEasing)
  const hasRecording = !!selectedActor?.recording
  const timingBaked =
    geometryEdit?.timingBaked === true ||
    selectedActor?.geometryEdit?.timingBaked === true
  const interactive = hasRecording && !timingBaked
  const value: MotionEasing = selectedActor?.easing ?? 'linear'
  const label = MOTION_EASING_LABELS[value]
  const optionRefs = useRef<Partial<Record<MotionEasing, HTMLButtonElement | null>>>(
    {},
  )
  const focusKindRef = useRef<MotionEasing | null>(null)

  useEffect(() => {
    const kind = focusKindRef.current
    if (!kind) return
    focusKindRef.current = null
    optionRefs.current[kind]?.focus()
  }, [value])

  const selectEasing = (kind: MotionEasing) => {
    if (!interactive) return
    if (kind !== value) focusKindRef.current = kind
    setEasing(kind)
    // Same value (no store update): still move focus when arrowing onto self.
    if (kind === value) {
      optionRefs.current[kind]?.focus()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    const idx = MOTION_EASING_VALUES.indexOf(value)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = MOTION_EASING_VALUES[(idx + 1) % MOTION_EASING_VALUES.length]!
      selectEasing(next)
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next =
        MOTION_EASING_VALUES[
          (idx - 1 + MOTION_EASING_VALUES.length) % MOTION_EASING_VALUES.length
        ]!
      selectEasing(next)
    }
  }

  const helpId = timingBaked
    ? 'easing-timing-baked-help'
    : !hasRecording
      ? 'easing-help'
      : describedBy

  const gridClass = interactive
    ? // Follow Inspector/sheet width — not the viewport.
      // ~238–255px floating card → 3 cols; ≥256px phone sheet (incl. 320) → 5.
      'grid grid-cols-2 gap-1 @[12rem]:grid-cols-3 @[16rem]:grid-cols-5'
    : 'grid grid-cols-2 gap-1 opacity-40 @[12rem]:grid-cols-3 @[16rem]:grid-cols-5'

  return (
    <div data-testid="easing-picker" className="@container space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
        <span id="easing-picker-label">Easing</span>
        <span data-testid="easing-value" className="font-medium text-slate-800">
          {label}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="easing-picker-label"
        aria-describedby={helpId}
        aria-disabled={!interactive}
        data-testid="easing-options"
        onKeyDown={onKeyDown}
        className={gridClass}
      >
        {MOTION_EASING_VALUES.map((kind) => {
          const selected = value === kind
          const name = MOTION_EASING_LABELS[kind]
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              ref={(el) => {
                optionRefs.current[kind] = el
              }}
              data-testid={`easing-option-${kind}`}
              aria-checked={selected}
              aria-label={name}
              tabIndex={interactive && selected ? 0 : -1}
              disabled={!interactive}
              onClick={() => selectEasing(kind)}
              className={
                selected
                  ? 'flex min-h-8 flex-col items-center justify-center gap-0 rounded-md border-2 border-ms-primary bg-ms-selected px-0.5 py-0.5 text-center outline-none ring-ms-primary focus-visible:ring-2'
                  : 'flex min-h-8 flex-col items-center justify-center gap-0 rounded-md border border-ms-border bg-white px-0.5 py-0.5 text-center outline-none hover:bg-slate-900/[0.04] focus-visible:ring-2 focus-visible:ring-ms-primary disabled:pointer-events-none'
              }
            >
              <EasingThumb kind={kind} selected={selected} />
              <span
                className={
                  selected
                    ? 'line-clamp-2 max-w-full text-xs font-semibold leading-none text-slate-800'
                    : 'line-clamp-2 max-w-full text-xs font-medium leading-none text-slate-600'
                }
              >
                {name}
              </span>
            </button>
          )
        })}
      </div>
      {timingBaked && (
        <p
          id="easing-timing-baked-help"
          data-testid="easing-timing-baked-help"
          className="text-xs leading-relaxed text-amber-800"
        >
          Easing is unavailable while Extend has baked timing into this path.
          Earlier motion stays protected. Restore recorded path to change
          Easing.
        </p>
      )}
      {!hasRecording && !timingBaked && (
        <p
          id="easing-help"
          data-testid="easing-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          Create a path for this element to choose easing.
        </p>
      )}
      {interactive && (
        <p
          data-testid="easing-compose-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          Applies after Steady Speed and Glide on moving sections.
        </p>
      )}
    </div>
  )
}
