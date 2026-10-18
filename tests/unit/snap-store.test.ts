import { beforeEach, describe, expect, it } from 'vitest'
import { nearestGridPoint } from '../../src/core/grid'
import { pickPersistable } from '../../src/lib/persistenceController'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject } from './helpers/project'

describe('snap to grid preference', () => {
  beforeEach(() => {
    useEditorStore.setState({
      project: makeProject({
        actors: [makeActor({ id: 'a', recording: null })],
      }),
      selectedActorId: 'a',
      mode: 'idle',
      snapToGrid: false,
      snapIndicator: null,
      showPathComparison: false,
    })
  })

  it('defaults off and toggling does not enter persistable project data', () => {
    expect(useEditorStore.getState().snapToGrid).toBe(false)
    useEditorStore.getState().setSnapToGrid(true)
    expect(useEditorStore.getState().snapToGrid).toBe(true)
    const slice = pickPersistable(useEditorStore.getState())
    expect(JSON.stringify(slice)).not.toMatch(/snapToGrid|snapIndicator/)
    expect(slice.project.actors[0]!.restPosition).toEqual(
      useEditorStore.getState().project.actors[0]!.restPosition,
    )
  })

  it('disabling snap clears the ephemeral indicator', () => {
    useEditorStore.getState().setSnapIndicator(nearestGridPoint({ x: 0.4, y: 0.6 }))
    useEditorStore.getState().setSnapToGrid(true)
    expect(useEditorStore.getState().snapIndicator).not.toBeNull()
    useEditorStore.getState().setSnapToGrid(false)
    expect(useEditorStore.getState().snapIndicator).toBeNull()
  })

  it('toggling snap does not move rest positions or geometry', () => {
    const before = JSON.stringify(useEditorStore.getState().project)
    useEditorStore.getState().setSnapToGrid(true)
    useEditorStore.getState().setSnapToGrid(false)
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
  })
})
