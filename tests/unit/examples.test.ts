import { beforeEach, describe, expect, it } from 'vitest'
import { projectToLocal } from '../../src/core/clip'
import { evaluate } from '../../src/core/playback'
import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { evaluateTransform } from '../../src/core/transform'
import { EXAMPLE_CATALOG } from '../../src/examples/catalog'
import {
  cloneExampleProject,
  loadExampleSnapshot,
} from '../../src/examples/load'
import { projectHasMeaningfulWork } from '../../src/examples/meaningfulWork'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'
import { createEmptyPersistableProject } from '../../src/core/persist/document'
import { EXAMPLE_STAGE_ASPECT } from '../../src/examples/buildScenes'

describe('starter examples', () => {
  beforeEach(() => {
    const empty = createEmptyPersistableProject()
    useEditorStore.setState({
      project: empty,
      selectedActorId: empty.actors[0].id,
      mode: 'idle',
      playbackHead: 0,
      actorEditOrder: [],
      actorEditRedoOrder: [],
      transformUndoStack: [],
      clipUndoStack: [],
    })
  })

  it('validates every catalog scene through the persist import path', () => {
    for (const example of EXAMPLE_CATALOG) {
      const loaded = loadExampleSnapshot(example.id)
      expect(loaded.ok, example.id).toBe(true)
      if (!loaded.ok) continue
      expect(loaded.snapshot.project.stageAspect).toBeCloseTo(
        EXAMPLE_STAGE_ASPECT,
        5,
      )
      expect(
        loaded.snapshot.project.actors.some((a) => !!a.recording),
      ).toBe(true)
    }
  })

  it('returns isolated clones so editing one load does not affect the next', () => {
    const a = loadExampleSnapshot('logo-entrance')
    const b = loadExampleSnapshot('logo-entrance')
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    a.snapshot.project.actors[0].name = 'Mutated'
    a.snapshot.project.actors[0].restPosition.x = 0.01
    if (a.snapshot.project.actors[0].recording) {
      a.snapshot.project.actors[0].recording.samples[0].x = 0.01
    }

    expect(b.snapshot.project.actors[0].name).toBe('Logo')
    expect(b.snapshot.project.actors[0].restPosition.x).toBeCloseTo(0.5, 5)
    expect(b.snapshot.project.actors[0].recording?.samples[0].x).toBeCloseTo(
      0.5,
      5,
    )

    // Fresh build matches the untouched second load.
    const again = cloneExampleProject(
      EXAMPLE_CATALOG.find((e) => e.id === 'logo-entrance')!.build(),
    )
    expect(again.actors[0].name).toBe('Logo')
  })

  it('detects meaningful work beyond recordings', () => {
    const blank = createEmptyPersistableProject()
    expect(projectHasMeaningfulWork(blank)).toBe(false)

    const recolored = makeProject({
      actors: [
        makeActor({
          recording: null,
          appearance: {
            kind: 'shape',
            width: 0.12,
            height: 0.12,
            borderRadius: 0.28,
            color: '#112233',
            image: null,
          },
        }),
      ],
    })
    expect(projectHasMeaningfulWork(recolored)).toBe(true)

    const multi = makeProject({
      actors: [
        makeActor({ id: 'a', recording: null }),
        makeActor({ id: 'b', recording: null }),
      ],
    })
    expect(projectHasMeaningfulWork(multi)).toBe(true)

    const recorded = makeProject({
      actors: [makeActor({ recording: makeRecording() })],
    })
    expect(projectHasMeaningfulWork(recorded)).toBe(true)
  })

  it('orbit endpoints and transforms match at the loop boundary', () => {
    const loaded = loadExampleSnapshot('orbit')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const project = loaded.snapshot.project
    const sat = project.actors.find((a) => a.id === 'ex-sat')!
    const path = selectProcessedPathForActor(project, sat, {
      geometryEdit: null,
      editSession: null,
      editPreview: null,
    })
    expect(path.length).toBeGreaterThan(2)
    const start = evaluate(path, 0)
    const end = evaluate(path, 1)
    expect(start.x).toBeCloseTo(end.x, 5)
    expect(start.y).toBeCloseTo(end.y, 5)

    const xf0 = evaluateTransform(sat.transform, projectToLocal(0, sat.clip))
    const xf1 = evaluateTransform(sat.transform, projectToLocal(1, sat.clip))
    // 0° and 360° are equivalent orientations for a repeat loop.
    expect(xf0.rotationDeg % 360).toBeCloseTo(xf1.rotationDeg % 360, 5)
    expect(xf0.scale).toBeCloseTo(xf1.scale, 5)
  })

  it('loads into the store with authored aspect and clears history', () => {
    useEditorStore.setState({
      transformUndoStack: [
        { keyframes: [{ id: 'x', t: 0, rotationDeg: 1, scale: 1 }] },
      ],
      clipUndoStack: [{ start: 0.1, end: 0.9 }],
      actorEditOrder: ['transform', 'clip'],
      playbackHead: 0.7,
    })
    const loaded = loadExampleSnapshot('follow-the-leader')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    useEditorStore.getState().applyPersistedSnapshot(loaded.snapshot)
    const state = useEditorStore.getState()
    expect(state.project.actors).toHaveLength(3)
    expect(state.project.stageAspect).toBeCloseTo(EXAMPLE_STAGE_ASPECT, 5)
    expect(state.playbackHead).toBe(0)
    expect(state.transformUndoStack).toEqual([])
    expect(state.clipUndoStack).toEqual([])
    expect(state.actorEditOrder).toEqual([])
    expect(state.mode).toBe('idle')
  })

  it('exports CSS/HTML-ready snapshots like user projects', () => {
    const loaded = loadExampleSnapshot('logo-entrance')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const snap = buildSnapshot(loaded.snapshot.project, null)
    const raw = serializeSnapshot(snap)
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0].appearance.kind).toBe('image')
  })
})
