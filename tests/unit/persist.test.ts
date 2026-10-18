import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportCssFromRecording } from '../../src/core/export/css'
import { findActor } from '../../src/core/sceneActor'
import {
  MAX_PROJECT_JSON_CHARS,
  PERSIST_FORMAT_VERSION,
  STORAGE_KEY,
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
  serializeSnapshotForDownload,
  validateSnapshot,
} from '../../src/core/persist/document'
import { MAX_ACTORS } from '../../src/core/sceneActor'
import {
  createMemoryStorage,
  loadStoredSnapshot,
  writeStoredSnapshot,
} from '../../src/core/persist/storage'
import type { GeometryEdit, MotionSample, Project } from '../../src/core/types'
import {
  createPersistenceController,
  isSliderOnlyChange,
  pickPersistable,
  setAppPersistenceControllerForTests,
} from '../../src/lib/persistenceController'
import { selectProcessedPath } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import {
  makeActor,
  makeProject,
  makeRecording,
  makeSamples,
} from './helpers/project'

function legacyProjectFrom(base: Project) {
  const actor = base.actors[0]
  return {
    version: 1 as const,
    actor: actor.appearance,
    recording: actor.recording,
    playback: {
      durationMs: base.playback.durationMs,
      smoothing: actor.smoothing,
      steadySpeed: actor.steadySpeed,
      loop: base.playback.loop,
      loopMode: base.playback.loopMode,
    },
    stageAspect: base.stageAspect,
    transform: actor.transform,
  }
}

function makePersistProject(overrides?: Partial<Project>): Project {
  return makeProject({
    actors: [
      makeActor({
        steadySpeed: 0.2,
        recording: makeRecording(),
        ...(overrides?.actors?.[0] ?? {}),
      }),
    ],
    playback: {
      durationMs: 1200,
      loop: true,
      loopMode: 'repeat',
      ...(overrides?.playback ?? {}),
    },
    stageAspect: overrides?.stageAspect ?? 1.6,
    ...(overrides?.actors ? { actors: overrides.actors } : {}),
  })
}

function resetStore(
  project: Project = makePersistProject(),
  geometryEdit: GeometryEdit | null = null,
) {
  const actors =
    geometryEdit != null
      ? project.actors.map((a, i) =>
          i === 0 ? { ...a, geometryEdit } : a,
        )
      : project.actors
  const projectWithGeo = { ...project, actors }
  const first = projectWithGeo.actors[0]
  useEditorStore.setState({
    workspace: 'editing',
    project: projectWithGeo,
    selectedActorId: first.id,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0.7,
    playbackDirection: 1,
    playbackEpoch: 0,
    livePosition: { x: 0.2, y: 0.4 },
    liveTrail: [{ x: 0.1, y: 0.1 }],
    showPathComparison: true,
    geometryEdit: geometryEdit
      ? {
          bakedSmoothing: geometryEdit.bakedSmoothing,
          samples: geometryEdit.samples.map((s) => ({ ...s })),
        }
      : null,
    editSession: geometryEdit
      ? {
          bakedSmoothing: geometryEdit.bakedSmoothing,
          samples: geometryEdit.samples.map((s) => ({ ...s })),
        }
      : null,
    undoStack: [makeSamples(5)],
    redoStack: [makeSamples(5)],
    selectedHandleIndex: 3,
    editPreview: makeSamples(5),
    selectedTransformId: null,
    transformUndoStack: [],
    transformRedoStack: [],
    clipUndoStack: [],
    clipRedoStack: [],
    actorEditOrder: [],
    actorEditRedoOrder: [],
    stageHint: 'default',
    actionAnnouncement: null,
  })
}

