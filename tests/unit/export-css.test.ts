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
    // Motion is transform-driven; keyframes must not animate left/top.
    const keyframeBlock = css.slice(css.indexOf('@keyframes'))
    expect(keyframeBlock).toContain('transform:')
    expect(keyframeBlock).not.toMatch(/\bleft\s*:/)
    expect(keyframeBlock).not.toMatch(/\btop\s*:/)
    expect(css).not.toMatch(/\bease\b/)
    expect(css).toContain('<div class="stage"><div class="actor"></div></div>')
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

  it('keeps playback and export paths consistent within a small error', () => {
    const raw = densePath()
    const smoothing = 0.4
    const playback = processMotion(raw, smoothing)
    const keyframes = buildKeyframes(raw, smoothing)
    const err = maxPlaybackExportError(playback, keyframes, 48)
    expect(err).toBeLessThan(0.03)
  })

  it('preserves keyframe endpoint coordinates', () => {
    const raw = densePath()
    const keyframes = buildKeyframes(raw, 0.5)
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
})
