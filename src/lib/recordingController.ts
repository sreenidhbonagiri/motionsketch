import { displayedPathSamples, pathEndpoint } from '../core/continuePath'
import {
  createSession,
  finish,
  pushSample,
  type RecordingSession,
} from '../core/recording'
import { findActor } from '../core/sceneActor'
import type { Recording, Vec2 } from '../core/types'
import { useEditorStore } from '../state/store'

let session: RecordingSession | null = null
let grabOffset: Vec2 = { x: 0, y: 0 }
let activePointerId: number | null = null
let isRecordingDrag = false
/** Rest pose captured at idle-drag start; restored on cancel. */
let idleRestBaseline: Vec2 | null = null
/** Element that called setPointerCapture for the active gesture. */
let pointerCaptureTarget: Element | null = null

export function getGrabOffset(): Vec2 {
  return grabOffset
}

export function setGrabOffset(offset: Vec2): void {
  grabOffset = offset
}

export function getActivePointerId(): number | null {
  return activePointerId
}

/** Remember the capture owner so Escape / blur / teardown can release it. */
export function bindPointerCaptureTarget(target: Element | null): void {
  pointerCaptureTarget = target
}

/**
 * Release pointer capture from the bound owner. Safe when the element is
 * gone, capture was already lost, or no gesture is active.
 */
export function releaseBoundPointerCapture(
  pointerId: number | null = activePointerId,
): void {
  const target = pointerCaptureTarget
  pointerCaptureTarget = null
  if (!target || pointerId === null) return
  try {
    if (!target.isConnected) return
    if (
      typeof target.hasPointerCapture === 'function' &&
      !target.hasPointerCapture(pointerId)
    ) {
      return
    }
    target.releasePointerCapture(pointerId)
  } catch {
    // already released / invalid state
  }
}

export function startRecordingDrag(
  pointerId: number,
  absoluteTimestamp: number,
  center: Vec2,
): void {
  activePointerId = pointerId
  isRecordingDrag = true
  idleRestBaseline = null
  const state = useEditorStore.getState()
  let start = center
  // Continue path: pin the first sample to the committed endpoint so the
  // stroke never jumps on pointerdown.
  if (state.recordingIntent === 'continue') {
    const actor = findActor(state.project.actors, state.selectedActorId)
    const endpoint = actor
      ? pathEndpoint(
          displayedPathSamples(actor, state.project.stageAspect),
        )
      : null
    if (endpoint) start = endpoint
  }
  session = pushSample(createSession(), absoluteTimestamp, start.x, start.y)
  useEditorStore.getState().beginRecording(pointerId, start)
}

export function startIdleDrag(pointerId: number, center: Vec2): void {
  activePointerId = pointerId
  isRecordingDrag = false
  session = null
  const state = useEditorStore.getState()
  const actor = findActor(state.project.actors, state.selectedActorId)
  idleRestBaseline = actor
    ? { x: actor.restPosition.x, y: actor.restPosition.y }
    : { x: center.x, y: center.y }
  useEditorStore.getState().setLivePosition(center)
}

/** Commit path for a finished idle drag (clears cancel baseline). */
export function commitIdleDragBaseline(): void {
  idleRestBaseline = null
}

/** Restore rest/live position after a canceled idle drag. */
export function restoreIdleDragBaseline(): void {
  if (idleRestBaseline) {
    useEditorStore.getState().setLivePosition({ ...idleRestBaseline })
  }
  idleRestBaseline = null
}

/**
 * Abort an in-progress idle placement without a history entry.
 * Releases capture, clears transient gesture state, and is the shared path
 * for Escape, pointercancel, blur, actor deletion, and project replacement.
 */
export function cancelIdleDrag(): void {
  if (isRecordingActive()) return
  if (
    activePointerId === null &&
    !idleRestBaseline &&
    !pointerCaptureTarget
  ) {
    return
  }
  restoreIdleDragBaseline()
  // endDrag releases bound capture then clears activePointerId.
  endDrag(false)
  grabOffset = { x: 0, y: 0 }
  useEditorStore.getState().setSnapIndicator(null)
}

export function pushRecordingSample(
  absoluteTimestamp: number,
  center: Vec2,
): void {
  if (!session || !isRecordingDrag) {
    useEditorStore.getState().setLivePosition(center)
    return
  }
  session = pushSample(session, absoluteTimestamp, center.x, center.y)
  useEditorStore.getState().pushLiveSample(center)
}

export function endDrag(keep: boolean): Recording | null {
  const current = session
  const pointerId = activePointerId
  // Drop capture before clearing the active id so release can match it.
  releaseBoundPointerCapture(pointerId)
  session = null
  activePointerId = null
  const wasRecording = isRecordingDrag
  isRecordingDrag = false

  if (!wasRecording) {
    return null
  }

  idleRestBaseline = null
  const recording = keep && current ? finish(current) : null
  useEditorStore.getState().finishRecording(recording)
  return recording
}

export function stopFromUi(): void {
  const mode = useEditorStore.getState().mode
  if (session) {
    endDrag(true)
    return
  }
  if (mode === 'armed') {
    useEditorStore.getState().cancelArm()
    return
  }
  if (mode === 'recording') {
    endDrag(true)
  }
}

export function isRecordingActive(): boolean {
  return isRecordingDrag
}

export function resetController(): void {
  pointerCaptureTarget = null
  session = null
  activePointerId = null
  isRecordingDrag = false
  idleRestBaseline = null
  grabOffset = { x: 0, y: 0 }
}
