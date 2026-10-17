import { describe, expect, it } from 'vitest'
import { exportCssFromRecording } from '../../src/core/export/css'
import { buildHtmlDemo } from '../../src/core/export/htmlDemo'
import { applySteadySpeed, processMotion } from '../../src/core/process'
import {
  aspectDistance,
  captureViewportStageAspect,
  formatCssAspectRatio,
  LEGACY_STAGE_ASPECT,
} from '../../src/core/stageAspect'
import { DEFAULT_ACTOR, type MotionSample } from '../../src/core/types'

const samples: MotionSample[] = [
  { t: 0, x: 0.1, y: 0.5 },
  { t: 100, x: 0.9, y: 0.5 },
  { t: 200, x: 0.9, y: 0.2 },
]

describe('stage aspect helpers', () => {
  it('formats known ratios and clamps capture', () => {
    expect(formatCssAspectRatio(1.6)).toBe('16 / 10')
    expect(formatCssAspectRatio(16 / 9)).toBe('16 / 9')
    expect(captureViewportStageAspect(1280, 800)).toBeCloseTo(1.6, 5)
    expect(captureViewportStageAspect(0, 0)).toBe(LEGACY_STAGE_ASPECT)
  })

  it('weights distance by aspect so horizontal travel counts more on wide stages', () => {
    const isotropic = aspectDistance(0, 0, 0.1, 0, 1)
    const wide = aspectDistance(0, 0, 0.1, 0, 1.6)
    expect(wide).toBeGreaterThan(isotropic)
    expect(wide).toBeCloseTo(0.16, 5)
  })
})

describe('export uses stored stageAspect', () => {
  it('embeds project aspect in CSS and HTML demo chrome', () => {
    const css = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      stageAspect: 16 / 9,
    })
    expect(css).toMatch(/aspect-ratio:\s*16\s*\/\s*9/)
    expect(css).not.toMatch(/aspect-ratio:\s*16\s*\/\s*10/)

    const html = buildHtmlDemo({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      stageAspect: 16 / 9,
    })
    expect(html).toContain(css)
    expect(html).toMatch(/calc\(\(100dvh - 5\.5rem\) \* 1\.777/)
  })

  it('defaults missing stageAspect to legacy 16/10', () => {
    const css = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
    })
    expect(css).toMatch(/aspect-ratio:\s*16\s*\/\s*10/)
  })
})

describe('aspect-aware processing', () => {
  it('keeps geometry when applying steady speed with a wide stage aspect', () => {
    const steadied = applySteadySpeed(samples, 1, 1.6)
    expect(steadied.map((s) => ({ x: s.x, y: s.y }))).toEqual(
      samples.map((s) => ({ x: s.x, y: s.y })),
    )
  })

  it('processMotion returns a stable canonical path for a given aspect', () => {
    const a = processMotion(samples, 0.3, 0.2, 1.6)
    const b = processMotion(samples, 0.3, 0.2, 1.6)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(2)
  })
})
