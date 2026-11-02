import { act, cleanup, renderHook } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePointerRecorder } from '../../src/hooks/usePointerRecorder'
import { resetController } from '../../src/lib/recordingController'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject } from './helpers/project'

describe('pointer recording focus', () => {
  beforeEach(() => {
    resetController()
    const actor = makeActor({ id: 'plane', recording: null })
    useEditorStore.setState({
      project: makeProject({ actors: [actor] }),
      selectedActorId: actor.id,
      mode: 'armed',
      recordingIntent: 'replace',
      livePosition: actor.restPosition,
    })
  })

  afterEach(() => {
    cleanup()
    resetController()
    document.body.replaceChildren()
  })

  it('moves focus from Record to the element when a recording drag starts', () => {
    const record = document.createElement('button')
    const element = document.createElement('div')
    element.tabIndex = 0
    const stage = document.createElement('div')
    stage.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 600)
    stage.append(element)
    document.body.append(record, stage)
    record.focus()
    const { result } = renderHook(() =>
      usePointerRecorder({ stageRef: { current: stage } }),
    )

    act(() => {
      result.current.onActorPointerDown('plane', {
        currentTarget: element,
        pointerId: 1,
        timeStamp: 100,
        clientX: 300,
        clientY: 300,
        preventDefault() {},
      } as PointerEvent<HTMLElement>)
    })

    expect(useEditorStore.getState().mode).toBe('recording')
    expect(document.activeElement).toBe(element)
  })
})
