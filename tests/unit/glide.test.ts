import { describe, expect, it } from 'vitest'
import {
  applyGlide,
  invSmoothstep,
  peakSpeed,
  segmentEdgeSpeedRatio,
  smoothstep,
} from '../../src/core/glide'
import { projectToLocal } from '../../src/core/clip'
import { applySteadySpeed, isInStationaryRun } from '../../src/core/process'
import { polishMotion } from '../../src/core/polish'
import {
  selectActorPositionForActor,
  selectProcessedPathForActor,
} from '../../src/state/selectors'
import { makeGeometryEdit } from '../../src/core/edit'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project, Vec2 } from '../../src/core/types'
import {
  buildProjectCssExport,
  unionExportOffsets,
} from '../../src/core/export/css'
import {
  evaluateKeyframes,
  maxPlaybackExportError,
} from '../../src/core/export/consistency'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import {
  buildHeadingTrack,
  evaluateActorRotationDeg,
  HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  headingExportOffsets,
  mergeExportLocalOffsets,
  pauseExportOffsets,
} from '../../src/core/faceAlongPath'
import { evaluate, tNormFromElapsed } from '../../src/core/playback'
import { evaluateTransform } from '../../src/core/transform'
import { aspectDistance } from '../../src/core/stageAspect'

const ASPECT = 1.6

/** Shaky uneven trackpad-style curve. */
function buildShakyCurve(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 80; i++) {
    const u = i / 80
    const jitter = Math.sin(i * 2.7) * 0.008 + Math.cos(i * 1.3) * 0.005
    // Uneven time steps (speed spikes).
    const t = i === 0 ? 0 : samples[i - 1]!.t + (8 + ((i * 17) % 40))
    samples.push({
      t,
      x: clamp01(0.15 + u * 0.7 + jitter),
      y: clamp01(0.35 + Math.sin(u * Math.PI) * 0.25 + jitter * 0.5),
    })
  }
  return samples
}

/** Pause then a fast bolt. */
function buildPauseThenFast(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 20; i++) {
    samples.push({ t: i * 40, x: 0.2 + i * 0.01, y: 0.4 })
  }
  for (let i = 1; i <= 5; i++) {
    samples.push({ t: 800 + i * 40, x: 0.4, y: 0.4 })
  }
  for (let i = 1; i <= 15; i++) {
    samples.push({
      t: 1000 + i * 12,
      x: 0.4 + i * 0.03,
      y: 0.4,
    })
  }
  return samples
}

/** Intentional sharp L corner (no pause). */
function buildSharpCorner(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 30; i++) {
    samples.push({ t: i * 30, x: 0.2 + i * 0.02, y: 0.3 })
  }
  for (let i = 1; i <= 30; i++) {
    samples.push({
      t: 900 + i * 30,
      x: 0.8,
      y: 0.3 + i * 0.015,
    })
  }
  return samples
}

/** Already-smooth arc with even timing. */
function buildSmoothArc(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 40; i++) {
    const u = i / 40
    const ang = Math.PI * u
    samples.push({
      t: i * 40,
      x: 0.5 + 0.25 * Math.cos(ang),
      y: 0.5 - 0.25 * Math.sin(ang),
    })
  }
  return samples
}

/** Very short take. */
function buildShortTake(): MotionSample[] {
  return [
    { t: 0, x: 0.3, y: 0.4 },
    { t: 40, x: 0.35, y: 0.42 },
    { t: 80, x: 0.42, y: 0.45 },
  ]
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function maxPosDelta(a: MotionSample[], b: MotionSample[]): number {
  let max = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    max = Math.max(
      max,
      Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y),
    )
  }
  return max
}

