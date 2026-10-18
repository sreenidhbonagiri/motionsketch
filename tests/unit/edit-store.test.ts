import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyHandleDelta,
  applyPathTranslation,
  makeGeometryEdit,
  selectHandleIndices,
} from '../../src/core/edit'
import { buildPathMoveFixtureSamples } from '../fixtures/pathMoveProject'
import { findActor } from '../../src/core/sceneActor'
import { selectProcessedPath } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'
import type { MotionSample } from '../../src/core/types'

function noisyBendSamples(n = 41): MotionSample[] {
  const mid = Math.floor(n / 2)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 25
    if (i <= mid) {
      const u = i / mid
      const jag = i > 2 && i < mid - 1 ? ((i % 2) * 2 - 1) * 0.035 : 0
      return { t, x: 0.15 + 0.35 * u, y: 0.2 + 0.3 * u + jag }
    }
    const u = (i - mid) / (n - 1 - mid)
    const jag = i > mid + 1 && i < n - 2 ? ((i % 2) * 2 - 1) * 0.035 : 0
    return { t, x: 0.5 + 0.35 * u + jag, y: 0.5 - 0.25 * u }
  })
}

function selectedActor() {
  const state = useEditorStore.getState()
  return findActor(state.project.actors, state.selectedActorId)!
}

