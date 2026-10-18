import { describe, expect, it } from 'vitest'
import { exportCssFromRecording } from '../../src/core/export/css'
import {
  buildHtmlDemo,
  isSafeCssForEmbed,
} from '../../src/core/export/htmlDemo'
import { DEFAULT_ACTOR, type MotionSample } from '../../src/core/types'

const samples: MotionSample[] = [
  { t: 0, x: 0.2, y: 0.3 },
  { t: 100, x: 0.5, y: 0.5 },
  { t: 200, x: 0.8, y: 0.4 },
]

const base = {
  samples,
  smoothing: 0.2,
  steadySpeed: 0,
  durationMs: 1200,
  actor: { ...DEFAULT_ACTOR, color: '#c2410c', width: 0.18, height: 0.18 },
}

describe('html demo export', () => {
  it('embeds the exact CSS from the shared exporter', () => {
    const css = exportCssFromRecording({
      ...base,
      loop: true,
      loopMode: 'alternate',
    })
    const html = buildHtmlDemo({
      ...base,
      loop: true,
      loopMode: 'alternate',
    })
    expect(html).toContain(css)
    expect(html).toContain('linear infinite alternate')
    expect(html).toContain('width: 18.00cqmin')
    expect(html).toContain('background: #c2410c')
  })

  it('is standalone: no external URLs, includes Play/Replay outside the stage', () => {
    const html = buildHtmlDemo({ ...base, loop: false })
    expect(html).toMatch(/<!DOCTYPE html>/i)
    expect(html).toContain('data-testid="demo-scene"')
    expect(html).toContain('data-testid="demo-stage"')
    expect(html).toContain('data-testid="demo-actor"')
    expect(html).toContain('data-testid="demo-replay"')
    expect(html).toContain('data-ms-play')
    expect(html).toContain('MotionSketchTrigger')
    expect(html).toContain('demo-frame')
    expect(html).toContain('ms-stage')
    expect(html).toMatch(/aspect-ratio:\s*16\s*\/\s*10/)
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i)
    expect(html).not.toContain('@import')
    // Controls are siblings of the frame, not inside the stage
    expect(html).toMatch(
      /demo-stage[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="demo-controls"/,
    )
  })

  it('exports once / repeat / alternate timings like the editor', () => {
    expect(buildHtmlDemo({ ...base, loop: false })).toContain(
      '1200ms linear forwards',
    )
    expect(
      buildHtmlDemo({ ...base, loop: true, loopMode: 'repeat' }),
    ).toContain('1200ms linear infinite')
    expect(
      buildHtmlDemo({ ...base, loop: true, loopMode: 'alternate' }),
    ).toContain('1200ms linear infinite alternate')
  })

  it('rejects CSS that could escape a style block', () => {
    expect(isSafeCssForEmbed('.a { color: red; }')).toBe(true)
    expect(isSafeCssForEmbed('/* <div class="stage"> */')).toBe(true)
    expect(isSafeCssForEmbed('</style><script>alert(1)</script>')).toBe(false)
    expect(isSafeCssForEmbed('.x { color: red } <script>')).toBe(false)
    expect(isSafeCssForEmbed('@import url("https://evil.test/x.css");')).toBe(
      false,
    )
    expect(isSafeCssForEmbed('')).toBe(false)
  })

  it('coerces unsafe actor color instead of embedding it raw', () => {
    const html = buildHtmlDemo({
      ...base,
      actor: { ...DEFAULT_ACTOR, color: 'url(javascript:alert(1))' as string },
    })
    expect(html).toContain(`background: ${DEFAULT_ACTOR.color}`)
    expect(html).not.toContain('javascript:')
  })
})
