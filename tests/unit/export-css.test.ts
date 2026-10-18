import { describe, expect, it } from 'vitest'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import {
  exportCssFromProject,
  exportCssFromRecording,
  formatProjectOffsets,
  projectTimelineSamples,
} from '../../src/core/export/css'
import { evaluateTransform } from '../../src/core/transform'
import { buildKeyframes } from '../../src/core/export/format'
import { processMotion } from '../../src/core/process'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { DEFAULT_ACTOR, type MotionSample } from '../../src/core/types'
import { makeActor, makeProject, makeRecording } from './helpers/project'

const samples: MotionSample[] = [
  { t: 0, x: 0.1, y: 0.2 },
  { t: 100, x: 0.5, y: 0.4 },
  { t: 200, x: 0.9, y: 0.8 },
]

function densePath(): MotionSample[] {
  const out: MotionSample[] = []
  for (let i = 0; i <= 40; i++) {
    out.push({
      t: i * 10,
      x: 0.1 + 0.8 * (i / 40),
      y: 0.2 + 0.5 * Math.sin((i / 40) * Math.PI),
    })
  }
  return out
}

describe('css export', () => {
  it('emits transform keyframes with container query units and linear timing', () => {
    const css = exportCssFromRecording({
      samples,
      smoothing: 0.35,
      steadySpeed: 0.4,
      durationMs: 1200,
      actor: DEFAULT_ACTOR,
    })

    expect(css).toMatch(/@keyframes ms-[a-f0-9]{8}/)
    expect(css).toContain('1200ms linear forwards')
    expect(css).toContain('container-type: size')
    expect(css).toContain('translate3d(')
    expect(css).toContain('cqw')
    expect(css).toContain('cqh')
    expect(css).toContain('cqmin')
    const keyframeBlock = css.slice(css.indexOf('@keyframes'))
    expect(keyframeBlock).toContain('transform:')
    expect(keyframeBlock).not.toMatch(/\bleft\s*:/)
    expect(keyframeBlock).not.toMatch(/\btop\s*:/)
    expect(css).not.toMatch(/\bease\b/)
    expect(css).toMatch(
      /Example HTML:[\s\S]*<div class="ms-scene-[a-f0-9]{8}" data-ms-scene="[a-f0-9]{8}">[\s\S]*<div class="ms-stage">[\s\S]*<div class="ms-actor"><\/div>/,
    )
  })

  it('documents correct px fallback conversion for cq units', () => {
    const css = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
    })
    expect(css).toContain('Ncqw  → (N / 100) * stageWidth')
    expect(css).toContain('Ncqh  → (N / 100) * stageHeight')
    expect(css).toContain('Ncqmin → (N / 100) * min(stageWidth, stageHeight)')
    // Guard against the old incorrect guidance.
    expect(css).not.toContain('value * stageWidth/Height')
  })

  it('returns a comment when there are no samples', () => {
    const css = exportCssFromRecording({
      samples: [],
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
    })
    expect(css).toContain('No recording')
  })

  it('keeps playback and export paths consistent with steady speed', () => {
    const raw = densePath()
    const smoothing = 0.4
    const steadySpeed = 0.6
    const playback = processMotion(raw, smoothing, steadySpeed)
    const keyframes = buildKeyframes(raw, smoothing, steadySpeed)
    const err = maxPlaybackExportError(playback, keyframes, 48)
    expect(err).toBeLessThan(0.03)
  })

  it('preserves keyframe endpoint coordinates', () => {
    const raw = densePath()
    const keyframes = buildKeyframes(raw, 0.5, 0.5)
    expect(keyframes[0].x).toBeCloseTo(raw[0].x, 5)
    expect(keyframes[0].y).toBeCloseTo(raw[0].y, 5)
    expect(keyframes[keyframes.length - 1].x).toBeCloseTo(
      raw[raw.length - 1].x,
      5,
    )
    expect(keyframes[keyframes.length - 1].y).toBeCloseTo(
      raw[raw.length - 1].y,
      5,
    )
  })

  it('scales exported cq lengths consistently across stage sizes', () => {
    const css = exportCssFromRecording({
      samples: [
        { t: 0, x: 0.25, y: 0.5 },
        { t: 100, x: 0.75, y: 0.5 },
      ],
      smoothing: 0,
      durationMs: 800,
      actor: DEFAULT_ACTOR,
    })
    // 25cqw on 400px and 800px stages → 100px and 200px (N/100 * W)
    expect((25 / 100) * 400).toBe(100)
    expect((25 / 100) * 800).toBe(200)
    expect(css).toMatch(/25\.000cqw/)
  })

  it('exports matching iteration and direction for loop modes', () => {
    const once = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      loop: false,
    })
    expect(once).toContain('1000ms linear forwards')
    expect(once).not.toContain('infinite')

    const repeat = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      loop: true,
      loopMode: 'repeat',
    })
    expect(repeat).toContain('1000ms linear infinite')
    expect(repeat).not.toContain('alternate')
    expect(repeat).toContain('End and start may jump')

    const alternate = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      loop: true,
      loopMode: 'alternate',
    })
    expect(alternate).toContain('1000ms linear infinite alternate')
    expect(alternate).toContain('full cycle is 2×')
  })

  it('scopes multi-actor selectors, keyframes, and stacking order independently', () => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a1',
          name: 'Shape',
          smoothing: 0,
          recording: makeRecording(10),
          restPosition: { x: 0.2, y: 0.5 },
        }),
        makeActor({
          id: 'a2',
          name: 'Other',
          smoothing: 0.9,
          recording: makeRecording(10),
          restPosition: { x: 0.8, y: 0.5 },
        }),
      ],
      playback: { durationMs: 1000, loop: true, loopMode: 'alternate' },
    })

    const pathA = selectProcessedPathForActor(project, project.actors[0], {
      geometryEdit: null,
      editSession: null,
      editPreview: null,
    })
    const pathB = selectProcessedPathForActor(project, project.actors[1], {
      geometryEdit: null,
      editSession: null,
      editPreview: null,
    })
    expect(pathA.length).toBeGreaterThan(1)
    expect(pathB.length).toBeGreaterThan(1)
    // Different smoothing must not collapse to an identical path.
    const mid = Math.floor(pathA.length / 2)
    expect(
      Math.abs(pathA[mid].x - pathB[mid].x) +
        Math.abs(pathA[mid].y - pathB[mid].y),
    ).toBeGreaterThan(0)

    const css = exportCssFromProject(project)
    expect(css).toContain('.ms-actor-1')
    expect(css).toContain('.ms-actor-2')
    expect(css).toMatch(/@keyframes ms-[a-f0-9]{8}-a1/)
    expect(css).toMatch(/@keyframes ms-[a-f0-9]{8}-a2/)
    expect(css).toMatch(/\.ms-actor-1\s*\{[^}]*z-index:\s*1/s)
    expect(css).toMatch(/\.ms-actor-2\s*\{[^}]*z-index:\s*2/s)
    expect(css).toContain('linear infinite alternate')
    // Example HTML lists actors in list/stacking order.
    const example = css.slice(css.indexOf('Example HTML:'))
    expect(example.indexOf('ms-actor-1')).toBeLessThan(
      example.indexOf('ms-actor-2'),
    )
  })

  it('keeps near-final and final clip poses distinct under short clips', () => {
    // Regression: 2-decimal rounding used to collapse local 0.9995 and 1 onto
    // the same CSS %, dropping the final 180° pose into the hold.
    const clip = { start: 0.2, end: 0.25 }
    const samples = projectTimelineSamples([0, 0.9995, 1], clip)
    const offsets = formatProjectOffsets(samples.map((s) => s.projectT))
    expect(new Set(offsets).size).toBe(offsets.length)

    const finalSample = samples.find((s) => s.localT >= 1 - 1e-9)
    expect(finalSample).toBeTruthy()
    const nearFinal = samples.find(
      (s) => s.localT > 0.99 && s.localT < 1 - 1e-9,
    )
    expect(nearFinal).toBeTruthy()
    expect(offsets[samples.indexOf(nearFinal!)]).not.toBe(
      offsets[samples.indexOf(finalSample!)],
    )

    const project = makeProject({
      actors: [
        makeActor({
          id: 'short',
          clip,
          recording: makeRecording(8),
          transform: {
            keyframes: [
              { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
              { id: 'k1', t: 0.9995, rotationDeg: 0, scale: 1 },
              { id: 'k2', t: 1, rotationDeg: 180, scale: 1 },
            ],
          },
        }),
      ],
      playback: { durationMs: 1000, loop: false, loopMode: 'repeat' },
    })
    const css = exportCssFromProject(project)
    const block = css.slice(css.indexOf('@keyframes'))
    // Clip-end pose must include 180deg before the final hold, not animate
    // toward it across the rest of the project timeline.
    expect(block).toMatch(/25(?:\.\d+)?%\s*\{[^}]*rotate\(180deg\)/)
    expect(block).toMatch(/100%\s*\{[^}]*rotate\(180deg\)/)
    // Preview evaluation agrees at and after the clip boundary.
    const track = project.actors[0].transform
    expect(evaluateTransform(track, 1).rotationDeg).toBe(180)
    expect(evaluateTransform(track, 0.9995).rotationDeg).toBe(0)
  })
})