describe('edit store', () => {
  beforeEach(() => {
    const project = makeProject({
      actors: [makeActor({ recording: makeRecording(30) })],
    })
    const first = project.actors[0]
    useEditorStore.setState({
      project,
      selectedActorId: first.id,
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      playbackDirection: 1,
      playbackEpoch: 0,
      livePosition: { x: 0.2, y: 0.4 },
      liveTrail: [],
      showPathComparison: false,
      geometryEdit: null,
      selectedTransformId: null,
      transformUndoStack: [],
      transformRedoStack: [],
      editSession: null,
      undoStack: [],
      redoStack: [],
      selectedHandleIndex: null,
      editPreview: null,
      pathAddMode: false,
      pathAddCandidateIndex: null,
      pathTool: 'edit-points',
      pathGestureActive: false,
      stageHint: 'default',
      actionAnnouncement: null,
    })
  })

  it('enters edit mode with a baked session and pauses play', () => {
    useEditorStore.setState({ mode: 'playing' })
    useEditorStore.getState().enterEditMode()
    const state = useEditorStore.getState()
    expect(state.mode).toBe('editing')
    expect(state.editSession?.samples.length).toBeGreaterThan(2)
    expect(state.geometryEdit).toBeNull()
  })

  it('commits one undo step per handle edit and supports redo', () => {
    const store = useEditorStore.getState()
    store.enterEditMode()
    const session = useEditorStore.getState().editSession!
    const mid = Math.floor(session.samples.length / 2)
    const edited = applyHandleDelta(session.samples, mid, { x: 0, y: -0.1 })
    useEditorStore.getState().commitHandleEdit(edited)

    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    expect(useEditorStore.getState().geometryEdit).not.toBeNull()

    const afterEditY =
      useEditorStore.getState().geometryEdit!.samples[mid].y
    useEditorStore.getState().undoEdit()
    expect(
      useEditorStore.getState().geometryEdit!.samples[mid].y,
    ).toBeCloseTo(session.samples[mid].y, 5)
    useEditorStore.getState().redoEdit()
    expect(
      useEditorStore.getState().geometryEdit!.samples[mid].y,
    ).toBeCloseTo(afterEditY, 5)
  })

  it('canceling a drag preview restores prior geometry', () => {
    const store = useEditorStore.getState()
    store.enterEditMode()
    const before = useEditorStore.getState().editSession!.samples
    store.beginHandleDrag()
    store.updateEditPreview(
      applyHandleDelta(before, 10, { x: 0.2, y: 0.2 }),
    )
    expect(useEditorStore.getState().editPreview).not.toBeNull()
    store.cancelHandleDrag()
    expect(useEditorStore.getState().editPreview).toBeNull()
    expect(useEditorStore.getState().geometryEdit).toBeNull()
    expect(useEditorStore.getState().editSession!.samples[10].x).toBeCloseTo(
      before[10].x,
      5,
    )
  })

  it('restore clears committed edits and keeps timing controls', () => {
    const store = useEditorStore.getState()
    store.setDurationMs(2400)
    store.setSteadySpeed(0.5)
    store.enterEditMode()
    const session = useEditorStore.getState().editSession!
    store.commitHandleEdit(
      applyHandleDelta(session.samples, 8, { x: 0.1, y: 0 }),
    )
    expect(useEditorStore.getState().geometryEdit).not.toBeNull()

    store.restoreRecordedPath()
    const state = useEditorStore.getState()
    expect(state.geometryEdit).toBeNull()
    expect(state.undoStack).toHaveLength(0)
    expect(state.project.playback.durationMs).toBe(2400)
    expect(selectedActor().steadySpeed).toBe(0.5)
    // Still editing with a fresh bake from the recording.
    expect(state.mode).toBe('editing')
    expect(state.editSession).not.toBeNull()
  })

  it('blocks recording while editing and keeps original samples intact', () => {
    const original = selectedActor().recording!.samples[5]
    useEditorStore.getState().enterEditMode()
    useEditorStore.getState().armRecording()
    expect(useEditorStore.getState().mode).toBe('editing')

    const session = useEditorStore.getState().editSession!
    useEditorStore.getState().commitHandleEdit(
      applyHandleDelta(session.samples, 5, { x: 0.15, y: 0.1 }),
    )
    const raw = selectedActor().recording!.samples[5]
    expect(raw.x).toBeCloseTo(original.x, 5)
    expect(raw.y).toBeCloseTo(original.y, 5)
  })

  it('uses edited geometry for processed path selection', () => {
    useEditorStore.getState().enterEditMode()
    const session = useEditorStore.getState().editSession!
    const mid = Math.floor(session.samples.length / 2)
    const edited = applyHandleDelta(session.samples, mid, { x: 0, y: 0.12 })
    useEditorStore.getState().commitHandleEdit(edited)
    useEditorStore.getState().exitEditMode()

    const state = useEditorStore.getState()
    const path = selectProcessedPath(state.project, {
      geometryEdit: state.geometryEdit,
      editSession: state.editSession,
      editPreview: state.editPreview,
    })
    expect(path[mid].y).toBeCloseTo(edited[mid].y, 5)
  })

  it('add/remove handle is undoable and add alone does not move samples', () => {
    useEditorStore.getState().enterEditMode()
    const session = useEditorStore.getState().editSession!
    const before = session.samples.map((s) => ({ ...s }))
    const addAt = Math.floor(session.samples.length / 3)
    expect(session.handleIndices.includes(addAt)).toBe(false)

    expect(useEditorStore.getState().addPathHandleAt(addAt)).toBe(true)
    const afterAdd = useEditorStore.getState().editSession!
    expect(afterAdd.handleIndices).toContain(addAt)
    expect(afterAdd.samples).toEqual(before)
    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    expect(useEditorStore.getState().actionAnnouncement).toMatch(
      /Handle added — point \d+ of \d+/,
    )

    useEditorStore.getState().setSelectedHandleIndex(addAt)
    expect(useEditorStore.getState().actionAnnouncement).toMatch(
      /Point \d+ of \d+/,
    )
    expect(useEditorStore.getState().removeSelectedPathHandle()).toBe(true)
    expect(useEditorStore.getState().editSession!.handleIndices).not.toContain(
      addAt,
    )
    expect(useEditorStore.getState().editSession!.samples).toEqual(before)

    useEditorStore.getState().undoEdit()
    expect(useEditorStore.getState().editSession!.handleIndices).toContain(addAt)
    useEditorStore.getState().undoEdit()
    expect(
      useEditorStore.getState().editSession!.handleIndices.includes(addAt),
    ).toBe(false)
  })

  it('announces selection and endpoint protection via setSelectedHandleIndex', () => {
    useEditorStore.getState().enterEditMode()
    const session = useEditorStore.getState().editSession!
    expect(useEditorStore.getState().actionAnnouncement).toMatch(
      /Point 1 of \d+/,
    )
    const interior = session.handleIndices.find((i) => i !== 0 && i !== session.samples.length - 1)!
    useEditorStore.getState().setSelectedHandleIndex(interior)
    expect(useEditorStore.getState().actionAnnouncement).toMatch(
      /^Point \d+ of \d+\.$/,
    )
    useEditorStore.getState().setSelectedHandleIndex(0)
    expect(useEditorStore.getState().actionAnnouncement).toContain('endpoint')
    expect(useEditorStore.getState().removeSelectedPathHandle()).toBe(false)
    expect(useEditorStore.getState().actionAnnouncement).toMatch(
      /can’t be removed/i,
    )
  })

  it('smooth bend commits one undo entry; no-op does not grow history', () => {
    useEditorStore.getState().enterEditMode()
    const samples = noisyBendSamples()
    const handles = selectHandleIndices(samples.length, 9)
    const mid = handles[Math.floor(handles.length / 2)]!
    const ge = makeGeometryEdit(samples, 0.3, handles)
    useEditorStore.setState({
      editSession: ge,
      geometryEdit: ge,
      selectedHandleIndex: mid,
      undoStack: [],
      redoStack: [],
      project: {
        ...useEditorStore.getState().project,
        actors: useEditorStore.getState().project.actors.map((a, i) =>
          i === 0 ? { ...a, geometryEdit: ge } : a,
        ),
      },
    })

    const apex = {
      x: useEditorStore.getState().editSession!.samples[mid]!.x,
      y: useEditorStore.getState().editSession!.samples[mid]!.y,
    }
    expect(useEditorStore.getState().smoothSelectedBend()).toBe(true)
    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    expect(useEditorStore.getState().editSession!.samples[mid]!.x).toBeCloseTo(
      apex.x,
      6,
    )
    expect(useEditorStore.getState().actionAnnouncement).toMatch(/Smoothed/)

    // Second smooth may still change or become no-op; force no-op via endpoint.
    useEditorStore.getState().setSelectedHandleIndex(0)
    const stackLen = useEditorStore.getState().undoStack.length
    expect(useEditorStore.getState().smoothSelectedBend()).toBe(false)
    expect(useEditorStore.getState().undoStack).toHaveLength(stackLen)

    useEditorStore.getState().setSelectedHandleIndex(mid)
    useEditorStore.getState().undoEdit()
    expect(useEditorStore.getState().editSession!.samples).toEqual(samples)
  })

  it('make corner rejects straight geometry without undo noise', () => {
    useEditorStore.getState().enterEditMode()
    const straight: MotionSample[] = Array.from({ length: 41 }, (_, i) => ({
      t: i * 25,
      x: 0.1 + (0.8 * i) / 40,
      y: 0.5,
    }))
    const handles = selectHandleIndices(straight.length, 9)
    const mid = handles[Math.floor(handles.length / 2)]!
    const ge = makeGeometryEdit(straight, 0.3, handles)
    useEditorStore.setState({
      editSession: ge,
      geometryEdit: ge,
      selectedHandleIndex: mid,
      undoStack: [],
      redoStack: [],
    })
    expect(useEditorStore.getState().makeSelectedCorner()).toBe(false)
    expect(useEditorStore.getState().undoStack).toHaveLength(0)
    expect(useEditorStore.getState().actionAnnouncement).toMatch(/straight/i)
  })

  it('path translation commits one undo and leaves the recording intact', () => {
    const samples = buildPathMoveFixtureSamples()
    const ge = makeGeometryEdit(samples, 0.25, [0, 8, 16, 24, 32])
    const recording = selectedActor().recording!
    useEditorStore.setState({
      project: {
        ...useEditorStore.getState().project,
        actors: [
          {
            ...selectedActor(),
            recording: {
              samples: samples.map((s) => ({ ...s })),
              recordedDurationMs: recording.recordedDurationMs,
            },
            geometryEdit: ge,
            transform: {
              keyframes: [
                { id: 'xf', t: 0.4, rotationDeg: 15, scale: 1.1 },
              ],
            },
            clip: {
              start: 0.1,
              end: 0.9,
              hideBeforeStart: true,
              hideAfterEnd: false,
            },
          },
        ],
      },
      geometryEdit: ge,
    })
    useEditorStore.getState().enterEditMode()
    useEditorStore.getState().setPathTool('move-path')
    expect(useEditorStore.getState().pathTool).toBe('move-path')
    expect(useEditorStore.getState().pathAddMode).toBe(false)

    const baseline = useEditorStore.getState().editSession!.samples
    const moved = applyPathTranslation(baseline, { x: 0.06, y: -0.04 })
    useEditorStore.getState().beginHandleDrag()
    useEditorStore.getState().updateEditPreview(moved)
    useEditorStore.getState().commitHandleEdit(moved)

    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    const committed = useEditorStore.getState().geometryEdit!.samples
    for (let i = 0; i < baseline.length; i++) {
      expect(committed[i]!.x - baseline[i]!.x).toBeCloseTo(0.06, 8)
      expect(committed[i]!.y - baseline[i]!.y).toBeCloseTo(-0.04, 8)
      expect(committed[i]!.t).toBe(baseline[i]!.t)
    }
    // Recording + transform + clip untouched.
    const actor = selectedActor()
    expect(actor.recording!.samples[0]!.x).toBeCloseTo(samples[0]!.x, 8)
    expect(actor.transform.keyframes[0]!.rotationDeg).toBe(15)
    expect(actor.clip.start).toBe(0.1)
    expect(actor.clip.hideBeforeStart).toBe(true)

    useEditorStore.getState().commitHandleEdit(moved)
    expect(useEditorStore.getState().undoStack).toHaveLength(1)

    useEditorStore.getState().beginHandleDrag()
    useEditorStore.getState().updateEditPreview(
      applyPathTranslation(committed, { x: 0.2, y: 0 }),
    )
    useEditorStore.getState().cancelHandleDrag()
    expect(useEditorStore.getState().editPreview).toBeNull()
    expect(useEditorStore.getState().geometryEdit!.samples[0]!.x).toBeCloseTo(
      committed[0]!.x,
      8,
    )

    // Undo restores the pre-move geometry; redo reapplies the same shared delta.
    useEditorStore.getState().undoEdit()
    expect(
      useEditorStore.getState().geometryEdit!.samples[0]!.x,
    ).toBeCloseTo(baseline[0]!.x, 8)
    useEditorStore.getState().redoEdit()
    expect(
      useEditorStore.getState().geometryEdit!.samples[0]!.x,
    ).toBeCloseTo(committed[0]!.x, 8)

    // Edge clamp: pushing past the stage still keeps every sample in [0,1].
    const edgePush = applyPathTranslation(
      useEditorStore.getState().editSession!.samples,
      { x: 5, y: 5 },
    )
    useEditorStore.getState().commitHandleEdit(edgePush)
    for (const s of useEditorStore.getState().geometryEdit!.samples) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(1)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(1)
    }
  })

  it('rejects path commits after leaving edit mode (late keyup / Done)', () => {
    useEditorStore.getState().enterEditMode()
    const session = useEditorStore.getState().editSession!
    const baseline = session.samples.map((s) => ({ ...s }))
    const moved = applyPathTranslation(session.samples, { x: 0.05, y: 0 })
    useEditorStore.getState().beginHandleDrag()
    useEditorStore.getState().updateEditPreview(moved)
    expect(useEditorStore.getState().editPreview).not.toBeNull()

    useEditorStore.getState().exitEditMode()
    expect(useEditorStore.getState().mode).toBe('idle')
    expect(useEditorStore.getState().editSession).toBeNull()

    // Late commit must not mutate geometryEdit via a leftover preview.
    useEditorStore.getState().commitHandleEdit(moved)
    expect(useEditorStore.getState().editPreview).toBeNull()
    expect(useEditorStore.getState().geometryEdit).toBeNull()
    expect(useEditorStore.getState().undoStack).toHaveLength(0)

    useEditorStore.getState().beginHandleDrag()
    useEditorStore.getState().updateEditPreview(moved)
    expect(useEditorStore.getState().editPreview).toBeNull()

    // Re-enter: geometry still matches the pre-Done recording bake.
    useEditorStore.getState().enterEditMode()
    const again = useEditorStore.getState().editSession!.samples
    expect(again[0]!.x).toBeCloseTo(baseline[0]!.x, 8)
  })

  it('enterEditMode from playing stops playback mode', () => {
    useEditorStore.getState().play()
    expect(useEditorStore.getState().mode).toBe('playing')
    useEditorStore.getState().enterEditMode()
    expect(useEditorStore.getState().mode).toBe('editing')
    useEditorStore.getState().play()
    expect(useEditorStore.getState().mode).toBe('editing')
  })

  it('setPathTool clears preview and add-point mode', () => {
    useEditorStore.getState().enterEditMode()
    useEditorStore.getState().setPathAddMode(true)
    expect(useEditorStore.getState().pathAddMode).toBe(true)
    const session = useEditorStore.getState().editSession!
    useEditorStore.getState().updateEditPreview(
      applyPathTranslation(session.samples, { x: 0.02, y: 0 }),
    )
    useEditorStore.getState().setPathTool('move-path')
    expect(useEditorStore.getState().pathTool).toBe('move-path')
    expect(useEditorStore.getState().pathAddMode).toBe(false)
    expect(useEditorStore.getState().editPreview).toBeNull()
  })
})
