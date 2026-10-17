import {
  createSession,
  finish,
  pushSample,
  type RecordingSession,
} from '../core/recording'
import type { Recording, Vec2 } from '../core/types'
import { useEditorStore } from '../state/store'

let session: RecordingSession | null = null
let grabOffset: Vec2 = { x: 0, y: 0 }
let activePointerId: number | null = null
let isRecordingDrag = false

export function getGrabOffset(): Vec2 {
  return grabOffset
}

export function setGrabOffset(offset: Vec2): void {
  grabOffset = offset
}

export function getActivePointerId(): number | null {
  return activePointerId
}

export function startRecordingDrag(
  pointerId: number,
  absoluteTimestamp: number,
  center: Vec2,
): void {
  activePointerId = pointerId
  isRecordingDrag = true
  session = pushSample(createSession(), absoluteTimestamp, center.x, center.y)
  useEditorStore.getState().beginRecording(pointerId, center)
}

export function startIdleDrag(pointerId: number, center: Vec2): void {
  activePointerId = pointerId
  isRecordingDrag = false
  session = null
  useEditorStore.getState().setLivePosition(center)
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
  session = null
  activePointerId = null
  const wasRecording = isRecordingDrag
  isRecordingDrag = false

  if (!wasRecording) {
    return null
  }

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
  session = null
  activePointerId = null
  isRecordingDrag = false
  grabOffset = { x: 0, y: 0 }
}
