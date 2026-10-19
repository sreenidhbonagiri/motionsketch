import { describe, expect, it } from 'vitest'
import {
  buildHeadingTrack,
  evaluateActorRotationDeg,
  HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  HEADING_EXPORT_ERROR_PROBE_COUNT,
  HEADING_EXPORT_MAX_OFFSETS,
  HEADING_EXPORT_STEP_DEG,
  headingExportOffsets,
  measureExportHeadingError,
  mergeExportLocalOffsets,
  mergeExportLocalOffsetsUniform,
  pauseExportOffsets,
} from '../../src/core/faceAlongPath'
import {
  buildProjectCssExport,
  unionExportOffsets,
} from '../../src/core/export/css'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { makeGeometryEdit } from '../../src/core/edit'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'

const ASPECT = 1.6

/**
 * Dense geometry spiral (like a geometry-edit path) — many samples and many
 * revolutions so unique export offsets exceed the hard cap.
 */
function buildDenseSpiral(points = 400, turns = 10): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i < points; i++) {
    const u = i / (points - 1)
    const ang = turns * Math.PI * 2 * u
    const r = 0.06 + 0.28 * u
    samples.push({
      t: i * 16,
      x: 0.5 + r * Math.cos(ang),
      y: 0.5 + r * Math.sin(ang),
    })
  }
  return samples
}

function rotationEvaluator(processed: MotionSample[]) {
  const track = buildHeadingTrack(processed, ASPECT)
  const actor = createSceneActor({
    faceAlongPath: true,
    directionOffsetDeg: 0,
    transform: { keyframes: [] },
    recording: {
      samples: processed,
      recordedDurationMs: processed[processed.length - 1]!.t,
    },
  })
  return (localT: number) =>
    evaluateActorRotationDeg(actor, processed, localT, ASPECT, track)
}