function projectFor(samples: MotionSample[], glide = 0): Project {
  const actor = createSceneActor({
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit: makeGeometryEdit(samples, 0),
    smoothing: 0,
    steadySpeed: 0,
    glide,
    faceAlongPath: true,
    transform: {
      keyframes: [
        { id: 's0', t: 0, rotationDeg: 0, scale: 1 },
        { id: 's1', t: 0.5, rotationDeg: 0, scale: 1.5 },
        { id: 's2', t: 1, rotationDeg: 0, scale: 1 },
      ],
    },
  })
  return {
    version: 1,
    name: 'Glide fixture',
    actors: [actor],
    playback: {
      durationMs: Math.max(1000, samples[samples.length - 1]!.t),
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: ASPECT,
  }
}

describe('glide', () => {
  it('smoothstep / invSmoothstep round-trip', () => {
    for (const u of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(invSmoothstep(smoothstep(u))).toBeCloseTo(u, 5)
    }
  })

  it('preserves geometry, endpoints, duration, and pause holds', () => {
    const raw = buildPauseThenFast()
    const duration = raw[raw.length - 1]!.t
    const glided = applyGlide(raw, 0.8, ASPECT)
    expect(glided.changed).toBe(true)
    expect(maxPosDelta(raw, glided.samples)).toBeLessThan(1e-12)
    expect(glided.samples[0]!.t).toBe(0)
    expect(glided.samples[glided.samples.length - 1]!.t).toBe(duration)
    // Pause samples stay at the same absolute times (held pose).
    const pauseIdx = raw.findIndex(
      (s, i) => i > 0 && s.x === 0.4 && s.y === 0.4 && raw[i - 1]!.x === 0.4,
    )
    expect(pauseIdx).toBeGreaterThan(0)
    expect(glided.samples[pauseIdx]!.t).toBeCloseTo(raw[pauseIdx]!.t, 5)
  })

  it('softens edge rush vs original on a pause-then-fast take', () => {
    const raw = buildPauseThenFast()
    const originalRatio = segmentEdgeSpeedRatio(raw, ASPECT)
    const glided = applyGlide(raw, 1, ASPECT).samples
    const glideRatio = segmentEdgeSpeedRatio(glided, ASPECT)
    expect(originalRatio).not.toBeNull()
    expect(glideRatio).not.toBeNull()
    // Glide should reduce the start-of-segment rush relative to mid-segment.
    expect(glideRatio!).toBeLessThan(originalRatio! * 0.85)
  })

  it('is distinct from Steady Speed and Polish timing on a shaky curve', () => {
    const raw = buildShakyCurve()
    const steady = applySteadySpeed(raw, 1, ASPECT)
    const polish = polishMotion(raw, {
      strength: 0.7,
      stageAspect: ASPECT,
    }).samples
    const glide = applyGlide(raw, 1, ASPECT).samples

    const peakRaw = peakSpeed(raw, ASPECT)
    const peakSteady = peakSpeed(steady, ASPECT)
    const peakGlide = peakSpeed(glide, ASPECT)
    expect(peakSteady).toBeLessThan(peakRaw)
    expect(peakGlide).toBeLessThan(peakRaw)

    // Glide keeps geometry; Polish may move points.
    expect(maxPosDelta(raw, glide)).toBeLessThan(1e-12)
    // Steady/Glide timing signatures differ (not the same remap).
    let timingDiff = 0
    for (let i = 0; i < raw.length; i++) {
      timingDiff += Math.abs(steady[i]!.t - glide[i]!.t)
    }
    expect(timingDiff).toBeGreaterThan(50)

    // Usefulness note (logged for the milestone report).
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'shaky-curve',
        peakRaw,
        peakSteady,
        peakPolish: peakSpeed(polish, ASPECT),
        peakGlide,
        edgeRatioRaw: segmentEdgeSpeedRatio(raw, ASPECT),
        edgeRatioSteady: segmentEdgeSpeedRatio(steady, ASPECT),
        edgeRatioGlide: segmentEdgeSpeedRatio(glide, ASPECT),
      }),
    )
  })

  it('leaves very short takes unchanged', () => {
    const raw = buildShortTake()
    const result = applyGlide(raw, 1, ASPECT)
    expect(result.changed).toBe(false)
    expect(result.segmentsAdjusted).toBe(0)
  })

  it('keeps sharp-corner geometry while retiming the moving span', () => {
    const raw = buildSharpCorner()
    const corner = raw[30]!
    const glided = applyGlide(raw, 0.9, ASPECT)
    expect(glided.samples[30]!.x).toBeCloseTo(corner.x, 5)
    expect(glided.samples[30]!.y).toBeCloseTo(corner.y, 5)
    expect(glided.changed).toBe(true)
  })

  it('shared pipeline matches export position/rotation/scale', () => {
    const raw = buildSmoothArc()
    const project = projectFor(raw, 0.8)
    const actor = project.actors[0]!
    const path = selectProcessedPathForActor(project, actor)
    const posKf = buildKeyframesFromProcessed(path)
    expect(maxPlaybackExportError(path, posKf, 48)).toBeLessThan(0.01)

    const heading = buildHeadingTrack(path, ASPECT)
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const editorPos = evaluate(path, u)
      const exportPos = evaluateKeyframes(posKf, u)
      expect(Math.hypot(editorPos.x - exportPos.x, editorPos.y - exportPos.y)).toBeLessThan(
        0.01,
      )
      const rot = evaluateActorRotationDeg(actor, path, u, ASPECT, heading)
      expect(Number.isFinite(rot)).toBe(true)
      const scale = evaluateTransform(actor.transform, u).scale
      expect(scale).toBeGreaterThan(0)
      if (u === 0.5) expect(scale).toBeCloseTo(1.5, 5)
      if (u === 0 || u === 1) expect(scale).toBeCloseTo(1, 5)
    }

    const { css } = buildProjectCssExport(project)
    expect(css).toMatch(/50%/)
    const midBlock = css.match(/50%\s*\{[^}]+\}/)
    expect(midBlock).not.toBeNull()
    expect(midBlock![0]).toMatch(/scale\(\s*1\.5/)
  })

  it('already-smooth paths still get ease without geometry change', () => {
    const raw = buildSmoothArc()
    const glided = applyGlide(raw, 0.75, ASPECT)
    expect(maxPosDelta(raw, glided.samples)).toBeLessThan(1e-12)
    expect(glided.changed).toBe(true)
    const ratio = segmentEdgeSpeedRatio(glided.samples, ASPECT)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeLessThan(0.95)
  })

  it('interpolated positions stay on the original polyline', () => {
    const raw = buildShakyCurve()
    const glided = applyGlide(raw, 1, ASPECT).samples
    let maxDist = 0
    for (let i = 0; i <= 64; i++) {
      const p = evaluate(glided, i / 64)
      maxDist = Math.max(maxDist, distanceToPolyline(p, raw, ASPECT))
    }
    // On-polyline (sample xy unchanged) — not merely equal sample arrays.
    expect(maxDist).toBeLessThan(1e-9)
  })

  it('preserves pause entry/exit times and held pose (dense + short move)', () => {
    const dense = buildDensePauseWithShortLead()
    const pauseMask = dense.map((_, i) =>
      isInStationaryRun(dense, i, 40, ASPECT),
    )
    const entry = pauseMask.findIndex(Boolean)
    let exit = entry
    while (exit + 1 < pauseMask.length && pauseMask[exit + 1]) exit += 1
    expect(entry).toBeGreaterThan(0)
    expect(exit - entry).toBeGreaterThanOrEqual(3)

    const glided = applyGlide(dense, 1, ASPECT)
    expect(glided.changed).toBe(true)
    expect(glided.samples[entry]!.t).toBeCloseTo(dense[entry]!.t, 5)
    expect(glided.samples[exit]!.t).toBeCloseTo(dense[exit]!.t, 5)
    for (let i = entry; i <= exit; i++) {
      expect(glided.samples[i]!.x).toBe(dense[i]!.x)
      expect(glided.samples[i]!.y).toBe(dense[i]!.y)
      expect(glided.samples[i]!.t).toBeCloseTo(dense[i]!.t, 5)
    }
    // Short lead-in below glide minimum is left alone.
    expect(glided.samples[1]!.t).toBeCloseTo(dense[1]!.t, 5)
  })

  it('timestamps are finite and non-decreasing at strengths 0 and 1', () => {
    const raw = buildPauseThenFast()
    for (const strength of [0, 1]) {
      const out = applyGlide(raw, strength, ASPECT).samples
      expect(out[0]!.t).toBe(0)
      for (let i = 0; i < out.length; i++) {
        expect(Number.isFinite(out[i]!.t)).toBe(true)
        expect(Number.isFinite(out[i]!.x)).toBe(true)
        expect(Number.isFinite(out[i]!.y)).toBe(true)
        if (i > 0) expect(out[i]!.t).toBeGreaterThanOrEqual(out[i - 1]!.t)
      }
      expect(out[out.length - 1]!.t).toBe(raw[raw.length - 1]!.t)
    }
  })

  it('Steady Speed then Glide compose in the shared selector pipeline', () => {
    // Steady equalizes speed along arc within moving segments; Glide then
    // remaps that uniform arc progress through invSmoothstep ease-in/out.
    // Order is fixed: never Glide-then-Steady, and never applying Glide twice.
    const raw = buildShakyCurve()
    const steadyAmt = 0.85
    const glideAmt = 0.7
    const manual = applyGlide(
      applySteadySpeed(raw, steadyAmt, ASPECT),
      glideAmt,
      ASPECT,
    ).samples
    const actor = createSceneActor({
      recording: {
        samples: raw.map((s) => ({ ...s })),
        recordedDurationMs: raw[raw.length - 1]!.t,
      },
      geometryEdit: makeGeometryEdit(raw, 0),
      smoothing: 0,
      steadySpeed: steadyAmt,
      glide: glideAmt,
    })
    const project = projectFor(raw, glideAmt)
    project.actors[0] = actor
    const viaSelector = selectProcessedPathForActor(project, actor)
    expect(viaSelector).toHaveLength(manual.length)
    for (let i = 0; i < manual.length; i++) {
      expect(viaSelector[i]!.t).toBeCloseTo(manual[i]!.t, 5)
      expect(viaSelector[i]!.x).toBeCloseTo(manual[i]!.x, 8)
      expect(viaSelector[i]!.y).toBeCloseTo(manual[i]!.y, 8)
    }
    // Composition ≠ Glide alone or Steady alone.
    const glideOnly = applyGlide(raw, glideAmt, ASPECT).samples
    const steadyOnly = applySteadySpeed(raw, steadyAmt, ASPECT)
    let diffGlide = 0
    let diffSteady = 0
    for (let i = 0; i < raw.length; i++) {
      diffGlide += Math.abs(manual[i]!.t - glideOnly[i]!.t)
      diffSteady += Math.abs(manual[i]!.t - steadyOnly[i]!.t)
    }
    expect(diffGlide).toBeGreaterThan(10)
    expect(diffSteady).toBeGreaterThan(10)
  })
})

