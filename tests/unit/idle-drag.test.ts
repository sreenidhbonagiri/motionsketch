import { describe, expect, it, beforeEach } from 'vitest'
import {
  commitIdleDragBaseline,
  endDrag,
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
    useEditorStore.getState().setRestPosition({ x: 0.62, y: 0.18 })
    commitIdleDragBaseline()
    endDrag(false)
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.62,
      y: 0.18,
    })

    // New drag then cancel restores the committed rest.
    startIdleDrag(2, { x: 0.62, y: 0.18 })
    useEditorStore.getState().setLivePosition({ x: 0.1, y: 0.1 })
    restoreIdleDragBaseline()
    endDrag(false)
    expect(useEditorStore.getState().livePosition).toEqual({ x: 0.62, y: 0.18 })
    expect(useEditorStore.getState().project.actors[0].restPosition).toEqual({
      x: 0.62,
      y: 0.18,
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
})
