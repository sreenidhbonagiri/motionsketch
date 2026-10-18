import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

function seed() {
  const project = makeProject({
    actors: [
      makeActor({
        id: 'a',
        recording: makeRecording(10),
        clip: { start: 0, end: 1 },
        transform: {
          keyframes: [{ id: 'seed', t: 0, rotationDeg: 0, scale: 1 }],
        },
      }),
      makeActor({
        id: 'b',
        recording: makeRecording(8),
        clip: { start: 0, end: 1 },
      }),
    ],
  })
  useEditorStore.setState({
    project,
    selectedActorId: 'a',
    mode: 'idle',
    playbackHead: 0.5,
    transformUndoStack: [],
    transformRedoStack: [],
    clipUndoStack: [],
    clipRedoStack: [],
    actorEditOrder: [],
    actorEditRedoOrder: [],
  })
}

describe('unified clip/transform undo', () => {
  beforeEach(seed)

  it('undoes interleaved transform → clip → transform in chronological order', () => {
    const store = useEditorStore.getState()
    store.upsertTransformAtPlayhead(45, 1.2)
    store.commitActorClip('a', { start: 0.2, end: 0.8 })
    useEditorStore.setState({ playbackHead: 0.9 })
    useEditorStore.getState().upsertTransformAtPlayhead(90, 2)

    expect(useEditorStore.getState().actorEditOrder).toEqual([
      'transform',
      'clip',
      'transform',
    ])

    // Most recent = second transform
    useEditorStore.getState().undoActorEdit()
    const afterFirstUndo = useEditorStore.getState()
    expect(
      afterFirstUndo.project.actors[0].transform.keyframes.some(
        (k) => k.rotationDeg === 90,
      ),
    ).toBe(false)
    expect(afterFirstUndo.project.actors[0].clip).toEqual({
      start: 0.2,
      end: 0.8,
      hideBeforeStart: false,
      hideAfterEnd: false,
    })

    // Next = clip
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0].clip).toEqual({
      start: 0,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    })

    // Next = first transform
    useEditorStore.getState().undoActorEdit()
    expect(
      useEditorStore
        .getState()
        .project.actors[0].transform.keyframes.some((k) => k.rotationDeg === 45),
    ).toBe(false)

    // Redo restores in reverse
    useEditorStore.getState().redoActorEdit()
    expect(
      useEditorStore
        .getState()
        .project.actors[0].transform.keyframes.some((k) => k.rotationDeg === 45),
    ).toBe(true)
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0].clip.start).toBeCloseTo(
      0.2,
      5,
    )
  })

  it('clears redo when a new edit follows undo', () => {
    useEditorStore.getState().commitActorClip('a', { start: 0.1, end: 0.9 })
    useEditorStore.getState().upsertTransformAtPlayhead(30, 1)
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().actorEditRedoOrder.length).toBeGreaterThan(
      0,
    )
    useEditorStore.getState().commitActorClip('a', { start: 0.3, end: 0.7 })
    expect(useEditorStore.getState().actorEditRedoOrder).toEqual([])
    expect(useEditorStore.getState().transformRedoStack).toEqual([])
    expect(useEditorStore.getState().clipRedoStack).toEqual([])
  })

  it('clears actor-edit history when switching actors', () => {
    useEditorStore.getState().commitActorClip('a', { start: 0.2, end: 1 })
    useEditorStore.getState().upsertTransformAtPlayhead(15, 1.1)
    expect(useEditorStore.getState().actorEditOrder.length).toBe(2)
    useEditorStore.getState().selectActor('b')
    expect(useEditorStore.getState().actorEditOrder).toEqual([])
    expect(useEditorStore.getState().transformUndoStack).toEqual([])
    expect(useEditorStore.getState().clipUndoStack).toEqual([])
  })
})
