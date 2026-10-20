import { beforeEach, describe, expect, it } from 'vitest'
import { actorDisplaySizePx } from '../../src/core/actor'
import {
  countConservativeTextLines,
  estimateTextLayoutSizePx,
} from '../../src/core/actorText'
import { makeGeometryEdit } from '../../src/core/edit'
import {
  buildSnapshot,
  parseSnapshotJson,
  PERSIST_FORMAT_VERSION,
  serializeSnapshot,
} from '../../src/core/persist/document'
import {
  planStageResize,
  resizeProjectStage,
  resolveProjectStageSize,
  toCompositionPoint,
  type StageCompositionSize,
} from '../../src/core/stageResize'
import { MIN_ACTOR_SIZE } from '../../src/core/types'
import { useEditorStore } from '../../src/state/store'
import {
  makeActor,
  makeProject,
  makeRecording,
  makeSamples,
} from './helpers/project'

function pathCompSpan(
  samples: Array<{ x: number; y: number }>,
  size: StageCompositionSize,
  offsetX = 0,
  offsetY = 0,
) {
  const pts = samples.map((s) => toCompositionPoint(s, size, offsetX, offsetY))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

describe('stage resize composition expansion', () => {
  it('1600×1000 → 3200×2000: same aspect, 2× working area; content composition size unchanged', () => {
    const samples = makeSamples(10)
    const actor = makeActor({
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      geometryEdit: makeGeometryEdit(samples, 0),
      appearance: { width: 0.12, height: 0.12 },
      restPosition: { x: 0.2, y: 0.4 },
    })
    const project = makeProject({
      actors: [actor],
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
    })
    const beforeSize = resolveProjectStageSize(project)
    expect(beforeSize).toEqual({ width: 1600, height: 1000 })
    const beforeSpan = pathCompSpan(samples, beforeSize)
    const beforeArt = actorDisplaySizePx(
      beforeSize.width,
      beforeSize.height,
      actor.appearance,
    )

    const result = resizeProjectStage(project, 3200, 2000, 'center')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.plan.after).toEqual({ width: 3200, height: 2000 })
    expect(result.plan.afterAspect).toBeCloseTo(1.6, 10)
    expect(result.plan.sizeScale).toBeCloseTo(0.5, 10)
    expect(result.project.stageWidth).toBe(3200)
    expect(result.project.stageHeight).toBe(2000)
    expect(result.project.stageAspect).toBeCloseTo(1.6, 10)

    const afterActor = result.project.actors[0]!
    const afterSpan = pathCompSpan(
      afterActor.geometryEdit!.samples,
      result.plan.after,
      result.plan.offsetX,
      result.plan.offsetY,
    )
    expect(afterSpan.width).toBeCloseTo(beforeSpan.width, 5)
    expect(afterSpan.height).toBeCloseTo(beforeSpan.height, 5)

    // cqmin fractions halved → composition px unchanged
    expect(afterActor.appearance.width).toBeCloseTo(0.06, 8)
    const afterArt = actorDisplaySizePx(
      result.plan.after.width,
      result.plan.after.height,
      afterActor.appearance,
    )
    expect(afterArt.width).toBeCloseTo(beforeArt.width, 5)
    expect(afterArt.height).toBeCloseTo(beforeArt.height, 5)

    // Original recording remapped identically (Restore stays correct)
    const recSpan = pathCompSpan(
      afterActor.recording!.samples,
      result.plan.after,
      result.plan.offsetX,
      result.plan.offsetY,
    )
    expect(recSpan.width).toBeCloseTo(beforeSpan.width, 5)
  })

  it('1600×1000 → 1600×2000: height grows; width and content composition size unchanged', () => {
    const samples = makeSamples(8)
    const actor = makeActor({
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      appearance: { width: 0.2, height: 0.2 },
    })
    const project = makeProject({
      actors: [actor],
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
    })
    const beforeSize = { width: 1600, height: 1000 }
    const beforeSpan = pathCompSpan(samples, beforeSize)
    const beforeArt = actorDisplaySizePx(1600, 1000, actor.appearance)

    const result = resizeProjectStage(project, 1600, 2000, 'top')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.project.stageWidth).toBe(1600)
    expect(result.project.stageHeight).toBe(2000)
    expect(result.plan.sizeScale).toBeCloseTo(1000 / 1600, 8)

    const afterActor = result.project.actors[0]!
    const afterSpan = pathCompSpan(
      afterActor.recording!.samples,
      result.plan.after,
      result.plan.offsetX,
      result.plan.offsetY,
    )
    expect(afterSpan.width).toBeCloseTo(beforeSpan.width, 5)
    expect(afterSpan.height).toBeCloseTo(beforeSpan.height, 5)

    const afterArt = actorDisplaySizePx(1600, 2000, afterActor.appearance)
    expect(afterArt.width).toBeCloseTo(beforeArt.width, 5)
    expect(afterArt.height).toBeCloseTo(beforeArt.height, 5)
  })

  it('save/reopen keeps requested dimensions, placement, and drawing space', () => {
    const cases: Array<{ w: number; h: number; anchor: 'center' | 'top' }> = [
      { w: 3200, h: 2000, anchor: 'center' },
      { w: 1600, h: 2000, anchor: 'top' },
    ]
    for (const c of cases) {
      const samples = makeSamples(6)
      const project = makeProject({
        actors: [
          makeActor({
            recording: {
              samples,
              recordedDurationMs: samples[samples.length - 1]!.t,
            },
            appearance: { width: 0.12, height: 0.12 },
          }),
        ],
        stageWidth: 1600,
        stageHeight: 1000,
        stageAspect: 1.6,
      })
      const resized = resizeProjectStage(project, c.w, c.h, c.anchor)
      expect(resized.ok).toBe(true)
      if (!resized.ok) continue

      const raw = serializeSnapshot(buildSnapshot(resized.project))
      const parsed = parseSnapshotJson(raw)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) continue
      expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
      expect(parsed.snapshot.project.stageWidth).toBe(c.w)
      expect(parsed.snapshot.project.stageHeight).toBe(c.h)

      const beforeComp = toCompositionPoint(
        resized.project.actors[0]!.recording!.samples[0]!,
        resized.plan.after,
        resized.plan.offsetX,
        resized.plan.offsetY,
      )
      const afterComp = toCompositionPoint(
        parsed.snapshot.project.actors[0]!.recording!.samples[0]!,
        {
          width: parsed.snapshot.project.stageWidth,
          height: parsed.snapshot.project.stageHeight,
        },
        resized.plan.offsetX,
        resized.plan.offsetY,
      )
      expect(afterComp.x).toBeCloseTo(beforeComp.x, 8)
      expect(afterComp.y).toBeCloseTo(beforeComp.y, 8)
      expect(resolveProjectStageSize(parsed.snapshot.project)).toEqual({
        width: c.w,
        height: c.h,
      })
    }
  })

  it('two successive resizes, undo/redo, then save/reopen', () => {
    useEditorStore.getState().newProject()
    const samples = makeSamples(5)
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a1',
          recording: {
            samples,
            recordedDurationMs: samples[samples.length - 1]!.t,
          },
        }),
      ],
      stageWidth: 1600,
      stageHeight: 1000,
      stageAspect: 1.6,
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a1',
      actorEditOrder: [],
      actorEditRedoOrder: [],
      stageResizeUndoStack: [],
      stageResizeRedoStack: [],
    })

    expect(
      useEditorStore.getState().resizeProjectStage(2400, 1000, 'left'),
    ).toBe(true)
    const mid = useEditorStore.getState().project
    expect(mid.stageWidth).toBe(2400)
    expect(mid.stageHeight).toBe(1000)

    expect(
      useEditorStore.getState().resizeProjectStage(2400, 1500, 'top'),
    ).toBe(true)
    const after = useEditorStore.getState().project
    expect(after.stageWidth).toBe(2400)
    expect(after.stageHeight).toBe(1500)
    expect(useEditorStore.getState().actorEditOrder).toEqual([
      'stageResize',
      'stageResize',
    ])

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.stageWidth).toBe(2400)
    expect(useEditorStore.getState().project.stageHeight).toBe(1000)

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.stageWidth).toBe(1600)
    expect(useEditorStore.getState().project.stageHeight).toBe(1000)

    useEditorStore.getState().redoActorEdit()
    useEditorStore.getState().redoActorEdit()
    const redone = useEditorStore.getState().project
    expect(redone.stageWidth).toBe(2400)
    expect(redone.stageHeight).toBe(1500)

    const parsed = parseSnapshotJson(serializeSnapshot(buildSnapshot(redone)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.stageWidth).toBe(2400)
    expect(parsed.snapshot.project.stageHeight).toBe(1500)
  })

  it('rejects resize that would clamp actor size', () => {
    const actor = makeActor({
      appearance: { width: MIN_ACTOR_SIZE, height: MIN_ACTOR_SIZE },
    })
    const project = makeProject({
      actors: [actor],
      stageWidth: 1600,
      stageHeight: 1000,
      stageAspect: 1.6,
    })
    // Doubling min side → sizeScale 0.5 → width below MIN
    const result = resizeProjectStage(project, 3200, 2000, 'center')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/outside the allowed artwork size range/i)
  })

  it('rejects shrink that would cut artwork extents, not only sample centers', () => {
    const actor = makeActor({
      restPosition: { x: 0.5, y: 0.5 },
      recording: {
        samples: [
          { t: 0, x: 0.5, y: 0.5 },
          { t: 100, x: 0.52, y: 0.5 },
        ],
        recordedDurationMs: 100,
      },
      appearance: { width: 0.4, height: 0.4 },
      transform: {
        keyframes: [{ id: 'k1', t: 0, rotationDeg: 45, scale: 4 }],
      },
    })
    // Sample centers easily fit 1400×1000; max-scale artwork disk does not.
    const planCentersOnly = planStageResize({
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [
        makeActor({
          restPosition: { x: 0.5, y: 0.5 },
          recording: {
            samples: [
              { t: 0, x: 0.5, y: 0.5 },
              { t: 100, x: 0.52, y: 0.5 },
            ],
            recordedDurationMs: 100,
          },
          appearance: { width: 0.06, height: 0.06 },
        }),
      ],
      width: 1400,
      height: 1000,
      anchor: 'center',
    })
    expect(planCentersOnly.ok).toBe(true)

    const plan = planStageResize({
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [actor],
      width: 1400,
      height: 1000,
      anchor: 'center',
    })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.error).toMatch(/artwork|motion/i)
  })

  it('rejects shrink that would clip wrapped/multiline text under max scale', () => {
    const long =
      'Word wrap lines for stage fit.\n'.repeat(8) +
      'Extra long unbrokenwordthatmustbreakacrossmanylinesinthewrapbox'
    const textActor = makeActor({
      restPosition: { x: 0.5, y: 0.5 },
      recording: {
        samples: [
          { t: 0, x: 0.5, y: 0.5 },
          { t: 80, x: 0.55, y: 0.5 },
        ],
        recordedDurationMs: 80,
      },
      appearance: {
        kind: 'text',
        width: 0.22,
        height: 0.22,
        text: {
          content: long,
          fontSize: 0.06,
          fontWeight: 700,
          align: 'left',
          fontFamily: 'system',
        },
      },
      transform: {
        keyframes: [{ id: 'k1', t: 0, rotationDeg: 30, scale: 2.5 }],
      },
    })
    const layout = estimateTextLayoutSizePx(1600, 1000, textActor.appearance)
    expect(layout).toBeTruthy()
    expect(layout!.height).toBeGreaterThan(
      actorDisplaySizePx(1600, 1000, textActor.appearance).height * 2,
    )
    expect(
      countConservativeTextLines(long, layout!.width, 0.06 * 1000),
    ).toBeGreaterThan(4)

    // Tiny shape at center still fits this shrink; multiline text must not.
    const shapeOk = planStageResize({
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [
        makeActor({
          restPosition: { x: 0.5, y: 0.5 },
          recording: {
            samples: [
              { t: 0, x: 0.5, y: 0.5 },
              { t: 80, x: 0.55, y: 0.5 },
            ],
            recordedDurationMs: 80,
          },
          appearance: { width: 0.08, height: 0.08 },
        }),
      ],
      width: 1200,
      height: 900,
      anchor: 'center',
    })
    expect(shapeOk.ok).toBe(true)

    const plan = planStageResize({
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      actors: [textActor],
      width: 1200,
      height: 900,
      anchor: 'center',
    })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.error).toMatch(/text|artwork|motion|unreliable/i)
  })

  it('migrates pre-v14 aspect-only projects to default composition height', () => {
    const legacy = {
      formatVersion: 13,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        name: 'Legacy',
        stageAspect: 1.6,
        playback: {
          durationMs: 1200,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [
          {
            id: 'a1',
            name: 'Actor 1',
            appearance: {
              kind: 'shape',
              width: 0.12,
              height: 0.12,
              borderRadius: 0.28,
              color: '#4f46e5',
              image: null,
              text: null,
            },
            recording: makeRecording(4),
            restPosition: { x: 0.5, y: 0.5 },
            smoothing: 0,
            steadySpeed: 0,
            glide: 0,
            transform: { keyframes: [] },
            geometryEdit: null,
            clip: {
              start: 0,
              end: 1,
              hideBeforeStart: false,
              hideAfterEnd: false,
            },
            faceAlongPath: false,
            directionOffsetDeg: 0,
          },
        ],
      },
    }
    const parsed = parseSnapshotJson(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.stageWidth).toBe(1600)
    expect(parsed.snapshot.project.stageHeight).toBe(1000)
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
  })
})

