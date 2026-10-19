import { describe, expect, it } from 'vitest'
import {
  buildHeadingTrack,
  evaluateActorRotationDeg,
  evaluatePathHeading,
  headingExportOffsets,
  mergeExportLocalOffsets,
  pathHeadingAt,
  segmentHeadingDeg,
  shortestAngleDeltaDeg,
} from '../../src/core/faceAlongPath'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample } from '../../src/core/types'
import {
  buildArcPathSamples,
  buildLPathSamples,
} from '../fixtures/faceAlongPathProject'
import { makeActor, makeProject, makeRecording } from './helpers/project'

const ASPECT = 1.6

describe('face along path heading', () => {
  it('computes CSS headings for axis-aligned segments', () => {
    expect(segmentHeadingDeg(0, 0, 0.1, 0, ASPECT)).toBeCloseTo(0, 5)
    expect(segmentHeadingDeg(0, 0, 0, 0.1, ASPECT)).toBeCloseTo(90, 5)
    expect(segmentHeadingDeg(0.1, 0, 0, 0, ASPECT)).toBeCloseTo(180, 5)
    expect(segmentHeadingDeg(0, 0.1, 0, 0, ASPECT)).toBeCloseTo(-90, 5)
    expect(segmentHeadingDeg(0.5, 0.5, 0.5, 0.5, ASPECT)).toBeNull()
  })

  it('unwraps across ±180 without flips', () => {
    expect(shortestAngleDeltaDeg(170, -170)).toBeCloseTo(20, 5)
    expect(shortestAngleDeltaDeg(-170, 170)).toBeCloseTo(-20, 5)
    const samples: MotionSample[] = []
    // Circle that crosses the ±180 seam
    for (let i = 0; i < 36; i++) {
      const a = (i / 35) * Math.PI * 2
      samples.push({
        t: i * 10,
        x: 0.5 + 0.2 * Math.cos(a),
        y: 0.5 + 0.2 * Math.sin(a),
      })
    }
    const track = buildHeadingTrack(samples, ASPECT)
    for (let i = 1; i < track.length; i++) {
      const step = Math.abs(track[i]!.headingDeg - track[i - 1]!.headingDeg)
      expect(step).toBeLessThan(40)
    }
  })

  it('holds heading through pauses on an L path', () => {
    const samples = buildLPathSamples()
    const track = buildHeadingTrack(samples, ASPECT)
    // Early horizontal ≈ 0°
    expect(evaluatePathHeading(track, 0.1)).toBeCloseTo(0, 0)
    // During pause near corner — still ~0 before the turn finishes
    const pauseT = 22 * 40
    const duration = samples[samples.length - 1]!.t
    const pauseNorm = pauseT / duration
    const pauseHeading = evaluatePathHeading(track, pauseNorm)
    expect(Math.abs(pauseHeading)).toBeLessThan(25)
    // Late vertical ≈ 90°
    expect(evaluatePathHeading(track, 0.9)).toBeCloseTo(90, 0)
  })

  it('returns 0 for stationary and repeated-point paths', () => {
    const stationary: MotionSample[] = [
      { t: 0, x: 0.4, y: 0.4 },
      { t: 100, x: 0.4, y: 0.4 },
      { t: 200, x: 0.4, y: 0.4 },
    ]
    expect(pathHeadingAt(stationary, 0.5, ASPECT)).toBe(0)
    expect(buildHeadingTrack([{ t: 0, x: 0.5, y: 0.5 }], ASPECT)).toEqual([
      { t: 0, headingDeg: 0 },
    ])
  })

  it('adds direction offset and transform without overwriting the track', () => {
    const samples = buildLPathSamples()
    const actor = createSceneActor({
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      faceAlongPath: true,
      directionOffsetDeg: -90,
      transform: {
        keyframes: [
          { id: 'a', t: 0, rotationDeg: 0, scale: 1 },
          { id: 'b', t: 1, rotationDeg: 20, scale: 1.2 },
        ],
      },
    })
    const early = evaluateActorRotationDeg(actor, samples, 0.1, ASPECT)
    // ~0 path + (−90) offset + small transform contribution
    expect(early).toBeGreaterThan(-95)
    expect(early).toBeLessThan(-80)
    const late = evaluateActorRotationDeg(actor, samples, 0.95, ASPECT)
    // ~90 path − 90 offset + ~19 transform
    expect(late).toBeGreaterThan(10)
    expect(late).toBeLessThan(30)
    expect(actor.transform.keyframes[1]!.rotationDeg).toBe(20)
  })

  it('ignores offset when facing is off', () => {
    const samples = buildLPathSamples()
    const actor = createSceneActor({
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      faceAlongPath: false,
      directionOffsetDeg: 45,
      transform: {
        keyframes: [{ id: 'k', t: 0.5, rotationDeg: 10, scale: 1 }],
      },
    })
    expect(evaluateActorRotationDeg(actor, samples, 0.5, ASPECT)).toBeCloseTo(
      10,
      5,
    )
  })

  it('exports denser offsets through turns', () => {
    const samples = buildArcPathSamples()
    const extra = headingExportOffsets(samples, ASPECT, 8)
    expect(extra.length).toBeGreaterThan(4)
    expect(extra[0]).toBe(0)
    expect(extra[extra.length - 1]).toBeCloseTo(1, 5)
    const merged = mergeExportLocalOffsets([0, 0.5, 1], extra, 40)
    expect(merged.offsets[0]).toBe(0)
    expect(merged.offsets[merged.offsets.length - 1]).toBe(1)
    expect(merged.offsets.length).toBeLessThanOrEqual(40)
  })

  it('defaults older actors to facing off via createSceneActor', () => {
    const actor = makeActor({ recording: makeRecording(8) })
    expect(actor.faceAlongPath).toBe(false)
    expect(actor.directionOffsetDeg).toBe(0)
    const project = makeProject({ actors: [actor] })
    expect(project.actors[0]!.faceAlongPath).toBe(false)
  })
})
