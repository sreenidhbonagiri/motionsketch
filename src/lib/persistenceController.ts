import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../core/persist/document'
import {
  clearStoredSnapshot,
  getLocalStorageAdapter,
  loadStoredSnapshot,
  writeStoredSnapshot,
  type StorageAdapter,
} from '../core/persist/storage'
import type { GeometryEdit, Project } from '../core/types'
import { downloadTextFile, stampFilename } from './download'
import { useEditorStore } from '../state/store'

export type PersistenceStatus =
  | 'idle'
  | 'saved'
  | 'save-error'
  | 'restore-error'

export type PersistenceListener = (status: PersistenceStatus) => void

const SLIDER_DEBOUNCE_MS = 350

export interface PersistableSlice {
  project: Project
  geometryEdit: GeometryEdit | null
}

export function pickPersistable(state: {
  project: Project
  geometryEdit: GeometryEdit | null
}): PersistableSlice {
  return {
    project: state.project,
    geometryEdit: state.geometryEdit,
  }
}

function persistableEqual(a: PersistableSlice, b: PersistableSlice): boolean {
  return (
    JSON.stringify({
      project: a.project,
      geometryEdit: a.geometryEdit,
    }) ===
    JSON.stringify({
      project: b.project,
      geometryEdit: b.geometryEdit,
    })
  )
}

/**
 * Debounce continuous controls: timing sliders and actor appearance.
 * Discrete changes (recording, loop, path edits) still save immediately.
 */
export function isSliderOnlyChange(
  prev: PersistableSlice,
  next: PersistableSlice,
): boolean {
  const prevAnchor = JSON.stringify({
    recording: prev.project.recording,
    loop: prev.project.playback.loop,
    loopMode: prev.project.playback.loopMode,
    version: prev.project.version,
    geometryEdit: prev.geometryEdit,
  })
  const nextAnchor = JSON.stringify({
    recording: next.project.recording,
    loop: next.project.playback.loop,
    loopMode: next.project.playback.loopMode,
    version: next.project.version,
    geometryEdit: next.geometryEdit,
  })
  if (prevAnchor !== nextAnchor) return false

  const p = prev.project.playback
  const n = next.project.playback
  const timingChanged =
    p.durationMs !== n.durationMs ||
    p.smoothing !== n.smoothing ||
    p.steadySpeed !== n.steadySpeed
  const actorChanged =
    JSON.stringify(prev.project.actor) !== JSON.stringify(next.project.actor)

  return timingChanged || actorChanged
}

export interface PersistenceController {
  getStatus: () => PersistenceStatus
  getQuarantineRaw: () => string | null
  isSaveBlocked: () => boolean
  subscribe: (listener: PersistenceListener) => () => void
  /** Load from storage and hydrate the editor store. Call once on startup. */
  restoreOnStartup: () => void
  /** Force a save of the current persistable state (respects quarantine block). */
  saveNow: () => void
  /** Clear quarantine + storage and allow future saves (after New project). */
  discardStoredAndUnblock: () => void
  /** Mark that a validated snapshot was applied and should be written. */
  afterSuccessfulReplace: () => void
  downloadCurrentProject: () => boolean
  /** Download quarantined raw bytes when restore failed (portable recovery). */
  downloadQuarantine: () => boolean
  dispose: () => void
}

