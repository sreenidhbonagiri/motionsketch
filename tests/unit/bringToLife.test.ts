import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRING_TO_LIFE_ALREADY_APPLIED,
  BRING_TO_LIFE_EASING,
  BRING_TO_LIFE_GLIDE,
  BRING_TO_LIFE_STEADY,
  bringToLifeAvailability,
  buildBringToLife,
} from '../../src/core/bringToLife'
import { makeGeometryEdit } from '../../src/core/edit'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { applyMotionStateToActor } from '../../src/core/motionPresets'
import { isInStationaryRun } from '../../src/core/process'
import { createSceneActor } from '../../src/core/sceneActor'
import { aspectDistance } from '../../src/core/stageAspect'
import type { MotionSample } from '../../src/core/types'
import {
  BTL_CURVE_ID,
  BTL_EDGE_ID,
  BTL_FLICK_ID,
  BTL_LOGO_ID,
  BTL_PAUSED_ID,
  buildBringToLifeFixtureProject,
  curvedFlight,
  pausedPath,
  quickFlick,
  roughLogoEntrance,
  stageEdgePath,
} from '../fixtures/bringToLifeProject'

const ASPECT = 1.6
const EVIDENCE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../tmp/bring-to-life-evidence',
)

function pathWobble(samples: MotionSample[]): number {
  if (samples.length < 3) return 0
  let sum = 0
  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    const c = samples[i + 1]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const bcx = c.x - b.x
    const bcy = c.y - b.y
    sum += Math.abs(abx * bcy - aby * bcx)
  }
  return sum
}

function samplePlayback(
  samples: MotionSample[],
  steps = 24,
): Array<{ t: number; x: number; y: number }> {
  const lastT = samples[samples.length - 1]!.t
  const out: Array<{ t: number; x: number; y: number }> = []
  for (let i = 0; i <= steps; i++) {
    const t = (lastT * i) / steps
    let j = 0
    while (j < samples.length - 2 && samples[j + 1]!.t < t) j += 1
    const a = samples[j]!
    const b = samples[j + 1]!
    const span = Math.max(1e-6, b.t - a.t)
    const u = Math.min(1, Math.max(0, (t - a.t) / span))
    out.push({
      t,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
    })
  }
  return out
}

