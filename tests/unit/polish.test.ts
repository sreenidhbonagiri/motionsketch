import { describe, expect, it } from 'vitest'
import {
  buildPolishProtection,
  maxDensePolylineDeviation,
  polishMotion,
} from '../../src/core/polish'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import type { MotionSample } from '../../src/core/types'
import { buildPolishMotionFixtureProject } from '../fixtures/polishMotionProject'
import { POLISH_EDITED_ACTOR_ID } from '../fixtures/polishMotionProject'

function sampleLine(
  n: number,
  mutate?: (i: number, s: MotionSample) => MotionSample,
): MotionSample[] {
  const out: MotionSample[] = []
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    let s: MotionSample = { t: i * 40, x: 0.2 + 0.6 * u, y: 0.5 }
    if (mutate) s = mutate(i, s)
    out.push(s)
  }
  return out
}

describe('polishMotion', () => {
  it('is deterministic', () => {
    const samples = sampleLine(40, (i, s) =>
      i > 0 && i < 39
        ? { ...s, y: s.y + (i % 2 === 0 ? 0.012 : -0.01) }
        : s,
    )
    const a = polishMotion(samples, { strength: 0.6, stageAspect: 1.6 })
    const b = polishMotion(samples, { strength: 0.6, stageAspect: 1.6 })
    expect(a.samples).toEqual(b.samples)
    expect(a.changed).toBe(b.changed)
  })

  it('reduces wobble on a shaky curve within deviation bound', () => {
    const samples = sampleLine(48, (i, s) => {
      if (i === 0 || i === 47) return s
      const wobble = Math.sin(i * 1.7) * 0.014
      return { ...s, y: s.y + wobble, x: s.x + Math.cos(i * 2.1) * 0.008 }
    })
    const result = polishMotion(samples, {
      strength: 0.7,
      stageAspect: 1.6,
      anchorIndices: [0, 47],
    })
    expect(result.changed).toBe(true)
    expect(result.maxDeviation).toBeLessThanOrEqual(0.018 * 1.15 + 1e-6)
    // Endpoints pinned
    expect(result.samples[0]).toMatchObject({
      x: samples[0]!.x,
      y: samples[0]!.y,
    })
    expect(result.samples.at(-1)).toMatchObject({
      x: samples.at(-1)!.x,
      y: samples.at(-1)!.y,
    })
    expect(result.samples.at(-1)!.t).toBe(samples.at(-1)!.t)
  })

  it('preserves a deliberate hard corner and anchored handles', () => {
    const samples = sampleLine(30, (i, s) => {
      if (i < 15) return { ...s, x: 0.2 + (i / 14) * 0.35, y: 0.3 }
      if (i === 15) return { ...s, x: 0.55, y: 0.3 }
      return { ...s, x: 0.55, y: 0.3 + ((i - 15) / 14) * 0.4 }
    })
    const corner = 15
    const result = polishMotion(samples, {
      strength: 0.8,
      stageAspect: 1.8,
      anchorIndices: [0, corner, 29],
    })
    expect(result.samples[corner]!.x).toBeCloseTo(samples[corner]!.x, 6)
    expect(result.samples[corner]!.y).toBeCloseTo(samples[corner]!.y, 6)
    const mask = buildPolishProtection(samples, 1.8, [corner])
    expect(mask[corner]).toBe(true)
  })

  it('preserves a pause followed by movement', () => {
    const samples: MotionSample[] = []
    for (let i = 0; i < 20; i++) {
      samples.push({ t: i * 50, x: 0.3, y: 0.4 })
    }
    for (let i = 0; i < 20; i++) {
      const u = i / 19
      samples.push({
        t: 1000 + i * 40,
        x: 0.3 + 0.4 * u,
        y: 0.4 + 0.2 * u,
      })
    }
    const result = polishMotion(samples, {
      strength: 0.6,
      stageAspect: 1.5,
    })
    // Mid-pause sample stays put
    expect(result.samples[10]!.x).toBeCloseTo(0.3, 5)
    expect(result.samples[10]!.y).toBeCloseTo(0.4, 5)
    expect(result.samples.at(-1)!.t).toBe(samples.at(-1)!.t)
  })

  it('does not invent loops on a long leap near a corner', () => {
    const samples = sampleLine(24, (i, s) => {
      if (i === 18) return { ...s, x: 0.85, y: 0.25 }
      if (i === 19) return { ...s, x: 0.7, y: 0.35 }
      if (i === 20) return { ...s, x: 0.88, y: 0.45 }
      return s
    })
    const before = samples.map((s) => ({ ...s }))
    const result = polishMotion(samples, {
      strength: 0.75,
      stageAspect: 2.0,
      anchorIndices: [0, 18, 19, 20, 23],
    })
    // Anchored leap vertices stay put — no spline overshoot past them.
    for (const idx of [18, 19, 20]) {
      expect(result.samples[idx]!.x).toBeCloseTo(before[idx]!.x, 6)
      expect(result.samples[idx]!.y).toBeCloseTo(before[idx]!.y, 6)
    }
  })

  it('leaves short paths and already-clean paths unchanged', () => {
    const short = sampleLine(2)
    const shortResult = polishMotion(short, { strength: 0.5, stageAspect: 1 })
    expect(shortResult.changed).toBe(false)
    expect(shortResult.reason).toMatch(/too short/i)

    const clean = sampleLine(20)
    const cleanResult = polishMotion(clean, {
      strength: 0.5,
      stageAspect: 1.2,
    })
    expect(cleanResult.changed).toBe(false)
    expect(cleanResult.reason).toMatch(/already clean|Nothing to polish/i)
  })

  it('accounts for non-square stage aspect in deviation', () => {
    const samples = sampleLine(36, (i, s) =>
      i > 0 && i < 35 ? { ...s, y: s.y + (i % 2 === 0 ? 0.01 : -0.008) } : s,
    )
    const wide = polishMotion(samples, { strength: 0.6, stageAspect: 2.2 })
    const tall = polishMotion(samples, { strength: 0.6, stageAspect: 0.7 })
    expect(wide.samples).not.toEqual(tall.samples)
    if (wide.changed) {
      expect(wide.maxDeviation).toBeLessThanOrEqual(0.018 * 1.15 + 1e-6)
    }
  })

  it('polishes the edited fixture actor without moving late corner handles', () => {
    const project = buildPolishMotionFixtureProject()
    const actor = project.actors.find((a) => a.id === POLISH_EDITED_ACTOR_ID)!
    const ge = actor.geometryEdit!
    const cornerHandle = 114
    expect(ge.handleIndices).toContain(cornerHandle)
    const result = polishMotion(ge.samples, {
      strength: 0.55,
      stageAspect: project.stageAspect,
      anchorIndices: ge.handleIndices,
    })
    for (const h of ge.handleIndices) {
      expect(result.samples[h]!.x).toBeCloseTo(ge.samples[h]!.x, 6)
      expect(result.samples[h]!.y).toBeCloseTo(ge.samples[h]!.y, 6)
    }
    expect(result.samples[0]!.t).toBe(0)
    expect(result.samples.at(-1)!.t).toBe(ge.samples.at(-1)!.t)

    if (result.changed) {
      const dense = maxDensePolylineDeviation(
        ge.samples,
        result.samples,
        project.stageAspect,
      )
      expect(dense).toBeLessThanOrEqual(0.018 * 1.15 + 1e-5)
      const kfs = buildKeyframesFromProcessed(result.samples)
      const err = maxPlaybackExportError(result.samples, kfs, 48)
      expect(err).toBeLessThan(0.02)
    }
  })
})
