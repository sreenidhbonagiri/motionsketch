import { describe, expect, it } from 'vitest'
import {
  applyEasing,
  bounceProgress,
  easeInOutSmoothstep,
  easeOutCubic,
  easingProgress,
  invEaseOutCubic,
  parseMotionEasing,
  positionAtArcProgress,
  springProgress,
  type MotionEasing,
} from '../../src/core/easing'
import {
  evaluateKeyframes,
  maxPlaybackExportError,
} from '../../src/core/export/consistency'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { evaluate } from '../../src/core/playback'
import { isInStationaryRun } from '../../src/core/process'
import { createSceneActor } from '../../src/core/sceneActor'
import { aspectDistance } from '../../src/core/stageAspect'
import type { MotionSample, Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'

const ASPECT = 1.6

function buildLine(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 40; i++) {
    const u = i / 40
    samples.push({ t: i * 40, x: 0.2 + u * 0.6, y: 0.5 })
  }
  return samples
}

/** Move → pause → move (repro: last hold at t=770). */
function buildPauseThenMove(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 15; i++) {
    samples.push({ t: i * 30, x: 0.25 + i * 0.01, y: 0.4 })
  }
  for (let i = 1; i <= 8; i++) {
    samples.push({ t: 450 + i * 40, x: 0.4, y: 0.4 })
  }
  for (let i = 1; i <= 30; i++) {
    samples.push({
      t: 770 + i * 30,
      x: 0.4 + i * 0.015,
      y: 0.4,
    })
  }
  return samples
}

function buildNearEdge(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 30; i++) {
    const u = i / 30
    samples.push({ t: i * 40, x: 0.7 + u * 0.28, y: 0.5 })
  }
  return samples
}

/** Start hold → short move → pause → move → end hold. */
function buildMultiPausePath(): MotionSample[] {
  const samples: MotionSample[] = []
  // Start hold
  for (let i = 0; i <= 5; i++) {
    samples.push({ t: i * 40, x: 0.2, y: 0.35 })
  }
  // Short moving lead (below easing minimum — must stay untouched)
  const shortStart = samples[samples.length - 1]!
  samples.push({ t: shortStart.t + 20, x: 0.22, y: 0.35 })
  samples.push({ t: shortStart.t + 40, x: 0.24, y: 0.35 })
  samples.push({ t: shortStart.t + 55, x: 0.26, y: 0.35 })
  // Mid pause
  const mid = samples[samples.length - 1]!
  for (let i = 1; i <= 8; i++) {
    samples.push({ t: mid.t + i * 40, x: mid.x, y: mid.y })
  }
  // Long move
  const bolt = samples[samples.length - 1]!
  for (let i = 1; i <= 36; i++) {
    samples.push({
      t: bolt.t + i * 30,
      x: bolt.x + i * 0.012,
      y: bolt.y + Math.sin(i / 10) * 0.02,
    })
  }
  // End hold
  const end = samples[samples.length - 1]!
  for (let i = 1; i <= 6; i++) {
    samples.push({ t: end.t + i * 40, x: end.x, y: end.y })
  }
  return samples
}

function pauseRuns(
  samples: MotionSample[],
  aspect = ASPECT,
): Array<{ entry: number; exit: number }> {
  const mask = samples.map((_, i) => isInStationaryRun(samples, i, 40, aspect))
  const runs: Array<{ entry: number; exit: number }> = []
  let i = 0
  while (i < mask.length) {
    if (!mask[i]) {
      i += 1
      continue
    }
    const entry = i
    while (i + 1 < mask.length && mask[i + 1]) i += 1
    runs.push({ entry, exit: i })
    i += 1
  }
  return runs
}

function assertTimestampsValid(samples: MotionSample[], duration: number) {
  expect(samples[0]!.t).toBe(0)
  expect(samples[samples.length - 1]!.t).toBe(duration)
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i]!.t).toBeGreaterThanOrEqual(samples[i - 1]!.t)
  }
}