describe('persist document validation', () => {
  it('round-trips a project with playback settings', () => {
    const project = makePersistProject()
    const snapshot = buildSnapshot(project, null, '2026-01-01T00:00:00.000Z')
    const raw = serializeSnapshot(snapshot)
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(parsed.snapshot.project.playback).toEqual(project.playback)
    expect(parsed.snapshot.project.actors[0].recording?.samples).toHaveLength(
      project.actors[0].recording!.samples.length,
    )
  })

  it('round-trips committed geometry edits', () => {
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.35,
      samples: makeSamples(16).map((s) => ({ ...s, y: s.y + 0.1 })),
    }
    const project = makePersistProject({
      actors: [makeActor({ geometryEdit, recording: makeRecording() })],
    })
    const snapshot = buildSnapshot(project, null)
    const parsed = parseSnapshotJson(serializeSnapshot(snapshot))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0].geometryEdit?.samples[0].y).toBeCloseTo(
      geometryEdit.samples[0].y,
      5,
    )
  })

  it('rejects malformed JSON and incomplete objects', () => {
    expect(parseSnapshotJson('{').ok).toBe(false)
    expect(validateSnapshot(null).ok).toBe(false)
    expect(validateSnapshot({ formatVersion: 1 }).ok).toBe(false)
    expect(
      validateSnapshot({
        formatVersion: 1,
        savedAt: 'x',
        project: { version: 1 },
        geometryEdit: null,
      }).ok,
    ).toBe(false)
  })

  it('rejects unsupported format versions', () => {
    const project = makePersistProject()
    const snapshot = buildSnapshot(project, null)
    const result = validateSnapshot({ ...snapshot, formatVersion: 99 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Unsupported project format version 99/)
  })

  it('defaults missing loopMode to repeat for older projects', () => {
    const base = makePersistProject()
    const legacy = legacyProjectFrom(base)
    const { loopMode: _ignored, ...playbackWithoutMode } = legacy.playback
    void _ignored
    const result = validateSnapshot({
      formatVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        ...legacy,
        playback: playbackWithoutMode,
      },
      geometryEdit: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.project.playback.loopMode).toBe('repeat')
  })

  it('migrates format v1 projects to stageAspect 16/10 without rewriting samples', () => {
    const base = makePersistProject()
    const legacy = legacyProjectFrom(base)
    const { stageAspect: _drop, ...projectWithoutAspect } = legacy
    void _drop
    const result = validateSnapshot({
      formatVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: projectWithoutAspect,
      geometryEdit: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(result.snapshot.project.stageAspect).toBeCloseTo(1.6, 5)
    expect(result.snapshot.project.actors[0].recording?.samples).toEqual(
      base.actors[0].recording?.samples,
    )
  })

  it('rejects geometryEdit without a recording', () => {
    const result = validateSnapshot({
      formatVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        recording: null,
        playback: {
          durationMs: 1200,
          smoothing: 0.35,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
        stageAspect: 1.6,
        transform: { keyframes: [] },
      },
      geometryEdit: {
        bakedSmoothing: 0.2,
        samples: makeSamples(8),
      },
    })
    expect(result.ok).toBe(false)
  })
})

describe('persist storage failures', () => {
  it('surfaces write failures without throwing', () => {
    const adapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    }
    const result = writeStoredSnapshot(
      adapter,
      buildSnapshot(makePersistProject(), null),
    )
    expect(result).toEqual({ status: 'error', error: 'quota' })
  })

  it('keeps invalid stored raw data and reports invalid', () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: '{"formatVersion":99,"savedAt":"x"}',
    })
    const loaded = loadStoredSnapshot(storage)
    expect(loaded.status).toBe('invalid')
    if (loaded.status !== 'invalid') return
    expect(loaded.raw).toContain('formatVersion')
    // Original slot still present
    expect(storage.getItem(STORAGE_KEY)).toContain('formatVersion')
  })
})

