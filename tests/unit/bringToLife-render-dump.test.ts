/**
 * One-shot dump of Original vs Enhanced playback paths for visual renders.
 * Invoked by tmp/bring-to-life-render.mjs — not part of the normal suite.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRING_TO_LIFE_EASING,
  BRING_TO_LIFE_GLIDE,
  BRING_TO_LIFE_STEADY,
  buildBringToLife,
} from '../../src/core/bringToLife'
import { applyMotionStateToActor } from '../../src/core/motionPresets'
import { evaluate } from '../../src/core/playback'
import { createSceneActor } from '../../src/core/sceneActor'
import { selectProcessedPathForActor } from '../../src/state/selectors'
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
import { isInStationaryRun } from '../../src/core/process'
import { aspectDistance } from '../../src/core/stageAspect'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import type { MotionSample, Project } from '../../src/core/types'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../tmp/bring-to-life-evidence/renders',
)

function samplePath(
  samples: MotionSample[],
  steps: number,
): MotionSample[] {
  if (samples.length === 0) return []
  const lastT = samples[samples.length - 1]!.t
  const out: MotionSample[] = []
  for (let i = 0; i <= steps; i++) {
    const tNorm = i / steps
    const p = evaluate(samples, tNorm)
    out.push({ t: tNorm * lastT, x: p.x, y: p.y })
  }
  return out
}

function pathWobble(samples: MotionSample[]): number {
  if (samples.length < 3) return 0
  let sum = 0
  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    const c = samples[i + 1]!
    sum += Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
  }
  return sum
}

function emptyProject(actor: ReturnType<typeof createSceneActor>): Project {
  return {
    version: 1,
    name: 'dump',
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
    playback: {
      durationMs: actor.recording!.recordedDurationMs,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [actor],
  }
}

describe('bring-to-life motion dump for renders', () => {
  it.skipIf(!process.env.BTL_DUMP)(
    'writes Original/Enhanced playback dumps + review metrics',
    () => {
    mkdirSync(OUT, { recursive: true })
    const aspect = 1.6
    const demos = [
      {
        id: 'rough-logo-entrance',
        actorId: BTL_LOGO_ID,
        label: 'Rough logo entrance',
        samples: roughLogoEntrance(),
        color: '#1d4ed8',
      },
      {
        id: 'curved-flight',
        actorId: BTL_CURVE_ID,
        label: 'Curved flight',
        samples: curvedFlight(),
        color: '#0f766e',
      },
      {
        id: 'quick-flick',
        actorId: BTL_FLICK_ID,
        label: 'Quick flick',
        samples: quickFlick(),
        color: '#b45309',
      },
      {
        id: 'paused-path',
        actorId: BTL_PAUSED_ID,
        label: 'Paused path',
        samples: pausedPath(),
        color: '#7c3aed',
      },
      {
        id: 'stage-edge',
        actorId: BTL_EDGE_ID,
        label: 'Stage edge',
        samples: stageEdgePath(),
        color: '#be123c',
      },
    ] as const

    const fixture = buildBringToLifeFixtureProject()
    const cases = []

    for (const demo of demos) {
      const fixtureActor =
        fixture.actors.find((a) => a.id === demo.actorId) ??
        createSceneActor({
          id: demo.actorId,
          name: demo.label,
          recording: {
            samples: demo.samples,
            recordedDurationMs: demo.samples[demo.samples.length - 1]!.t,
          },
        })

      const built = buildBringToLife(fixtureActor, aspect)
      expect(built.ok).toBe(true)
      if (!built.ok) continue

      const projectOrig = emptyProject(fixtureActor)
      const originalPlayback = selectProcessedPathForActor(
        projectOrig,
        fixtureActor,
        { geometryEdit: null, editSession: null, editPreview: null },
      )

      const enhancedActor = applyMotionStateToActor(
        fixtureActor,
        built.proposed,
      )
      const projectEnh = emptyProject(enhancedActor)
      const enhancedPlayback = selectProcessedPathForActor(
        projectEnh,
        enhancedActor,
        {
          geometryEdit: enhancedActor.geometryEdit,
          editSession: null,
          editPreview: null,
        },
      )

      // Preview samples (+ prefs) should match applied processed path.
      const previewActor = applyMotionStateToActor(
        fixtureActor,
        built.proposed,
      )
      const previewPlayback = selectProcessedPathForActor(
        emptyProject(previewActor),
        previewActor,
        {
          geometryEdit: previewActor.geometryEdit,
          editSession: null,
          editPreview: null,
        },
      )
      expect(previewPlayback).toEqual(enhancedPlayback)

      const kf = buildKeyframesFromProcessed(enhancedPlayback)
      const exportErr = maxPlaybackExportError(enhancedPlayback, kf, 64)

      // Pause hold comparison (original vs enhanced wall-clock).
      let origPauseMs = 0
      let enhPauseMs = 0
      let pausePos: { x: number; y: number } | null = null
      for (let i = 2; i < demo.samples.length - 2; i++) {
        if (isInStationaryRun(demo.samples, i, 40, aspect)) {
          pausePos = { x: demo.samples[i]!.x, y: demo.samples[i]!.y }
          let lo = i
          let hi = i
          while (
            lo > 0 &&
            aspectDistance(
              demo.samples[lo - 1]!.x,
              demo.samples[lo - 1]!.y,
              pausePos.x,
              pausePos.y,
              aspect,
            ) < 0.003
          )
            lo -= 1
          while (
            hi < demo.samples.length - 1 &&
            aspectDistance(
              demo.samples[hi + 1]!.x,
              demo.samples[hi + 1]!.y,
              pausePos.x,
              pausePos.y,
              aspect,
            ) < 0.003
          )
            hi += 1
          origPauseMs = demo.samples[hi]!.t - demo.samples[lo]!.t
          break
        }
      }
      if (pausePos) {
        for (let i = 1; i < built.previewSamples.length - 1; i++) {
          if (!isInStationaryRun(built.previewSamples, i, 40, aspect)) continue
          const s = built.previewSamples[i]!
          if (aspectDistance(s.x, s.y, pausePos.x, pausePos.y, aspect) > 0.02)
            continue
          let lo = i
          let hi = i
          while (
            lo > 0 &&
            aspectDistance(
              built.previewSamples[lo - 1]!.x,
              built.previewSamples[lo - 1]!.y,
              s.x,
              s.y,
              aspect,
            ) < 0.003
          )
            lo -= 1
          while (
            hi < built.previewSamples.length - 1 &&
            aspectDistance(
              built.previewSamples[hi + 1]!.x,
              built.previewSamples[hi + 1]!.y,
              s.x,
              s.y,
              aspect,
            ) < 0.003
          )
            hi += 1
          enhPauseMs =
            built.previewSamples[hi]!.t - built.previewSamples[lo]!.t
          break
        }
      }

      // Edge flat-spot heuristic: long colinear runs hugging x<=0.03 or y edge.
      let edgeFlatMs = 0
      const edgeSamples = built.previewSamples
      for (let i = 0; i < edgeSamples.length - 1; i++) {
        const a = edgeSamples[i]!
        const b = edgeSamples[i + 1]!
        const onEdge = a.x <= 0.03 && b.x <= 0.03
        const flat =
          Math.abs(a.x - b.x) < 1e-6 &&
          aspectDistance(a.x, a.y, b.x, b.y, aspect) > 0.002
        if (onEdge && flat) edgeFlatMs += b.t - a.t
      }

      // Second pass on stamped apply must be a no-op (no compounding).
      const second = buildBringToLife(enhancedActor, aspect)
      expect(second.ok).toBe(true)
      if (second.ok) expect(second.changed).toBe(false)

      cases.push({
        id: demo.id,
        label: demo.label,
        color: demo.color,
        durationMs: demo.samples[demo.samples.length - 1]!.t,
        originalPath: demo.samples,
        enhancedPath: built.previewSamples,
        originalPlayback: samplePath(originalPlayback, 48),
        enhancedPlayback: samplePath(enhancedPlayback, 48),
        prefs: {
          steadySpeed: BRING_TO_LIFE_STEADY,
          glide: BRING_TO_LIFE_GLIDE,
          easing: BRING_TO_LIFE_EASING,
        },
        metrics: {
          beforeWobble: pathWobble(demo.samples),
          afterWobble: pathWobble(built.previewSamples),
          exportErr,
          origPauseMs,
          enhPauseMs,
          pauseHoldRatio:
            origPauseMs > 0 ? enhPauseMs / origPauseMs : null,
          edgeFlatMs,
          secondPassChanged: second.ok ? second.changed : null,
          proposedReplacesEasing: built.proposed.easing === BRING_TO_LIFE_EASING,
          proposedReplacesGlide: built.proposed.glide === BRING_TO_LIFE_GLIDE,
        },
      })
    }

    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        aspect,
        framing: 'identical side-by-side panels; shared tNorm duration',
      },
      cases,
    }
    writeFileSync(join(OUT, 'motion-dump.json'), JSON.stringify(payload))
    expect(cases.length).toBe(5)
  },
  )
})
