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
import { captureViewportStageAspect } from '../core/stageAspect'
import { createEmptyPersistableProject } from '../core/persist/document'
import type { Project } from '../core/types'
import { downloadTextFile, stampFilename, stampProjectFilename } from './download'
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
}

export function pickPersistable(state: {
  project: Project
}): PersistableSlice {
  return {
    project: state.project,
  }
}

function persistableEqual(a: PersistableSlice, b: PersistableSlice): boolean {
  return JSON.stringify(a.project) === JSON.stringify(b.project)
}

/**
 * Debounce continuous controls: timing sliders and actor appearance.
 * Discrete changes (recording, loop, path edits, actor list) save immediately.
 */
export function isSliderOnlyChange(
  prev: PersistableSlice,
  next: PersistableSlice,
): boolean {
  const prevAnchor = JSON.stringify({
    actors: prev.project.actors.map((a) => ({
      id: a.id,
      recording: a.recording,
      transform: a.transform,
      geometryEdit: a.geometryEdit,
      name: a.name,
    })),
    loop: prev.project.playback.loop,
    loopMode: prev.project.playback.loopMode,
    version: prev.project.version,
    actorCount: prev.project.actors.length,
  })
  const nextAnchor = JSON.stringify({
    actors: next.project.actors.map((a) => ({
      id: a.id,
      recording: a.recording,
      transform: a.transform,
      geometryEdit: a.geometryEdit,
      name: a.name,
    })),
    loop: next.project.playback.loop,
    loopMode: next.project.playback.loopMode,
    version: next.project.version,
    actorCount: next.project.actors.length,
  })
  if (prevAnchor !== nextAnchor) return false

  const durationChanged =
    prev.project.playback.durationMs !== next.project.playback.durationMs
  const appearanceOrPathTuningChanged =
    JSON.stringify(
      prev.project.actors.map((a) => ({
        appearance: a.appearance,
        smoothing: a.smoothing,
        steadySpeed: a.steadySpeed,
        restPosition: a.restPosition,
      })),
    ) !==
    JSON.stringify(
      next.project.actors.map((a) => ({
        appearance: a.appearance,
        smoothing: a.smoothing,
        steadySpeed: a.steadySpeed,
        restPosition: a.restPosition,
      })),
    )

  return durationChanged || appearanceOrPathTuningChanged
}

export interface PersistenceController {
  getStatus: () => PersistenceStatus
  getQuarantineRaw: () => string | null
  isSaveBlocked: () => boolean
  subscribe: (listener: PersistenceListener) => () => void
  restoreOnStartup: () => void
  saveNow: () => void
  discardStoredAndUnblock: () => void
  afterSuccessfulReplace: () => void
  downloadCurrentProject: () => boolean
  downloadQuarantine: () => boolean
  dispose: () => void
}

let appController: PersistenceController | null = null

export function setAppPersistenceControllerForTests(
  controller: PersistenceController | null,
) {
  appController = controller
}

export function getAppPersistenceController(): PersistenceController {
  if (!appController) {
    appController = createPersistenceController()
  }
  return appController
}

