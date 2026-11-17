import { describe, expect, it } from 'vitest'
import {
  BRING_TO_LIFE_EASING,
  BRING_TO_LIFE_GLIDE,
  BRING_TO_LIFE_STEADY,
  buildBringToLife,
} from '../../src/core/bringToLife'
import { applyEasing } from '../../src/core/easing'
import { applyGlide } from '../../src/core/glide'
import { applyMotionStateToActor } from '../../src/core/motionPresets'
import { polishMotion } from '../../src/core/polish'
import { applySteadySpeed } from '../../src/core/process'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import {
  BTL_LOGO_ID,
  buildBringToLifeFixtureProject,
} from '../fixtures/bringToLifeProject'

describe('bringToLife Steady Speed single pass', () => {
  it('stores polished geometry without baking Steady; playback applies 28% once', () => {
    const project = buildBringToLifeFixtureProject()
    const actor = project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const built = buildBringToLife(actor, project.stageAspect)
    expect(built.ok && built.changed).toBe(true)
    if (!built.ok) return

    expect(built.proposed.steadySpeed).toBe(BRING_TO_LIFE_STEADY)

    const polished = polishMotion(actor.recording!.samples, {
      strength: 0.55,
      stageAspect: project.stageAspect,
    }).samples
    // Geometry matches spatial polish only (endpoints pinned) — not Steady.
    const ge = built.proposed.geometryEdit!.samples
    expect(ge).toHaveLength(polished.length)
    let maxSpatial = 0
    let maxTimeVsPolish = 0
    for (let i = 0; i < ge.length; i++) {
      maxSpatial = Math.max(
        maxSpatial,
        Math.hypot(ge[i]!.x - polished[i]!.x, ge[i]!.y - polished[i]!.y),
      )
      maxTimeVsPolish = Math.max(
        maxTimeVsPolish,
        Math.abs(ge[i]!.t - polished[i]!.t),
      )
    }
    expect(maxSpatial).toBeLessThan(1e-9)
    expect(maxTimeVsPolish).toBeLessThan(1e-9)

    const once = applySteadySpeed(polished, BRING_TO_LIFE_STEADY, project.stageAspect)
    const twice = applySteadySpeed(once, BRING_TO_LIFE_STEADY, project.stageAspect)
    const enhanced = applyMotionStateToActor(actor, built.proposed)
    const playback = selectProcessedPathForActor(
      { ...project, actors: [enhanced] },
      enhanced,
      { geometryEdit: enhanced.geometryEdit, editSession: null, editPreview: null },
    )

    // After Glide/Easing the path differs, but Steady must not already be double-baked.
    // Compare Steady-only once vs geometry: timestamps should match the single pass.
    let maxVsOnce = 0
    for (let i = 0; i < once.length; i++) {
      maxVsOnce = Math.max(maxVsOnce, Math.abs(once[i]!.t - ge[i]!.t))
    }
    // Geometry is NOT steadied — so once differs from ge (Steady is playback-only).
    expect(maxVsOnce).toBeGreaterThan(0.1)

    // Double-bake would diverge from single Steady on polished; playback Steady
    // amount remains the slider value.
    let maxTwiceVsOnce = 0
    for (let i = 0; i < once.length; i++) {
      maxTwiceVsOnce = Math.max(
        maxTwiceVsOnce,
        Math.abs(twice[i]!.t - once[i]!.t),
      )
    }
    expect(maxTwiceVsOnce).toBeGreaterThan(0.1)
    expect(enhanced.steadySpeed).toBe(BRING_TO_LIFE_STEADY)
    expect(playback.length).toBeGreaterThan(2)
  })

  it('setting Steady Speed to 0 after Apply removes Steady processing', () => {
    const project = buildBringToLifeFixtureProject()
    const actor = project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const built = buildBringToLife(actor, project.stageAspect)
    expect(built.ok && built.changed).toBe(true)
    if (!built.ok) return

    const enhanced = applyMotionStateToActor(actor, built.proposed)
    const withSteady = selectProcessedPathForActor(
      { ...project, actors: [enhanced] },
      enhanced,
      { geometryEdit: enhanced.geometryEdit, editSession: null, editPreview: null },
    )

    // Zero only Steady — Glide/Easing stay at Bring-to-life values.
    const zeroed = { ...enhanced, steadySpeed: 0 }
    const withoutSteady = selectProcessedPathForActor(
      { ...project, actors: [zeroed] },
      zeroed,
      { geometryEdit: zeroed.geometryEdit, editSession: null, editPreview: null },
    )

    const ge = enhanced.geometryEdit!.samples
    const expected = applyEasing(
      applyGlide(ge, BRING_TO_LIFE_GLIDE, project.stageAspect).samples,
      BRING_TO_LIFE_EASING,
      project.stageAspect,
    ).samples
    expect(withoutSteady).toHaveLength(expected.length)
    for (let i = 0; i < withoutSteady.length; i++) {
      expect(withoutSteady[i]!.t).toBeCloseTo(expected[i]!.t, 5)
      expect(withoutSteady[i]!.x).toBeCloseTo(expected[i]!.x, 5)
      expect(withoutSteady[i]!.y).toBeCloseTo(expected[i]!.y, 5)
    }

    // Steady-only contribution must disappear when the slider is 0.
    let maxDelta = 0
    for (let i = 0; i < Math.min(withSteady.length, withoutSteady.length); i++) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(withSteady[i]!.t - withoutSteady[i]!.t),
      )
    }
    expect(maxDelta).toBeGreaterThan(0.05)

    // Geometry itself must not retain a baked Steady pass.
    const once = applySteadySpeed(ge, BRING_TO_LIFE_STEADY, project.stageAspect)
    let maxGeVsOnce = 0
    for (let i = 0; i < ge.length; i++) {
      maxGeVsOnce = Math.max(maxGeVsOnce, Math.abs(ge[i]!.t - once[i]!.t))
    }
    expect(maxGeVsOnce).toBeGreaterThan(0.1)
  })
})
