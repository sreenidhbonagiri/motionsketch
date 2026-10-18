import type { CSSProperties, PointerEventHandler } from 'react'
import { actorDisplaySizePx } from '../core/actor'
import type { Actor as ActorModel, Vec2 } from '../core/types'

interface ActorProps {
  actor: ActorModel
  actorId: string
  name: string
  position: Vec2
  stageWidth: number
  stageHeight: number
  zIndex: number
  selected: boolean
  armed: boolean
  recording: boolean
  rotationDeg?: number
  scale?: number
  onPointerDown: PointerEventHandler<HTMLElement>
}

export function Actor({
  actor,
  actorId,
  name,
  position,
  stageWidth,
  stageHeight,
  zIndex,
  selected,
  armed,
  recording,
  rotationDeg = 0,
  scale = 1,
  onPointerDown,
}: ActorProps) {
  const { width, height } = actorDisplaySizePx(
    stageWidth,
    stageHeight,
    actor,
  )

  const shadow = recording
    ? '0 0 0 3px rgba(239, 68, 68, 0.45), 0 12px 32px rgba(15, 23, 42, 0.2)'
    : armed && selected
      ? '0 0 0 3px rgba(15, 118, 110, 0.4), 0 12px 32px rgba(15, 23, 42, 0.18)'
      : selected
        ? '0 0 0 2px rgba(15, 23, 42, 0.35), 0 12px 28px rgba(15, 23, 42, 0.18)'
        : '0 12px 28px rgba(15, 23, 42, 0.18)'

  const boxStyle: CSSProperties = {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
    width,
    height,
    zIndex,
    transform: `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${scale})`,
    boxShadow: shadow,
  }

  const label =
    actor.kind === 'image' && actor.image
      ? `Actor ${name}: ${actor.image.label}`
      : `Actor ${name}`

  if (actor.kind === 'image' && actor.image) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text -- aria-label on interactive control
      <img
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={selected}
        data-testid={selected ? 'actor' : `actor-${actorId}`}
        data-actor-id={actorId}
        data-actor-kind="image"
        data-selected={selected ? 'true' : 'false'}
        src={actor.image.dataUrl}
        alt=""
        draggable={false}
        className="absolute cursor-grab touch-none select-none object-contain active:cursor-grabbing"
        style={{
          ...boxStyle,
          background: 'transparent',
          borderRadius: 0,
        }}
        onPointerDown={onPointerDown}
      />
    )
  }

  const radius = actor.borderRadius * 0.5 * Math.min(width, height)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-testid={selected ? 'actor' : `actor-${actorId}`}
      data-actor-id={actorId}
      data-actor-kind="shape"
      data-selected={selected ? 'true' : 'false'}
      className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
      style={{
        ...boxStyle,
        borderRadius: radius,
        background: actor.color,
      }}
      onPointerDown={onPointerDown}
    />
  )
}