export function createPersistenceController(
  storage: StorageAdapter | null = getLocalStorageAdapter(),
): PersistenceController {
  let status: PersistenceStatus = 'idle'
  let quarantineRaw: string | null = null
  let saveBlocked = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastWrittenFingerprint = ''
  let unsubscribeStore: (() => void) | null = null
  const listeners = new Set<PersistenceListener>()

  const setStatus = (next: PersistenceStatus) => {
    status = next
    for (const listener of listeners) listener(status)
  }

  const fingerprint = (slice: PersistableSlice) =>
    JSON.stringify({ project: slice.project })

  const writeSlice = (slice: PersistableSlice) => {
    if (disposed || saveBlocked) return
    if (!storage) {
      setStatus('save-error')
      return
    }

    try {
      const snap = buildSnapshot(slice.project, null)
      const result = writeStoredSnapshot(storage, snap)
      if (result.status === 'ok') {
        lastWrittenFingerprint = fingerprint(slice)
        quarantineRaw = null
        setStatus('saved')
      } else {
        setStatus('save-error')
      }
    } catch {
      setStatus('save-error')
    }
  }

  const scheduleWrite = (
    slice: PersistableSlice,
    mode: 'immediate' | 'debounce',
  ) => {
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
    }, SLIDER_DEBOUNCE_MS)
  }

  const flushPending = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      writeSlice(pickPersistable(useEditorStore.getState()))
    }
  }

  const onStoreChange = (
    state: { project: Project; workspace?: string },
    prev: { project: Project; workspace?: string },
  ) => {
    // Never autosave the welcome placeholder — no intentional project yet.
    if (state.workspace === 'welcome') return

    // Playhead/direction/mode UI updates keep the same project reference —
    // bail before any JSON serialization or image-bearing snapshots.
    if (state.project === prev.project) return

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
      if (disposed) return

      const onFlushPending = () => {
        if (document.visibilityState === 'hidden') flushPending()
      }
      document.addEventListener('visibilitychange', onFlushPending)
      window.addEventListener('pagehide', flushPending)

      if (!storage) {
        setStatus('save-error')
        const fresh = createEmptyPersistableProject(captureViewportStageAspect())
        useEditorStore.setState({
          workspace: 'welcome',
          project: fresh,
          selectedActorId: fresh.actors[0].id,
          livePosition: { ...fresh.actors[0].restPosition },
        })
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      const loaded = loadStoredSnapshot(storage)
      if (loaded.status === 'empty') {
        // No saved project: stay on the welcome screen and do not persist a blank.
        const fresh = createEmptyPersistableProject(captureViewportStageAspect())
        useEditorStore.setState({
          workspace: 'welcome',
          project: fresh,
          selectedActorId: fresh.actors[0].id,
          livePosition: { ...fresh.actors[0].restPosition },
          mode: 'idle',
          playbackHead: 0,
        })
        lastWrittenFingerprint = ''
        setStatus('idle')
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      if (loaded.status === 'error') {
        setStatus('restore-error')
        const fresh = createEmptyPersistableProject(captureViewportStageAspect())
        useEditorStore.setState({
          workspace: 'welcome',
          project: fresh,
          selectedActorId: fresh.actors[0].id,
          livePosition: { ...fresh.actors[0].restPosition },
        })
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      if (loaded.status === 'invalid') {
        quarantineRaw = loaded.raw
        saveBlocked = true
        setStatus('restore-error')
        const fresh = createEmptyPersistableProject(captureViewportStageAspect())
        useEditorStore.setState({
          workspace: 'welcome',
          project: fresh,
          selectedActorId: fresh.actors[0].id,
          livePosition: { ...fresh.actors[0].restPosition },
        })
        unsubscribeStore = useEditorStore.subscribe(onStoreChange)
        return
      }

      useEditorStore.getState().applyPersistedSnapshot(loaded.snapshot)
      lastWrittenFingerprint = fingerprint({
        project: loaded.snapshot.project,
      })
      setStatus('saved')
      unsubscribeStore = useEditorStore.subscribe(onStoreChange)

      // Keep flush listeners — attach once.
      void onFlushPending
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
      const state = useEditorStore.getState()
      if (state.workspace === 'editing') {
        writeSlice(pickPersistable(state))
      }
    },

    afterSuccessfulReplace: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      quarantineRaw = null
      saveBlocked = false
      const state = useEditorStore.getState()
      if (state.workspace === 'editing') {
        writeSlice(pickPersistable(state))
      }
    },

    downloadCurrentProject: () => {
      try {
        const slice = pickPersistable(useEditorStore.getState())
        const snap = buildSnapshot(slice.project, null)
        const ok = downloadTextFile(
          serializeSnapshot(snap),
          stampProjectFilename(slice.project.name, 'json'),
          'application/json',
        )
        if (!ok) {
          useEditorStore
            .getState()
            .announceAction('Could not download the project file.')
        }
        return ok
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Could not download the project file.'
        useEditorStore.getState().announceAction(message)
        return false
      }
    },

    downloadQuarantine: () => {
      if (!quarantineRaw) return false
      return downloadTextFile(
        quarantineRaw,
        stampFilename('motionsketch-unreadable', 'json'),
        'application/json',
      )
    },

    dispose: () => {
      disposed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      unsubscribeStore?.()
      unsubscribeStore = null
      listeners.clear()
    },
  }
}

export function importSnapshotFromText(raw: string) {
  return parseSnapshotJson(raw)
}
