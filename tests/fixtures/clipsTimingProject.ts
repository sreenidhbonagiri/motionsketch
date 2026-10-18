import {
  buildSnapshot,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project, Recording } from '../../src/core/types'

function pathRecording(
  count: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Recording {
  const samples: MotionSample[] = Array.from({ length: count }, (_, i) => {
    const u = count === 1 ? 0 : i / (count - 1)
    return {
      t: i * 40,
      x: from.x + (to.x - from.x) * u,
      y: from.y + (to.y - from.y) * u,
    }
  })
  return {
    samples,
    recordedDurationMs: samples[samples.length - 1]!.t,
  }
}

/** Three-actor, 2s project used by focused clip timing e2e tests. */
export function buildClipsTimingFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
  options?: { loop?: boolean; loopMode?: 'repeat' | 'alternate' },
): string {
  const lead = createSceneActor({
    id: 'clip-lead',
    name: 'Lead',
    recording: pathRecording(16, { x: 0.25, y: 0.45 }, { x: 0.75, y: 0.55 }),
    clip: {
      start: 0,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    },
  })
  const late = createSceneActor({
    id: 'clip-late',
    name: 'Late',
    recording: pathRecording(16, { x: 0.55, y: 0.35 }, { x: 0.3, y: 0.7 }),
    clip: {
      start: 0.5,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    },
  })
  const early = createSceneActor({
    id: 'clip-early',
    name: 'Early',
    recording: pathRecording(16, { x: 0.4, y: 0.6 }, { x: 0.65, y: 0.35 }),
    clip: {
      start: 0,
      end: 0.5,
      hideBeforeStart: false,
      hideAfterEnd: false,
    },
  })
  const project: Project = {
    version: 1,
    name: 'Clips timing fixture',
    actors: [lead, late, early],
    playback: {
      durationMs: 2000,
      loop: options?.loop ?? false,
      loopMode: options?.loopMode ?? 'repeat',
      trigger: 'page-load',
    },
    stageAspect: 1.6,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}

/** Eight actors for Sequence overflow / scroll regression coverage. */
export function buildSequenceCrowdFixtureJson(
  savedAt = '2026-01-01T00:00:00.000Z',
): string {
  const actors = Array.from({ length: 8 }, (_, i) => {
    const start = Math.min(0.7, i * 0.08)
    const end = Math.min(1, start + 0.25)
    return createSceneActor({
      id: `seq-crowd-${i + 1}`,
      name: `Actor ${i + 1}`,
      recording: pathRecording(
        12,
        { x: 0.2 + (i % 4) * 0.12, y: 0.3 + Math.floor(i / 4) * 0.2 },
        { x: 0.55 + (i % 3) * 0.1, y: 0.55 },
      ),
      clip: {
        start,
        end,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
    })
  })
  const project: Project = {
    version: 1,
    name: 'Sequence crowd fixture',
    actors,
    playback: {
      durationMs: 4000,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    stageAspect: 1.6,
  }
  return serializeSnapshot(buildSnapshot(project, null, savedAt))
}
