import { describe, expect, it } from 'vitest'
import {
  addHandleIndex,
  applyHandleDelta,
  copyPath,
  cumulativeArcLengths,
  cycleHandleIndex,
  cycleWithinHandles,
  defaultInfluenceRadius,
  findNearbyHandleIndices,
  findNearestPathHit,
  formatHandleSelectionAnnouncement,
  influenceWeight,
  influenceWeightArc,
  makeGeometryEdit,
  MAX_PATH_HANDLES,
  normalizeHandleIndices,
  removeHandleIndex,
  selectHandleIndices,
  stationaryRunCenterIndex,
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
    expect(edited[edited.length - 1]!.t).toBe(path[path.length - 1]!.t)
    expect(edited[mid]!.y).toBeCloseTo(0.4, 5)
  })

  it('arc-length influence moves nearby samples more than distant ones', () => {
    const path = straightPath()
    const mid = 20
    const edited = applyHandleDelta(path, mid, { x: 0, y: 0.2 }, {
      stageAspect: 1.6,
    })
    const near = Math.abs(edited[mid + 2]!.y - path[mid + 2]!.y)
    const far = Math.abs(edited[mid + 12]!.y - path[mid + 12]!.y)
    expect(near).toBeGreaterThan(far)
    expect(edited[0]!.y).toBeCloseTo(0.5, 5)
    expect(edited[path.length - 1]!.y).toBeCloseTo(0.5, 5)
  })

  it('index influence remains available via forceIndex', () => {
    const path = straightPath()
    const mid = 20
    const edited = applyHandleDelta(path, mid, { x: 0, y: 0.2 }, {
      forceIndex: true,
      radius: defaultInfluenceRadius(path.length),
    })
    expect(edited[mid]!.y).toBeCloseTo(0.7, 5)
    expect(edited[0]!.y).toBeCloseTo(0.5, 5)
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
      x: playback[0]!.x,
      y: playback[0]!.y,
    })
  })

  it('copyPath isolates mutations', () => {
    const path = straightPath()
    const clone = copyPath(path)
    clone[0]!.x = 0.99
    expect(path[0]!.x).toBeCloseTo(0.1, 5)
  })
})

