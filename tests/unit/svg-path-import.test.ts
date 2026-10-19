import { describe, expect, it } from 'vitest'
import {
  importSvgPathFromText,
  pathDToPolyline,
  resampleEvenSpeed,
} from '../../src/core/svgPathImport'
import { exportCssFromProject } from '../../src/core/export/css'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { makeActor, makeProject } from './helpers/project'

function svgWithPath(d: string, viewBox = '0 0 100 100'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <path d="${d}" fill="none" stroke="black"/>
</svg>`
}

describe('svg path import', () => {
  it('imports a curved cubic path with even timing', () => {
    const result = importSvgPathFromText(
      svgWithPath('M 10 80 C 10 10, 90 10, 90 80'),
      1200,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.samples.length).toBeGreaterThanOrEqual(2)
    expect(result.samples[0]!.t).toBe(0)
    expect(result.samples[result.samples.length - 1]!.t).toBe(1200)
    // Curve should leave the straight chord (rise toward top of stage).
    const mid = result.samples[Math.floor(result.samples.length / 2)]!
    expect(mid.y).toBeLessThan(0.55)
    // Even speed: roughly uniform segment times
    const dts = result.samples
      .slice(1)
      .map((s, i) => s.t - result.samples[i]!.t)
    const avg = dts.reduce((a, b) => a + b, 0) / dts.length
    expect(dts.every((dt) => Math.abs(dt - avg) < avg * 0.35)).toBe(true)
  })

  it('preserves a sharp corner vertex', () => {
    const poly = pathDToPolyline('M 0 50 L 50 50 L 50 0')
    expect(poly.ok).toBe(true)
    if (!poly.ok) return
    const corner = poly.points.find(
      (p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y - 50) < 1e-6,
    )
    expect(corner).toBeTruthy()

    const result = importSvgPathFromText(
      svgWithPath('M 0 50 L 50 50 L 50 0'),
      1000,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Near the corner in path space → ~0.5, 0.5 in viewBox 0 0 100 100
    const nearCorner = result.samples.some(
      (s) => Math.abs(s.x - 0.5) < 0.08 && Math.abs(s.y - 0.5) < 0.08,
    )
    expect(nearCorner).toBe(true)
  })

  it('imports a closed loop (Z)', () => {
    const result = importSvgPathFromText(
      svgWithPath('M 20 20 L 80 20 L 80 80 L 20 80 Z'),
      1600,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.closed).toBe(true)
    const first = result.samples[0]!
    const last = result.samples[result.samples.length - 1]!
    expect(Math.abs(first.x - last.x)).toBeLessThan(0.02)
    expect(Math.abs(first.y - last.y)).toBeLessThan(0.02)
  })

  it('rejects multiple paths, subpaths, scripts, and external refs', () => {
    expect(
      importSvgPathFromText(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
          <path d="M0 0 L10 10"/><path d="M0 10 L10 0"/>
        </svg>`,
        1000,
      ).ok,
    ).toBe(false)

    expect(
      importSvgPathFromText(
        svgWithPath('M 0 0 L 10 10 M 20 20 L 30 30'),
        1000,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/subpath/i),
    })

    expect(
      importSvgPathFromText(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
          <script>alert(1)</script>
          <path d="M0 0 L10 10"/>
        </svg>`,
        1000,
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/script/i) })

    expect(
      importSvgPathFromText(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
          <path d="M0 0 L10 10" href="https://evil.example"/>
        </svg>`,
        1000,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/external|script|link/i),
    })

    expect(importSvgPathFromText('not svg at all', 1000).ok).toBe(false)
  })

  it('feeds the same processed path into CSS export', () => {
    const result = importSvgPathFromText(
      svgWithPath('M 10 50 C 30 10, 70 10, 90 50'),
      1400,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const actor = makeActor({
      recording: result.recording,
      smoothing: 0,
      steadySpeed: 1,
      geometryEdit: null,
    })
    const project = makeProject({
      actors: [actor],
      playback: {
        durationMs: 1400,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const processed = selectProcessedPathForActor(project, actor)
    expect(processed.length).toBeGreaterThan(2)
    const css = exportCssFromProject(project)
    expect(css).toContain('translate3d(')
    expect(css).toContain('1400ms')
    // Start pose should reflect left side of the curve.
    expect(css).toMatch(/translate3d\(([0-9.]+)cqw/)
    const startX = Number(
      css.match(
        /\.ms-actor[^{]*\{[^}]*transform:\s*translate3d\(([0-9.]+)cqw/,
      )?.[1],
    )
    expect(startX).toBeGreaterThan(5)
    expect(startX).toBeLessThan(25)
  })

  it('resampleEvenSpeed pins endpoints', () => {
    const samples = resampleEvenSpeed(
      [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.9 },
        { x: 0.9, y: 0.3 },
      ],
      800,
      10,
    )
    expect(samples[0]).toMatchObject({ t: 0, x: 0.1, y: 0.2 })
    expect(samples[samples.length - 1]).toMatchObject({
      t: 800,
      x: 0.9,
      y: 0.3,
    })
  })
})