describe('v14 stage size import validation', () => {
  const baseActor = {
    id: 'a1',
    name: 'Actor 1',
    appearance: {
      kind: 'shape' as const,
      width: 0.12,
      height: 0.12,
      borderRadius: 0.28,
      color: '#4f46e5',
      image: null,
      text: null,
    },
    recording: makeRecording(3),
    restPosition: { x: 0.5, y: 0.5 },
    smoothing: 0,
    steadySpeed: 0,
    glide: 0,
    transform: { keyframes: [] as [] },
    geometryEdit: null,
    clip: {
      start: 0,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    },
    faceAlongPath: false,
    directionOffsetDeg: 0,
  }

  function wrap(project: Record<string, unknown>, formatVersion = 14) {
    return JSON.stringify({
      formatVersion,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        name: 'Validate',
        playback: {
          durationMs: 1200,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [baseActor],
        ...project,
      },
    })
  }

  it('rejects non-finite, non-positive, and aspect-mismatched dimensions on v14', () => {
    expect(
      parseSnapshotJson(
        wrap({ stageAspect: 1.6, stageWidth: NaN, stageHeight: 1000 }),
      ).ok,
    ).toBe(false)
    expect(
      parseSnapshotJson(
        wrap({ stageAspect: 1.6, stageWidth: -10, stageHeight: 1000 }),
      ).ok,
    ).toBe(false)
    expect(
      parseSnapshotJson(
        wrap({ stageAspect: 1.6, stageWidth: 0, stageHeight: 1000 }),
      ).ok,
    ).toBe(false)
    expect(
      parseSnapshotJson(
        wrap({ stageAspect: 1.6, stageWidth: '1600', stageHeight: 1000 }),
      ).ok,
    ).toBe(false)
    expect(
      parseSnapshotJson(
        wrap({ stageAspect: 1.6 }), // missing sizes on v14
      ).ok,
    ).toBe(false)
    const mismatch = parseSnapshotJson(
      wrap({ stageAspect: 2, stageWidth: 1600, stageHeight: 1000 }),
    )
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) {
      expect(mismatch.error).toMatch(/does not match/i)
    }
  })

  it('pre-v14 with disagreeing aspect prefers dimensions deterministically', () => {
    const parsed = parseSnapshotJson(
      wrap(
        { stageAspect: 2, stageWidth: 1600, stageHeight: 1000 },
        13,
      ),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.stageWidth).toBe(1600)
    expect(parsed.snapshot.project.stageHeight).toBe(1000)
    expect(parsed.snapshot.project.stageAspect).toBeCloseTo(1.6, 8)
  })
})

