import { beforeEach, describe, expect, it } from 'vitest'
import {
  additionHasMotion,
  applyContinueTimelineSnapshot,
  captureContinueTimelineSnapshot,
  committedPathSamples,
  continuePathAvailability,
  displayedPathSamples,
  joinPathSamples,
  pathEndpoint,
  planContinuePathCommit,
  recordingFromSamples,
} from '../../src/core/continuePath'
import { makeGeometryEdit } from '../../src/core/edit'
import { evaluate } from '../../src/core/playback'
import { MAX_PLAYBACK_DURATION_MS } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording, makeSamples } from './helpers/project'

describe('continuePath join', () => {
  it('joins without a pause and keeps the base prefix bit-identical', () => {
    const base = makeSamples(5)
    const baseCopy = base.map((s) => ({ ...s }))
    const addition = [
      { t: 0, x: base[base.length - 1]!.x + 0.01, y: base[base.length - 1]!.y },
      { t: 80, x: 0.9, y: 0.2 },
      { t: 160, x: 0.95, y: 0.25 },
    ]
    const joined = joinPathSamples(base, addition)
    expect(joined.length).toBe(base.length + 2)
    for (let i = 0; i < base.length; i++) {
      expect(joined[i]).toEqual(baseCopy[i])
    }
    for (let i = 1; i < joined.length; i++) {
      expect(joined[i]!.t).toBeGreaterThan(joined[i - 1]!.t)
    }
    // Addition is translated onto the preserved seam.
    const seam = joined[base.length - 1]!
    expect(joined[base.length]!.t).toBe(seam.t + 80)
    expect(joined[base.length]!.x).toBeCloseTo(0.9 - 0.01, 10)
  })

  it('rejects zero-motion additions', () => {
    const still = {
      samples: [
        { t: 0, x: 0.2, y: 0.3 },
        { t: 100, x: 0.2, y: 0.3 },
      ],
      recordedDurationMs: 100,
    }
    expect(additionHasMotion(still)).toBe(false)
    expect(additionHasMotion(makeRecording(8))).toBe(true)
  })
})

