import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  bindPointerCaptureTarget,
  cancelIdleDrag,
  commitIdleDragBaseline,
  endDrag,
  getActivePointerId,
  resetController,
  restoreIdleDragBaseline,
  startIdleDrag,
} from '../../src/lib/recordingController'
import { selectActorPositionForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

describe('idle drag for unrecorded actors', () => {
  beforeEach(() => {
    resetController()
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          name: 'Loose',
          recording: null,
          restPosition: { x: 0.3, y: 0.4 },
        }),
        makeActor({
          id: 'b',
          name: 'Recorded',
          recording: makeRecording(6),
          restPosition: { x: 0.7, y: 0.7 },
        }),
      ],
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a',
      mode: 'idle',
      livePosition: { x: 0.3, y: 0.4 },
      placementUndoStack: [],
      placementRedoStack: [],
      actorEditOrder: [],
      actorEditRedoOrder: [],
    })
  })

  it('shows live position while dragging before commit', () => {
    const state = useEditorStore.getState()
    const actor = state.project.actors[0]
    startIdleDrag(1, { x: 0.55, y: 0.6 })
    useEditorStore.getState().setLivePosition({ x: 0.55, y: 0.6 })

    const mid = selectActorPositionForActor(
      useEditorStore.getState().project,
      actor,
      0,
      useEditorStore.getState().livePosition,
      'idle',
      undefined,
      true,
    )
    expect(mid.x).toBeCloseTo(0.55, 5)
    expect(mid.y).toBeCloseTo(0.6, 5)
    // Rest is unchanged until commit.
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.3,
      y: 0.4,
    })
  })

  it('commits rest on completion and restores on cancel', () => {
    startIdleDrag(1, { x: 0.4, y: 0.5 })
    useEditorStore.getState().setLivePosition({ x: 0.62, y: 0.18 })
    useEditorStore.getState().commitActorPlacement({ x: 0.62, y: 0.18 })
    commitIdleDragBaseline()
    endDrag(false)
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.62,
      y: 0.18,
    })
    expect(useEditorStore.getState().actorEditOrder).toEqual(['placement'])

    // New drag then cancel restores the committed rest without a new entry.
    startIdleDrag(2, { x: 0.62, y: 0.18 })
    useEditorStore.getState().setLivePosition({ x: 0.1, y: 0.1 })
    restoreIdleDragBaseline()
    endDrag(false)
    expect(useEditorStore.getState().livePosition).toEqual({ x: 0.62, y: 0.18 })
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.62,
      y: 0.18,
    })
    expect(useEditorStore.getState().actorEditOrder).toEqual(['placement'])
  })

  it('records one undo entry per completed placement; zero-distance is a no-op', () => {
    useEditorStore.getState().commitActorPlacement({ x: 0.3, y: 0.4 })
    expect(useEditorStore.getState().actorEditOrder).toEqual([])
    expect(useEditorStore.getState().placementUndoStack).toEqual([])

    useEditorStore.getState().commitActorPlacement({ x: 0.55, y: 0.2 })
    expect(useEditorStore.getState().actorEditOrder).toEqual(['placement'])
    expect(useEditorStore.getState().placementUndoStack).toEqual([
      { x: 0.3, y: 0.4 },
    ])
    expect(useEditorStore.getState().livePosition).toEqual({ x: 0.55, y: 0.2 })
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.55,
      y: 0.2,
    })

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.3,
      y: 0.4,
    })
    expect(useEditorStore.getState().livePosition).toEqual({ x: 0.3, y: 0.4 })
    expect(useEditorStore.getState().actorEditRedoOrder).toEqual(['placement'])

    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.55,
      y: 0.2,
    })
    expect(useEditorStore.getState().livePosition).toEqual({ x: 0.55, y: 0.2 })
  })

  it('does not commit placement history for recorded actors', () => {
    useEditorStore.getState().selectActor('b')
    useEditorStore.getState().commitActorPlacement({ x: 0.1, y: 0.1 })
    expect(useEditorStore.getState().actorEditOrder).toEqual([])
    expect(useEditorStore.getState().project.actors[1].restPosition).toEqual({
      x: 0.7,
      y: 0.7,
    })
  })

  it('does not move an unselected recorded actor with the pointer', () => {
    const state = useEditorStore.getState()
    const recorded = state.project.actors[1]
    useEditorStore.getState().setLivePosition({ x: 0.11, y: 0.22 })
    const pos = selectActorPositionForActor(
      state.project,
      recorded,
      0.5,
      useEditorStore.getState().livePosition,
      'idle',
      undefined,
      false,
    )
    // Recorded actor follows its path, not the selected actor's live drag.
    expect(pos.x).not.toBeCloseTo(0.11, 2)
    expect(pos.y).not.toBeCloseTo(0.22, 2)
  })

  it('cancelIdleDrag releases bound capture and clears the active gesture', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const release = vi.fn()
    const hasCapture = vi.fn(() => true)
    target.releasePointerCapture = release
    target.hasPointerCapture = hasCapture

    startIdleDrag(7, { x: 0.4, y: 0.5 })
    bindPointerCaptureTarget(target)
    useEditorStore.getState().setLivePosition({ x: 0.9, y: 0.1 })
    useEditorStore.getState().setSnapIndicator({ x: 0.9, y: 0.1 })

    cancelIdleDrag()

    expect(hasCapture).toHaveBeenCalledWith(7)
    expect(release).toHaveBeenCalledWith(7)
    expect(getActivePointerId()).toBeNull()
    expect(useEditorStore.getState().livePosition).toEqual({ x: 0.3, y: 0.4 })
    expect(useEditorStore.getState().snapIndicator).toBeNull()
    expect(useEditorStore.getState().actorEditOrder).toEqual([])

    // Safe when capture was already lost / element gone.
    startIdleDrag(8, { x: 0.3, y: 0.4 })
    bindPointerCaptureTarget(target)
    hasCapture.mockReturnValue(false)
    cancelIdleDrag()
    expect(release).toHaveBeenCalledTimes(1)

    startIdleDrag(9, { x: 0.3, y: 0.4 })
    bindPointerCaptureTarget(target)
    hasCapture.mockReturnValue(true)
    target.remove()
    cancelIdleDrag()
    expect(getActivePointerId()).toBeNull()
  })
})
