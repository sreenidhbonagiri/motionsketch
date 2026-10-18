import { describe, expect, it } from 'vitest'
import { exportCssFromRecording } from '../../src/core/export/css'
import { buildHtmlDemo } from '../../src/core/export/htmlDemo'
import {
  PERSIST_FORMAT_VERSION,
  parseSnapshotJson,
  validateSnapshot,
} from '../../src/core/persist/document'
import {
  DEFAULT_TRANSFORM,
  MAX_TRANSFORM_KEYFRAMES,
  MAX_TRANSFORM_SCALE,
  MIN_TRANSFORM_SCALE,
  coerceTransformTrack,
  evaluateTransform,
  parseTransformTrack,
  upsertTransformKeyframe,
} from '../../src/core/transform'
import { DEFAULT_ACTOR, type MotionSample } from '../../src/core/types'
import { useEditorStore } from '../../src/state/store'

const samples: MotionSample[] = [
  { t: 0, x: 0.1, y: 0.2 },
  { t: 100, x: 0.5, y: 0.4 },
  { t: 200, x: 0.9, y: 0.8 },
]

describe('transform evaluation', () => {
  it('defaults to identity with no keyframes', () => {
    expect(evaluateTransform({ keyframes: [] }, 0.5)).toEqual(DEFAULT_TRANSFORM)
  })

  it('seeds identity at t=0 when first keyframe is after zero', () => {
    const { track } = upsertTransformKeyframe(
      { keyframes: [] },
      { t: 0.5, rotationDeg: 180, scale: 2 },
    )
    expect(track.keyframes).toHaveLength(2)
    expect(track.keyframes[0].t).toBe(0)
    expect(track.keyframes[0].rotationDeg).toBe(0)
    expect(track.keyframes[0].scale).toBe(1)
    expect(track.keyframes[1].rotationDeg).toBe(180)
  })

  it('interpolates linearly and holds outside the keyed range', () => {
    let track = {
      keyframes: [] as ReturnType<
        typeof upsertTransformKeyframe
      >['track']['keyframes'],
    }
    ;({ track } = upsertTransformKeyframe(track, {
      t: 0,
      rotationDeg: 0,
      scale: 1,
    }))
    ;({ track } = upsertTransformKeyframe(track, {
      t: 1,
      rotationDeg: 360,
      scale: 2,
    }))
    const mid = evaluateTransform(track, 0.5)
    expect(mid.rotationDeg).toBeCloseTo(180, 5)
    expect(mid.scale).toBeCloseTo(1.5, 5)

    ;({ track } = upsertTransformKeyframe(
      { keyframes: [] },
      { t: 0.25, rotationDeg: 90, scale: 1.5 },
    ))
    ;({ track } = upsertTransformKeyframe(track, {
      t: 0.75,
      rotationDeg: 270,
      scale: 2.5,
    }))
    // Seeded identity at 0; hold last value after 0.75
    expect(evaluateTransform(track, 0).rotationDeg).toBe(0)
    expect(evaluateTransform(track, 1).rotationDeg).toBe(270)
  })

  it('treats 0→360 as a full spin (unwrapped degrees)', () => {
    let track = { keyframes: [] as ReturnType<typeof upsertTransformKeyframe>['track']['keyframes'] }
    ;({ track } = upsertTransformKeyframe(track, { t: 0, rotationDeg: 0, scale: 1 }))
    ;({ track } = upsertTransformKeyframe(track, { t: 1, rotationDeg: 360, scale: 1 }))
    expect(evaluateTransform(track, 0.25).rotationDeg).toBeCloseTo(90, 5)
  })

  it('replaces duplicate times and removes the other when moving onto a key', () => {
    let track = { keyframes: [] as ReturnType<typeof upsertTransformKeyframe>['track']['keyframes'] }
    let idA: string
    ;({ track, keyframeId: idA } = upsertTransformKeyframe(track, {
      t: 0.2,
      rotationDeg: 10,
      scale: 1,
    }))
    let idB: string
    ;({ track, keyframeId: idB } = upsertTransformKeyframe(track, {
      t: 0.8,
      rotationDeg: 80,
      scale: 2,
    }))
    ;({ track } = upsertTransformKeyframe(track, {
      id: idB,
      t: 0.2,
      rotationDeg: 99,
      scale: 1.5,
    }))
    expect(track.keyframes).toHaveLength(2) // seeded 0 + the merged slot
    const at02 = track.keyframes.find((k) => Math.abs(k.t - 0.2) < 1e-4)
    expect(at02?.rotationDeg).toBe(99)
    expect(track.keyframes.some((k) => k.id === idA)).toBe(false)
  })

  it('rejects invalid imports instead of dropping keyframes', () => {
    expect(
      parseTransformTrack({
        keyframes: [
          { id: 'a', t: 0.5, rotationDeg: 90, scale: 2 },
          { id: 'bad', t: 0.2, rotationDeg: 1, scale: 99 },
        ],
      }).ok,
    ).toBe(false)

    expect(
      parseTransformTrack({
        keyframes: [{ id: 'nan', t: Number.NaN, rotationDeg: 1, scale: 1 }],
      }).ok,
    ).toBe(false)

    expect(
      parseTransformTrack({
        keyframes: Array.from({ length: MAX_TRANSFORM_KEYFRAMES + 1 }, (_, i) => ({
          id: `k${i}`,
          t: i / (MAX_TRANSFORM_KEYFRAMES + 1),
          rotationDeg: i,
          scale: 1,
        })),
      }).ok,
    ).toBe(false)

    // Soft coerce remains available for non-import callers.
    const coerced = coerceTransformTrack({
      keyframes: [{ id: 'bad', t: 0.2, rotationDeg: 1, scale: 99 }],
    })
    expect(coerced.keyframes).toEqual([])
  })
})

