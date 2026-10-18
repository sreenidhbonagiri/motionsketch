import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import {
  centerFromPointer,
  clientToNormalized,
  grabOffsetFromPointer,
} from '../core/coords'
import { findActor } from '../core/sceneActor'
import {
  endDrag,
  getActivePointerId,
  getGrabOffset,
  isRecordingActive,
  pushRecordingSample,
  setGrabOffset,
  startIdleDrag,
  startRecordingDrag,
  stopFromUi,
} from '../lib/recordingController'
import { useEditorStore } from '../state/store'

interface UsePointerRecorderOptions {
  stageRef: React.RefObject<HTMLElement | null>
}

export function usePointerRecorder({ stageRef }: UsePointerRecorderOptions) {
  const mode = useEditorStore((s) => s.mode)
  const pointerId = useEditorStore((s) => s.pointerId)
  const selectActor = useEditorStore((s) => s.selectActor)

  const getRect = useCallback(() => {
    return stageRef.current?.getBoundingClientRect() ?? null
  }, [stageRef])

  const onActorPointerDown = useCallback(
    (actorId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (mode === 'playing' || mode === 'editing') return

      selectActor(actorId)
      const state = useEditorStore.getState()
      const actor = findActor(state.project.actors, actorId)
      if (!actor) return

      // After a take exists on this actor, only armed recording may move it.
      if (actor.recording && state.mode !== 'armed') return

      const rect = getRect()
      if (!rect) return

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

      const pointer = clientToNormalized(event.clientX, event.clientY, rect)
      const position =
        actorId === state.selectedActorId
          ? state.livePosition
          : actor.restPosition
      setGrabOffset(grabOffsetFromPointer(pointer, position))
      const center = centerFromPointer(pointer, getGrabOffset())

      if (state.mode === 'armed') {
        startRecordingDrag(event.pointerId, event.timeStamp, center)
      } else {
        startIdleDrag(event.pointerId, center)
      }
    },
    [mode, selectActor, getRect],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (getActivePointerId() !== event.pointerId) return

      const rect = getRect()
      if (!rect) return

      const events =
        typeof event.nativeEvent.getCoalescedEvents === 'function'
          ? event.nativeEvent.getCoalescedEvents()
          : [event.nativeEvent]

      for (const e of events) {
        const pointer = clientToNormalized(e.clientX, e.clientY, rect)
        const center = centerFromPointer(pointer, getGrabOffset())
        if (isRecordingActive()) {
          pushRecordingSample(e.timeStamp, center)
        } else {
          useEditorStore.getState().setLivePosition(center)
        }
      }
    },
    [getRect],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (getActivePointerId() !== event.pointerId) return

      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // already released
      }

      if (isRecordingActive()) {
        endDrag(true)
      } else {
        const pos = useEditorStore.getState().livePosition
        const actor = findActor(
          useEditorStore.getState().project.actors,
          useEditorStore.getState().selectedActorId,
        )
        if (actor && !actor.recording) {
          useEditorStore.getState().setRestPosition(pos)
        }
        endDrag(false)
      }
    },
    [],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (getActivePointerId() !== event.pointerId) return

      if (isRecordingActive()) {
        endDrag(true)
      } else {
        endDrag(false)
        if (mode === 'recording') useEditorStore.getState().setIdle()
      }
    },
    [mode],
  )

  return {
    pointerId,
    onActorPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    stopRecordingFromUi: stopFromUi,
  }
}
