import type { FocusEventHandler, PointerEventHandler } from 'react'
import type { MotionSample } from '../core/types'

interface PathMoveOverlayProps {
  samples: MotionSample[]
  hovered: boolean
  dragging: boolean
  onPointerDown: PointerEventHandler<SVGElement>
  onPointerMove: PointerEventHandler<SVGElement>
  onPointerLeave: () => void
  onFocus: FocusEventHandler<SVGElement>
  onBlur: FocusEventHandler<SVGElement>
}

/** Interactive stroke for Move path — hit target, hover/focus/drag chrome. */
export function PathMoveOverlay({
  samples,
  hovered,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onFocus,
  onBlur,
}: PathMoveOverlayProps) {
  if (samples.length < 2) return null

  const points = samples
    .map((s) => `${s.x * 100},${s.y * 100}`)
    .join(' ')

  const active = hovered || dragging

  return (
    <svg
      data-testid="path-move-overlay"
      data-hovered={hovered ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      className="absolute inset-0 z-[15] h-full w-full touch-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="button"
      tabIndex={0}
      aria-label="Move path. Drag to reposition. Arrow keys nudge; Shift for larger steps."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* Wide invisible hit stroke */}
      <polyline
        points={points}
        fill="none"
        stroke="transparent"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="cursor-grab"
      />
      <polyline
        data-testid="path-move-stroke"
        points={points}
        fill="none"
        stroke={dragging ? '#0f766e' : active ? '#0d9488' : '#115e59'}
        strokeWidth={active || dragging ? 0.85 : 0.55}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dragging ? 1 : active ? 0.95 : 0.75}
        className={dragging ? 'cursor-grabbing' : 'cursor-grab'}
        style={
          active || dragging
            ? { filter: 'drop-shadow(0 0 0.35px rgba(15, 118, 110, 0.85))' }
            : undefined
        }
      />
    </svg>
  )
}
