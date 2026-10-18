import { describe, expect, it } from 'vitest'
import { actorDisplaySizePx, coerceActor } from '../../src/core/actor'
import { exportCssFromRecording } from '../../src/core/export/css'
import { buildHtmlDemo } from '../../src/core/export/htmlDemo'
import {
  coerceActorImage,
  validateSvgMarkup,
  type ActorImageAsset,
} from '../../src/core/imageAsset'
import {
  PERSIST_FORMAT_VERSION,
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { makeActor, makeProject } from './helpers/project'
import { DEFAULT_ACTOR, type MotionSample } from '../../src/core/types'

const samples: MotionSample[] = [
  { t: 0, x: 0.2, y: 0.3 },
  { t: 100, x: 0.5, y: 0.5 },
  { t: 200, x: 0.8, y: 0.4 },
]

function tinyPngDataUrl(): string {
  // 1×1 transparent PNG
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
}

function asset(
  overrides: Partial<ActorImageAsset> &
    Pick<ActorImageAsset, 'naturalWidth' | 'naturalHeight'>,
): ActorImageAsset {
  return {
    mimeType: 'image/png',
    dataUrl: tinyPngDataUrl(),
    label: 'Logo',
    ...overrides,
  }
}

describe('SVG validation', () => {
  it('accepts a static SVG', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f766e"/></svg>`
    expect(validateSvgMarkup(svg)).toBeNull()
  })

  it('rejects scripts, handlers, and external hrefs', () => {
    expect(
      validateSvgMarkup(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
      )?.error,
    ).toMatch(/script/i)
    expect(
      validateSvgMarkup(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>`,
      )?.error,
    ).toMatch(/handler/i)
    expect(
      validateSvgMarkup(
        `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>`,
      )?.error,
    ).toMatch(/external|URL|link/i)
  })
})

describe('image actor sizing', () => {
  it('fits a wide logo so the longer edge matches size × minSide', () => {
    const actor = coerceActor({
      kind: 'image',
      width: 0.2,
      image: asset({ naturalWidth: 400, naturalHeight: 100 }),
    })
    const { width, height } = actorDisplaySizePx(1000, 500, actor)
    expect(width).toBeCloseTo(100) // 0.2 * 500
    expect(height).toBeCloseTo(25)
  })

  it('fits a tall image so height is the longer edge', () => {
    const actor = coerceActor({
      kind: 'image',
      width: 0.2,
      image: asset({ naturalWidth: 100, naturalHeight: 400 }),
    })
    const { width, height } = actorDisplaySizePx(1000, 500, actor)
    expect(height).toBeCloseTo(100)
    expect(width).toBeCloseTo(25)
  })

  it('keeps shapes square', () => {
    const { width, height } = actorDisplaySizePx(800, 600, DEFAULT_ACTOR)
    expect(width).toBeCloseTo(height)
    expect(width).toBeCloseTo(0.12 * 600)
  })
})

describe('image actor export', () => {
  it('documents that CSS does not embed the image and sizes by longer edge', () => {
    const actor = coerceActor({
      kind: 'image',
      width: 0.18,
      image: asset({ naturalWidth: 320, naturalHeight: 80, label: 'Wide' }),
    })
    const css = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor,
      stageAspect: 1.6,
      transform: { keyframes: [] },
    })
    expect(css).toMatch(/does NOT embed the image/i)
    expect(css).toContain('<img class="ms-actor"')
    expect(css).toContain('width: 18.00cqmin')
    expect(css).toMatch(/aspect-ratio:/)
    expect(css).not.toContain('background: #4f46e5')
  })

  it('embeds the image data URL in the offline HTML demo', () => {
    const dataUrl = tinyPngDataUrl()
    const actor = coerceActor({
      kind: 'image',
      width: 0.2,
      image: asset({
        naturalWidth: 64,
        naturalHeight: 64,
        dataUrl,
        label: 'Icon',
      }),
    })
    const html = buildHtmlDemo({
      samples,
      smoothing: 0,
      durationMs: 800,
      actor,
      stageAspect: 1.6,
      transform: { keyframes: [] },
    })
    expect(html).toContain('data-testid="demo-actor"')
    expect(html).toContain('<img class="ms-actor"')
    expect(html).toContain(dataUrl)
    expect(html).not.toMatch(/https?:\/\//i)
  })
})

describe('image actor persistence', () => {
  it('round-trips an embedded image in the current persist format', () => {
    const dataUrl = tinyPngDataUrl()
    const project = makeProject({
      actors: [
        makeActor({
          recording: { samples, recordedDurationMs: 200 },
          appearance: {
            kind: 'image',
            width: 0.2,
            height: 0.2,
            borderRadius: 0.28,
            color: '#4f46e5',
            image: {
              mimeType: 'image/png',
              dataUrl,
              naturalWidth: 1,
              naturalHeight: 1,
              label: 'Dot',
            },
          },
        }),
      ],
    })
    const raw = serializeSnapshot(
      buildSnapshot(project, null, '2026-01-01T00:00:00.000Z'),
    )
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    const appearance = parsed.snapshot.project.actors[0].appearance
    expect(appearance.kind).toBe('image')
    expect(appearance.image?.dataUrl).toBe(dataUrl)
    expect(appearance.image?.label).toBe('Dot')
  })

  it('rejects unsafe SVG payloads in coerceActorImage', () => {
    const evil =
      'data:image/svg+xml;base64,' +
      btoa(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
      )
    expect(
      coerceActorImage({
        mimeType: 'image/svg+xml',
        dataUrl: evil,
        naturalWidth: 10,
        naturalHeight: 10,
        label: 'x',
      }),
    ).toBeNull()
  })

  it('migrates older shape-only actors without image fields', () => {
    const actor = coerceActor({
      width: 0.15,
      height: 0.15,
      borderRadius: 0.5,
      color: '#112233',
    })
    expect(actor.kind).toBe('shape')
    expect(actor.image).toBeNull()
    expect(actor.width).toBeCloseTo(0.15)
  })
})
