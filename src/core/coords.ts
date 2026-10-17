import type { Vec2 } from './types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect | { left: number; top: number; width: number; height: number },
): Vec2 {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0.5, y: 0.5 }
  }
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  }
}

export function normalizedToCssPercent(value: number): number {
  return clamp01(value) * 100
}

export function formatPercent(value: number, digits = 2): string {
  return `${normalizedToCssPercent(value).toFixed(digits)}%`
}

/** Actor center in normalized coords from pointer + grab offset (normalized). */
export function centerFromPointer(
  pointer: Vec2,
  grabOffset: Vec2,
): Vec2 {
  return {
    x: clamp01(pointer.x - grabOffset.x),
    y: clamp01(pointer.y - grabOffset.y),
  }
}

export function grabOffsetFromPointer(
  pointer: Vec2,
  actorCenter: Vec2,
): Vec2 {
  return {
    x: pointer.x - actorCenter.x,
    y: pointer.y - actorCenter.y,
  }
}

export function actorSizePx(
  stageWidth: number,
  stageHeight: number,
  widthNorm: number,
  heightNorm: number,
): { width: number; height: number } {
  const minSide = Math.min(stageWidth, stageHeight)
  return {
    width: widthNorm * minSide,
    height: heightNorm * minSide,
  }
}