describe('transform store + export', () => {
  it('clears transform on new recording and preserves it when replacing the image', () => {
    useEditorStore.setState({
      project: {
        version: 1,
        actor: { ...DEFAULT_ACTOR },
        recording: { samples, recordedDurationMs: 200 },
        playback: {
          durationMs: 1000,
          smoothing: 0,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
        stageAspect: 1.6,
        transform: { keyframes: [] },
      },
      mode: 'idle',
      playbackHead: 0.5,
      selectedTransformId: null,
      transformUndoStack: [],
      transformRedoStack: [],
    })
    useEditorStore.getState().upsertTransformAtPlayhead(180, 2)
    expect(useEditorStore.getState().project.transform.keyframes.length).toBeGreaterThan(0)

    useEditorStore.getState().beginRecording(1, { x: 0.3, y: 0.3 })
    expect(useEditorStore.getState().project.transform.keyframes).toHaveLength(0)

    useEditorStore.getState().finishRecording({
      samples,
      recordedDurationMs: 200,
    })
    useEditorStore.setState({ playbackHead: 0.5 })
    useEditorStore.getState().upsertTransformAtPlayhead(90, 1.5)
    const before = useEditorStore.getState().project.transform
    useEditorStore.getState().setActorImage({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aa',
      naturalWidth: 8,
      naturalHeight: 4,
      label: 'Wide',
    })
    expect(useEditorStore.getState().project.transform).toEqual(before)
  })

  it('undo/redo uses one entry per completed keyframe action', () => {
    useEditorStore.setState({
      project: {
        version: 1,
        actor: { ...DEFAULT_ACTOR },
        recording: { samples, recordedDurationMs: 200 },
        playback: {
          durationMs: 1000,
          smoothing: 0,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
        stageAspect: 1.6,
        transform: { keyframes: [] },
      },
      mode: 'idle',
      playbackHead: 0.4,
      selectedTransformId: null,
      transformUndoStack: [],
      transformRedoStack: [],
    })
    useEditorStore.getState().upsertTransformAtPlayhead(45, 1.2)
    useEditorStore.setState({ playbackHead: 0.8 })
    useEditorStore.getState().upsertTransformAtPlayhead(90, 2)
    expect(useEditorStore.getState().transformUndoStack).toHaveLength(2)
    useEditorStore.getState().undoTransform()
    expect(useEditorStore.getState().project.transform.keyframes).toHaveLength(2) // seed + first
    useEditorStore.getState().redoTransform()
    expect(
      useEditorStore.getState().project.transform.keyframes.some(
        (k) => k.rotationDeg === 90,
      ),
    ).toBe(true)
  })

  it('CSS unions position and transform times with correct order', () => {
    const { track } = upsertTransformKeyframe(
      { keyframes: [] },
      { t: 0.5, rotationDeg: 360, scale: 2 },
    )
    const css = exportCssFromRecording({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      transform: track,
    })
    expect(css).toContain('rotate(360deg)')
    expect(css).toContain('scale(2)')
    expect(css).toMatch(
      /translate3d\([^)]+\) translate\(-50%, -50%\) rotate\(360deg\) scale\(2\)/,
    )
    // Transform-only time appears
    expect(css).toMatch(/50% \{ transform:/)

    const html = buildHtmlDemo({
      samples,
      smoothing: 0,
      durationMs: 1000,
      actor: DEFAULT_ACTOR,
      transform: track,
    })
    expect(html).toContain(css)
  })

  it('migrates older projects to an empty transform track', () => {
    const raw = JSON.stringify({
      formatVersion: 3,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        actor: DEFAULT_ACTOR,
        recording: { samples, recordedDurationMs: 200 },
        playback: {
          durationMs: 1000,
          smoothing: 0,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
        stageAspect: 1.6,
      },
      geometryEdit: null,
    })
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(parsed.snapshot.project.transform.keyframes).toEqual([])

    const withXf = validateSnapshot({
      formatVersion: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        actor: DEFAULT_ACTOR,
        recording: { samples, recordedDurationMs: 200 },
        playback: {
          durationMs: 1000,
          smoothing: 0,
          steadySpeed: 0,
          loop: true,
          loopMode: 'alternate',
        },
        stageAspect: 1.6,
        transform: {
          keyframes: [
            { id: 'a', t: 0, rotationDeg: 0, scale: 1 },
            { id: 'b', t: 1, rotationDeg: 720, scale: 1.5 },
          ],
        },
      },
      geometryEdit: null,
    })
    expect(withXf.ok).toBe(true)
    if (!withXf.ok) return
    expect(withXf.snapshot.project.transform.keyframes).toHaveLength(2)
  })

  it('rejects v4 imports with invalid transform keyframes', () => {
    const bad = validateSnapshot({
      formatVersion: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        actor: DEFAULT_ACTOR,
        recording: { samples, recordedDurationMs: 200 },
        playback: {
          durationMs: 1000,
          smoothing: 0,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
        stageAspect: 1.6,
        transform: {
          keyframes: [{ id: 'x', t: 0.5, rotationDeg: 10, scale: 99 }],
        },
      },
      geometryEdit: null,
    })
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.error).toMatch(/scale/)
  })
})