describe('persistence controller', () => {
  afterEach(() => {
    setAppPersistenceControllerForTests(null)
    vi.useRealTimers()
  })

  beforeEach(() => {
    resetStore()
  })

  it('restores persistable fields and clears transient UI state', () => {
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.35,
      samples: makeSamples(12).map((s) => ({ ...s, x: Math.min(1, s.x + 0.05) })),
    }
    const project = makePersistProject({
      actors: [makeActor({ geometryEdit, steadySpeed: 0.2, recording: makeRecording() })],
    })
    const snapshot = buildSnapshot(project, null)
    const storage = createMemoryStorage({
      [STORAGE_KEY]: serializeSnapshot(snapshot),
    })

    resetStore(
      makePersistProject({
        actors: [makeActor({ recording: null })],
      }),
      null,
    )

    const controller = createPersistenceController(storage)
    controller.restoreOnStartup()

    const state = useEditorStore.getState()
    expect(state.mode).toBe('idle')
    expect(state.playbackHead).toBe(0)
    expect(state.liveTrail).toEqual([])
    expect(state.undoStack).toEqual([])
    expect(state.redoStack).toEqual([])
    expect(state.selectedHandleIndex).toBeNull()
    expect(state.editPreview).toBeNull()
    expect(state.editSession).toBeNull()
    expect(state.project.playback.loop).toBe(true)
    expect(state.project.actors[0].steadySpeed).toBe(0.2)
    expect(state.geometryEdit?.samples[0].x).toBeCloseTo(
      geometryEdit.samples[0].x,
      5,
    )
    expect(controller.getStatus()).toBe('saved')
    expect(state.workspace).toBe('editing')
    expect(state.project.name).toBe('Test project')
    controller.dispose()
  })

  it('preserves playback/export consistency after restore', () => {
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.35,
      samples: makeSamples(18).map((s) => ({ ...s, y: 0.55 })),
    }
    const project = makePersistProject({
      actors: [
        makeActor({
          geometryEdit,
          steadySpeed: 0.2,
          recording: makeRecording(),
        }),
      ],
    })
    const actor = project.actors[0]
    const beforePath = selectProcessedPath(
      project,
      { geometryEdit, editSession: null, editPreview: null },
      actor.id,
    )
    const beforeCss = exportCssFromRecording({
      samples: actor.recording!.samples,
      smoothing: actor.smoothing,
      steadySpeed: actor.steadySpeed,
      durationMs: project.playback.durationMs,
      actor: actor.appearance,
      processedPath: beforePath,
    })

    const storage = createMemoryStorage({
      [STORAGE_KEY]: serializeSnapshot(buildSnapshot(project, null)),
    })
    resetStore(
      makePersistProject({
        actors: [makeActor({ recording: null })],
      }),
    )
    const controller = createPersistenceController(storage)
    controller.restoreOnStartup()

    const state = useEditorStore.getState()
    const restored = findActor(state.project.actors, state.selectedActorId)!
    const afterPath = selectProcessedPath(state.project, {
      geometryEdit: state.geometryEdit,
      editSession: null,
      editPreview: null,
    })
    const afterCss = exportCssFromRecording({
      samples: restored.recording!.samples,
      smoothing: restored.smoothing,
      steadySpeed: restored.steadySpeed,
      durationMs: state.project.playback.durationMs,
      actor: restored.appearance,
      processedPath: afterPath,
    })

    expect(afterCss).toBe(beforeCss)
    controller.dispose()
  })

  it('does not overwrite quarantined invalid data on later edits', () => {
    const bad = '{"formatVersion":99,"savedAt":"nope"}'
    const storage = createMemoryStorage({ [STORAGE_KEY]: bad })
    resetStore(
      makePersistProject({
        actors: [makeActor({ recording: null })],
      }),
    )
    const controller = createPersistenceController(storage)
    controller.restoreOnStartup()
    expect(controller.getStatus()).toBe('restore-error')
    expect(controller.isSaveBlocked()).toBe(true)
    expect(useEditorStore.getState().workspace).toBe('welcome')

    // Enter an intentional project; quarantine still blocks writes.
    expect(useEditorStore.getState().createNamedProject('Recovered')).toBe(true)
    useEditorStore.getState().finishRecording(makeRecording())
    expect(storage.getItem(STORAGE_KEY)).toBe(bad)

    controller.discardStoredAndUnblock()
    expect(controller.isSaveBlocked()).toBe(false)
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy()
    expect(storage.getItem(STORAGE_KEY)).not.toBe(bad)
    controller.dispose()
  })

  it('reports save-error when storage writes fail', () => {
    const adapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => undefined,
    }
    resetStore(
      makePersistProject({
        actors: [makeActor({ recording: null })],
      }),
    )
    const controller = createPersistenceController(adapter)
    controller.restoreOnStartup()
    expect(useEditorStore.getState().createNamedProject('Quota')).toBe(true)
    useEditorStore.getState().finishRecording(makeRecording())
    expect(controller.getStatus()).toBe('save-error')
    controller.dispose()
  })

  it('debounces slider updates but saves recording completion immediately', () => {
    vi.useFakeTimers()
    const storage = createMemoryStorage()
    resetStore(
      makePersistProject({
        actors: [makeActor({ recording: null })],
      }),
    )
    const controller = createPersistenceController(storage)
    controller.restoreOnStartup()
    expect(useEditorStore.getState().createNamedProject('Debounce')).toBe(true)

    useEditorStore.getState().finishRecording(makeRecording())
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy()

    const afterRecord = storage.getItem(STORAGE_KEY)!
    useEditorStore.getState().setDurationMs(2000)
    expect(storage.getItem(STORAGE_KEY)).toBe(afterRecord)

    vi.advanceTimersByTime(349)
    expect(storage.getItem(STORAGE_KEY)).toBe(afterRecord)
    vi.advanceTimersByTime(2)
    const afterSlider = storage.getItem(STORAGE_KEY)!
    expect(afterSlider).not.toBe(afterRecord)
    expect(afterSlider).toContain('"durationMs": 2000')
    controller.dispose()
  })

  it('skips serialization and storage writes on playhead-only updates', () => {
    const storage = createMemoryStorage()
    const setItemSpy = vi.spyOn(storage, 'setItem')
    resetStore(
      makePersistProject({
        actors: [makeActor({ recording: makeRecording() })],
      }),
    )
    const controller = createPersistenceController(storage)
    controller.restoreOnStartup()
    expect(useEditorStore.getState().createNamedProject('Playhead')).toBe(true)
    useEditorStore.getState().finishRecording(makeRecording())
    setItemSpy.mockClear()

    const stringifySpy = vi.spyOn(JSON, 'stringify')
    const beforeCalls = stringifySpy.mock.calls.length

    useEditorStore.getState().setPlaybackHead(0.33)
    useEditorStore.getState().setPlaybackDirection(-1)
    useEditorStore.getState().setPlaybackSample(0.8, 1)

    // No new project fingerprints / writes from playhead traffic.
    expect(setItemSpy).not.toHaveBeenCalled()
    const projectStringifies = stringifySpy.mock.calls.filter((args) => {
      const first = args[0]
      return (
        first &&
        typeof first === 'object' &&
        'project' in (first as object)
      )
    })
    expect(projectStringifies.length).toBe(0)
    expect(stringifySpy.mock.calls.length).toBe(beforeCalls)

    stringifySpy.mockRestore()

    // Real edits still save.
    useEditorStore.getState().setLoop(true)
    expect(setItemSpy).toHaveBeenCalled()
    controller.dispose()
  })

  it('empty storage stays on welcome and does not persist a blank project', () => {
    const storage = createMemoryStorage()
    const controller = createPersistenceController(storage)
    controller.restoreOnStartup()
    expect(useEditorStore.getState().workspace).toBe('welcome')
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    expect(controller.getStatus()).toBe('idle')
    controller.dispose()
  })
})

