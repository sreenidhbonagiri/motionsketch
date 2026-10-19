import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyPath, makeGeometryEdit } from '../../src/core/edit'
import * as glideMod from '../../src/core/glide'
import {
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

describe('glide path cache (playback)', () => {
  beforeEach(() => {
    resetProcessedPathCache()
  })

  it('reuses the same Glide array across playback-head updates without re-apply', () => {
    const spy = vi.spyOn(glideMod, 'applyGlide')
    const project = makeProject({
      actors: [
        makeActor({
          id: 'heavy',
          recording: makeRecording(2400),
          smoothing: 0,
          steadySpeed: 0,
          glide: 0.75,
        }),
      ],
    })
    const actor = project.actors[0]!

    const first = selectProcessedPathForActor(project, actor, emptyView)
    expect(spy.mock.calls.length).toBe(1)

    const paths: ReturnType<typeof selectProcessedPathForActor>[] = []
    for (let i = 0; i < 160; i++) {
      const head = i / 159
      selectActorPositionForActor(
        project,
        actor,
        head,
        { x: 0.5, y: 0.5 },
        'playing',
        emptyView,
        true,
      )
      paths.push(selectProcessedPathForActor(project, actor, emptyView))
    }

    expect(spy.mock.calls.length).toBe(1)
    for (const p of paths) {
      expect(p).toBe(first)
    }
    expect(getProcessedPathCacheStats().fingerprintTraversals).toBe(0)
    spy.mockRestore()
  })

  it('invalidates when glide, steady, smoothing, recording, geometry, or aspect changes', () => {
    const spy = vi.spyOn(glideMod, 'applyGlide')
    const recording = makeRecording(120)
    let project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording,
          smoothing: 0,
          steadySpeed: 0,
          glide: 0.5,
        }),
      ],
      stageAspect: 1.6,
    })

    selectProcessedPathForActor(project, project.actors[0]!, emptyView)
    expect(spy.mock.calls.length).toBe(1)

    project = {
      ...project,
      actors: [{ ...project.actors[0]!, glide: 0.9 }],
    }
    selectProcessedPathForActor(project, project.actors[0]!, emptyView)
    expect(spy.mock.calls.length).toBe(2)

    project = {
      ...project,
      actors: [{ ...project.actors[0]!, steadySpeed: 0.6 }],
    }
    selectProcessedPathForActor(project, project.actors[0]!, emptyView)
    expect(spy.mock.calls.length).toBe(3)

    project = {
      ...project,
      actors: [{ ...project.actors[0]!, smoothing: 0.4 }],
    }
    // smoothing only affects processMotion path (no geometryEdit).
    selectProcessedPathForActor(project, project.actors[0]!, emptyView)
    expect(spy.mock.calls.length).toBe(4)

    const replaced = {
      ...recording,
      samples: copyPath(recording.samples),
    }
    project = {
      ...project,
      actors: [{ ...project.actors[0]!, recording: replaced }],
    }
    selectProcessedPathForActor(project, project.actors[0]!, emptyView)
    expect(spy.mock.calls.length).toBe(5)

    const geo = makeGeometryEdit(copyPath(replaced.samples), 0)
    project = {
      ...project,
      actors: [{ ...project.actors[0]!, geometryEdit: geo }],
    }
    selectProcessedPathForActor(project, project.actors[0]!, {
      geometryEdit: geo,
      editSession: null,
      editPreview: null,
    })
    expect(spy.mock.calls.length).toBe(6)

    project = { ...project, stageAspect: 1.25 }
    selectProcessedPathForActor(project, project.actors[0]!, {
      geometryEdit: geo,
      editSession: null,
      editPreview: null,
    })
    expect(spy.mock.calls.length).toBe(7)

    spy.mockRestore()
  })

  it('close but distinct params do not collide; identical params reuse arrays', () => {
    const recording = makeRecording(80)
    const base = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording,
          smoothing: 0,
          steadySpeed: 0,
          glide: 0.50001,
        }),
      ],
      stageAspect: 1.6,
    })

    const pathA = selectProcessedPathForActor(base, base.actors[0]!, emptyView)
    const pathAAgain = selectProcessedPathForActor(
      base,
      base.actors[0]!,
      emptyView,
    )
    expect(pathAAgain).toBe(pathA)

    const glideB = {
      ...base,
      actors: [{ ...base.actors[0]!, glide: 0.50002 }],
    }
    const pathB = selectProcessedPathForActor(
      glideB,
      glideB.actors[0]!,
      emptyView,
    )
    expect(pathB).not.toBe(pathA)
    // Distinct strengths must not share a rounded key — timing differs.
    expect(
      pathB.some((s, i) => Math.abs(s.t - pathA[i]!.t) > 1e-9),
    ).toBe(true)
    expect(
      selectProcessedPathForActor(glideB, glideB.actors[0]!, emptyView),
    ).toBe(pathB)

    // Fresh uncached apply must match each cached entry (no cross-talk).
    const steadyBase = selectProcessedPathForActor(
      { ...base, actors: [{ ...base.actors[0]!, glide: 0 }] },
      { ...base.actors[0]!, glide: 0 },
      emptyView,
    )
    const freshA = glideMod.applyGlide(steadyBase, 0.50001, 1.6).samples
    const freshB = glideMod.applyGlide(steadyBase, 0.50002, 1.6).samples
    for (let i = 0; i < pathA.length; i++) {
      expect(pathA[i]!.t).toBeCloseTo(freshA[i]!.t, 10)
      expect(pathB[i]!.t).toBeCloseTo(freshB[i]!.t, 10)
    }

    // Steady Speed / aspect keys used the same toFixed rounding — no collision.
    const steadyA = {
      ...base,
      actors: [{ ...base.actors[0]!, glide: 0, steadySpeed: 0.50001 }],
    }
    const steadyB = {
      ...base,
      actors: [{ ...base.actors[0]!, glide: 0, steadySpeed: 0.50002 }],
    }
    const ssA = selectProcessedPathForActor(
      steadyA,
      steadyA.actors[0]!,
      emptyView,
    )
    const ssB = selectProcessedPathForActor(
      steadyB,
      steadyB.actors[0]!,
      emptyView,
    )
    expect(ssB).not.toBe(ssA)
    expect(
      selectProcessedPathForActor(steadyA, steadyA.actors[0]!, emptyView),
    ).toBe(ssA)

    const aspectA = { ...base, stageAspect: 1.600001 }
    const aspectB = { ...base, stageAspect: 1.600002 }
    const asA = selectProcessedPathForActor(
      aspectA,
      aspectA.actors[0]!,
      emptyView,
    )
    const asB = selectProcessedPathForActor(
      aspectB,
      aspectB.actors[0]!,
      emptyView,
    )
    expect(asB).not.toBe(asA)
    expect(
      selectProcessedPathForActor(aspectA, aspectA.actors[0]!, emptyView),
    ).toBe(asA)
  })

  it('does not admit live edit previews into the committed cache', () => {
    const spy = vi.spyOn(glideMod, 'applyGlide')
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording: makeRecording(80),
          glide: 0.8,
        }),
      ],
    })
    const preview = copyPath(project.actors[0]!.recording!.samples)
    const sizeBefore = getProcessedPathCacheStats().size

    selectProcessedPathForActor(project, project.actors[0]!, {
      ...emptyView,
      editPreview: preview,
    })
    selectProcessedPathForActor(project, project.actors[0]!, {
      ...emptyView,
      editPreview: preview,
    })
    expect(spy.mock.calls.length).toBe(2)
    expect(getProcessedPathCacheStats().size).toBe(sizeBefore)
    spy.mockRestore()
  })

  it('benchmark: 8 actors × 2400 samples × 60 frames (cold vs warm, Glide on)', () => {
    const actors = Array.from({ length: 8 }, (_, i) =>
      makeActor({
        id: `g${i}`,
        recording: makeRecording(2400),
        smoothing: 0,
        steadySpeed: 0.2,
        glide: 0.75,
      }),
    )
    const project = makeProject({ actors })
    const spy = vi.spyOn(glideMod, 'applyGlide')
    const frames = 60

    // Legacy baseline: re-run applyGlide on every lookup (pre-cache behavior).
    const steadyOnce = project.actors.map((actor) =>
      selectProcessedPathForActor(
        project,
        { ...actor, glide: 0 },
        emptyView,
      ),
    )
    spy.mockClear()
    const legacyColdStart = performance.now()
    for (const base of steadyOnce) {
      glideMod.applyGlide(base, 0.75, project.stageAspect)
    }
    const legacyColdMs = performance.now() - legacyColdStart
    const legacyWarmStart = performance.now()
    for (let f = 0; f < frames; f++) {
      for (const base of steadyOnce) {
        glideMod.applyGlide(base, 0.75, project.stageAspect)
      }
    }
    const legacyWarmMs = performance.now() - legacyWarmStart
    const legacyWarmCalls = spy.mock.calls.length - 8

    resetProcessedPathCache()
    spy.mockClear()

    const coldStart = performance.now()
    const coldPaths = project.actors.map((actor) =>
      selectProcessedPathForActor(project, actor, emptyView),
    )
    const coldMs = performance.now() - coldStart
    const coldGlideCalls = spy.mock.calls.length
    expect(coldGlideCalls).toBe(8)

    const warmStart = performance.now()
    for (let f = 0; f < frames; f++) {
      const head = f / (frames - 1)
      for (let ai = 0; ai < project.actors.length; ai++) {
        const actor = project.actors[ai]!
        // Mimic CanvasStage: one path select shared by position + facing.
        const path = selectProcessedPathForActor(project, actor, emptyView)
        selectActorPositionForActor(
          project,
          actor,
          head,
          { x: 0.5, y: 0.5 },
          'playing',
          emptyView,
          false,
        )
        expect(path).toBe(coldPaths[ai]!)
      }
    }
    const warmMs = performance.now() - warmStart
    const warmGlideCalls = spy.mock.calls.length - coldGlideCalls
    expect(warmGlideCalls).toBe(0)
    expect(legacyWarmCalls).toBe(8 * frames)

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'glide-path-cache-8x2400x60',
        legacy: {
          coldMs: Number(legacyColdMs.toFixed(3)),
          warmMs: Number(legacyWarmMs.toFixed(3)),
          warmGlideCalls: legacyWarmCalls,
        },
        cached: {
          coldMs: Number(coldMs.toFixed(3)),
          warmMs: Number(warmMs.toFixed(3)),
          coldGlideCalls,
          warmGlideCalls,
        },
        warmLookups: 8 * frames,
        note: 'Measurements for comparison; not a CI timing gate.',
      }),
    )

    spy.mockRestore()
  })
})
