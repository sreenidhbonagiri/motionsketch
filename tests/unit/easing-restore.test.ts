import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  serializeSnapshot,
  validateSnapshot,
} from '../../src/core/persist/document'
import { evaluate } from '../../src/core/playback'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'

function pausePath(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 20; i++) {
    samples.push({ t: i * 30, x: 0.2 + i * 0.02, y: 0.45 })
  }
  for (let i = 1; i <= 8; i++) {
    samples.push({
      t: samples[samples.length - 1]!.t + 40,
      x: samples[samples.length - 1]!.x,
      y: samples[samples.length - 1]!.y,
    })
  }
  const hold = samples[samples.length - 1]!
  for (let i = 1; i <= 24; i++) {
    samples.push({
      t: hold.t + i * 30,
      x: hold.x + i * 0.015,
      y: hold.y,
    })
  }
  return samples
}

function maxDiff(a: MotionSample[], b: MotionSample[]): number {
  let peak = 0
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const p = evaluate(a, t)
    const q = evaluate(b, t)
    peak = Math.max(peak, Math.hypot(p.x - q.x, p.y - q.y))
  }
  return peak
}

function seed(project: Project) {
  const actor = project.actors[0]!
  useEditorStore.setState({
    project,
    selectedActorId: actor.id,
    mode: 'idle',
    geometryEdit: null,
    easingUndoStack: [],
    easingRedoStack: [],
    continuePathUndoStack: [],
    continuePathRedoStack: [],
    actorEditOrder: [],
    actorEditRedoOrder: [],
    actionAnnouncement: null,
    livePosition: { ...actor.restPosition },
  })
}

describe('Extend → Restore restores easing + motion settings', () => {
  beforeEach(() => {
    const samples = pausePath()
    const actor = createSceneActor({
      id: 'restore-easing',
      name: 'Restore Easing',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      smoothing: 0,
      steadySpeed: 0.7,
      glide: 0.55,
      easing: 'spring',
    })
    seed({
      version: 1,
      name: 'Restore easing fixture',
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      playback: {
        durationMs: samples[samples.length - 1]!.t,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
      actors: [actor],
    })
  })

  it('Restore returns Steady/Glide and re-enables stored Easing', () => {
    const project = useEditorStore.getState().project
    const actor = project.actors[0]!
    const pathBefore = selectProcessedPathForActor(project, actor)
    const recordingBefore = JSON.stringify(actor.recording)

    const end = evaluate(pathBefore, 0.99)
    expect(useEditorStore.getState().armContinuePath()).toBe(true)
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 180, x: Math.min(0.99, end.x + 0.12), y: end.y },
      ],
      recordedDurationMs: 180,
    })

    const continued = useEditorStore.getState().project.actors[0]!
    expect(continued.geometryEdit?.timingBaked).toBe(true)
    expect(continued.steadySpeed).toBe(0)
    expect(continued.glide).toBe(0)
    // Field retained; live path forced linear while baked.
    expect(continued.easing).toBe('spring')
    const bakedPath = selectProcessedPathForActor(
      useEditorStore.getState().project,
      continued,
    )
    const bakedAsSpringField = selectProcessedPathForActor(
      useEditorStore.getState().project,
      { ...continued, easing: 'bounce' },
    )
    expect(maxDiff(bakedPath, bakedAsSpringField)).toBe(0)

    useEditorStore.getState().setEasing('bounce')
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('spring')

    useEditorStore.getState().restoreRecordedPath()
    const restored = useEditorStore.getState().project.actors[0]!
    expect(restored.geometryEdit).toBeNull()
    expect(JSON.stringify(restored.recording)).toBe(recordingBefore)
    expect(restored.steadySpeed).toBe(0.7)
    expect(restored.glide).toBe(0.55)
    expect(restored.easing).toBe('spring')

    const pathAfter = selectProcessedPathForActor(
      useEditorStore.getState().project,
      restored,
    )
    // Live Spring again differs from Linear on the restored recording.
    const asLinear = selectProcessedPathForActor(
      useEditorStore.getState().project,
      { ...restored, easing: 'linear' },
    )
    expect(maxDiff(pathAfter, asLinear)).toBeGreaterThan(0.01)
  })

  it('undo continue restores pre-Extend easing motion; easing undo works after Restore', () => {
    const project = useEditorStore.getState().project
    const pathBefore = selectProcessedPathForActor(
      project,
      project.actors[0]!,
    )
    const end = evaluate(pathBefore, 0.99)
    useEditorStore.getState().armContinuePath()
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 160, x: Math.min(0.99, end.x + 0.1), y: end.y },
      ],
      recordedDurationMs: 160,
    })
    expect(useEditorStore.getState().continuePathUndoStack.length).toBeGreaterThan(
      0,
    )

    useEditorStore.getState().undoContinuePath()
    const undone = useEditorStore.getState().project.actors[0]!
    expect(undone.geometryEdit).toBeNull()
    expect(undone.easing).toBe('spring')
    expect(undone.steadySpeed).toBe(0.7)
    expect(undone.glide).toBe(0.55)

    // Re-extend then Restore, then change easing with undo/redo.
    const end2 = evaluate(
      selectProcessedPathForActor(
        useEditorStore.getState().project,
        undone,
      ),
      0.99,
    )
    useEditorStore.getState().armContinuePath()
    useEditorStore.getState().beginRecording(1, end2)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end2.x, y: end2.y },
        { t: 140, x: Math.min(0.99, end2.x + 0.08), y: end2.y },
      ],
      recordedDurationMs: 140,
    })
    useEditorStore.getState().restoreRecordedPath()
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('spring')

    useEditorStore.getState().setEasing('bounce')
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('bounce')
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('spring')
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('bounce')
  })

  it('reload after Restore keeps easing and Steady/Glide', () => {
    const project = useEditorStore.getState().project
    const end = evaluate(
      selectProcessedPathForActor(project, project.actors[0]!),
      0.99,
    )
    useEditorStore.getState().armContinuePath()
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 150, x: Math.min(0.99, end.x + 0.09), y: end.y },
      ],
      recordedDurationMs: 150,
    })
    useEditorStore.getState().restoreRecordedPath()

    const snap = buildSnapshot(useEditorStore.getState().project)
    const parsed = validateSnapshot(JSON.parse(serializeSnapshot(snap)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const actor = parsed.snapshot.project.actors[0]!
    expect(actor.geometryEdit).toBeNull()
    expect(actor.easing).toBe('spring')
    expect(actor.steadySpeed).toBe(0.7)
    expect(actor.glide).toBe(0.55)
  })
})