function assertPauseHeld(
  raw: MotionSample[],
  eased: MotionSample[],
  aspect = ASPECT,
) {
  const runs = pauseRuns(raw, aspect)
  expect(runs.length).toBeGreaterThan(0)
  for (const { entry, exit } of runs) {
    const t0 = raw[entry]!.t
    const t1 = raw[exit]!.t
    const hold = { x: raw[entry]!.x, y: raw[entry]!.y }
    // Exact pause boundary samples survive.
    expect(
      eased.some(
        (s) =>
          Math.abs(s.t - t0) < 1e-6 &&
          Math.abs(s.x - hold.x) < 1e-9 &&
          Math.abs(s.y - hold.y) < 1e-9,
      ),
    ).toBe(true)
    expect(
      eased.some(
        (s) =>
          Math.abs(s.t - t1) < 1e-6 &&
          Math.abs(s.x - hold.x) < 1e-9 &&
          Math.abs(s.y - hold.y) < 1e-9,
      ),
    ).toBe(true)
    // Held pose throughout the pause window (evaluated, not index-matched).
    const duration = eased[eased.length - 1]!.t
    for (let k = 0; k <= 8; k++) {
      const t = t0 + ((t1 - t0) * k) / 8
      const pos = evaluate(eased, t / duration)
      expect(pos.x).toBeCloseTo(hold.x, 5)
      expect(pos.y).toBeCloseTo(hold.y, 5)
    }
  }
}

describe('easing curves', () => {
  it('parses unknown easing as linear', () => {
    expect(parseMotionEasing(undefined)).toBe('linear')
    expect(parseMotionEasing('nope')).toBe('linear')
    expect(parseMotionEasing('spring')).toBe('spring')
  })

  it('ease-out inverse round-trips', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      expect(invEaseOutCubic(easeOutCubic(u))).toBeCloseTo(u, 5)
    }
  })

  it('spring and bounce overshoot then settle at 1', () => {
    let springMax = 0
    let bounceMax = 0
    for (let i = 0; i <= 100; i++) {
      const u = i / 100
      springMax = Math.max(springMax, springProgress(u))
      bounceMax = Math.max(bounceMax, bounceProgress(u))
    }
    expect(springProgress(0)).toBe(0)
    expect(springProgress(1)).toBeCloseTo(1, 5)
    expect(springMax).toBeGreaterThan(1.02)
    expect(bounceProgress(0)).toBe(0)
    expect(bounceProgress(1)).toBeCloseTo(1, 5)
    expect(bounceMax).toBeGreaterThan(1.05)
    expect(easeInOutSmoothstep(0.5)).toBeCloseTo(0.5, 5)
    expect(easingProgress('linear', 0.3)).toBeCloseTo(0.3, 5)
  })
})

