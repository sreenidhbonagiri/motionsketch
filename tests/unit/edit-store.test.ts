import { beforeEach, describe, expect, it } from 'vitest'
import { applyHandleDelta } from '../../src/core/edit'
import type { MotionSample, Recording } from '../../src/core/types'
import { selectProcessedPath } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'

function makeRecording(): Recording {
  const samples: MotionSample[] = Array.from({ length: 30 }, (_, i) => ({
    t: i * 40,
    x: 0.2 + i * 0.02,
    y: 0.4,
  }))
  return {
    samples,
    recordedDurationMs: samples[samples.length - 1].t,
  }
}

describe('edit store', () => {
  beforeEach(() => {
    useEditorStore.setState({
      project: {
        version: 1,
        actor: {
          width: 0.12,
          height: 0.12,
          borderRadius: 0.28,
          color: '#4f46e5',
        },
        recording: makeRecording(),
        playback: {
          durationMs: 1200,
          smoothing: 0.35,
          steadySpeed: 0,
          loop: false,
        },
      },
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      livePosition: { x: 0.2, y: 0.4 },
      liveTrail: [],
      showPathComparison: false,
      geometryEdit: null,
      editSession: null,
      undoStack: [],
      redoStack: [],
      selectedHandleIndex: null,
      editPreview: null,
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
    expect(state.project.playback.steadySpeed).toBe(0.5)
    // Still editing with a fresh bake from the recording.
    expect(state.mode).toBe('editing')
    expect(state.editSession).not.toBeNull()
  })

  it('blocks recording while editing and keeps original samples intact', () => {
    const original = useEditorStore.getState().project.recording!.samples[5]
    useEditorStore.getState().enterEditMode()
    useEditorStore.getState().armRecording()
    expect(useEditorStore.getState().mode).toBe('editing')

    const session = useEditorStore.getState().editSession!
    useEditorStore.getState().commitHandleEdit(
      applyHandleDelta(session.samples, 5, { x: 0.15, y: 0.1 }),
    )
    const raw = useEditorStore.getState().project.recording!.samples[5]
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
})