describe('glide export fidelity', () => {
  function buildCornerPauseScene() {
    // Sharp L with dense pause, face-along, scale keys, shortened clip.
    const samples = buildDensePauseL()
    const actor = createSceneActor({
      id: 'corner-pause',
      name: 'Corner pause',
      faceAlongPath: true,
      directionOffsetDeg: 15,
      recording: {
        samples: samples.map((s) => ({ ...s })),
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      geometryEdit: makeGeometryEdit(samples, 0),
      smoothing: 0,
      steadySpeed: 0.4,
      glide: 0.85,
      clip: {
        start: 0.15,
        end: 0.85,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
      transform: {
        keyframes: [
          { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
          { id: 'k1', t: 0.5, rotationDeg: 0, scale: 1.4 },
          { id: 'k2', t: 1, rotationDeg: 0, scale: 1 },
        ],
      },
    })
    const project: Project = {
      version: 1,
      name: 'Glide export scene',
      actors: [actor],
      playback: {
        durationMs: samples[samples.length - 1]!.t,
        loop: true,
        loopMode: 'alternate',
        trigger: 'page-load',
      },
      stageAspect: ASPECT,
    }
    return { project, actor, samples }
  }

  it('editor and export agree on pose around pauses and through ease', () => {
    const { project, actor } = buildCornerPauseScene()
    const path = selectProcessedPathForActor(project, actor)
    const posKf = buildKeyframesFromProcessed(path)
    expect(maxPlaybackExportError(path, posKf, 64)).toBeLessThan(0.012)

    const heading = buildHeadingTrack(path, ASPECT)
    const pauseMask = path.map((_, i) =>
      isInStationaryRun(path, i, 40, ASPECT),
    )
    const entry = pauseMask.findIndex(Boolean)
    const exit = (() => {
      let i = entry
      while (i + 1 < pauseMask.length && pauseMask[i + 1]) i += 1
      return i
    })()
    expect(entry).toBeGreaterThan(0)

    const duration = path[path.length - 1]!.t
    const localTimes = [
      0,
      path[entry]!.t / duration,
      (path[entry]!.t + path[exit]!.t) / 2 / duration,
      path[exit]!.t / duration,
      Math.min(1, path[exit]!.t / duration + 0.05),
      0.25,
      0.5,
      0.75,
      1,
    ]

    for (const localT of localTimes) {
      const editorPos = evaluate(path, localT)
      const exportPos = evaluateKeyframes(posKf, localT)
      expect(
        Math.hypot(editorPos.x - exportPos.x, editorPos.y - exportPos.y),
        `pos @ ${localT}`,
      ).toBeLessThan(0.012)
      const editorRot = evaluateActorRotationDeg(
        actor,
        path,
        localT,
        ASPECT,
        heading,
      )
      expect(Number.isFinite(editorRot)).toBe(true)
      const scale = evaluateTransform(actor.transform, localT).scale
      expect(Number.isFinite(scale)).toBe(true)
    }

    // Export sampling must keep ease — not collapse to a few endpoints.
    const edgePath = segmentEdgeSpeedRatio(path, ASPECT)
    expect(edgePath).not.toBeNull()
    expect(edgePath!).toBeLessThan(0.9)
    // Early playhead stays behind mid-arc (ease-in); export keyframes agree.
    const earlyEditor = evaluate(path, 0.12)
    const earlyExport = evaluateKeyframes(posKf, 0.12)
    expect(
      Math.hypot(
        earlyEditor.x - earlyExport.x,
        earlyEditor.y - earlyExport.y,
      ),
    ).toBeLessThan(0.012)
    const midEditor = evaluate(path, 0.5)
    const chordEarly = Math.hypot(
      earlyEditor.x - path[0]!.x,
      earlyEditor.y - path[0]!.y,
    )
    const chordMid = Math.hypot(
      midEditor.x - path[0]!.x,
      midEditor.y - path[0]!.y,
    )
    expect(chordEarly / Math.max(chordMid, 1e-9)).toBeLessThan(0.45)

    const base = unionExportOffsets(posKf, actor.transform)
    const merged = mergeExportLocalOffsets(
      base,
      headingExportOffsets(path, ASPECT),
      120,
      (t) => evaluateActorRotationDeg(actor, path, t, ASPECT, heading),
      HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
      pauseExportOffsets(path, ASPECT),
    )
    expect(merged.offsets.length).toBeGreaterThan(8)
    for (const t of pauseExportOffsets(path, ASPECT)) {
      expect(merged.offsets.some((o) => Math.abs(o - t) < 1e-9)).toBe(true)
    }

    const { css } = buildProjectCssExport(project)
    expect(css).toMatch(/alternate/i)
    expect(css).toMatch(/scale\(\s*1\.4/)
    // Shortened clip note present.
    expect(css).toMatch(/Clip/)
    // Enough transform samples that easing is not two-endpoint linear.
    const frameCount = (css.match(/\{\s*transform:/g) ?? []).length
    expect(frameCount).toBeGreaterThan(12)

    // Clip-local mapping: project head inside clip → same editor path localT.
    const projectHead = 0.5
    const localT = projectToLocal(projectHead, actor.clip)
    const viaClip = selectActorPositionForActor(
      project,
      actor,
      projectHead,
      actor.restPosition,
      'playing',
    )
    const direct = evaluate(path, localT)
    expect(viaClip.x).toBeCloseTo(direct.x, 5)
    expect(viaClip.y).toBeCloseTo(direct.y, 5)

    // Alternate: forward localT and mirrored return share the same pose.
    const oneWay = project.playback.durationMs
    const fwd = tNormFromElapsed(oneWay * 0.3, oneWay, true, 'alternate')
    const back = tNormFromElapsed(oneWay * 1.7, oneWay, true, 'alternate')
    expect(fwd.tNorm).toBeCloseTo(0.3, 5)
    expect(back.tNorm).toBeCloseTo(0.3, 5)
    const a = evaluate(path, fwd.tNorm)
    const b = evaluate(path, back.tNorm)
    expect(a.x).toBeCloseTo(b.x, 8)
    expect(a.y).toBeCloseTo(b.y, 8)
  })
})

function distanceToPolyline(
  p: Vec2,
  samples: MotionSample[],
  aspect: number,
): number {
  let best = Infinity
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const apx = p.x - a.x
    const apy = p.y - a.y
    const ab2 = abx * abx + aby * aby
    const u = ab2 <= 1e-18 ? 0 : Math.min(1, Math.max(0, (apx * abx + apy * aby) / ab2))
    const qx = a.x + abx * u
    const qy = a.y + aby * u
    best = Math.min(best, aspectDistance(p.x, p.y, qx, qy, aspect))
  }
  return best
}

/** Dense pause L: short lead, hold, then long legs (sharp corner). */
function buildDensePauseL(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 8; i++) {
    samples.push({ t: i * 20, x: 0.2 + i * 0.01, y: 0.25 })
  }
  const hold = samples[samples.length - 1]!
  for (let i = 1; i <= 12; i++) {
    samples.push({ t: hold.t + i * 20, x: hold.x, y: hold.y })
  }
  const cornerX = 0.75
  const last = samples[samples.length - 1]!
  for (let i = 1; i <= 40; i++) {
    samples.push({
      t: last.t + i * 30,
      x: last.x + ((cornerX - last.x) * i) / 40,
      y: last.y,
    })
  }
  const corner = samples[samples.length - 1]!
  for (let i = 1; i <= 40; i++) {
    samples.push({
      t: corner.t + i * 30,
      x: corner.x,
      y: corner.y + i * 0.012,
    })
  }
  return samples
}

/** Dense pause with a very short moving lead-in (below glide minimum). */
function buildDensePauseWithShortLead(): MotionSample[] {
  const samples: MotionSample[] = [
    { t: 0, x: 0.3, y: 0.4 },
    { t: 30, x: 0.32, y: 0.4 },
    { t: 50, x: 0.34, y: 0.4 },
  ]
  for (let i = 1; i <= 10; i++) {
    samples.push({ t: 50 + i * 40, x: 0.34, y: 0.4 })
  }
  const bolt = samples[samples.length - 1]!
  for (let i = 1; i <= 30; i++) {
    samples.push({
      t: bolt.t + i * 25,
      x: bolt.x + i * 0.015,
      y: bolt.y,
    })
  }
  return samples
}
