import { describe, expect, it } from 'vitest'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import { exportCssFromRecording } from '../../src/core/export/css'
import { buildKeyframes } from '../../src/core/export/format'
import { processMotion } from '../../src/core/process'
import { DEFAULT_ACTOR, type MotionSample } from '../../src/core/types'

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

    expect(css).toContain('@keyframes motionsketch')
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
    expect(css).toContain('<div class="stage"><div class="actor"></div></div>')
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
})
