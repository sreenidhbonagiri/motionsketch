import { describe, expect, it } from 'vitest'
import {
  actorSizePx,
  centerFromPointer,
  clientToNormalized,
  formatPercent,
  grabOffsetFromPointer,
  normalizedToCssPercent,
} from '../../src/core/coords'

describe('coords', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 }

  it('maps client coordinates to normalized space', () => {
    expect(clientToNormalized(100, 50, rect)).toEqual({ x: 0, y: 0 })
    expect(clientToNormalized(200, 100, rect)).toEqual({ x: 0.5, y: 0.5 })
    expect(clientToNormalized(300, 150, rect)).toEqual({ x: 1, y: 1 })
  })

  it('clamps out-of-bounds pointer positions', () => {
    expect(clientToNormalized(0, 0, rect)).toEqual({ x: 0, y: 0 })
    expect(clientToNormalized(999, 999, rect)).toEqual({ x: 1, y: 1 })
  })

  it('round-trips normalized values to CSS percents', () => {
    expect(normalizedToCssPercent(0.25)).toBe(25)
    expect(formatPercent(0.5)).toBe('50.00%')
  })

  it('preserves grab offset so the actor does not snap', () => {
    const pointer = { x: 0.4, y: 0.6 }
    const actor = { x: 0.3, y: 0.5 }
    const grab = grabOffsetFromPointer(pointer, actor)
    expect(grab.x).toBeCloseTo(0.1)
    expect(grab.y).toBeCloseTo(0.1)
    const center = centerFromPointer(pointer, grab)
    expect(center.x).toBeCloseTo(actor.x)
    expect(center.y).toBeCloseTo(actor.y)
  })

  it('sizes the actor from the stage min-side', () => {
    expect(actorSizePx(800, 400, 0.12, 0.12)).toEqual({
      width: 48,
      height: 48,
    })
    expect(actorSizePx(300, 600, 0.1, 0.2)).toEqual({
      width: 30,
      height: 60,
    })
  })

  it('handles degenerate rects safely', () => {
    expect(clientToNormalized(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0.5,
      y: 0.5,
    })
  })
})
