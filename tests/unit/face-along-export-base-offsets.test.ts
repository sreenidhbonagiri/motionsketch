import { describe, expect, it } from 'vitest'
import {
  HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  HEADING_EXPORT_MAX_OFFSETS,
  evaluateActorRotationDeg,
  headingExportOffsets,
  mergeExportLocalOffsets,
  pauseExportOffsets,
} from '../../src/core/faceAlongPath'
import {
  buildProjectCssExport,
  unionExportOffsets,
} from '../../src/core/export/css'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { evaluateKeyframes } from '../../src/core/export/consistency'
import { makeGeometryEdit } from '../../src/core/edit'
import { createSceneActor } from '../../src/core/sceneActor'
import { evaluateTransform } from '../../src/core/transform'
import type { MotionSample, Project } from '../../src/core/types'

const ASPECT = 1.6

/**
 * Straight horizontal path with a mid-path speed change (x=.2 at half time)
 * plus scale keys 1 → 3 → 1. Facing is on but rotation stays ~0°.
 */
function buildStraightScaleScene() {
  const samples: MotionSample[] = [
    { t: 0, x: 0.1, y: 0.5 },
    { t: 500, x: 0.2, y: 0.5 },
    { t: 1000, x: 0.9, y: 0.5 },
  ]
  const actor = createSceneActor({
    id: 'straight-scale',
    name: 'Straight scale',
    faceAlongPath: true,
    directionOffsetDeg: 0,
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: 1000,
    },
    geometryEdit: makeGeometryEdit(samples, 0),
    smoothing: 0,
    steadySpeed: 0,
    transform: {
      keyframes: [
        { id: 's0', t: 0, rotationDeg: 0, scale: 1 },
        { id: 's1', t: 0.5, rotationDeg: 0, scale: 3 },
        { id: 's2', t: 1, rotationDeg: 0, scale: 1 },
      ],
    },
  })
  const project: Project = {
    version: 1,
    name: 'Straight scale facing',
    actors: [actor],
    playback: {
      durationMs: 1000,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: ASPECT,
  }
  return { project, actor, samples }
}

describe('face-along export preserves position/transform offsets', () => {
  it('keeps the mid transform/position keyframe (regression: dropped 0.5 → x=.5 scale 1)', () => {
    const { actor, samples } = buildStraightScaleScene()
    const posKf = buildKeyframesFromProcessed(samples)
    const base = unionExportOffsets(posKf, actor.transform)
    expect(base).toContain(0.5)

    const rotationAt = (t: number) =>
      evaluateActorRotationDeg(actor, samples, t, ASPECT)
    const merged = mergeExportLocalOffsets(
      base,
      headingExportOffsets(samples, ASPECT),
      HEADING_EXPORT_MAX_OFFSETS,
      rotationAt,
      HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
      pauseExportOffsets(samples, ASPECT),
    )

    // Mandatory base offsets must survive facing densify.
    for (const t of base) {
      expect(
        merged.offsets.some((o) => Math.abs(o - t) < 1e-9),
        `missing mandatory base offset ${t}`,
      ).toBe(true)
    }

    // Editor truth at halfway.
    const midPos = evaluateKeyframes(posKf, 0.5)
    const midXf = evaluateTransform(actor.transform, 0.5)
    expect(midPos.x).toBeCloseTo(0.2, 5)
    expect(midXf.scale).toBeCloseTo(3, 5)

    // Export keyframe set must still evaluate the same pose at 0.5
    // (CSS only samples at merged offsets — dropping 0.5 lerps 0→1 → x=.5 scale 1).
    expect(merged.offsets.some((o) => Math.abs(o - 0.5) < 1e-9)).toBe(true)
    const exportPos = evaluateKeyframes(posKf, 0.5)
    const exportXf = evaluateTransform(actor.transform, 0.5)
    expect(exportPos.x).toBeCloseTo(0.2, 5)
    expect(exportXf.scale).toBeCloseTo(3, 5)
  })

  it('does not replace base offsets when heading budget is tight', () => {
    const { actor, samples } = buildStraightScaleScene()
    const posKf = buildKeyframesFromProcessed(samples)
    const base = unionExportOffsets(posKf, actor.transform)
    const rotationAt = (t: number) =>
      evaluateActorRotationDeg(actor, samples, t, ASPECT)
    // Tiny total cap: base must still win over heading-only optimization.
    const merged = mergeExportLocalOffsets(
      base,
      headingExportOffsets(samples, ASPECT),
      Math.max(base.length, 3),
      rotationAt,
    )
    for (const t of base) {
      expect(merged.offsets.some((o) => Math.abs(o - t) < 1e-9)).toBe(true)
    }
  })

  it('exported CSS keyframes include the mid scale pose', () => {
    const { project } = buildStraightScaleScene()
    const { css } = buildProjectCssExport(project)
    // Mid keyframe should appear (50%) with a large scale near 3.
    expect(css).toMatch(/50%/)
    const midBlock = css.match(/50%\s*\{[^}]+\}/)
    expect(midBlock).not.toBeNull()
    expect(midBlock![0]).toMatch(/scale\(\s*3/)
    // Position at mid should not be the 0↔1 lerp midpoint (~0.5).
    // translate3d uses cqw; x=.2 → 20cqw.
    expect(midBlock![0]).toMatch(/20(?:\.0+)?cqw/)
  })
})
