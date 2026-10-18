import { describe, expect, it } from 'vitest'
import { clamp01 } from '../../src/core/coords'
import { limitPathTranslationDelta } from '../../src/core/edit'
import {
  GRID_STEP,
  gridLineCoords,
  nearestGridPoint,
  normalizedDistancePx,
  resolveSnapTarget,
  snapGridAxis,
  snapPointIfEnabled,
  snapTranslationForAnchor,
} from '../../src/core/grid'
import type { MotionSample } from '../../src/core/types'

describe('project-space grid', () => {
  it('exposes a stable lattice including 0 and 1', () => {
    const lines = gridLineCoords()
    expect(lines[0]).toBe(0)
    expect(lines.at(-1)).toBe(1)
    expect(lines).toContain(GRID_STEP)
    expect(lines).toContain(0.5)
    // Step must divide [0,1] evenly.
    expect(lines).toHaveLength(Math.round(1 / GRID_STEP) + 1)
  })

  it('snap axis and nearest point stay on the lattice', () => {
    expect(snapGridAxis(0.12)).toBeCloseTo(0.1, 10)
    expect(snapGridAxis(0.13)).toBeCloseTo(0.15, 10)
    expect(snapGridAxis(-0.2)).toBe(0)
    expect(snapGridAxis(1.4)).toBe(1)
    const p = nearestGridPoint({ x: 0.33, y: 0.67 })
    expect(p.x).toBeCloseTo(0.35, 10)
    expect(p.y).toBeCloseTo(0.65, 10)
  })

  it('snapPointIfEnabled is a no-op when disabled', () => {
    const raw = { x: 0.33, y: 0.67 }
    expect(snapPointIfEnabled(raw, false)).toEqual(raw)
    expect(snapPointIfEnabled(raw, true)).toEqual(nearestGridPoint(raw))
  })

  it('release hysteresis avoids flicker between neighbors', () => {
    const w = 400
    const h = 400
    const near = { x: 0.1, y: 0.1 }
    const first = resolveSnapTarget(near, w, h, null)
    expect(first.engaged).toBe(true)
    expect(first.snapped!.x).toBeCloseTo(0.1, 10)
    expect(first.snapped!.y).toBeCloseTo(0.1, 10)

    // Drift toward 0.15 but stay within release radius of 0.10.
    const drift = { x: 0.112, y: 0.1 }
    const held = resolveSnapTarget(drift, w, h, first.snapped)
    expect(held.snapped!.x).toBeCloseTo(0.1, 10)

    // Far from held target — switch to the neighbor.
    const far = { x: 0.15, y: 0.1 }
    const next = resolveSnapTarget(far, w, h, first.snapped)
    expect(next.snapped!.x).toBeCloseTo(0.15, 10)
    expect(next.snapped!.y).toBeCloseTo(0.1, 10)

    // Mid-cell still snaps (no free zone while Snap is on).
    const mid = resolveSnapTarget({ x: 0.125, y: 0.125 }, w, h, null)
    expect(mid.engaged).toBe(true)
    expect(mid.snapped).not.toBeNull()
  })

  it('move-path snap reports actual reachable anchor when bounds clip', () => {
    const samples: MotionSample[] = [
      { t: 0, x: 0.9, y: 0.5 },
      { t: 100, x: 0.95, y: 0.5 },
      { t: 200, x: 1, y: 0.5 },
    ]
    const anchor = { x: samples[0]!.x, y: samples[0]!.y }
    // Ideal snap would pull start to 1.0 — impossible without overflowing end.
    const rawDelta = { x: 0.2, y: 0 }
    const result = snapTranslationForAnchor(
      anchor,
      rawDelta,
      (d) => limitPathTranslationDelta(samples, d),
      true,
      800,
      600,
      null,
    )
    expect(result.actualAnchor.x).toBeLessThanOrEqual(1)
    expect(result.actualAnchor.x + (1 - 0.9)).toBeLessThanOrEqual(1 + 1e-9)
    // Actual marker must match applied translation, not a false ideal.
    expect(result.actualAnchor.x).toBeCloseTo(
      clamp01(anchor.x + result.delta.x),
      10,
    )
    expect(result.actualAnchor.y).toBeCloseTo(0.5, 10)
  })

  it('normalizedDistancePx matches stage CSS mapping', () => {
    expect(
      normalizedDistancePx(
        { x: 0, y: 0 },
        { x: 0.05, y: 0 },
        1000,
        500,
      ),
    ).toBeCloseTo(50, 6)
  })
})
