import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import {
  centerFromPointer,
  clientToNormalized,
  grabOffsetFromPointer,
} from '../core/coords'
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
  const livePosition = useEditorStore((s) => s.livePosition)
  const hasRecording = useEditorStore((s) => !!s.project.recording)
  const setIdle = useEditorStore((s) => s.setIdle)

  const getRect = useCallback(() => {
    return stageRef.current?.getBoundingClientRect() ?? null
  }, [stageRef])

  const onActorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (mode === 'playing') return
      // After a take exists, only armed recording may move the actor.
      if (hasRecording && mode !== 'armed') return

      const rect = getRect()
      if (!rect) return

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

      const pointer = clientToNormalized(event.clientX, event.clientY, rect)
      setGrabOffset(grabOffsetFromPointer(pointer, livePosition))
      const center = centerFromPointer(pointer, getGrabOffset())

      if (mode === 'armed') {
        startRecordingDrag(event.pointerId, event.timeStamp, center)
      } else {
        startIdleDrag(event.pointerId, center)
      }
    },
    [mode, hasRecording, livePosition, getRect],
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
        if (mode === 'recording') setIdle()
      }
    },
    [mode, setIdle],
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
