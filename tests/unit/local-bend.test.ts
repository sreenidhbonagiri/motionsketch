import { describe, expect, it } from 'vitest'
import {
  makeCornerAtHandle,
  makeCornerAvailability,
  makeGeometryEdit,
  selectHandleIndices,
  smoothBendAtHandle,
  smoothBendAvailability,
  timestampsPreserved,
} from '../../src/core/edit'
import type { MotionSample } from '../../src/core/types'

function line(n = 41): MotionSample[] {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 25,
    x: 0.1 + (0.8 * i) / (n - 1),
    y: 0.5,
  }))
}

/** Noisy right-angle-ish bend at mid with jagged approaches. */
function noisyBend(n = 41): MotionSample[] {
  const mid = Math.floor(n / 2)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 25
    if (i <= mid) {
      const u = i / mid
      const jag = i > 2 && i < mid - 1 ? ((i % 2) * 2 - 1) * 0.035 : 0
      return { t, x: 0.15 + 0.35 * u, y: 0.2 + 0.3 * u + jag }
    }
    const u = (i - mid) / (n - 1 - mid)
    const jag = i > mid + 1 && i < n - 2 ? ((i % 2) * 2 - 1) * 0.035 : 0
    return { t, x: 0.5 + 0.35 * u + jag, y: 0.5 - 0.25 * u }
  })
}

/** Smooth rounded turn (bulge off the corner chords). */
function roundedTurn(n = 41): MotionSample[] {
  const mid = Math.floor(n / 2)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 25
    if (i <= mid) {
      const u = i / mid
      // Quadratic ease away from the chord into a round shoulder.
      return {
        t,
        x: 0.15 + 0.35 * u,
        y: 0.2 + 0.3 * u + 0.12 * Math.sin(Math.PI * u),
      }
    }
    const u = (i - mid) / (n - 1 - mid)
    return {
      t,
      x: 0.5 + 0.35 * u,
      y: 0.5 - 0.25 * u + 0.12 * Math.sin(Math.PI * u),
    }
  })
}

function handlePos(samples: MotionSample[], index: number) {
  return { x: samples[index]!.x, y: samples[index]!.y }
}

