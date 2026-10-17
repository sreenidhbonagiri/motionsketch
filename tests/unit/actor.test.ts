import { describe, expect, it } from 'vitest'
import {
  actorBorderRadiusCssPercent,
  clampActorSize,
  coerceActor,
  normalizeActorColor,
} from '../../src/core/actor'
import { exportCssFromRecording } from '../../src/core/export/css'
import { actorSizePx } from '../../src/core/coords'
import {
  DEFAULT_ACTOR,
  MAX_ACTOR_SIZE,
  MIN_ACTOR_SIZE,
  type MotionSample,
} from '../../src/core/types'
import { parseSnapshotJson } from '../../src/core/persist/document'
import { useEditorStore } from '../../src/state/store'

const samples: MotionSample[] = [
  { t: 0, x: 0.35, y: 0.5 },
  { t: 100, x: 0.6, y: 0.4 },
  { t: 200, x: 0.8, y: 0.55 },
]

describe('actor appearance helpers', () => {
  it('normalizes hex colors and rejects unsupported values', () => {
    expect(normalizeActorColor('#AbC')).toBe('#aabbcc')
    expect(normalizeActorColor('#4f46e5')).toBe('#4f46e5')
    expect(normalizeActorColor('indigo')).toBeNull()
  })

  it('clamps size into the supported UI range', () => {
    expect(clampActorSize(0.01)).toBe(MIN_ACTOR_SIZE)
    expect(clampActorSize(0.9)).toBe(MAX_ACTOR_SIZE)
    expect(clampActorSize(0.2)).toBeCloseTo(0.2)
  })

  it('maps corner radius 0→square and 1→circle in CSS percent', () => {
    expect(actorBorderRadiusCssPercent(0)).toBe(0)
    expect(actorBorderRadiusCssPercent(1)).toBe(50)
    expect(actorBorderRadiusCssPercent(0.28)).toBeCloseTo(14)
  })

  it('coerces missing or partial actor data to safe defaults', () => {
    expect(coerceActor(undefined)).toEqual(DEFAULT_ACTOR)
    expect(coerceActor({ color: '#ff0000' }).color).toBe('#ff0000')
    expect(coerceActor({ color: '#ff0000' }).width).toBe(DEFAULT_ACTOR.width)
    expect(coerceActor({ width: 0.25, height: 0.1 }).height).toBeCloseTo(0.25)
    expect(coerceActor({ borderRadius: 2 }).borderRadius).toBe(1)
    expect(coerceActor({ color: 'nope' }).color).toBe(DEFAULT_ACTOR.color)
  })
})

describe('actor store + export consistency', () => {
  it('keeps center position when resizing (layout uses translate -50%)', () => {
    const stage = { w: 800, h: 500 }
    const center = { x: 0.35, y: 0.5 }
    const small = actorSizePx(stage.w, stage.h, 0.1, 0.1)
    const large = actorSizePx(stage.w, stage.h, 0.3, 0.3)

    // Centered box: left = center*stage - size/2
    const smallLeft = center.x * stage.w - small.width / 2
    const largeLeft = center.x * stage.w - large.width / 2
    const smallCenterX = smallLeft + small.width / 2
    const largeCenterX = largeLeft + large.width / 2
    expect(smallCenterX).toBeCloseTo(largeCenterX, 5)
    expect(smallCenterX).toBeCloseTo(center.x * stage.w, 5)

    // Path samples untouched by appearance setters.
    useEditorStore.setState({
      project: {
        version: 1,
        actor: { ...DEFAULT_ACTOR },
        recording: { samples, recordedDurationMs: 200 },
        playback: {
          durationMs: 1200,
          smoothing: 0.35,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
      },
      playbackHead: 0.4,
    })
    const beforeSamples = useEditorStore.getState().project.recording!.samples
    const beforeHead = useEditorStore.getState().playbackHead
    useEditorStore.getState().setActorSize(0.28)
    useEditorStore.getState().setActorBorderRadius(1)
    useEditorStore.getState().setActorColor('#112233')
    expect(useEditorStore.getState().project.recording!.samples).toEqual(
      beforeSamples,
    )
    expect(useEditorStore.getState().playbackHead).toBe(beforeHead)
    expect(useEditorStore.getState().project.actor.width).toBeCloseTo(0.28)
    expect(useEditorStore.getState().project.actor.height).toBeCloseTo(0.28)
  })

  it('exports selected appearance with cqmin sizing semantics', () => {
    const actor = {
      width: 0.22,
      height: 0.22,
      borderRadius: 1,
      color: '#c2410c',
    }
    const css = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor,
    })
    expect(css).toContain('width: 22.00cqmin')
    expect(css).toContain('border-radius: 50.00%')
    expect(css).toContain('background: #c2410c')
    expect(css).toContain('aspect-ratio: 1')
  })
})

describe('actor persistence compatibility', () => {
  it('round-trips customized actor through project JSON', () => {
    const raw = JSON.stringify({
      formatVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        actor: {
          width: 0.2,
          height: 0.2,
          borderRadius: 0.5,
          color: '#00aa88',
        },
        recording: {
          samples,
          recordedDurationMs: 200,
        },
        playback: {
          durationMs: 1200,
          smoothing: 0.35,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
      },
      geometryEdit: null,
    })
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actor).toEqual({
      width: 0.2,
      height: 0.2,
      borderRadius: 0.5,
      color: '#00aa88',
    })
  })

  it('loads older projects missing actor fields with defaults', () => {
    const raw = JSON.stringify({
      formatVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        recording: {
          samples,
          recordedDurationMs: 200,
        },
        playback: {
          durationMs: 1200,
          smoothing: 0.35,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
      },
      geometryEdit: null,
    })
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actor).toEqual(DEFAULT_ACTOR)
  })
})
