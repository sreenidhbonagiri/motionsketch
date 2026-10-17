import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportCssFromRecording } from '../../src/core/export/css'
import {
  PERSIST_FORMAT_VERSION,
  STORAGE_KEY,
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
  validateSnapshot,
} from '../../src/core/persist/document'
import {
  createMemoryStorage,
  loadStoredSnapshot,
  writeStoredSnapshot,
} from '../../src/core/persist/storage'
import type { GeometryEdit, MotionSample, Project, Recording } from '../../src/core/types'
import {
  createPersistenceController,
  isSliderOnlyChange,
  pickPersistable,
  setAppPersistenceControllerForTests,
} from '../../src/lib/persistenceController'
import { selectProcessedPath } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'

function makeSamples(count = 20): MotionSample[] {
  return Array.from({ length: count }, (_, i) => ({
    t: i * 40,
    x: 0.2 + i * 0.02,
    y: 0.4 + (i % 3) * 0.01,
  }))
}

function makeRecording(): Recording {
  const samples = makeSamples()
  return {
    samples,
    recordedDurationMs: samples[samples.length - 1].t,
  }
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    version: 1,
    actor: {
      kind: 'shape',
      width: 0.12,
      height: 0.12,
      borderRadius: 0.28,
      color: '#4f46e5',
      image: null,
    },
    recording: makeRecording(),
    playback: {
      durationMs: 1200,
      smoothing: 0.35,
      steadySpeed: 0.2,
      loop: true,
      loopMode: 'repeat',
    },
    stageAspect: 1.6,
    ...overrides,
  }
}

function resetStore(project: Project = makeProject(), geometryEdit: GeometryEdit | null = null) {
  useEditorStore.setState({
    project,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0.7,
    playbackDirection: 1,
    playbackEpoch: 0,
    livePosition: { x: 0.2, y: 0.4 },
    liveTrail: [{ x: 0.1, y: 0.1 }],
    showPathComparison: true,
    geometryEdit,
    editSession: geometryEdit
      ? { ...geometryEdit, samples: geometryEdit.samples.map((s) => ({ ...s })) }
      : null,
    undoStack: [makeSamples(5)],
    redoStack: [makeSamples(5)],
    selectedHandleIndex: 3,
    editPreview: makeSamples(5),
    stageHint: 'default',
    actionAnnouncement: null,
  })
}

