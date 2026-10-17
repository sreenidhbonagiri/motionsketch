import { describe, expect, it } from 'vitest'
import {
  elapsedFromPlayhead,
  evaluate,
  tNormFromElapsed,
  traversalElapsedMs,
} from '../../src/core/playback'
import type { MotionSample } from '../../src/core/types'

const path: MotionSample[] = [
  { t: 0, x: 0, y: 0 },
  { t: 100, x: 1, y: 0 },
  { t: 200, x: 1, y: 1 },
]

describe('playback', () => {
  it('returns endpoints exactly', () => {
    expect(evaluate(path, 0)).toEqual({ x: 0, y: 0 })
    expect(evaluate(path, 1)).toEqual({ x: 1, y: 1 })
  })

  it('interpolates midpoints', () => {
    expect(evaluate(path, 0.25)).toEqual({ x: 0.5, y: 0 })
    expect(evaluate(path, 0.75)).toEqual({ x: 1, y: 0.5 })
  })

  it('wraps when looping with repeat', () => {
    const looping = tNormFromElapsed(2500, 1000, true, 'repeat')
    expect(looping.finished).toBe(false)
    expect(looping.tNorm).toBeCloseTo(0.5)
    expect(looping.direction).toBe(1)
  })

  it('finishes when not looping', () => {
    const done = tNormFromElapsed(1500, 1000, false)
    expect(done).toEqual({ tNorm: 1, finished: true, direction: 1 })
  })

  it('stretches time via duration at the clock layer', () => {
    const mid = tNormFromElapsed(600, 1200, false)
    expect(mid.tNorm).toBeCloseTo(0.5)
    expect(evaluate(path, mid.tNorm).x).toBeCloseTo(1)
  })

  it('alternate reverses at endpoints without a position jump', () => {
    const duration = 1000
    const atEnd = tNormFromElapsed(duration, duration, true, 'alternate')
    expect(atEnd.tNorm).toBeCloseTo(1)
    expect(atEnd.direction).toBe(1)

    const justAfter = tNormFromElapsed(duration + 1, duration, true, 'alternate')
    expect(justAfter.tNorm).toBeCloseTo(1 - 1 / duration, 5)
    expect(justAfter.direction).toBe(-1)
    // Continuous with the endpoint within one millisecond of travel.
    expect(Math.abs(justAfter.tNorm - atEnd.tNorm)).toBeLessThan(0.002)

    const nearStartBackward = tNormFromElapsed(
      duration * 2 - 1,
      duration,
      true,
      'alternate',
    )
    expect(nearStartBackward.tNorm).toBeCloseTo(1 / duration, 5)
    expect(nearStartBackward.direction).toBe(-1)

    // Exact cycle boundary lands on the start of the next forward pass.
    const atStartAgain = tNormFromElapsed(
      duration * 2,
      duration,
      true,
      'alternate',
    )
    expect(atStartAgain.tNorm).toBeCloseTo(0)
    expect(atStartAgain.direction).toBe(1)

    const nextForward = tNormFromElapsed(
      duration * 2 + 1,
      duration,
      true,
      'alternate',
    )
    expect(nextForward.tNorm).toBeCloseTo(1 / duration, 5)
    expect(nextForward.direction).toBe(1)
  })

  it('maps playhead+direction back to elapsed for pause/resume', () => {
    const duration = 1000
    const forward = elapsedFromPlayhead(0.25, 1, duration, true, 'alternate')
    expect(forward).toBeCloseTo(250)
    const sample = tNormFromElapsed(forward, duration, true, 'alternate')
    expect(sample.tNorm).toBeCloseTo(0.25)
    expect(sample.direction).toBe(1)

    const backward = elapsedFromPlayhead(0.25, -1, duration, true, 'alternate')
    expect(backward).toBeCloseTo(1750)
    const backSample = tNormFromElapsed(backward, duration, true, 'alternate')
    expect(backSample.tNorm).toBeCloseTo(0.25)
    expect(backSample.direction).toBe(-1)
  })

  it('reports traversal elapsed from the start of the current pass', () => {
    expect(traversalElapsedMs(0.25, 1, 1000)).toBeCloseTo(250)
    expect(traversalElapsedMs(0.25, -1, 1000)).toBeCloseTo(750)
  })
})