describe('store stage resize', () => {
  beforeEach(() => {
    useEditorStore.getState().newProject()
  })

  it('persists dimensions through store resize', () => {
    const project = makeProject({
      actors: [makeActor({ id: 'a1' })],
      stageWidth: 1600,
      stageHeight: 1000,
      stageAspect: 1.6,
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a1',
      stageResizeUndoStack: [],
      stageResizeRedoStack: [],
      actorEditOrder: [],
    })
    expect(
      useEditorStore.getState().resizeProjectStage(3200, 2000, 'center'),
    ).toBe(true)
    const p = useEditorStore.getState().project
    expect(p.stageWidth).toBe(3200)
    expect(p.stageHeight).toBe(2000)
  })

  it('undo order stays correct with Continue path and another actor’s placement', () => {
    const a1 = makeActor({
      id: 'a1',
      name: 'Path',
      recording: makeRecording(6),
    })
    const a2 = makeActor({
      id: 'a2',
      name: 'Idle',
      recording: null,
      restPosition: { x: 0.3, y: 0.3 },
    })
    useEditorStore.setState({
      project: makeProject({
        actors: [a1, a2],
        stageWidth: 1600,
        stageHeight: 1000,
        stageAspect: 1.6,
      }),
      selectedActorId: 'a1',
      actorEditOrder: [],
      actorEditRedoOrder: [],
      stageResizeUndoStack: [],
      stageResizeRedoStack: [],
      continuePathUndoStack: [],
      continuePathRedoStack: [],
      placementUndoStack: [],
      placementRedoStack: [],
    })

    expect(
      useEditorStore.getState().resizeProjectStage(2400, 1000, 'left'),
    ).toBe(true)
    expect(useEditorStore.getState().project.stageWidth).toBe(2400)

    expect(useEditorStore.getState().armContinuePath()).toBe(true)
    const end = useEditorStore.getState().livePosition
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 100, x: Math.min(0.99, end.x + 0.12), y: end.y },
      ],
      recordedDurationMs: 100,
    })
    expect(useEditorStore.getState().actorEditOrder.at(-1)).toBe('continuePath')

    useEditorStore.getState().selectActor('a2')
    const restAfterResize = {
      ...useEditorStore.getState().project.actors[1]!.restPosition,
    }
    // Left-anchored widen remaps 0.3 → 0.2 in normalized x.
    expect(restAfterResize.x).toBeCloseTo(0.2, 5)

    useEditorStore.getState().commitActorPlacement({ x: 0.7, y: 0.7 })
    expect(useEditorStore.getState().actorEditOrder.at(-1)).toBe('placement')
    // Global resize + continue survive the actor switch.
    expect(useEditorStore.getState().actorEditOrder).toEqual([
      'stageResize',
      'continuePath',
      'placement',
    ])

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[1]!.restPosition).toEqual(
      restAfterResize,
    )
    expect(useEditorStore.getState().project.stageWidth).toBe(2400)

    useEditorStore.getState().selectActor('a1')
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.geometryEdit).toBeNull()
    expect(useEditorStore.getState().project.stageWidth).toBe(2400)

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.stageWidth).toBe(1600)
    expect(useEditorStore.getState().project.stageHeight).toBe(1000)
    expect(useEditorStore.getState().project.actors[1]!.restPosition).toEqual({
      x: 0.3,
      y: 0.3,
    })
  })
})