describe('applyEasing', () => {
  it('linear is identity on samples', () => {
    const samples = buildLine()
    const result = applyEasing(samples, 'linear', ASPECT)
    expect(result.changed).toBe(false)
    expect(result.samples).toEqual(samples.map((s) => ({ ...s })))
    expect(samples[10]).toEqual(buildLine()[10])
  })

  it('easeOut keeps duration/endpoints and advances early along the path', () => {
    const samples = buildLine()
    const result = applyEasing(samples, 'easeOut', ASPECT)
    expect(result.changed).toBe(true)
    expect(result.samples.length).toBe(samples.length)
    expect(result.samples[0]).toEqual(samples[0])
    expect(result.samples[result.samples.length - 1]!.x).toBe(
      samples[samples.length - 1]!.x,
    )
    expect(result.samples[result.samples.length - 1]!.t).toBe(
      samples[samples.length - 1]!.t,
    )
    // Same clock times; ease-out pulls early samples further along x.
    const mid = Math.floor(samples.length / 2)
    expect(result.samples[mid]!.t).toBe(samples[mid]!.t)
    expect(result.samples[mid]!.x).toBeGreaterThan(samples[mid]!.x)
  })

  it('preserves pause entry/exit times and held pose', () => {
    const samples = buildPauseThenMove()
    const pauseMask = samples.map((_, i) =>
      isInStationaryRun(samples, i, 40, ASPECT),
    )
    const entry = pauseMask.findIndex(Boolean)
    let exit = entry
    while (exit + 1 < pauseMask.length && pauseMask[exit + 1]) exit += 1
    expect(entry).toBeGreaterThan(0)
    expect(exit - entry).toBeGreaterThanOrEqual(3)

    const result = applyEasing(samples, 'easeInOut', ASPECT)
    expect(result.changed).toBe(true)
    expect(result.samples.length).toBe(samples.length)
    expect(result.samples[entry]!.t).toBeCloseTo(samples[entry]!.t, 5)
    expect(result.samples[exit]!.t).toBeCloseTo(samples[exit]!.t, 5)
    for (let i = entry; i <= exit; i++) {
      expect(result.samples[i]!.x).toBe(samples[i]!.x)
      expect(result.samples[i]!.y).toBe(samples[i]!.y)
      expect(result.samples[i]!.t).toBeCloseTo(samples[i]!.t, 5)
    }
  })

  it('spring invents overshoot past the end then settles', () => {
    const samples = buildLine()
    const endX = samples[samples.length - 1]!.x
    const result = applyEasing(samples, 'spring', ASPECT)
    expect(result.changed).toBe(true)
    expect(result.samples[0]!.x).toBeCloseTo(samples[0]!.x, 5)
    expect(result.samples[result.samples.length - 1]!.x).toBeCloseTo(endX, 5)
    expect(result.samples[result.samples.length - 1]!.t).toBe(
      samples[samples.length - 1]!.t,
    )
    const maxX = Math.max(...result.samples.map((s) => s.x))
    expect(maxX).toBeGreaterThan(endX + 0.01)
  })

  it('bounce overshoot clamps to stage bounds', () => {
    const samples = buildNearEdge()
    const result = applyEasing(samples, 'bounce', ASPECT)
    expect(result.changed).toBe(true)
    for (const s of result.samples) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(1)
    }
    expect(result.samples[result.samples.length - 1]!.x).toBeCloseTo(
      samples[samples.length - 1]!.x,
      5,
    )
  })

  it('does not mutate the input array', () => {
    const samples = buildLine()
    const fingerprint = JSON.stringify(samples)
    applyEasing(samples, 'bounce', ASPECT)
    applyEasing(samples, 'easeOut', ASPECT)
    expect(JSON.stringify(samples)).toBe(fingerprint)
  })
})

describe('positionAtArcProgress', () => {
  it('extrapolates along end tangent then clamps', () => {
    const samples: MotionSample[] = [
      { t: 0, x: 0.2, y: 0.5 },
      { t: 100, x: 0.5, y: 0.5 },
      { t: 200, x: 0.8, y: 0.5 },
    ]
    const dist = [0]
    for (let i = 1; i < samples.length; i++) {
      dist.push(
        dist[i - 1]! +
          aspectDistance(
            samples[i]!.x,
            samples[i]!.y,
            samples[i - 1]!.x,
            samples[i - 1]!.y,
            ASPECT,
          ),
      )
    }
    const table = {
      samples,
      dist,
      totalDist: dist[dist.length - 1]!,
      aspect: ASPECT,
    }
    const mid = positionAtArcProgress(table, 0.5)
    expect(mid.x).toBeCloseTo(0.5, 3)
    const past = positionAtArcProgress(table, 1.5)
    expect(past.x).toBeGreaterThan(0.8)
    expect(past.x).toBeLessThanOrEqual(1)
  })
})

