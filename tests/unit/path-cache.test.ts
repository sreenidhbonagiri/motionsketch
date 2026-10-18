import { describe, expect, it, beforeEach, vi } from 'vitest'
import { applyHandleDelta, copyPath } from '../../src/core/edit'
import * as processMod from '../../src/core/process'
import {
  cachedProcessMotion,
  fingerprintSamples,
  getProcessedPathCacheStats,
  resetProcessedPathCache,
} from '../../src/core/pathCache'
import {
  selectActorPositionForActor,
  selectProcessedPathForActor,
} from '../../src/state/selectors'
import { makeActor, makeProject, makeRecording } from './helpers/project'

const emptyView = {
  geometryEdit: null,
  editSession: null,
  editPreview: null,
}

describe('processed path cache', () => {
  beforeEach(() => {
    resetProcessedPathCache()
  })

  it('warm playback uses array identity — no fingerprint traversal or reprocess', () => {
    const spy = vi.spyOn(processMod, 'processMotion')
    const project = makeProject({
      actors: [
        makeActor({
          id: 'heavy',
          recording: makeRecording(2400),
          smoothing: 0.35,
          steadySpeed: 0.2,
        }),
      ],
    })
    const actor = project.actors[0]

    selectProcessedPathForActor(project, actor, emptyView)
    expect(spy.mock.calls.length).toBe(1)
    const afterCold = getProcessedPathCacheStats()
    expect(afterCold.misses).toBe(1)
    expect(afterCold.fingerprintTraversals).toBe(0)

    for (const head of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      selectActorPositionForActor(
        project,
        actor,
        head,
        { x: 0.5, y: 0.5 },
        'idle',
        emptyView,
        true,
      )
    }

    expect(spy.mock.calls.length).toBe(1)
    const warm = getProcessedPathCacheStats()
    expect(warm.hits).toBeGreaterThan(0)
    expect(warm.fingerprintTraversals).toBe(0)
    spy.mockRestore()
  })

  it('replacing the sample array invalidates; nested sample mutation is sealed', () => {
    const spy = vi.spyOn(processMod, 'processMotion')
    const recording = makeRecording(80)
    let project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording,
          smoothing: 0.2,
          steadySpeed: 0,
        }),
      ],
    })

    const pathBefore = selectProcessedPathForActor(
      project,
      project.actors[0],
      emptyView,
    )
    expect(spy.mock.calls.length).toBe(1)
    const mid = pathBefore[Math.floor(pathBefore.length / 2)]

    // Nested mutation on a cached input must not alter sealed x/y/t.
    const sealed = project.actors[0].recording!.samples
    expect(Object.isFrozen(sealed)).toBe(true)
    expect(Object.isFrozen(sealed[0])).toBe(true)
    const snapshot = { t: sealed[0].t, x: sealed[0].x, y: sealed[0].y }
    for (const key of ['t', 'x', 'y'] as const) {
      try {
        // @ts-expect-error intentional mutation attempt
        sealed[0][key] = 0.99
      } catch {
        // Strict mode throws; sloppy mode no-ops on frozen objects.
      }
    }
    expect(sealed[0]).toEqual(snapshot)

    // Warm hit still returns the same processed geometry (no silent stale write).
    const pathAfterMutate = selectProcessedPathForActor(
      project,
      project.actors[0],
      emptyView,
    )
    expect(spy.mock.calls.length).toBe(1)
    expect(pathAfterMutate).toBe(pathBefore)
    expect(pathAfterMutate[Math.floor(pathAfterMutate.length / 2)]).toEqual(mid)
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(0)

    // Same content, new array identity → miss and reprocess.
    const replaced = {
      ...recording,
      samples: copyPath(recording.samples),
    }
    project = {
      ...project,
      actors: [{ ...project.actors[0], recording: replaced }],
    }
    selectProcessedPathForActor(project, project.actors[0], emptyView)
    expect(spy.mock.calls.length).toBe(2)

    expect(() => {
      replaced.samples.push({ t: 999, x: 0.5, y: 0.5 })
    }).toThrow()

    spy.mockRestore()
  })

  it('recording finish and path-handle edits keep working with sealed inputs', () => {
    const recording = makeRecording(40)
    const project = makeProject({
      actors: [makeActor({ id: 'a', recording, smoothing: 0.25 })],
    })

    // Admit + seal recording samples.
    selectProcessedPathForActor(project, project.actors[0], emptyView)
    expect(Object.isFrozen(project.actors[0].recording!.samples[0])).toBe(true)

    // Handle edits allocate a new path (immutable model) even when the source is sealed.
    const edited = applyHandleDelta(
      project.actors[0].recording!.samples,
      0,
      { x: 0.05, y: -0.02 },
    )
    expect(edited).not.toBe(project.actors[0].recording!.samples)
    expect(edited[0].x).not.toBe(project.actors[0].recording!.samples[0].x)
    expect(Object.isFrozen(edited)).toBe(false)

    // Committing geometry via a fresh array identity processes once, then hits.
    const withGeo = {
      ...project,
      actors: [
        {
          ...project.actors[0],
          geometryEdit: { bakedSmoothing: 0.25, samples: edited },
        },
      ],
    }
    const spySs = vi.spyOn(processMod, 'applySteadySpeed')
    selectProcessedPathForActor(withGeo, withGeo.actors[0], {
      geometryEdit: withGeo.actors[0].geometryEdit,
      editSession: null,
      editPreview: null,
    })
    selectProcessedPathForActor(withGeo, withGeo.actors[0], {
      geometryEdit: withGeo.actors[0].geometryEdit,
      editSession: null,
      editPreview: null,
    })
    expect(spySs.mock.calls.length).toBe(1)
    expect(Object.isFrozen(edited[0])).toBe(true)
    spySs.mockRestore()
  })

  it('invalidates when smoothing, steady speed, or aspect changes', () => {
    const spy = vi.spyOn(processMod, 'processMotion')
    const recording = makeRecording(120)
    let project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording,
          smoothing: 0.2,
          steadySpeed: 0,
        }),
      ],
      stageAspect: 1.6,
    })

    selectProcessedPathForActor(project, project.actors[0], emptyView)
    expect(spy.mock.calls.length).toBe(1)

    project = {
      ...project,
      actors: [{ ...project.actors[0], smoothing: 0.8 }],
    }
    selectProcessedPathForActor(project, project.actors[0], emptyView)
    expect(spy.mock.calls.length).toBe(2)

    project = {
      ...project,
      actors: [{ ...project.actors[0], steadySpeed: 0.5 }],
    }
    selectProcessedPathForActor(project, project.actors[0], emptyView)
    expect(spy.mock.calls.length).toBe(3)

    project = { ...project, stageAspect: 1.2 }
    selectProcessedPathForActor(project, project.actors[0], emptyView)
    expect(spy.mock.calls.length).toBe(4)
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(0)

    spy.mockRestore()
  })

  it('bypasses the cache for live edit previews', () => {
    const spySs = vi.spyOn(processMod, 'applySteadySpeed')
    const project = makeProject({
      actors: [makeActor({ id: 'a', recording: makeRecording(40) })],
    })
    const preview = copyPath(project.actors[0].recording!.samples)

    selectProcessedPathForActor(project, project.actors[0], {
      ...emptyView,
      editPreview: preview,
    })
    selectProcessedPathForActor(project, project.actors[0], {
      ...emptyView,
      editPreview: preview,
    })
    // Preview path always calls applySteadySpeed directly (no identity cache).
    expect(spySs.mock.calls.length).toBe(2)
    expect(getProcessedPathCacheStats().size).toBe(0)
    spySs.mockRestore()
  })

  it('fingerprintSamples is opt-in and counts traversals outside playback', () => {
    const samples = makeRecording(100).samples
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(0)
    const a = fingerprintSamples(samples)
    const b = fingerprintSamples(samples)
    expect(a).toBe(b)
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(2)

    cachedProcessMotion(samples, 0.2, 0, 1.6)
    cachedProcessMotion(samples, 0.2, 0, 1.6)
    // Warm identity lookup must not add fingerprint traversals.
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(2)
  })

  it('reports cold processing and warm per-frame evaluation separately', () => {
    const actors = Array.from({ length: 8 }, (_, i) =>
      makeActor({
        id: `a${i}`,
        recording: makeRecording(2400),
        smoothing: 0.3,
        steadySpeed: 0.15,
      }),
    )
    const project = makeProject({ actors })
    const spy = vi.spyOn(processMod, 'processMotion')

    const coldStart = performance.now()
    for (const actor of project.actors) {
      selectProcessedPathForActor(project, actor, emptyView)
    }
    const coldMs = performance.now() - coldStart
    const coldProcessCalls = spy.mock.calls.length
    expect(coldProcessCalls).toBe(8)

    const warmStart = performance.now()
    const frames = 60
    for (let step = 0; step < frames; step++) {
      const head = step / (frames - 1)
      for (const actor of project.actors) {
        selectActorPositionForActor(
          project,
          actor,
          head,
          { x: 0.5, y: 0.5 },
          'playing',
          emptyView,
          false,
        )
      }
    }
    const warmMs = performance.now() - warmStart
    const warmFrames = frames
    const warmActorEvals = frames * 8
    const perFrameMs = warmMs / warmFrames

    expect(spy.mock.calls.length).toBe(coldProcessCalls)
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(0)

    console.log(
      `[path-cache] cold process (8 actors × 2400 samples, one fill)=${coldMs.toFixed(2)}ms (${coldProcessCalls} processMotion calls)`,
    )
    console.log(
      `[path-cache] warm evaluate (${warmFrames} frames × 8 actors=${warmActorEvals} evals)=${warmMs.toFixed(2)}ms total, ${perFrameMs.toFixed(3)}ms/frame`,
    )

    expect(coldMs).toBeGreaterThan(0)
    expect(warmMs).toBeGreaterThanOrEqual(0)
    spy.mockRestore()
  })
})
