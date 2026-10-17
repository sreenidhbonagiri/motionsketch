import { describe, expect, it } from 'vitest'
import {
  applyHandleDelta,
  copyPath,
  defaultInfluenceRadius,
  influenceWeight,
  selectHandleIndices,
  timestampsPreserved,
} from '../../src/core/edit'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import { applySteadySpeed, processMotion } from '../../src/core/process'
import type { MotionSample } from '../../src/core/types'
import { evaluate } from '../../src/core/playback'

function straightPath(): MotionSample[] {
  return Array.from({ length: 41 }, (_, i) => ({
    t: i * 25,
    x: 0.1 + (0.8 * i) / 40,
    y: 0.5,
  }))
}

describe('path edit core', () => {
  it('selects a manageable set of handles including endpoints', () => {
    const indices = selectHandleIndices(120, 9)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(119)
    expect(indices.length).toBeLessThanOrEqual(9)
    expect(indices.length).toBeGreaterThanOrEqual(2)
  })

  it('uses cosine falloff that is 1 at the handle and 0 at the radius', () => {
    expect(influenceWeight(10, 10, 8)).toBeCloseTo(1)
    expect(influenceWeight(18, 10, 8)).toBeCloseTo(0)
    expect(influenceWeight(14, 10, 8)).toBeGreaterThan(0)
    expect(influenceWeight(14, 10, 8)).toBeLessThan(1)
  })

  it('preserves timestamps and duration when moving a handle', () => {
    const path = straightPath()
    const mid = Math.floor(path.length / 2)
    const edited = applyHandleDelta(path, mid, { x: 0, y: -0.1 })
    expect(timestampsPreserved(path, edited)).toBe(true)
    expect(edited[edited.length - 1].t).toBe(path[path.length - 1].t)
    expect(edited[mid].y).toBeCloseTo(0.4, 5)
  })

  it('influences nearby samples more than distant ones', () => {
    const path = straightPath()
    const mid = 20
    const edited = applyHandleDelta(
      path,
      mid,
      { x: 0, y: 0.2 },
      defaultInfluenceRadius(path.length),
    )
    const near = Math.abs(edited[mid + 2].y - path[mid + 2].y)
    const far = Math.abs(edited[mid + 12].y - path[mid + 12].y)
    expect(near).toBeGreaterThan(far)
    expect(edited[0].y).toBeCloseTo(0.5, 5)
    expect(edited[path.length - 1].y).toBeCloseTo(0.5, 5)
  })

  it('keeps playback and export consistent after a geometry edit', () => {
    const baked = processMotion(straightPath(), 0.3, 0)
    const mid = Math.floor(baked.length / 2)
    const edited = applyHandleDelta(baked, mid, { x: 0.05, y: -0.08 })
    const playback = applySteadySpeed(edited, 0.4)
    const keyframes = buildKeyframesFromProcessed(playback)
    const err = maxPlaybackExportError(playback, keyframes, 40)
    expect(err).toBeLessThan(0.03)
    expect(evaluate(playback, 0)).toEqual({
      x: playback[0].x,
      y: playback[0].y,
    })
  })

  it('copyPath isolates mutations', () => {
    const path = straightPath()
    const clone = copyPath(path)
    clone[0].x = 0.99
    expect(path[0].x).toBeCloseTo(0.1, 5)
  })
})