describe('continuePath timeline plan', () => {
  it('preserves prior path speed by extending Sequence and Duration', () => {
    const recording = makeRecording(11) // 400ms path
    const actor = makeActor({
      id: 'a1',
      recording,
      clip: {
        start: 0,
        end: 1,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
    })
    const other = makeActor({
      id: 'a2',
      name: 'Other',
      recording: makeRecording(6),
      clip: {
        start: 0,
        end: 0.5,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
      transform: {
        keyframes: [
          {
            id: 'k1',
            t: 0.25,
            rotationDeg: 45,
            scale: 1,
          },
        ],
      },
    })
    const project = makeProject({
      actors: [actor, other],
      playback: {
        durationMs: 1200,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })

    const baseSamples = displayedPathSamples(actor, project.stageAspect)
    const oldPathMs = baseSamples[baseSamples.length - 1]!.t
    const addition = {
      samples: [
        {
          t: 0,
          x: baseSamples[baseSamples.length - 1]!.x,
          y: baseSamples[baseSamples.length - 1]!.y,
        },
        { t: 200, x: 0.9, y: 0.1 },
      ],
      recordedDurationMs: 200,
    }

    const plan = planContinuePathCommit({
      project,
      actorId: 'a1',
      addition,
    })
    expect('error' in plan).toBe(false)
    if ('error' in plan) return

    const newPathMs = plan.geometryEdit.samples[plan.geometryEdit.samples.length - 1]!.t
    expect(newPathMs).toBeGreaterThan(oldPathMs)
    // Full-timeline actor: Duration grows with path.
    expect(plan.durationMs).toBeCloseTo(1200 * (newPathMs / oldPathMs), 5)

    const continued = plan.actors.find((a) => a.id === 'a1')!
    expect(continued.clip.start).toBeCloseTo(0, 5)
    expect(continued.clip.end).toBeCloseTo(1, 5)

    // Other actor absolute clip end stays 600ms; clip-local transform keys stay.
    const otherPlan = plan.actors.find((a) => a.id === 'a2')!
    expect(otherPlan.clip.end * plan.durationMs).toBeCloseTo(600, 4)
    expect(otherPlan.transform.keyframes[0]!.t).toBeCloseTo(0.25, 5)
    const otherClipLen =
      (otherPlan.clip.end - otherPlan.clip.start) * plan.durationMs
    expect(
      otherPlan.clip.start * plan.durationMs +
        otherPlan.transform.keyframes[0]!.t * otherClipLen,
    ).toBeCloseTo(150, 4)
  })

  it('disables when Duration cannot grow past the max', () => {
    const recording = makeRecording(21)
    // Inflate path length so even a short addition needs > max duration.
    const longSamples = recording.samples.map((s, i) => ({
      ...s,
      t: i * 400,
    }))
    const long = {
      samples: longSamples,
      recordedDurationMs: longSamples[longSamples.length - 1]!.t,
    }
    const actor = makeActor({
      id: 'a1',
      recording: long,
      clip: {
        start: 0,
        end: 1,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
    })
    const project = makeProject({
      actors: [actor],
      playback: {
        durationMs: MAX_PLAYBACK_DURATION_MS,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const end = long.samples[long.samples.length - 1]!
    const addition = {
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 500, x: end.x + 0.1, y: end.y },
      ],
      recordedDurationMs: 500,
    }
    const plan = planContinuePathCommit({
      project,
      actorId: 'a1',
      addition,
    })
    expect('error' in plan).toBe(true)
  })
})

function seedContinueStore(project = makeProject()) {
  const actor = project.actors[0]!
  useEditorStore.setState({
    project,
    selectedActorId: actor.id,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0,
    playbackDirection: 1,
    livePosition: { ...actor.restPosition },
    liveTrail: [],
    recordingIntent: 'replace',
    continuePathUndoStack: [],
    continuePathRedoStack: [],
    actorEditOrder: [],
    actorEditRedoOrder: [],
    geometryEdit: null,
    editSession: null,
    undoStack: [],
    redoStack: [],
    polishSession: null,
    glideSession: null,
    presetSession: null,
    pathGestureActive: false,
  })
}

describe('continuePath store', () => {
  beforeEach(() => {
    seedContinueStore()
  })

  it('commits one undo entry; cancel and zero-motion leave history empty', () => {
    const store = useEditorStore.getState()
    const actor = store.project.actors[0]!
    const end = pathEndpoint(committedPathSamples(actor))!
    expect(store.armContinuePath()).toBe(true)
    expect(useEditorStore.getState().recordingIntent).toBe('continue')
    expect(useEditorStore.getState().livePosition).toEqual(end)

    // Zero-motion finish.
    store.beginRecording(1, end)
    store.finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 80, x: end.x, y: end.y },
      ],
      recordedDurationMs: 80,
    })
    expect(useEditorStore.getState().continuePathUndoStack).toHaveLength(0)
    expect(useEditorStore.getState().project.actors[0]!.recording).toEqual(
      actor.recording,
    )

    expect(useEditorStore.getState().armContinuePath()).toBe(true)
    useEditorStore.getState().cancelContinueRecording()
    expect(useEditorStore.getState().mode).toBe('idle')
    expect(useEditorStore.getState().recordingIntent).toBe('replace')
    expect(useEditorStore.getState().continuePathUndoStack).toHaveLength(0)
  })

  it('joins successive additions and restores via undo/redo', () => {
    const beforeDur = useEditorStore.getState().project.playback.durationMs
    const beforePathLen =
      useEditorStore.getState().project.actors[0]!.recording!.samples.length

    expect(useEditorStore.getState().armContinuePath()).toBe(true)
    const end = useEditorStore.getState().livePosition
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 120, x: Math.min(0.99, end.x + 0.15), y: end.y },
      ],
      recordedDurationMs: 120,
    })

    const mid = useEditorStore.getState()
    expect(mid.continuePathUndoStack).toHaveLength(1)
    expect(mid.actorEditOrder.at(-1)).toBe('continuePath')
    const midGe = mid.project.actors[0]!.geometryEdit!
    expect(midGe.samples.length).toBeGreaterThan(beforePathLen)
    expect(mid.project.actors[0]!.recording!.samples.length).toBe(beforePathLen)
    expect(mid.project.playback.durationMs).toBeGreaterThan(beforeDur)

    const end2 = pathEndpoint(
      displayedPathSamples(mid.project.actors[0]!, mid.project.stageAspect),
    )!
    expect(mid.armContinuePath()).toBe(true)
    useEditorStore.getState().beginRecording(2, end2)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end2.x, y: end2.y },
        {
          t: 100,
          x: Math.min(0.99, end2.x + 0.1),
          y: Math.min(0.99, end2.y + 0.1),
        },
      ],
      recordedDurationMs: 100,
    })
    expect(useEditorStore.getState().continuePathUndoStack).toHaveLength(2)

    useEditorStore.getState().undoActorEdit()
    expect(
      useEditorStore.getState().project.actors[0]!.geometryEdit!.samples.length,
    ).toBe(midGe.samples.length)
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.geometryEdit).toBeNull()
    expect(useEditorStore.getState().project.playback.durationMs).toBe(beforeDur)

    useEditorStore.getState().redoActorEdit()
    useEditorStore.getState().redoActorEdit()
    expect(
      useEditorStore.getState().project.actors[0]!.geometryEdit!.samples.length,
    ).toBeGreaterThan(midGe.samples.length)
  })

  it('keeps original recording under geometryEdit so Restore can recover the take', () => {
    const store = useEditorStore.getState()
    const actor = store.project.actors[0]!
    const originalRecording = actor.recording!
    const baked = makeGeometryEdit(
      actor.recording!.samples.map((s, i) => ({
        ...s,
        y: s.y + (i === actor.recording!.samples.length - 1 ? 0.05 : 0),
      })),
      actor.smoothing,
    )
    useEditorStore.setState({
      project: {
        ...store.project,
        actors: store.project.actors.map((a) =>
          a.id === actor.id ? { ...a, geometryEdit: baked } : a,
        ),
      },
      geometryEdit: baked,
    })

    const end = pathEndpoint(
      displayedPathSamples(
        useEditorStore.getState().project.actors[0]!,
        useEditorStore.getState().project.stageAspect,
      ),
    )!
    expect(useEditorStore.getState().armContinuePath()).toBe(true)
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 150, x: Math.min(0.99, end.x + 0.2), y: end.y },
      ],
      recordedDurationMs: 150,
    })

    const next = useEditorStore.getState().project.actors[0]!
    expect(next.recording).toEqual(originalRecording)
    expect(next.geometryEdit).not.toBeNull()
    expect(next.geometryEdit!.timingBaked).toBe(true)
    const samples = next.geometryEdit!.samples
    expect(samples[samples.length - 1]!.x).toBeCloseTo(
      Math.min(0.99, end.x + 0.2),
      5,
    )

    const path = selectProcessedPathForActor(
      useEditorStore.getState().project,
      next,
    )
    expect(evaluate(path, 1).x).toBeCloseTo(samples[samples.length - 1]!.x, 4)
  })

  it('reports availability reasons while Polish is open', () => {
    const actor = useEditorStore.getState().project.actors[0]!
    expect(
      continuePathAvailability({
        actor,
        mode: 'idle',
        polishSession: { strength: 0.5 },
        glideSession: null,
        presetSession: null,
      }).enabled,
    ).toBe(false)
  })
})

describe('continuePath snapshot helpers', () => {
  it('round-trips a timeline snapshot', () => {
    const project = makeProject()
    const snap = captureContinueTimelineSnapshot(project)
    const restored = applyContinueTimelineSnapshot(
      {
        ...project,
        playback: { ...project.playback, durationMs: 2000 },
      },
      snap,
    )
    expect(restored.playback.durationMs).toBe(project.playback.durationMs)
    expect(restored.actors[0]!.clip).toEqual(project.actors[0]!.clip)
  })

  it('recordingFromSamples rejects short takes', () => {
    expect(recordingFromSamples([{ t: 0, x: 0.1, y: 0.1 }])).toBeNull()
  })
})