describe('persist document validation', () => {
  it('round-trips a project with playback settings', () => {
    const project = makeProject()
    const snapshot = buildSnapshot(project, null, '2026-01-01T00:00:00.000Z')
    const raw = serializeSnapshot(snapshot)
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(parsed.snapshot.project.playback).toEqual(project.playback)
    expect(parsed.snapshot.project.recording?.samples).toHaveLength(
      project.recording!.samples.length,
    )
  })

  it('round-trips committed geometry edits', () => {
    const project = makeProject()
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.35,
      samples: makeSamples(16).map((s) => ({ ...s, y: s.y + 0.1 })),
    }
    const snapshot = buildSnapshot(project, geometryEdit)
    const parsed = parseSnapshotJson(serializeSnapshot(snapshot))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.geometryEdit?.samples[0].y).toBeCloseTo(
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
    const project = makeProject()
    const snapshot = buildSnapshot(project, null)
    const result = validateSnapshot({ ...snapshot, formatVersion: 99 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Unsupported project format version 99/)
  })

  it('defaults missing loopMode to repeat for older projects', () => {
    const project = makeProject()
    const { loopMode: _ignored, ...playbackWithoutMode } = project.playback
    void _ignored
    const result = validateSnapshot({
      formatVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        ...project,
        playback: playbackWithoutMode,
      },
      geometryEdit: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.project.playback.loopMode).toBe('repeat')
  })

  it('migrates format v1 projects to stageAspect 16/10 without rewriting samples', () => {
    const project = makeProject()
    const { stageAspect: _drop, ...projectWithoutAspect } = project
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
    expect(result.snapshot.project.recording?.samples).toEqual(
      project.recording?.samples,
    )
  })

  it('rejects geometryEdit without a recording', () => {
    const snapshot = buildSnapshot(makeProject({ recording: null }), {
      bakedSmoothing: 0.2,
      samples: makeSamples(8),
    })
    const result = validateSnapshot(snapshot)
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
      buildSnapshot(makeProject(), null),
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
    const project = makeProject()
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.35,
      samples: makeSamples(12).map((s) => ({ ...s, x: Math.min(1, s.x + 0.05) })),
    }
    const snapshot = buildSnapshot(project, geometryEdit)
    const storage = createMemoryStorage({
      [STORAGE_KEY]: serializeSnapshot(snapshot),
    })

    // Dirty transient state before restore
    resetStore(makeProject({ recording: null }), null)

    const controller = createPersistenceController({ storage, debounceMs: 20 })
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
    expect(state.project.playback.steadySpeed).toBe(0.2)
    expect(state.geometryEdit?.samples[0].x).toBeCloseTo(
      geometryEdit.samples[0].x,
      5,
    )
    expect(controller.getStatus()).toBe('saved')
    controller.dispose()
  })

  it('preserves playback/export consistency after restore', () => {
    const project = makeProject()
    const geometryEdit: GeometryEdit = {
      bakedSmoothing: 0.35,
      samples: makeSamples(18).map((s) => ({ ...s, y: 0.55 })),
    }
    const beforePath = selectProcessedPath(project, { geometryEdit, editSession: null, editPreview: null })
    const beforeCss = exportCssFromRecording({
      samples: project.recording!.samples,
      smoothing: project.playback.smoothing,
      steadySpeed: project.playback.steadySpeed,
      durationMs: project.playback.durationMs,
      actor: project.actor,
      processedPath: beforePath,
    })

    const storage = createMemoryStorage({
      [STORAGE_KEY]: serializeSnapshot(buildSnapshot(project, geometryEdit)),
    })
    resetStore(makeProject({ recording: null }))
    const controller = createPersistenceController({ storage })
    controller.restoreOnStartup()

    const state = useEditorStore.getState()
    const afterPath = selectProcessedPath(state.project, {
      geometryEdit: state.geometryEdit,
      editSession: null,
      editPreview: null,
    })
    const afterCss = exportCssFromRecording({
      samples: state.project.recording!.samples,
      smoothing: state.project.playback.smoothing,
      steadySpeed: state.project.playback.steadySpeed,
      durationMs: state.project.playback.durationMs,
      actor: state.project.actor,
      processedPath: afterPath,
    })

    expect(afterCss).toBe(beforeCss)
    controller.dispose()
  })

  it('does not overwrite quarantined invalid data on later edits', () => {
    const bad = '{"formatVersion":99,"savedAt":"nope"}'
    const storage = createMemoryStorage({ [STORAGE_KEY]: bad })
    resetStore(makeProject({ recording: null }))
    const controller = createPersistenceController({ storage, debounceMs: 10 })
    controller.restoreOnStartup()
    expect(controller.getStatus()).toBe('restore-error')
    expect(controller.isSaveBlocked()).toBe(true)

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
    resetStore(makeProject({ recording: null }))
    const controller = createPersistenceController({
      storage: adapter,
      debounceMs: 5,
    })
    controller.restoreOnStartup()
    useEditorStore.getState().finishRecording(makeRecording())
    expect(controller.getStatus()).toBe('save-error')
    controller.dispose()
  })

  it('debounces slider updates but saves recording completion immediately', () => {
    vi.useFakeTimers()
    const storage = createMemoryStorage()
    resetStore(makeProject({ recording: null }))
    const controller = createPersistenceController({ storage, debounceMs: 200 })
    controller.restoreOnStartup()

    useEditorStore.getState().finishRecording(makeRecording())
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy()

    const afterRecord = storage.getItem(STORAGE_KEY)!
    useEditorStore.getState().setDurationMs(2000)
    expect(storage.getItem(STORAGE_KEY)).toBe(afterRecord)

    vi.advanceTimersByTime(199)
    expect(storage.getItem(STORAGE_KEY)).toBe(afterRecord)
    vi.advanceTimersByTime(2)
    const afterSlider = storage.getItem(STORAGE_KEY)!
    expect(afterSlider).not.toBe(afterRecord)
    expect(afterSlider).toContain('"durationMs": 2000')
    controller.dispose()
  })
})

describe('slider change detection', () => {
  it('detects duration/smoothing/steadySpeed-only changes', () => {
    const base = pickPersistable({
      project: makeProject(),
      geometryEdit: null,
    })
    const slid = pickPersistable({
      project: {
        ...base.project,
        playback: { ...base.project.playback, durationMs: 2400, smoothing: 0.1 },
      },
      geometryEdit: null,
    })
    expect(isSliderOnlyChange(base, slid)).toBe(true)

    const looped = pickPersistable({
      project: {
        ...base.project,
        playback: { ...base.project.playback, loop: !base.project.playback.loop },
      },
      geometryEdit: null,
    })
    expect(isSliderOnlyChange(base, looped)).toBe(false)
  })

  it('debounces actor appearance-only changes', () => {
    const base = pickPersistable({
      project: makeProject(),
      geometryEdit: null,
    })
    const recolored = pickPersistable({
      project: {
        ...base.project,
        actor: { ...base.project.actor, color: '#112233', width: 0.2, height: 0.2 },
      },
      geometryEdit: null,
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
    expect(state.project.recording).toBeNull()
    expect(state.project.playback.durationMs).toBe(1200)
    expect(state.project.playback.loop).toBe(false)
    expect(state.geometryEdit).toBeNull()
    expect(state.mode).toBe('idle')
    expect(state.stageHint).toBe('new-project')
    expect(state.actionAnnouncement).toBe('New project created.')
  })

  it('Reset still only clears the recording, keeping playback settings', () => {
    useEditorStore.getState().setDurationMs(3000)
    useEditorStore.getState().setLoop(true)
    useEditorStore.getState().resetRecording()
    const state = useEditorStore.getState()
    expect(state.project.recording).toBeNull()
    expect(state.project.playback.durationMs).toBe(3000)
    expect(state.project.playback.loop).toBe(true)
  })
})