function spiralProject(processed: MotionSample[]): Project {
  const actor = createSceneActor({
    id: 'spiral',
    name: 'Spiral',
    faceAlongPath: true,
    directionOffsetDeg: 0,
    transform: { keyframes: [] },
    recording: {
      samples: processed.map((s) => ({ ...s })),
      recordedDurationMs: processed[processed.length - 1]!.t,
    },
    geometryEdit: makeGeometryEdit(processed, 0),
    smoothing: 0,
    steadySpeed: 0,
  })
  return {
    version: 1,
    name: 'Spiral fidelity',
    actors: [actor],
    playback: {
      durationMs: 4000,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: ASPECT,
  }
}

describe('face-along export fidelity', () => {
  it('demonstrates uniform thinning exceeds angular tolerance on a tight spiral', () => {
    const processed = buildDenseSpiral()
    const headingOff = headingExportOffsets(processed, ASPECT)
    // Sparse position/transform base so the stress cap is spent on heading
    // (mandatory base offsets are never thinned for facing).
    const base = [0, 1]
    const uniqueBefore = new Set([...base, ...headingOff]).size
    const stressCap = 60
    const uniform = mergeExportLocalOffsetsUniform(base, headingOff, stressCap)
    const rotationAt = rotationEvaluator(processed)
    const track = buildHeadingTrack(processed, ASPECT)
    const headingSpan =
      track[track.length - 1]!.headingDeg - track[0]!.headingDeg
    const maxErrDeg = measureExportHeadingError(uniform, rotationAt)
    const adaptive = mergeExportLocalOffsets(
      base,
      headingOff,
      stressCap,
      rotationAt,
    )

    expect(uniqueBefore).toBeGreaterThan(stressCap)
    expect(uniform.length).toBeLessThanOrEqual(stressCap)
    expect(Math.abs(headingSpan)).toBeGreaterThan(360 * 3)
    expect(maxErrDeg).toBeGreaterThan(HEADING_EXPORT_ANGULAR_TOLERANCE_DEG)
    expect(adaptive.maxErrDeg).toBeLessThan(maxErrDeg)
    // Base endpoints always survive.
    expect(adaptive.offsets[0]).toBe(0)
    expect(adaptive.offsets[adaptive.offsets.length - 1]).toBe(1)

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'uniform-thin-mismatch',
        stepDeg: HEADING_EXPORT_STEP_DEG,
        toleranceDeg: HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
        probeCount: HEADING_EXPORT_ERROR_PROBE_COUNT,
        maxOffsets: stressCap,
        uniqueBefore,
        uniformMaxErrDeg: maxErrDeg,
        adaptiveMaxErrDeg: adaptive.maxErrDeg,
        adaptiveWarning: !!adaptive.fidelityWarning,
      }),
    )
  })

  it('enforces a strict 3° sampled tolerance (no 0.05° slack) on the dense spiral', () => {
    const processed = buildDenseSpiral()
    const headingOff = headingExportOffsets(processed, ASPECT)
    const posKf = buildKeyframesFromProcessed(processed)
    const base = unionExportOffsets(posKf, { keyframes: [] })
    const rotationAt = rotationEvaluator(processed)
    const merged = mergeExportLocalOffsets(
      base,
      headingOff,
      HEADING_EXPORT_MAX_OFFSETS,
      rotationAt,
    )

    // Mandatory position offsets always retained.
    for (const t of base) {
      expect(merged.offsets.some((o) => Math.abs(o - t) < 1e-9)).toBe(true)
    }
    expect(merged.offsets.length).toBeLessThanOrEqual(
      Math.max(HEADING_EXPORT_MAX_OFFSETS, base.length),
    )
    expect(merged.offsets[0]).toBe(0)
    expect(merged.offsets[merged.offsets.length - 1]).toBe(1)

    // Probe-driven densify brings the former ~3.04° miss under the strict 3°
    // sampled check (no 0.05° acceptance slack).
    expect(merged.maxErrDeg).toBeLessThanOrEqual(
      HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
    )
    expect(merged.fidelityWarning).toBeNull()

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'strict-tolerance-dense-spiral',
        toleranceDeg: HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
        maxOffsets: HEADING_EXPORT_MAX_OFFSETS,
        maxErrDeg: merged.maxErrDeg,
        meetsTolerance: true,
        warning: merged.fidelityWarning,
      }),
    )
  })

  it('regression: former ~3.04° uniform-thin case meets 3° via probe densify or warns', () => {
    // Uniform thinning of the full candidate set at the production cap previously
    // measured ~3.04° and the 0.05° acceptance slack hid the miss.
    const processed = buildDenseSpiral()
    const headingOff = headingExportOffsets(processed, ASPECT)
    const posKf = buildKeyframesFromProcessed(processed)
    const fullBase = unionExportOffsets(posKf, { keyframes: [] })
    const rotationAt = rotationEvaluator(processed)
    const uniformErr = measureExportHeadingError(
      mergeExportLocalOffsetsUniform(fullBase, headingOff, 120),
      rotationAt,
    )
    expect(uniformErr).toBeGreaterThan(HEADING_EXPORT_ANGULAR_TOLERANCE_DEG)
    expect(uniformErr).toBeLessThan(HEADING_EXPORT_ANGULAR_TOLERANCE_DEG + 0.1)

    // Adaptive with mandatory position base preserved + heading densify.
    const merged = mergeExportLocalOffsets(
      fullBase,
      headingOff,
      120,
      rotationAt,
    )
    for (const t of fullBase) {
      expect(merged.offsets.some((o) => Math.abs(o - t) < 1e-9)).toBe(true)
    }
    if (merged.maxErrDeg <= HEADING_EXPORT_ANGULAR_TOLERANCE_DEG) {
      expect(merged.fidelityWarning).toBeNull()
      expect(merged.maxErrDeg).toBeLessThan(uniformErr)
    } else {
      expect(merged.fidelityWarning).not.toBeNull()
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'regression-3.04-slack',
        uniformErrDeg: uniformErr,
        adaptiveErrDeg: merged.maxErrDeg,
        warning: merged.fidelityWarning,
      }),
    )
  })

  it('surfaces a fidelity warning when the hard cap cannot meet tolerance', () => {
    const processed = buildDenseSpiral(500, 14)
    const headingOff = headingExportOffsets(processed, ASPECT)
    // Tiny heading budget with minimal mandatory base.
    const base = [0, 1]
    const rotationAt = rotationEvaluator(processed)
    const merged = mergeExportLocalOffsets(base, headingOff, 24, rotationAt)

    expect(merged.offsets.length).toBeLessThanOrEqual(24)
    expect(merged.offsets).toEqual(expect.arrayContaining([0, 1]))
    expect(merged.maxErrDeg).toBeGreaterThan(HEADING_EXPORT_ANGULAR_TOLERANCE_DEG)
    expect(merged.fidelityWarning).toMatch(/sampled angular error/i)
    expect(merged.fidelityWarning).toMatch(/24 keyframes/)

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'adaptive-over-budget-warning',
        maxOffsets: 24,
        maxErrDeg: merged.maxErrDeg,
        warning: merged.fidelityWarning,
      }),
    )
  })

  it('exposes plain-language warnings via buildProjectCssExport (Export panel)', () => {
    // Extreme spiral: production 120-keyframe budget cannot meet the sampled 3°.
    const processed = buildDenseSpiral(800, 30)
    const bundle = buildProjectCssExport(spiralProject(processed))
    expect(bundle.facingFidelityWarnings.length).toBeGreaterThan(0)
    const notice = bundle.facingFidelityWarnings[0]!
    expect(notice.maxErrDeg).toBeGreaterThan(HEADING_EXPORT_ANGULAR_TOLERANCE_DEG)
    expect(notice.plainMessage).toMatch(/Facing export/i)
    expect(notice.plainMessage).toMatch(/sample grid/i)
    expect(notice.plainMessage).toMatch(/still copy or download/i)
    expect(notice.cssComment).toMatch(/sampled angular error/i)
    expect(bundle.css).toContain(notice.cssComment)
    expect(bundle.css).toMatch(/Sampled angular export check/i)
  })

  it('preserves pause boundaries under adaptive merge', () => {
    const samples: MotionSample[] = []
    for (let i = 0; i < 15; i++) {
      samples.push({ t: i * 40, x: 0.2 + (i / 14) * 0.3, y: 0.4 })
    }
    for (let i = 0; i < 6; i++) {
      samples.push({ t: (15 + i) * 40, x: 0.5, y: 0.4 })
    }
    for (let i = 1; i <= 15; i++) {
      samples.push({
        t: (20 + i) * 40,
        x: 0.5,
        y: 0.4 + (i / 15) * 0.3,
      })
    }
    const headingOff = headingExportOffsets(samples, ASPECT)
    const duration = samples[samples.length - 1]!.t
    const pauseStart = clampLocal(samples[14]!.t / duration)
    const pauseEnd = clampLocal(samples[20]!.t / duration)
    expect(headingOff.some((t) => Math.abs(t - pauseStart) < 1e-6)).toBe(true)
    expect(headingOff.some((t) => Math.abs(t - pauseEnd) < 1e-6)).toBe(true)

    const rotationAt = rotationEvaluator(samples)
    const merged = mergeExportLocalOffsets(
      [0, 0.5, 1],
      headingOff,
      40,
      rotationAt,
      HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
      pauseExportOffsets(samples, ASPECT),
    )
    expect(merged.offsets.some((t) => Math.abs(t - pauseStart) < 1e-6)).toBe(
      true,
    )
    expect(merged.offsets.some((t) => Math.abs(t - pauseEnd) < 1e-6)).toBe(true)
  })

  it('keeps additive multi-turn unwrapped progression in export samples', () => {
    const processed = buildDenseSpiral(300, 5)
    const track = buildHeadingTrack(processed, ASPECT)
    const span =
      track[track.length - 1]!.headingDeg - track[0]!.headingDeg
    expect(Math.abs(span)).toBeGreaterThan(360 * 4)

    const rotationAt = rotationEvaluator(processed)
    const headingOff = headingExportOffsets(processed, ASPECT)
    const posKf = buildKeyframesFromProcessed(processed)
    const base = unionExportOffsets(posKf, { keyframes: [] })
    const { offsets } = mergeExportLocalOffsets(
      base,
      headingOff,
      HEADING_EXPORT_MAX_OFFSETS,
      rotationAt,
    )
    const rots = offsets.map((t) => rotationAt(t))

    let increases = 0
    for (let i = 1; i < rots.length; i++) {
      if (rots[i]! > rots[i - 1]!) increases++
    }
    expect(increases).toBeGreaterThan(rots.length * 0.85)
    expect(Math.abs(rots[rots.length - 1]! - rots[0]!)).toBeGreaterThan(
      360 * 4,
    )

    const mid = rots[Math.floor(rots.length / 2)]!
    expect(Math.abs(mid - rots[0]!)).toBeGreaterThan(360)
  })
})

function clampLocal(t: number): number {
  return Math.min(1, Math.max(0, t))
}