describe('slider change detection', () => {
  it('detects duration/smoothing/steadySpeed-only changes', () => {
    const base = pickPersistable({ project: makePersistProject() })
    const slid = pickPersistable({
      project: {
        ...base.project,
        playback: { ...base.project.playback, durationMs: 2400 },
        actors: base.project.actors.map((a, i) =>
          i === 0 ? { ...a, smoothing: 0.1 } : a,
        ),
      },
    })
    expect(isSliderOnlyChange(base, slid)).toBe(true)

    const looped = pickPersistable({
      project: {
        ...base.project,
        playback: { ...base.project.playback, loop: !base.project.playback.loop },
      },
    })
    expect(isSliderOnlyChange(base, looped)).toBe(false)
  })

  it('debounces actor appearance-only changes', () => {
    const base = pickPersistable({ project: makePersistProject() })
    const recolored = pickPersistable({
      project: {
        ...base.project,
        actors: base.project.actors.map((a, i) =>
          i === 0
            ? {
                ...a,
                appearance: {
                  ...a.appearance,
                  color: '#112233',
                  width: 0.2,
                  height: 0.2,
                },
              }
            : a,
        ),
      },
    })
    expect(isSliderOnlyChange(base, recolored)).toBe(true)
  })
})

describe('store applyPersistedSnapshot / newProject', () => {
  beforeEach(() => {
    resetStore()
  })

  it('newProject clears animation and restores defaults without touching Reset semantics separately', () => {
    useEditorStore.getState().setDurationMs(3000)
    useEditorStore.getState().setLoop(true)
    useEditorStore.getState().newProject()
    const state = useEditorStore.getState()
    expect(state.project.actors[0].recording).toBeNull()
    expect(state.project.playback.durationMs).toBe(1200)
    expect(state.project.playback.loop).toBe(false)
    expect(state.geometryEdit).toBeNull()
    expect(state.mode).toBe('idle')
    expect(state.stageHint).toBe('new-project')
    expect(state.actionAnnouncement).toBe(
      'Created “Untitled project”. You can start drawing.',
    )
  })

  it('Reset still only clears the recording, keeping playback settings', () => {
    useEditorStore.getState().setDurationMs(3000)
    useEditorStore.getState().setLoop(true)
    useEditorStore.getState().resetRecording()
    const state = useEditorStore.getState()
    expect(state.project.actors[0].recording).toBeNull()
    expect(state.project.playback.durationMs).toBe(3000)
    expect(state.project.playback.loop).toBe(true)
  })
})

