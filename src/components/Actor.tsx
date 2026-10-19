import type { CSSProperties, PointerEventHandler } from 'react'
import { actorDisplaySizePx } from '../core/actor'
import {
  actorTextFontCss,
  clampActorTextFontSize,
} from '../core/actorText'
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
  /** When true, not painted for hit-testing; still mounted for layout tests. */
  hidden?: boolean
  /** Explicit path-edit preview label (does not change saved visibility). */
  editingPreview?: boolean
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
  hidden = false,
  editingPreview = false,
  rotationDeg = 0,
  scale = 1,
  onPointerDown,
}: ActorProps) {
  const { width, height } = actorDisplaySizePx(
    stageWidth,
    stageHeight,
    actor,
  )
  // Text matches CSS export: fixed wrap width, height from browser layout.
  const boxHeight: CSSProperties['height'] =
    actor.kind === 'text' ? 'auto' : height

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
    height: boxHeight,
    zIndex,
    transform: `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${scale})`,
    boxShadow: editingPreview
      ? '0 0 0 2px rgba(180, 83, 9, 0.55), 0 12px 28px rgba(15, 23, 42, 0.18)'
      : shadow,
    visibility: hidden ? 'hidden' : 'visible',
    pointerEvents: hidden ? 'none' : 'auto',
  }

  const label =
    actor.kind === 'image' && actor.image
      ? `Actor ${name}: ${actor.image.label}`
      : actor.kind === 'text' && actor.text
        ? `Actor ${name}: text`
        : `Actor ${name}`
  const ariaLabel = editingPreview
    ? `${label} (editing preview)`
    : armed
      ? `${label}. Drag to draw its path.`
      : recording
        ? `${label}. Recording — release to finish.`
        : label

  if (actor.kind === 'image' && actor.image) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text -- aria-label on interactive control
      <img
        role="button"
        tabIndex={hidden ? -1 : 0}
        aria-label={ariaLabel}
        aria-pressed={selected}
        aria-hidden={hidden ? true : undefined}
        data-testid={selected ? 'actor' : `actor-${actorId}`}
        data-actor-id={actorId}
        data-actor-kind="image"
        data-selected={selected ? 'true' : 'false'}
        data-hidden={hidden ? 'true' : 'false'}
        data-editing-preview={editingPreview ? 'true' : 'false'}
        src={actor.image.dataUrl}
        alt=""
        draggable={false}
        className="absolute cursor-grab touch-none select-none object-contain active:cursor-grabbing"
        style={{
          ...boxStyle,
          background: 'transparent',
          borderRadius: 0,
        }}
        onPointerDown={hidden ? undefined : onPointerDown}
      />
    )
  }

  if (actor.kind === 'text' && actor.text) {
    const minSide = Math.min(stageWidth, stageHeight)
    const fontPx = clampActorTextFontSize(actor.text.fontSize) * minSide
    return (
      <div
        role="button"
        tabIndex={hidden ? -1 : 0}
        aria-label={ariaLabel}
        aria-pressed={selected}
        aria-hidden={hidden ? true : undefined}
        data-testid={selected ? 'actor' : `actor-${actorId}`}
        data-actor-id={actorId}
        data-actor-kind="text"
        data-selected={selected ? 'true' : 'false'}
        data-hidden={hidden ? 'true' : 'false'}
        data-editing-preview={editingPreview ? 'true' : 'false'}
        className="absolute cursor-grab touch-none active:cursor-grabbing"
        style={{
          ...boxStyle,
          background: 'transparent',
          color: actor.color,
          fontSize: fontPx,
          fontWeight: actor.text.fontWeight,
          fontFamily: actorTextFontCss(actor.text.fontFamily),
          textAlign: actor.text.align,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.25,
          boxSizing: 'border-box',
          userSelect: 'text',
        }}
        onPointerDown={hidden ? undefined : onPointerDown}
      >
        <span
          data-testid={selected ? 'actor-text-body' : undefined}
          style={{ display: 'block', width: '100%', userSelect: 'text' }}
        >
          {actor.text.content}
        </span>
      </div>
    )
  }

  const radius = actor.borderRadius * 0.5 * Math.min(width, height)

  return (
    <div
      role="button"
      tabIndex={hidden ? -1 : 0}
      aria-label={ariaLabel}
      aria-pressed={selected}
      aria-hidden={hidden ? true : undefined}
      data-testid={selected ? 'actor' : `actor-${actorId}`}
      data-actor-id={actorId}
      data-actor-kind="shape"
      data-selected={selected ? 'true' : 'false'}
      data-hidden={hidden ? 'true' : 'false'}
      data-editing-preview={editingPreview ? 'true' : 'false'}
      className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
      style={{
        ...boxStyle,
        borderRadius: radius,
        background: actor.color,
      }}
      onPointerDown={hidden ? undefined : onPointerDown}
    />
  )
}
