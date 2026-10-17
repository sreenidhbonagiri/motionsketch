import type { CSSProperties, PointerEventHandler } from 'react'
import type { Actor as ActorModel, Vec2 } from '../core/types'
import { actorSizePx } from '../core/coords'

interface ActorProps {
  actor: ActorModel
  position: Vec2
  stageWidth: number
  stageHeight: number
  armed: boolean
  recording: boolean
  onPointerDown: PointerEventHandler<HTMLDivElement>
}

export function Actor({
  actor,
  position,
  stageWidth,
  stageHeight,
  armed,
  recording,
  onPointerDown,
}: ActorProps) {
  const { width, height } = actorSizePx(
    stageWidth,
    stageHeight,
    actor.width,
    actor.height,
  )

  const radius = actor.borderRadius * Math.min(width, height)

  const style: CSSProperties = {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
    width,
    height,
    borderRadius: radius,
    background: actor.color,
    transform: 'translate(-50%, -50%)',
    boxShadow: recording
      ? '0 0 0 3px rgba(239, 68, 68, 0.45), 0 12px 32px rgba(79, 70, 229, 0.35)'
      : armed
        ? '0 0 0 3px rgba(79, 70, 229, 0.35), 0 12px 32px rgba(79, 70, 229, 0.25)'
        : '0 12px 28px rgba(15, 23, 42, 0.18)',
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Draggable animation tile"
      data-testid="actor"
      className="absolute z-10 cursor-grab touch-none select-none active:cursor-grabbing"
      style={style}
      onPointerDown={onPointerDown}
    />
  )
}
