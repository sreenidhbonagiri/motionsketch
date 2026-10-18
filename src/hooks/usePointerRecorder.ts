import {
  useCallback,
  useEffect,
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
  bindPointerCaptureTarget,
  cancelIdleDrag,
  commitIdleDragBaseline,
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
  const previousSnapRef = useRef<Vec2 | null>(null)

  const getRect = useCallback(() => {
    return stageRef.current?.getBoundingClientRect() ?? null
  }, [stageRef])

  const clearSnapChrome = useCallback(() => {
    previousSnapRef.current = null
    useEditorStore.getState().setSnapIndicator(null)
  }, [])

  /** Shared idle-placement cancel: capture release + baseline + transient chrome. */
  const cancelIdlePlacement = useCallback(() => {
    cancelIdleDrag()
    previousSnapRef.current = null
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
      const captureEl = event.currentTarget
      try {
        captureEl.setPointerCapture(event.pointerId)
        bindPointerCaptureTarget(captureEl)
      } catch {
        // Synthetic / inactive pointer ids (tests, some touch engines) cannot
        // take capture — still bind the element so cancel cleanup is a no-op
        // release, and continue the gesture via bubbling move/up.
        bindPointerCaptureTarget(captureEl)
      }

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
          useEditorStore.getState().commitActorPlacement(pos)
        }
        commitIdleDragBaseline()
        // Releases bound capture; later orphaned ups cannot match active id.
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
        clearSnapChrome()
      } else {
        // Same cleanup as Escape / blur / project teardown.
        cancelIdlePlacement()
        if (mode === 'recording') useEditorStore.getState().setIdle()
      }
    },
    [mode, clearSnapChrome, cancelIdlePlacement],
  )

  // Escape / blur: same cancel path as pointercancel (capture + baseline).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (isRecordingActive()) return
      if (getActivePointerId() === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancelIdlePlacement()
    }
    const onBlur = () => {
      cancelIdlePlacement()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
      // Unmount mid-gesture: drop capture without committing.
      cancelIdlePlacement()
    }
  }, [cancelIdlePlacement])

  return {
    pointerId,
    onActorPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    stopRecordingFromUi: stopFromUi,
  }
}