describe('spring/bounce pause boundaries', () => {
  const kinds: Array<'spring' | 'bounce'> = ['spring', 'bounce']

  for (const kind of kinds) {
    it(`${kind} keeps the last held sample (move→pause→move repro)`, () => {
      const input = buildPauseThenMove()
      const fingerprint = JSON.stringify(input)
      const lastHold = input.find((s) => s.t === 770)!
      expect(lastHold).toEqual({ t: 770, x: 0.4, y: 0.4 })

      const result = applyEasing(input, kind, ASPECT)
      expect(result.changed).toBe(true)
      expect(JSON.stringify(input)).toBe(fingerprint)
      expect(result.samples).toContainEqual(lastHold)

      assertTimestampsValid(result.samples, input[input.length - 1]!.t)
      assertPauseHeld(input, result.samples)

      // Must not interpolate through the pause (730→800 would move).
      const duration = result.samples[result.samples.length - 1]!.t
      const midPause = evaluate(result.samples, 750 / duration)
      expect(midPause.x).toBeCloseTo(0.4, 5)
      expect(midPause.y).toBeCloseTo(0.4, 5)
    })

    it(`${kind} preserves multi-pause / start-end holds / short moves`, () => {
      const input = buildMultiPausePath()
      const fingerprint = JSON.stringify(input)
      const duration = input[input.length - 1]!.t
      const result = applyEasing(input, kind, ASPECT)

      expect(JSON.stringify(input)).toBe(fingerprint)
      expect(result.samples[result.samples.length - 1]!.t).toBe(duration)
      assertTimestampsValid(result.samples, duration)
      assertPauseHeld(input, result.samples)

      // Short lead (< MIN_EASING_SEGMENT_MS) stays as recorded samples.
      const short = input.slice(6, 9)
      for (const s of short) {
        expect(result.samples).toContainEqual(s)
      }
    })

    it(`${kind} playback and export agree at pause boundaries`, () => {
      const samples = buildPauseThenMove()
      // Geometry edit avoids processMotion's uniform resample so pauses stay
      // intact before easing (same as an edited path in the editor).
      const actor = createSceneActor({
        id: `${kind}-pause`,
        name: 'Pause Actor',
        recording: {
          samples: samples.map((s) => ({ ...s })),
          recordedDurationMs: samples[samples.length - 1]!.t,
        },
        geometryEdit: {
          samples: samples.map((s) => ({ ...s })),
          bakedSmoothing: 0,
          handleIndices: [0, samples.length - 1],
        },
        smoothing: 0,
        steadySpeed: 0,
        glide: 0,
        easing: kind as MotionEasing,
      })
      const project: Project = {
        version: 1,
        name: `${kind} pause export`,
        stageAspect: ASPECT,
        stageWidth: 1600,
        stageHeight: 1000,
        playback: {
          durationMs: samples[samples.length - 1]!.t,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [actor],
      }
      const path = selectProcessedPathForActor(project, actor)
      const kf = buildKeyframesFromProcessed(path)
      // Dense spring/bounce paths lose some mid-overshoot detail to RDP; still
      // require tight agreement — pause checks below are the contract.
      expect(maxPlaybackExportError(path, kf, 64)).toBeLessThan(0.025)

      const runs = pauseRuns(samples)
      const duration = path[path.length - 1]!.t
      for (const { entry, exit } of runs) {
        const hold = samples[entry]!
        for (const tMs of [
          hold.t,
          (samples[entry]!.t + samples[exit]!.t) / 2,
          samples[exit]!.t,
        ]) {
          const localT = tMs / duration
          const play = evaluate(path, localT)
          const exported = evaluateKeyframes(kf, localT)
          expect(play.x).toBeCloseTo(hold.x, 3)
          expect(play.y).toBeCloseTo(hold.y, 3)
          expect(exported.x).toBeCloseTo(play.x, 3)
          expect(exported.y).toBeCloseTo(play.y, 3)
        }
      }
    })
  }
})