describe('multi-actor persist reliability', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  it('migrates v2–v4 legacy projects preserving appearance, motion, edits, transform, duration, and loop', () => {
    const samples = makeSamples(12)
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.4,
      samples: samples.map((s) => ({ ...s, x: s.x + 0.05 })),
    }
    const transform = {
      keyframes: [
        { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
        { id: 'k1', t: 1, rotationDeg: 180, scale: 1.25 },
      ],
    }
    const actor = {
      kind: 'shape' as const,
      width: 0.18,
      height: 0.18,
      borderRadius: 0.25,
      color: '#0f766e',
      image: null,
    }

    for (const formatVersion of [2, 3, 4] as const) {
      const result = validateSnapshot({
        formatVersion,
        savedAt: '2026-01-01T00:00:00.000Z',
        project: {
          version: 1,
          actor,
          recording: { samples, recordedDurationMs: samples[samples.length - 1].t },
          playback: {
            durationMs: 2400,
            smoothing: 0.55,
            steadySpeed: 0.3,
            loop: true,
            loopMode: 'alternate',
          },
          stageAspect: 1.6,
          ...(formatVersion >= 4 ? { transform } : {}),
        },
        geometryEdit: formatVersion >= 2 ? geometryEdit : null,
      })
      expect(result.ok, `format ${formatVersion}`).toBe(true)
      if (!result.ok) return
      const migrated = result.snapshot.project
      expect(migrated.actors).toHaveLength(1)
      expect(migrated.actors[0].appearance.color).toBe('#0f766e')
      expect(migrated.actors[0].appearance.width).toBeCloseTo(0.18)
      expect(migrated.actors[0].recording?.samples).toEqual(samples)
      expect(migrated.actors[0].smoothing).toBeCloseTo(0.55)
      expect(migrated.actors[0].steadySpeed).toBeCloseTo(0.3)
      expect(migrated.actors[0].geometryEdit?.samples[0].x).toBeCloseTo(
        geometryEdit.samples[0].x,
        5,
      )
      expect(migrated.playback.durationMs).toBe(2400)
      expect(migrated.playback.loop).toBe(true)
      expect(migrated.playback.loopMode).toBe('alternate')
      if (formatVersion >= 4) {
        expect(migrated.actors[0].transform.keyframes).toHaveLength(2)
        expect(migrated.actors[0].transform.keyframes[1].rotationDeg).toBe(180)
      } else {
        expect(migrated.actors[0].transform.keyframes).toEqual([])
      }
    }
  })

  it('deduplicates shared image bytes on download and restores them on import', () => {
    const image = {
      mimeType: 'image/png' as const,
      dataUrl: PNG,
      naturalWidth: 1,
      naturalHeight: 1,
      label: 'Shared',
    }
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          name: 'One',
          appearance: {
            kind: 'image',
            width: 0.2,
            height: 0.1,
            borderRadius: 0,
            color: '#000000',
            image,
          },
        }),
        makeActor({
          id: 'b',
          name: 'Two',
          appearance: {
            kind: 'image',
            width: 0.1,
            height: 0.2,
            borderRadius: 0,
            color: '#000000',
            image: { ...image },
          },
        }),
      ],
    })
    const raw = serializeSnapshotForDownload(buildSnapshot(project, null))
    expect(raw.split(PNG).length - 1).toBe(1)
    const wire = JSON.parse(raw) as {
      assets: Record<string, { dataUrl: string }>
      project: {
        actors: Array<{ appearance: { image: { assetId?: string } } }>
      }
    }
    expect(Object.keys(wire.assets)).toHaveLength(1)
    const assetId = Object.keys(wire.assets)[0]
    expect(wire.project.actors[0].appearance.image.assetId).toBe(assetId)
    expect(wire.project.actors[1].appearance.image.assetId).toBe(assetId)

    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0].appearance.image?.dataUrl).toBe(PNG)
    expect(parsed.snapshot.project.actors[1].appearance.image?.dataUrl).toBe(PNG)
  })

  it('rejects duplicate actor ids and missing asset references without accepting the snapshot', () => {
    const base = makePersistProject()
    const a = makeActor({ id: 'same', name: 'A' })
    const b = makeActor({ id: 'same', name: 'B' })
    const dup = validateSnapshot({
      formatVersion: PERSIST_FORMAT_VERSION,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: { ...base, actors: [a, b] },
    })
    expect(dup.ok).toBe(false)
    if (dup.ok) return
    expect(dup.error).toMatch(/Duplicate actor id/)

    const missing = validateSnapshot({
      formatVersion: PERSIST_FORMAT_VERSION,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        ...base,
        actors: [
          {
            ...a,
            id: 'img-actor',
            appearance: {
              kind: 'image',
              width: 0.2,
              height: 0.2,
              borderRadius: 0,
              color: '#111111',
              image: { assetId: 'missing-img' },
            },
          },
        ],
      },
      assets: {},
    })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.error).toMatch(/missing assets\[missing-img\]/)
  })

  it('enforces actor count and project JSON size limits', () => {
    const actors = Array.from({ length: MAX_ACTORS + 1 }, (_, i) =>
      makeActor({ id: `a${i}`, name: `A${i}` }),
    )
    const tooMany = validateSnapshot({
      formatVersion: PERSIST_FORMAT_VERSION,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: { ...makePersistProject(), actors },
    })
    expect(tooMany.ok).toBe(false)
    if (tooMany.ok) return
    expect(tooMany.error).toMatch(new RegExp(`maximum is ${MAX_ACTORS}`))

    const oversized = 'x'.repeat(MAX_PROJECT_JSON_CHARS + 1)
    const parsed = parseSnapshotJson(oversized)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/too large/)
  })
})
