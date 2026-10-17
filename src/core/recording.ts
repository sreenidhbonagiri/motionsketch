import {
  MIN_RECORDING_DURATION_MS,
  MIN_RECORDING_SAMPLES,
  type MotionSample,
  type Recording,
} from './types'
import { clamp01 } from './coords'

export interface RecordingSession {
  originTimestamp: number | null
  samples: MotionSample[]
}

export function createSession(): RecordingSession {
  return {
    originTimestamp: null,
    samples: [],
  }
}

export function pushSample(
  session: RecordingSession,
  absoluteTimestamp: number,
  x: number,
  y: number,
): RecordingSession {
  const nx = clamp01(x)
  const ny = clamp01(y)

  if (session.originTimestamp === null) {
    return {
      originTimestamp: absoluteTimestamp,
      samples: [{ t: 0, x: nx, y: ny }],
    }
  }

  const t = Math.max(0, absoluteTimestamp - session.originTimestamp)
  const last = session.samples[session.samples.length - 1]

  // Skip duplicate timestamps that would break monotonic ordering.
  if (last && t < last.t) {
    return session
  }

  if (last && t === last.t && last.x === nx && last.y === ny) {
    return session
  }

  return {
    ...session,
    samples: [...session.samples, { t, x: nx, y: ny }],
  }
}

export function finish(session: RecordingSession): Recording | null {
  if (session.samples.length < MIN_RECORDING_SAMPLES) {
    return null
  }

  const last = session.samples[session.samples.length - 1]
  const recordedDurationMs = last.t

  if (recordedDurationMs < MIN_RECORDING_DURATION_MS) {
    return null
  }

  return {
    samples: session.samples.map((s) => ({ ...s })),
    recordedDurationMs,
  }
}