export function createPersistenceController(options?: {
  storage?: StorageAdapter | null
  debounceMs?: number
}): PersistenceController {
  const storage =
    options?.storage === undefined
      ? getLocalStorageAdapter()
      : options.storage
  const debounceMs = options?.debounceMs ?? SLIDER_DEBOUNCE_MS

  let status: PersistenceStatus = 'idle'
  let quarantineRaw: string | null = null
  let saveBlocked = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastWrittenFingerprint = ''
  let disposed = false
  const listeners = new Set<PersistenceListener>()

  let unsubscribeStore: (() => void) | null = null
  let started = false
  let onFlushPending: (() => void) | null = null

  const setStatus = (next: PersistenceStatus) => {
    status = next
    for (const listener of listeners) listener(status)
  }

  const flushPending = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
    writeSlice(pickPersistable(useEditorStore.getState()))
  }

  const fingerprint = (slice: PersistableSlice) =>
    JSON.stringify({
      project: slice.project,
      geometryEdit: slice.geometryEdit,
    })

  const writeSlice = (slice: PersistableSlice) => {
    if (disposed || saveBlocked) return
    if (!storage) {
      setStatus('save-error')
      return
    }

    const snap = buildSnapshot(slice.project, slice.geometryEdit)
    const result = writeStoredSnapshot(storage, snap)
    if (result.status === 'ok') {
      lastWrittenFingerprint = fingerprint(slice)
      quarantineRaw = null
      setStatus('saved')
    } else {
      setStatus('save-error')
    }
  }

  const scheduleWrite = (slice: PersistableSlice, mode: 'immediate' | 'debounce') => {
    if (disposed || saveBlocked) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (mode === 'immediate') {
      writeSlice(slice)
      return
    }
    timer = setTimeout(() => {
      timer = null
      writeSlice(slice)
    }, debounceMs)
  }

  const onStoreChange = (
    state: ReturnType<typeof useEditorStore.getState>,
    prev: ReturnType<typeof useEditorStore.getState>,
  ) => {
    // Never persist while a take is being captured.
    if (state.mode === 'recording') return

    const next = pickPersistable(state)
    const previous = pickPersistable(prev)
    if (persistableEqual(next, previous)) return
    if (fingerprint(next) === lastWrittenFingerprint) return

    const mode = isSliderOnlyChange(previous, next) ? 'debounce' : 'immediate'
    scheduleWrite(next, mode)
  }

  return {
    getStatus: () => status,
    getQuarantineRaw: () => quarantineRaw,
    isSaveBlocked: () => saveBlocked,

    subscribe: (listener) => {
      listeners.add(listener)
      listener(status)
      return () => {
        listeners.delete(listener)
      }
    },

    restoreOnStartup: () => {
      if (disposed || started) return
      started = true

      onFlushPending = () => {
        if (document.visibilityState === 'hidden') flushPending()
      }
      document.addEventListener('visibilitychange', onFlushPending)
      window.addEventListener('pagehide', flushPending)

      if (!storage) {
        setStatus('save-error')
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      const loaded = loadStoredSnapshot(storage)
      if (loaded.status === 'empty') {
        lastWrittenFingerprint = fingerprint(
          pickPersistable(useEditorStore.getState()),
        )
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      if (loaded.status === 'error') {
        setStatus('restore-error')
        // Don't block forever on a read glitch — allow saving a fresh project.
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      if (loaded.status === 'invalid') {
        quarantineRaw = loaded.raw
        saveBlocked = true
        setStatus('restore-error')
        // Subscribe but writes stay blocked until discard / successful replace.
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      useEditorStore.getState().applyPersistedSnapshot(loaded.snapshot)
      lastWrittenFingerprint = fingerprint({
        project: loaded.snapshot.project,
        geometryEdit: loaded.snapshot.geometryEdit,
      })
      setStatus('saved')
      unsubscribeStore = useEditorStore.subscribe(onStoreChange)
    },

    saveNow: () => {
      flushPending()
      writeSlice(pickPersistable(useEditorStore.getState()))
    },

    discardStoredAndUnblock: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (storage) {
        clearStoredSnapshot(storage)
      }
      quarantineRaw = null
      saveBlocked = false
      lastWrittenFingerprint = ''
      // Persist the (typically empty) current project after New project.
      writeSlice(pickPersistable(useEditorStore.getState()))
    },

    afterSuccessfulReplace: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      quarantineRaw = null
      saveBlocked = false
      writeSlice(pickPersistable(useEditorStore.getState()))
    },

    downloadCurrentProject: () => {
      try {
        const slice = pickPersistable(useEditorStore.getState())
        const snap = buildSnapshot(slice.project, slice.geometryEdit)
        return downloadTextFile(
          serializeSnapshot(snap),
          stampFilename('motionsketch', 'json'),
          'application/json',
        )
      } catch {
        return false
      }
    },

    downloadQuarantine: () => {
      if (!quarantineRaw) return false
      return downloadTextFile(
        quarantineRaw,
        'motionsketch-unreadable.json',
        'application/json',
      )
    },

    dispose: () => {
      disposed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (onFlushPending) {
        document.removeEventListener('visibilitychange', onFlushPending)
        onFlushPending = null
      }
      window.removeEventListener('pagehide', flushPending)
      unsubscribeStore?.()
      unsubscribeStore = null
      listeners.clear()
    },
  }
}

export function importSnapshotFromText(raw: string): PersistParseResultLike {
  return parseSnapshotJson(raw)
}

type PersistParseResultLike = ReturnType<typeof parseSnapshotJson>

/** Singleton used by the app shell. Tests can create their own controllers. */
let appController: PersistenceController | null = null

export function getAppPersistenceController(): PersistenceController {
  if (!appController) {
    appController = createPersistenceController()
  }
  return appController
}

/** Test helper — replace or clear the app singleton. */
export function setAppPersistenceControllerForTests(
  controller: PersistenceController | null,
) {
  appController?.dispose()
  appController = controller
}