describe('local Smooth bend / Make corner', () => {
  it('smooths a noisy bend without moving the selected handle or neighbors', () => {
    const samples = noisyBend()
    const handles = selectHandleIndices(samples.length, 9)
    const mid = handles[Math.floor(handles.length / 2)]!
    const before = handlePos(samples, mid)
    const neighborL = handles[handles.indexOf(mid) - 1]!
    const neighborR = handles[handles.indexOf(mid) + 1]!
    const leftBefore = handlePos(samples, neighborL)
    const rightBefore = handlePos(samples, neighborR)

    expect(smoothBendAvailability(samples, handles, mid, 1.6).enabled).toBe(
      true,
    )
    const result = smoothBendAtHandle(samples, handles, mid, 1.6)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.samples.length).toBe(samples.length)
    expect(timestampsPreserved(samples, result.samples)).toBe(true)
    expect(result.samples[mid]!.x).toBeCloseTo(before.x, 6)
    expect(result.samples[mid]!.y).toBeCloseTo(before.y, 6)
    expect(result.samples[neighborL]!.x).toBeCloseTo(leftBefore.x, 6)
    expect(result.samples[neighborR]!.y).toBeCloseTo(rightBefore.y, 6)
    expect(result.samples[0]).toEqual(samples[0])
    expect(result.samples[samples.length - 1]).toEqual(
      samples[samples.length - 1],
    )

    // Local roughness around the handle should drop.
    let beforeZig = 0
    let afterZig = 0
    for (let i = mid - 3; i <= mid + 3; i++) {
      if (i <= 0 || i >= samples.length - 1 || i === mid) continue
      beforeZig += Math.abs(
        samples[i]!.y - (samples[i - 1]!.y + samples[i + 1]!.y) * 0.5,
      )
      afterZig += Math.abs(
        result.samples[i]!.y -
          (result.samples[i - 1]!.y + result.samples[i + 1]!.y) * 0.5,
      )
    }
    expect(afterZig).toBeLessThan(beforeZig)
  })

  it('make corner sharpens a rounded turn without moving the apex', () => {
    const samples = roundedTurn()
    const handles = selectHandleIndices(samples.length, 9)
    const mid = handles[Math.floor(handles.length / 2)]!
    const before = handlePos(samples, mid)
    expect(makeCornerAvailability(samples, handles, mid, 1.6).enabled).toBe(
      true,
    )
    const result = makeCornerAtHandle(samples, handles, mid, 1.6)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.samples[mid]!.x).toBeCloseTo(before.x, 6)
    expect(result.samples[mid]!.y).toBeCloseTo(before.y, 6)
    expect(timestampsPreserved(samples, result.samples)).toBe(true)

    // Bulge toward the left chord should shrink.
    const lo = handles[handles.indexOf(mid) - 1]!
    const probe = Math.round((lo + mid) / 2)
    const bulgeBefore = Math.hypot(
      samples[probe]!.x -
        (samples[lo]!.x +
          (samples[mid]!.x - samples[lo]!.x) *
            ((probe - lo) / Math.max(1, mid - lo))),
      samples[probe]!.y -
        (samples[lo]!.y +
          (samples[mid]!.y - samples[lo]!.y) *
            ((probe - lo) / Math.max(1, mid - lo))),
    )
    const bulgeAfter = Math.hypot(
      result.samples[probe]!.x -
        (result.samples[lo]!.x +
          (result.samples[mid]!.x - result.samples[lo]!.x) *
            ((probe - lo) / Math.max(1, mid - lo))),
      result.samples[probe]!.y -
        (result.samples[lo]!.y +
          (result.samples[mid]!.y - result.samples[lo]!.y) *
            ((probe - lo) / Math.max(1, mid - lo))),
    )
    expect(bulgeAfter).toBeLessThan(bulgeBefore)
  })

  it('reports no meaningful corner on a straight segment', () => {
    const samples = line()
    const handles = selectHandleIndices(samples.length, 9)
    const mid = handles[Math.floor(handles.length / 2)]!
    const avail = makeCornerAvailability(samples, handles, mid, 1)
    expect(avail.enabled).toBe(false)
    expect(avail.reason).toBe('straight')
    expect(makeCornerAtHandle(samples, handles, mid, 1).ok).toBe(false)
  })

  it('protects stationary runs that are not the active handle', () => {
    const samples = noisyBend(51)
    // Plant a pause blob away from the mid handle.
    for (let i = 8; i <= 12; i++) {
      samples[i] = { t: samples[i]!.t, x: 0.22, y: 0.28 }
    }
    const handles = [0, 10, 25, 50]
    const mid = 25
    const pauseBefore = samples.slice(8, 13).map((s) => ({ ...s }))
    const result = smoothBendAtHandle(samples, handles, mid, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (let i = 0; i < pauseBefore.length; i++) {
      expect(result.samples[8 + i]).toEqual(pauseBefore[i])
    }
  })

  it('keeps co-located pause at the active handle together', () => {
    const samples = roundedTurn(41)
    const mid = 20
    for (let i = 18; i <= 22; i++) {
      samples[i] = {
        t: samples[i]!.t,
        x: samples[mid]!.x,
        y: samples[mid]!.y,
      }
    }
    const handles = [0, 10, mid, 30, 40]
    const apex = { x: samples[mid]!.x, y: samples[mid]!.y }
    const result = makeCornerAtHandle(samples, handles, mid, 1.6)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (let i = 18; i <= 22; i++) {
      expect(result.samples[i]!.x).toBeCloseTo(apex.x, 6)
      expect(result.samples[i]!.y).toBeCloseTo(apex.y, 6)
    }
  })

  it('handles uneven spacing and non-square aspect without moving endpoints', () => {
    const samples: MotionSample[] = []
    let t = 0
    for (let i = 0; i < 30; i++) {
      // Uneven spatial steps.
      const step = i < 10 ? 0.01 : i < 20 ? 0.04 : 0.02
      const prev = samples[i - 1]
      samples.push({
        t,
        x: prev ? Math.min(0.95, prev.x + step) : 0.1,
        y: 0.4 + (i % 5 === 0 ? 0.08 : 0) + (i === 15 ? 0.2 : 0),
      })
      t += i % 3 === 0 ? 10 : 40
    }
    const handles = [0, 8, 15, 22, 29]
    const result = smoothBendAtHandle(samples, handles, 15, 2.2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.samples[0]).toEqual(samples[0])
    expect(result.samples[29]).toEqual(samples[29])
    expect(result.samples[8]).toEqual(samples[8])
    expect(result.samples[22]).toEqual(samples[22])
    expect(result.samples[15]).toEqual(samples[15])
  })

  it('crossing path: local edit only touches the selected neighborhood', () => {
    // Two passes near the same point — earlier segment owns sample 1.
    const samples: MotionSample[] = [
      { t: 0, x: 0.1, y: 0.2 },
      { t: 40, x: 0.5, y: 0.5 },
      { t: 80, x: 0.9, y: 0.2 },
      { t: 120, x: 0.9, y: 0.8 },
      { t: 160, x: 0.5, y: 0.5 },
      { t: 200, x: 0.1, y: 0.8 },
      { t: 240, x: 0.1, y: 0.5 },
      { t: 280, x: 0.3, y: 0.5 },
      { t: 320, x: 0.5, y: 0.55 },
      { t: 360, x: 0.7, y: 0.5 },
      { t: 400, x: 0.9, y: 0.5 },
    ]
    // Nudge a bend around index 8.
    samples[7] = { t: 280, x: 0.3, y: 0.62 }
    samples[8] = { t: 320, x: 0.5, y: 0.7 }
    samples[9] = { t: 360, x: 0.7, y: 0.62 }
    const handles = [0, 2, 5, 8, 10]
    const far = samples.slice(0, 5).map((s) => ({ ...s }))
    const result = makeCornerAtHandle(samples, handles, 8, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (let i = 0; i < 5; i++) {
      expect(result.samples[i]).toEqual(far[i])
    }
  })

  it('zero-length neighborhood (adjacent handles) is unavailable', () => {
    const samples = line(20)
    // Neighbors immediately beside the selection → no movable samples.
    const handles = [0, 8, 9, 10, 19]
    const avail = smoothBendAvailability(samples, handles, 9, 1)
    expect(avail.enabled).toBe(false)
    expect(avail.reason).toBe('zero-neighborhood')
    expect(smoothBendAtHandle(samples, handles, 9, 1).ok).toBe(false)
  })

  it('endpoint selection cannot run either action', () => {
    const samples = noisyBend()
    const handles = selectHandleIndices(samples.length)
    expect(smoothBendAvailability(samples, handles, 0, 1).enabled).toBe(false)
    expect(makeCornerAvailability(samples, handles, samples.length - 1, 1).enabled).toBe(
      false,
    )
  })

  it('makeGeometryEdit after local bend keeps handle indices', () => {
    const samples = roundedTurn()
    const handles = selectHandleIndices(samples.length, 7)
    const mid = handles[2]!
    const result = makeCornerAtHandle(samples, handles, mid, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ge = makeGeometryEdit(result.samples, 0.3, handles)
    expect(ge.handleIndices).toEqual(handles)
    expect(ge.samples).toHaveLength(samples.length)
  })
})
