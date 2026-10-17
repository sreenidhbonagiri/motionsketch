import { describe, expect, it } from 'vitest'
import {
  createSession,
  finish,
  pushSample,
} from '../../src/core/recording'

describe('recording', () => {
  it('rebases the first sample to t = 0', () => {
    let session = createSession()
    session = pushSample(session, 1000, 0.2, 0.3)
    session = pushSample(session, 1100, 0.4, 0.5)
    expect(session.samples[0]).toEqual({ t: 0, x: 0.2, y: 0.3 })
    expect(session.samples[1].t).toBe(100)
  })

  it('returns null for empty or tiny recordings', () => {
    expect(finish(createSession())).toBeNull()

    let short = createSession()
    short = pushSample(short, 0, 0.1, 0.1)
    short = pushSample(short, 10, 0.2, 0.2)
    expect(finish(short)).toBeNull()
  })

  it('keeps valid recordings with at least two samples', () => {
    let session = createSession()
    session = pushSample(session, 50, 0.1, 0.1)
    session = pushSample(session, 200, 0.8, 0.7)
    const recording = finish(session)
    expect(recording).not.toBeNull()
    expect(recording!.samples).toHaveLength(2)
    expect(recording!.recordedDurationMs).toBe(150)
  })

  it('clamps sample coordinates', () => {
    let session = createSession()
    session = pushSample(session, 0, -1, 2)
    expect(session.samples[0].x).toBe(0)
    expect(session.samples[0].y).toBe(1)
  })
})
