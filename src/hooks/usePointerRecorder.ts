import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  centerFromPointer,
  clientToNormalized,
  grabOffsetFromPointer,
} from '../core/coords'
import { resolveSnapTarget } from '../core/grid'
import { findActor } from '../core/sceneActor'
import type { Vec2 } from '../core/types'
import {
  commitIdleDragBaseline,
  endDrag,
  getActivePointerId,
  getGrabOffset,
  isRecordingActive,
  pushRecordingSample,
  restoreIdleDragBaseline,
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
  const previousSnapRef = useRef<Vec2 | null>(null)

  const getRect = useCallback(() => {
    return stageRef.current?.getBoundingClientRect() ?? null
  }, [stageRef])

  const clearSnapChrome = useCallback(() => {
    previousSnapRef.current = null
    useEditorStore.getState().setSnapIndicator(null)
  }, [])

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
      // Unsnapped on pointer down — preserves grab offset, no jump.
      const center = centerFromPointer(pointer, getGrabOffset())
      previousSnapRef.current = null
      useEditorStore.getState().setSnapIndicator(null)

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

      const snapEnabled = useEditorStore.getState().snapToGrid
      const recording = isRecordingActive()

      for (const e of events) {
        const pointer = clientToNormalized(e.clientX, e.clientY, rect)
        let center = centerFromPointer(pointer, getGrabOffset())
        if (recording) {
          // Recording stays freehand — never snap pointer samples.
          pushRecordingSample(e.timeStamp, center)
          continue
        }
        if (snapEnabled) {
          const resolved = resolveSnapTarget(
            center,
            rect.width,
            rect.height,
            previousSnapRef.current,
          )
          previousSnapRef.current = resolved.snapped
          if (resolved.snapped) {
            center = resolved.snapped
            useEditorStore.getState().setSnapIndicator(resolved.snapped)
          } else {
            useEditorStore.getState().setSnapIndicator(null)
          }
        } else if (previousSnapRef.current || useEditorStore.getState().snapIndicator) {
          clearSnapChrome()
        }
        useEditorStore.getState().setLivePosition(center)
      }
    },
    [getRect, clearSnapChrome],
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
        // Stamp the release time so a post-move hold still counts toward
        // minimum duration (WebKit often compresses move timeStamps).
        const pos = useEditorStore.getState().livePosition
        pushRecordingSample(event.timeStamp, pos)
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
        commitIdleDragBaseline()
        endDrag(false)
      }
      clearSnapChrome()
    },
    [clearSnapChrome],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (getActivePointerId() !== event.pointerId) return

      if (isRecordingActive()) {
        const pos = useEditorStore.getState().livePosition
        pushRecordingSample(event.timeStamp, pos)
        endDrag(true)
      } else {
        // Cancel restores the pre-drag rest pose; do not commit.
        restoreIdleDragBaseline()
        endDrag(false)
        if (mode === 'recording') useEditorStore.getState().setIdle()
      }
      clearSnapChrome()
    },
    [mode, clearSnapChrome],
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
