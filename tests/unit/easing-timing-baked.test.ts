import { beforeEach, describe, expect, it } from 'vitest'
import { evaluate } from '../../src/core/playback'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { buildEasingFixtureProject } from '../fixtures/easingProject'

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

describe('easing with timing-baked Extend paths', () => {
  beforeEach(() => {
    const project = buildEasingFixtureProject()
    const actor = project.actors[0]!
    const samples = actor.recording!.samples
    const baked = createSceneActor({
      ...actor,
      geometryEdit: {
        samples: samples.map((s) => ({ ...s })),
        bakedSmoothing: 0,
        handleIndices: [0, samples.length - 1],
        timingBaked: true,
      },
      easing: 'linear',
    })
    const next: Project = { ...project, actors: [baked] }
    useEditorStore.setState({
      project: next,
      selectedActorId: baked.id,
      mode: 'idle',
      geometryEdit: null,
      easingUndoStack: [],
      easingRedoStack: [],
      actorEditOrder: [],
      actorEditRedoOrder: [],
      actionAnnouncement: null,
    })
  })

  it('forces Linear playback on timing-baked paths even if easing field differs', () => {
    const project = useEditorStore.getState().project
    const actor = project.actors[0]!
    const linear = selectProcessedPathForActor(project, {
      ...actor,
      easing: 'linear',
    })
    const spring = selectProcessedPathForActor(project, {
      ...actor,
      easing: 'spring',
    })
    expect(maxDiff(linear, spring)).toBe(0)
  })

  it('setEasing refuses to change the field while timing is baked', () => {
    useEditorStore.getState().setEasing('spring')
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('linear')
    expect(useEditorStore.getState().actionAnnouncement).toMatch(/baked timing/i)
  })
})