describe('bringToLife core', () => {
  it('is deterministic for the three demo paths', () => {
    for (const samples of [
      roughLogoEntrance(),
      curvedFlight(),
      quickFlick(),
    ]) {
      const actor = createSceneActor({
        id: 'a',
        name: 'A',
        recording: {
          samples,
          recordedDurationMs: samples[samples.length - 1]!.t,
        },
      })
      const a = buildBringToLife(actor, ASPECT)
      const b = buildBringToLife(actor, ASPECT)
      expect(a).toEqual(b)
      expect(a.ok).toBe(true)
      if (a.ok) expect(a.changed).toBe(true)
    }
  })

  it('preserves raw recording, endpoints, duration, and stage bounds', () => {
    const project = buildBringToLifeFixtureProject()
    for (const actor of project.actors) {
      const built = buildBringToLife(actor, project.stageAspect)
      expect(built.ok).toBe(true)
      if (!built.ok) continue
      expect(built.proposed.recording).toEqual(actor.recording)
      const src = actor.recording!.samples
      const preview = built.previewSamples
      expect(preview[0]).toMatchObject({ x: src[0]!.x, y: src[0]!.y, t: 0 })
      expect(preview.at(-1)).toMatchObject({
        x: src.at(-1)!.x,
        y: src.at(-1)!.y,
        t: src.at(-1)!.t,
      })
      for (const s of preview) {
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.x).toBeLessThanOrEqual(1)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeLessThanOrEqual(1)
      }
      expect(built.proposed.glide).toBe(BRING_TO_LIFE_GLIDE)
      expect(built.proposed.steadySpeed).toBe(BRING_TO_LIFE_STEADY)
      expect(built.proposed.easing).toBe(BRING_TO_LIFE_EASING)
      expect(built.proposed.geometryEdit?.bringToLife).toBe(true)
      expect(built.notes.squashStretchDeferred).toBe(true)
      expect(built.notes.replacesTimingPrefs).toBe(true)
    }
  })

  it('keeps a mid-path pause stationary after enhancement', () => {
    const samples = pausedPath()
    const actor = createSceneActor({
      id: BTL_PAUSED_ID,
      name: 'Paused',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
    })
    const built = buildBringToLife(actor, ASPECT)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    let pauseIdx = -1
    for (let i = 2; i < samples.length - 2; i++) {
      if (isInStationaryRun(samples, i, 40, ASPECT)) {
        pauseIdx = i
        break
      }
    }
    expect(pauseIdx).toBeGreaterThan(0)
    const pausePos = samples[pauseIdx]!
    const enhanced = built.previewSamples
    let enhancedPauseIdx = -1
    let pauseHoldMs = 0
    for (let i = 1; i < enhanced.length - 1; i++) {
      if (!isInStationaryRun(enhanced, i, 40, ASPECT)) continue
      const s = enhanced[i]!
      if (aspectDistance(s.x, s.y, pausePos.x, pausePos.y, ASPECT) > 0.02) {
        continue
      }
      enhancedPauseIdx = i
      let lo = i
      let hi = i
      while (
        lo > 0 &&
        aspectDistance(
          enhanced[lo - 1]!.x,
          enhanced[lo - 1]!.y,
          s.x,
          s.y,
          ASPECT,
        ) < 0.003
      ) {
        lo -= 1
      }
      while (
        hi < enhanced.length - 1 &&
        aspectDistance(
          enhanced[hi + 1]!.x,
          enhanced[hi + 1]!.y,
          s.x,
          s.y,
          ASPECT,
        ) < 0.003
      ) {
        hi += 1
      }
      pauseHoldMs = enhanced[hi]!.t - enhanced[lo]!.t
      break
    }
    expect(enhancedPauseIdx).toBeGreaterThan(0)
    expect(pauseHoldMs).toBeGreaterThanOrEqual(200)
  })

  it('disables timing-baked Continue-path geometry with a clear reason', () => {
    const samples = roughLogoEntrance()
    const actor = createSceneActor({
      id: 'baked',
      name: 'Baked',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      geometryEdit: makeGeometryEdit(samples, 0, null, { timingBaked: true }),
    })
    const avail = bringToLifeAvailability(actor)
    expect(avail.enabled).toBe(false)
    expect(avail.message).toMatch(/Steady Speed|Glide|Easing|Continue/i)
    const built = buildBringToLife(actor, ASPECT)
    expect(built.ok).toBe(false)
  })

  it('preserves transform keyframes by reference equality of times/values', () => {
    const project = buildBringToLifeFixtureProject()
    const logo = project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const built = buildBringToLife(logo, project.stageAspect)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.notes.preservesTransformKeyframes).toBe(true)
    expect(built.proposed.transform).toEqual(logo.transform)
  })

  it('repeated enhance on unchanged apply is a no-op (no compounding)', () => {
    const samples = roughLogoEntrance()
    const actor = createSceneActor({
      id: 'a',
      name: 'A',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
    })
    const first = buildBringToLife(actor, ASPECT)
    expect(first.ok && first.changed).toBe(true)
    if (!first.ok) return
    const once = applyMotionStateToActor(actor, first.proposed)
    expect(once.geometryEdit?.bringToLife).toBe(true)

    const second = buildBringToLife(once, ASPECT)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.changed).toBe(false)
    expect(second.reason).toBe(BRING_TO_LIFE_ALREADY_APPLIED)
    expect(second.proposed.geometryEdit).toEqual(once.geometryEdit)
    expect(bringToLifeAvailability(once).message).toBe(
      BRING_TO_LIFE_ALREADY_APPLIED,
    )
  })

  it('becomes available again after path edit clears the stamp', () => {
    const samples = roughLogoEntrance()
    const actor = createSceneActor({
      id: 'a',
      name: 'A',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
    })
    const first = buildBringToLife(actor, ASPECT)
    expect(first.ok && first.changed).toBe(true)
    if (!first.ok) return
    const once = applyMotionStateToActor(actor, first.proposed)

    // Path edit / Polish rewrite geometry without bringToLife.
    const editedSamples = once.geometryEdit!.samples.map((s, i) =>
      i === Math.floor(once.geometryEdit!.samples.length / 2)
        ? { ...s, y: Math.min(1, s.y + 0.04) }
        : { ...s },
    )
    const afterEdit = {
      ...once,
      geometryEdit: makeGeometryEdit(
        editedSamples,
        once.geometryEdit!.bakedSmoothing,
        once.geometryEdit!.handleIndices,
      ),
    }
    expect(afterEdit.geometryEdit?.bringToLife).toBeUndefined()
    const avail = bringToLifeAvailability(afterEdit)
    expect(avail.enabled).toBe(true)
    expect(avail.message).toBeNull()
    const again = buildBringToLife(afterEdit, ASPECT)
    expect(again.ok && again.changed).toBe(true)
  })

  it('becomes available again after Restore clears geometry', () => {
    const samples = roughLogoEntrance()
    const actor = createSceneActor({
      id: 'a',
      name: 'A',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
    })
    const first = buildBringToLife(actor, ASPECT)
    expect(first.ok && first.changed).toBe(true)
    if (!first.ok) return
    const once = applyMotionStateToActor(actor, first.proposed)
    const restored = { ...once, geometryEdit: null, glide: 0, steadySpeed: 0, easing: 'linear' as const }
    expect(bringToLifeAvailability(restored).message).toBeNull()
    const again = buildBringToLife(restored, ASPECT)
    expect(again.ok && again.changed).toBe(true)
  })

  it('writes before/after evidence for logo, curve, and flick', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true })
    const cases = [
      { id: BTL_LOGO_ID, label: 'rough-logo-entrance', samples: roughLogoEntrance() },
      { id: BTL_CURVE_ID, label: 'curved-flight', samples: curvedFlight() },
      { id: BTL_FLICK_ID, label: 'quick-flick', samples: quickFlick() },
      { id: BTL_PAUSED_ID, label: 'paused-path', samples: pausedPath() },
      { id: BTL_EDGE_ID, label: 'stage-edge', samples: stageEdgePath() },
    ] as const

    const report: Array<Record<string, unknown>> = []
    for (const c of cases) {
      const actor = createSceneActor({
        id: c.id,
        name: c.label,
        recording: {
          samples: c.samples,
          recordedDurationMs: c.samples[c.samples.length - 1]!.t,
        },
      })
      const built = buildBringToLife(actor, ASPECT)
      expect(built.ok).toBe(true)
      if (!built.ok) continue
      const beforeWobble = pathWobble(c.samples)
      const afterWobble = pathWobble(built.previewSamples)
      const entry = {
        id: c.id,
        label: c.label,
        changed: built.changed,
        beforeWobble,
        afterWobble,
        wobbleReduced: afterWobble < beforeWobble,
        beforePlayback: samplePlayback(c.samples),
        afterPlayback: samplePlayback(built.previewSamples),
        endpointPreserved: {
          start: built.previewSamples[0],
          end: built.previewSamples.at(-1),
        },
      }
      report.push(entry)
      writeFileSync(
        join(EVIDENCE_DIR, `${c.label}.json`),
        JSON.stringify(entry, null, 2),
      )
      expect(built.changed).toBe(true)
      expect(afterWobble).toBeLessThan(beforeWobble)
    }
    writeFileSync(
      join(EVIDENCE_DIR, 'summary.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), cases: report }, null, 2),
    )
  })

  it('export keyframes stay close to processed playback after enhance', () => {
    const project = buildBringToLifeFixtureProject()
    const actor = project.actors.find((a) => a.id === BTL_CURVE_ID)!
    const built = buildBringToLife(actor, project.stageAspect)
    expect(built.ok && built.changed).toBe(true)
    if (!built.ok) return
    const path = built.previewSamples
    const kf = buildKeyframesFromProcessed(path)
    expect(maxPlaybackExportError(path, kf, 48)).toBeLessThan(0.03)
    expect(built.proposed.easing).toBe(BRING_TO_LIFE_EASING)
  })
})