describe('user-controlled handles', () => {
  it('add/remove handle indices without changing sample geometry', () => {
    const path = straightPath()
    const base = makeGeometryEdit(path, 0.3)
    const before = copyPath(base.samples)
    const free =
      Array.from({ length: path.length - 2 }, (_, i) => i + 1).find(
        (i) => !base.handleIndices.includes(i),
      ) ?? 3
    const added = addHandleIndex(base.samples.length, base.handleIndices, free)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.handleIndices).toContain(free)
    expect(base.samples).toEqual(before)

    const removed = removeHandleIndex(
      base.samples.length,
      added.handleIndices,
      free,
    )
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.handleIndices).not.toContain(free)
    expect(removeHandleIndex(base.samples.length, base.handleIndices, 0).ok).toBe(
      false,
    )
  })

  it('rejects duplicates and enforces max handles', () => {
    const n = 80
    let indices = selectHandleIndices(n, 9)
    const mid = indices[2]!
    expect(addHandleIndex(n, indices, mid).reason).toBe('duplicate')

    indices = [0, n - 1]
    for (let i = 1; i < MAX_PATH_HANDLES - 1; i++) {
      const r = addHandleIndex(n, indices, i * 2)
      expect(r.ok).toBe(true)
      if (r.ok) indices = r.handleIndices
    }
    expect(indices.length).toBe(MAX_PATH_HANDLES)
    expect(addHandleIndex(n, indices, 3).reason).toBe('max')
  })

  it('older projects without handleIndices get evenly spaced defaults', () => {
    const path = straightPath()
    const normalized = normalizeHandleIndices(path.length, undefined)
    expect(normalized).toEqual(selectHandleIndices(path.length))
    const ge = makeGeometryEdit(path, 0.2, undefined)
    expect(ge.handleIndices[0]).toBe(0)
    expect(ge.handleIndices[ge.handleIndices.length - 1]).toBe(path.length - 1)
  })

  it('hit test prefers earlier segment at a crossing and uses screen tolerance', () => {
    // Figure-eight-ish: two segments pass near the same screen point.
    const samples: MotionSample[] = [
      { t: 0, x: 0.1, y: 0.2 },
      { t: 50, x: 0.5, y: 0.5 },
      { t: 100, x: 0.9, y: 0.2 },
      { t: 150, x: 0.5, y: 0.5 },
      { t: 200, x: 0.1, y: 0.8 },
    ]
    const w = 1000
    const h = 1000
    const hit = findNearestPathHit(samples, 500, 500, w, h, 1)
    expect(hit).toBeTruthy()
    // Earlier segment (0–1 or 1–2) wins over the later revisit of (0.5,0.5).
    expect(hit!.segmentIndex).toBeLessThan(3)
    expect(hit!.sampleIndex).toBeGreaterThanOrEqual(0)
    expect(hit!.sampleX).toBe(samples[hit!.sampleIndex]!.x)
    expect(hit!.sampleY).toBe(samples[hit!.sampleIndex]!.y)
  })

  it('ghost sample matches the handle that would be added (not segment projection)', () => {
    // Horizontal segment; pointer closer to sample 0 than sample 1, but mid-segment.
    const samples: MotionSample[] = [
      { t: 0, x: 0.0, y: 0.5 },
      { t: 100, x: 1.0, y: 0.5 },
      { t: 200, x: 1.0, y: 0.9 },
    ]
    const w = 1000
    const h = 1000
    // Projection is at (300,500); nearer sample endpoint is index 0 at (0,500).
    const hit = findNearestPathHit(samples, 300, 500, w, h, 1)
    expect(hit).toBeTruthy()
    expect(hit!.sampleIndex).toBe(0)
    expect(hit!.sampleX).toBe(0)
    expect(hit!.sampleY).toBe(0.5)
    // Ghost must not report the projected mid-segment x=0.3.
    expect(hit!.sampleX).not.toBeCloseTo(0.3, 2)
  })

  it('dense loop hit resolves to a real sample with matching ghost coords', () => {
    const n = 48
    const samples: MotionSample[] = Array.from({ length: n }, (_, i) => {
      const a = (i / (n - 1)) * Math.PI * 2
      return {
        t: i * 20,
        x: 0.5 + 0.3 * Math.cos(a),
        y: 0.5 + 0.3 * Math.sin(a),
      }
    })
    const w = 800
    const h = 800
    // Point near sample 12 on the circle.
    const target = samples[12]!
    const hit = findNearestPathHit(
      samples,
      target.x * w + 3,
      target.y * h - 2,
      w,
      h,
      1,
    )
    expect(hit).toBeTruthy()
    expect(hit!.sampleX).toBe(samples[hit!.sampleIndex]!.x)
    expect(hit!.sampleY).toBe(samples[hit!.sampleIndex]!.y)
    expect(
      Math.hypot(hit!.sampleX - target.x, hit!.sampleY - target.y),
    ).toBeLessThan(0.08)
  })

  it('stationary runs center the handle and share arc influence', () => {
    const samples: MotionSample[] = [
      { t: 0, x: 0.2, y: 0.5 },
      { t: 40, x: 0.5, y: 0.5 },
      { t: 80, x: 0.5, y: 0.5 },
      { t: 120, x: 0.5, y: 0.5 },
      { t: 160, x: 0.8, y: 0.5 },
    ]
    const center = stationaryRunCenterIndex(samples, 1, 1)
    expect(center).toBe(2)
    const arcs = cumulativeArcLengths(samples, 1)
    expect(influenceWeightArc(arcs, 1, 2, 1)).toBeCloseTo(1)
    expect(influenceWeightArc(arcs, 3, 2, 1)).toBeCloseTo(1)

    const w = 1000
    const h = 1000
    const hit = findNearestPathHit(samples, 500, 500, w, h, 1)
    expect(hit!.sampleIndex).toBe(2)
    expect(hit!.sampleX).toBe(0.5)
    expect(hit!.sampleY).toBe(0.5)
  })

  it('add/remove preserve sample geometry and timestamps byte-for-byte', () => {
    const path = straightPath()
    const handles = selectHandleIndices(path.length)
    const free =
      Array.from({ length: path.length - 2 }, (_, i) => i + 1).find(
        (i) => !handles.includes(i),
      ) ?? 5
    const stamp = path.map((s) => ({ t: s.t, x: s.x, y: s.y }))
    const added = addHandleIndex(path.length, handles, free)
    expect(added.ok).toBe(true)
    expect(path.map((s) => ({ t: s.t, x: s.x, y: s.y }))).toEqual(stamp)
    if (!added.ok) return
    const removed = removeHandleIndex(path.length, added.handleIndices, free)
    expect(removed.ok).toBe(true)
    expect(path.map((s) => ({ t: s.t, x: s.x, y: s.y }))).toEqual(stamp)
    expect(timestampsPreserved(path, path)).toBe(true)
  })

  it('cycles handles in path order and formats Point N of M', () => {
    const handles = [0, 4, 10, 20]
    expect(cycleHandleIndex(handles, 4, 1)).toBe(10)
    expect(cycleHandleIndex(handles, 20, 1)).toBe(0)
    expect(cycleHandleIndex(handles, 0, -1)).toBe(20)
    expect(cycleHandleIndex(handles, null, 1)).toBe(0)
    expect(cycleWithinHandles([4, 10, 20], 10)).toBe(20)
    expect(cycleWithinHandles([4, 10, 20], 20)).toBe(4)
    expect(formatHandleSelectionAnnouncement(handles, 10, 21)).toBe(
      'Point 3 of 4.',
    )
    expect(formatHandleSelectionAnnouncement(handles, 0, 21)).toContain(
      'endpoint',
    )
  })

  it('finds overlapping nearby handles sorted in path order', () => {
    const samples: MotionSample[] = [
      { t: 0, x: 0.1, y: 0.1 },
      { t: 50, x: 0.5, y: 0.5 },
      { t: 100, x: 0.5, y: 0.5 },
      { t: 150, x: 0.9, y: 0.9 },
    ]
    const handles = [0, 1, 2, 3]
    const nearby = findNearbyHandleIndices(
      samples,
      handles,
      500,
      500,
      1000,
      1000,
      14,
    )
    expect(nearby).toEqual([1, 2])
  })

  it('add then drag changes only local region; remove does not revert drag', () => {
    const baked = processMotion(straightPath(), 0.25, 0, 1.6)
    let handles = selectHandleIndices(baked.length)
    const addAt = Math.floor(baked.length / 3)
    const added = addHandleIndex(baked.length, handles, addAt)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    handles = added.handleIndices
    const afterAdd = copyPath(baked)
    const dragged = applyHandleDelta(afterAdd, addAt, { x: 0, y: -0.12 }, {
      stageAspect: 1.6,
    })
    expect(timestampsPreserved(afterAdd, dragged)).toBe(true)
    expect(dragged[addAt]!.y).toBeLessThan(afterAdd[addAt]!.y)
    const removed = removeHandleIndex(baked.length, handles, addAt)
    expect(removed.ok).toBe(true)
    // Geometry stays at the dragged shape — removing the control is not a reshape.
    expect(dragged[addAt]!.y).toBeLessThan(baked[addAt]!.y)
  })
})
