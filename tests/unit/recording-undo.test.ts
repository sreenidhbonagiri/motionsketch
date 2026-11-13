import { beforeEach, describe, expect, it } from 'vitest'
import { copyGeometryEdit, makeGeometryEdit } from '../../src/core/edit'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

function seedUnrecorded() {
  const project = makeProject({
    actors: [
      makeActor({
        id: 'a',
        recording: null,
        restPosition: { x: 0.3, y: 0.4 },
      }),
    ],
  })
  useEditorStore.setState({
    project,
    selectedActorId: 'a',
    mode: 'idle',
    livePosition: { x: 0.3, y: 0.4 },
    recordingUndoStack: [],
    recordingRedoStack: [],
    pendingRecordingBaseline: null,
    actorEditOrder: [],
    actorEditRedoOrder: [],
  })
}

describe('recording undo', () => {
  beforeEach(seedUnrecorded)

  it('makes a first recording undoable and redoable', () => {
    const first = makeRecording(12)
    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(1, { x: 0.3, y: 0.4 })
    useEditorStore.getState().finishRecording(first)

    expect(useEditorStore.getState().actorEditOrder).toEqual(['recording'])
    expect(useEditorStore.getState().project.actors[0].recording?.samples).toHaveLength(
      12,
    )

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0].recording).toBeNull()
    expect(useEditorStore.getState().actorEditOrder).toEqual([])
    expect(useEditorStore.getState().actorEditRedoOrder).toEqual(['recording'])

    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0].recording?.samples).toHaveLength(
      12,
    )
    expect(useEditorStore.getState().actorEditOrder).toEqual(['recording'])
  })

  it('restores the prior take and geometry when undoing a replacement; redo restores the new take', () => {
    const takeA = makeRecording(10)
    const takeB = makeRecording(16)
    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(1, { x: 0.3, y: 0.4 })
    useEditorStore.getState().finishRecording(takeA)

    const ge = makeGeometryEdit(takeA.samples, 0.25)
    useEditorStore.setState({
      project: {
        ...useEditorStore.getState().project,
        actors: [
          {
            ...useEditorStore.getState().project.actors[0],
            geometryEdit: copyGeometryEdit(ge),
            smoothing: 0.4,
            steadySpeed: 0.55,
            glide: 0.2,
          },
        ],
      },
      geometryEdit: copyGeometryEdit(ge),
    })

    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(2, { x: 0.35, y: 0.45 })
    expect(useEditorStore.getState().pendingRecordingBaseline?.recording?.samples).toHaveLength(
      10,
    )
    expect(
      useEditorStore.getState().pendingRecordingBaseline?.geometryEdit,
    ).not.toBeNull()
    useEditorStore.getState().finishRecording(takeB)

    expect(useEditorStore.getState().project.actors[0].recording?.samples).toHaveLength(
      16,
    )
    expect(useEditorStore.getState().project.actors[0].geometryEdit).toBeNull()
    expect(useEditorStore.getState().actorEditOrder.at(-1)).toBe('recording')

    useEditorStore.getState().undoActorEdit()
    const restored = useEditorStore.getState().project.actors[0]
    expect(restored.recording?.samples).toHaveLength(10)
    expect(restored.geometryEdit).not.toBeNull()
    expect(restored.smoothing).toBeCloseTo(0.4, 5)
    expect(restored.steadySpeed).toBeCloseTo(0.55, 5)
    expect(restored.glide).toBeCloseTo(0.2, 5)
    expect(useEditorStore.getState().geometryEdit).not.toBeNull()

    useEditorStore.getState().redoActorEdit()
    const redone = useEditorStore.getState().project.actors[0]
    expect(redone.recording?.samples).toHaveLength(16)
    expect(redone.geometryEdit).toBeNull()
  })

  it('restores prior motion on a discarded short take without a history entry', () => {
    const takeA = makeRecording(10)
    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(1, { x: 0.3, y: 0.4 })
    useEditorStore.getState().finishRecording(takeA)
    const orderBefore = [...useEditorStore.getState().actorEditOrder]

    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(2, { x: 0.3, y: 0.4 })
    useEditorStore.getState().finishRecording(null)

    expect(useEditorStore.getState().project.actors[0].recording?.samples).toHaveLength(
      10,
    )
    expect(useEditorStore.getState().actorEditOrder).toEqual(orderBefore)
    expect(useEditorStore.getState().pendingRecordingBaseline).toBeNull()
  })

  it('clears Smoothing lock when undoing the only path edit from a clean take', () => {
    const take = makeRecording(12)
    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(1, { x: 0.3, y: 0.4 })
    useEditorStore.getState().finishRecording(take)

    useEditorStore.getState().enterEditMode()
    expect(useEditorStore.getState().pathEditStartedClean).toBe(true)
    const session = useEditorStore.getState().editSession!
    const moved = session.samples.map((s, i) =>
      i === 0 ? s : { ...s, x: Math.min(0.99, s.x + 0.05) },
    )
    useEditorStore.getState().beginHandleDrag()
    useEditorStore.getState().commitHandleEdit(moved)

    expect(useEditorStore.getState().geometryEdit).not.toBeNull()
    expect(useEditorStore.getState().project.actors[0].geometryEdit).not.toBeNull()

    useEditorStore.getState().undoEdit()
    expect(useEditorStore.getState().undoStack).toHaveLength(0)
    expect(useEditorStore.getState().geometryEdit).toBeNull()
    expect(useEditorStore.getState().project.actors[0].geometryEdit).toBeNull()
  })

  it('keeps pre-existing edited geometry after undoing a later path edit', () => {
    const take = makeRecording(12)
    useEditorStore.getState().armRecording()
    useEditorStore.getState().beginRecording(1, { x: 0.3, y: 0.4 })
    useEditorStore.getState().finishRecording(take)

    const prior = makeGeometryEdit(take.samples, 0.3)
    useEditorStore.setState({
      project: {
        ...useEditorStore.getState().project,
        actors: [
          {
            ...useEditorStore.getState().project.actors[0],
            geometryEdit: copyGeometryEdit(prior),
          },
        ],
      },
      geometryEdit: copyGeometryEdit(prior),
    })

    useEditorStore.getState().enterEditMode()
    expect(useEditorStore.getState().pathEditStartedClean).toBe(false)
    const session = useEditorStore.getState().editSession!
    const moved = session.samples.map((s, i) =>
      i === 0 ? s : { ...s, y: Math.min(0.99, s.y + 0.04) },
    )
    useEditorStore.getState().beginHandleDrag()
    useEditorStore.getState().commitHandleEdit(moved)
    useEditorStore.getState().undoEdit()

    expect(useEditorStore.getState().undoStack).toHaveLength(0)
    expect(useEditorStore.getState().geometryEdit).not.toBeNull()
    expect(useEditorStore.getState().project.actors[0].geometryEdit).not.toBeNull()
    expect(
      useEditorStore.getState().geometryEdit!.bakedSmoothing,
    ).toBeCloseTo(0.3, 5)
  })
})
