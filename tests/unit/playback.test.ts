import { describe, expect, it } from 'vitest'
import { evaluate, tNormFromElapsed } from '../../src/core/playback'
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

  it('wraps when looping', () => {
    const looping = tNormFromElapsed(2500, 1000, true)
    expect(looping.finished).toBe(false)
    expect(looping.tNorm).toBeCloseTo(0.5)
  })

  it('finishes when not looping', () => {
    const done = tNormFromElapsed(1500, 1000, false)
    expect(done).toEqual({ tNorm: 1, finished: true })
  })

  it('stretches time via duration at the clock layer', () => {
    const mid = tNormFromElapsed(600, 1200, false)
    expect(mid.tNorm).toBeCloseTo(0.5)
    expect(evaluate(path, mid.tNorm).x).toBeCloseTo(1)
  })
})
