import { create } from 'zustand'
import {
  clampActorBorderRadius,
  clampActorSize,
  normalizeActorColor,
} from '../core/actor'
import type { ActorImageAsset } from '../core/imageAsset'
import { copyPath } from '../core/edit'
import { clamp } from '../core/coords'
import type { PlaybackDirection } from '../core/playback'
import type { PersistedSnapshot } from '../core/persist/document'
import { createEmptyPersistableProject } from '../core/persist/document'
import {
  commitProjectName,
  DEFAULT_PROJECT_NAME,
  isValidProjectName,
  sanitizeProjectName,
} from '../core/projectName'
import { captureViewportStageAspect, clampStageAspect } from '../core/stageAspect'
import {
  clampClip,
  cloneClip,
  localToProject,
  projectToLocal,
} from '../core/clip'
import {
  cloneSceneActor,
  createSceneActor,
  DEFAULT_REST_POSITION,
  duplicateSceneActor,
  findActor,
  mapActor,
  MAX_ACTORS,
  projectHasAnyRecording,
  restPositionFromRecording,
  sanitizeActorName,
  uniqueActorName,
} from '../core/sceneActor'
import {
  cloneTransformTrack,
  emptyTransformTrack,
  removeTransformKeyframe,
  upsertTransformKeyframe,
} from '../core/transform'
import {
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type ActorClip,
  type EditorMode,
  type GeometryEdit,
  type LoopMode,
  type MotionSample,
  type Project,
  type Recording,
  type SceneActor,
  type TransformTrack,
  type Vec2,
} from '../core/types'
import {
  bakeEditablePathForActor,
  selectActorPositionForActor,
} from './selectors'

const MAX_UNDO = 40

/** Chronological actor-edit kinds for unified clip/transform undo. */
export type ActorEditKind = 'transform' | 'clip'

/** Welcome = no intentional project yet; editor only after create/open/example. */
export type WorkspacePhase = 'welcome' | 'editing'

interface EditorStore {
  workspace: WorkspacePhase
  project: Project
  selectedActorId: string
  mode: EditorMode
  pointerId: number | null
  playbackHead: number
  playbackDirection: PlaybackDirection
  playbackEpoch: number
  livePosition: Vec2
  liveTrail: Vec2[]
  showPathComparison: boolean

  /**
   * Working geometry for the selected actor (mirrors actor.geometryEdit when idle).
   * Path undo/redo apply only to this selection — stacks clear on actor change.
   */
  geometryEdit: GeometryEdit | null
  editSession: GeometryEdit | null
  undoStack: MotionSample[][]
  redoStack: MotionSample[][]
  selectedHandleIndex: number | null
  editPreview: MotionSample[] | null

  selectedTransformId: string | null
  transformUndoStack: TransformTrack[]
  transformRedoStack: TransformTrack[]

  /** Selection-scoped clip timing history (one gesture → one entry). */
  clipUndoStack: ActorClip[]
  clipRedoStack: ActorClip[]

  /**
   * Chronological order of completed clip/transform edits for the selected actor.
   * Dock + keyboard undo/redo pop the most recent kind first.
   */
  actorEditOrder: ActorEditKind[]
  actorEditRedoOrder: ActorEditKind[]

  stageHint: 'default' | 'new-project'
  actionAnnouncement: string | null

  armRecording: () => void
  cancelArm: () => void
  beginRecording: (pointerId: number, position: Vec2) => void
  pushLiveSample: (position: Vec2) => void
  finishRecording: (recording: Recording | null) => void
  setIdle: () => void

  setLivePosition: (position: Vec2) => void
  /** Persist rest position for the selected actor (idle drag, no recording). */
  setRestPosition: (position: Vec2) => void
  clearLiveTrail: () => void

  play: () => void
  pause: () => void
  restartPlayback: () => void
  scrubPlayback: (tNorm: number) => void
  setPlaybackHead: (tNorm: number) => void
  setPlaybackDirection: (direction: PlaybackDirection) => void
  setPlaybackSample: (tNorm: number, direction: PlaybackDirection) => void
  stopPlayback: () => void

  setDurationMs: (ms: number) => void
  setSmoothing: (value: number) => void
  setSteadySpeed: (value: number) => void
  setLoop: (loop: boolean) => void
  setLoopMode: (loopMode: LoopMode) => void
  setShowPathComparison: (show: boolean) => void
  setActorColor: (color: string) => void
  setActorSize: (size: number) => void
  setActorBorderRadius: (radius: number) => void
  setActorKind: (kind: 'shape' | 'image') => void
  setActorImage: (image: ActorImageAsset) => void
  clearActorImage: () => void
  setActorImageLabel: (label: string) => void
  /** Clear the selected actor’s recording, path edits, and transform track. */
  resetRecording: () => void

  /**
   * Create a fresh board with the given name and enter the editor.
   * Returns false when the name is invalid (caller should show validation).
   */
  createNamedProject: (name: string) => boolean
  /** @deprecated Prefer createNamedProject — kept for transitional call sites. */
  newProject: () => void
  /** Rename the project title only — does not touch actors or history. */
  renameProject: (name: string) => void
  applyPersistedSnapshot: (snapshot: PersistedSnapshot) => void
  enterWelcome: () => void
  hasReplaceableAnimation: () => boolean
  announceAction: (message: string | null) => void

  selectActor: (id: string) => void
  addActor: () => string | null
  duplicateSelectedActor: () => string | null
  deleteSelectedActor: () => boolean
  renameSelectedActor: (name: string) => void
  /** Rename a specific actor by id (ignores selection). */
  renameActor: (id: string, name: string) => void
  moveSelectedActor: (direction: -1 | 1) => void

  /** Commit a full clip replace for an actor (one undo step). */
  commitActorClip: (id: string, clip: ActorClip) => void
  /** Live preview while dragging (no history). */
  previewActorClip: (id: string, clip: ActorClip) => void
  /** Begin a clip drag/resize; pairs with finishClipGesture. */
  beginClipGesture: (id: string) => void
  finishClipGesture: (id: string, clip: ActorClip) => void
  undoClip: () => void
  redoClip: () => void
  /** Undo the most recent clip or transform edit for the selected actor. */
  undoActorEdit: () => void
  redoActorEdit: () => void

  enterEditMode: () => void
  exitEditMode: () => void
  restoreRecordedPath: () => void
  setSelectedHandleIndex: (index: number | null) => void
  beginHandleDrag: () => void
  updateEditPreview: (samples: MotionSample[]) => void
  commitHandleEdit: (samples: MotionSample[]) => void
  cancelHandleDrag: () => void
  undoEdit: () => void
  redoEdit: () => void

  selectTransformKeyframe: (id: string | null) => void
  upsertTransformAtPlayhead: (rotationDeg: number, scale: number) => void
  commitTransformKeyframe: (input: {
    id: string
    t: number
    rotationDeg: number
    scale: number
  }) => void
  deleteSelectedTransform: () => void
  undoTransform: () => void
  redoTransform: () => void
}

function clearEditState() {
  return {
    geometryEdit: null as GeometryEdit | null,
    editSession: null as GeometryEdit | null,
    undoStack: [] as MotionSample[][],
    redoStack: [] as MotionSample[][],
    selectedHandleIndex: null as number | null,
    editPreview: null as MotionSample[] | null,
  }
}

function clearTransformEditState() {
  return {
    selectedTransformId: null as string | null,
    transformUndoStack: [] as TransformTrack[],
    transformRedoStack: [] as TransformTrack[],
  }
}

function clearClipEditState() {
  return {
    clipUndoStack: [] as ActorClip[],
    clipRedoStack: [] as ActorClip[],
  }
}

function clearActorEditOrder() {
  return {
    actorEditOrder: [] as ActorEditKind[],
    actorEditRedoOrder: [] as ActorEditKind[],
  }
}

/** History is selection-scoped: changing actors drops undo/redo stacks. */
function clearHistoryForActorSwitch() {
  return {
    ...clearEditState(),
    ...clearTransformEditState(),
    ...clearClipEditState(),
    ...clearActorEditOrder(),
  }
}

function popKindFromOrder(
  order: ActorEditKind[],
  kind: ActorEditKind,
): ActorEditKind[] {
  const next: ActorEditKind[] = [...order]
  const idx = next.lastIndexOf(kind)
  if (idx >= 0) next.splice(idx, 1)
  return next
}

function pushEditOrder(
  order: ActorEditKind[],
  kind: ActorEditKind,
): ActorEditKind[] {
  return [...order, kind].slice(-MAX_UNDO)
}

let clipGestureBaseline: { id: string; clip: ActorClip } | null = null

function getSelected(state: {
  project: Project
  selectedActorId: string
}): SceneActor {
  return (
    findActor(state.project.actors, state.selectedActorId) ??
    state.project.actors[0]
  )
}

function withSelectedActor(
  project: Project,
  selectedActorId: string,
  updater: (actor: SceneActor) => SceneActor,
): Project {
  return {
    ...project,
    actors: mapActor(project.actors, selectedActorId, updater),
  }
}

function pushTransformHistory(
  state: EditorStore,
  nextTrack: TransformTrack,
  selectedId: string | null,
): Partial<EditorStore> {
  const actor = getSelected(state)
  const prev = cloneTransformTrack(actor.transform)
  return {
    project: withSelectedActor(state.project, state.selectedActorId, (a) => ({
      ...a,
      transform: nextTrack,
    })),
    selectedTransformId: selectedId,
    transformUndoStack: [...state.transformUndoStack, prev].slice(-MAX_UNDO),
    transformRedoStack: [],
    // New transform action clears all actor-edit redo (clip + transform).
    clipRedoStack: [],
    actorEditOrder: pushEditOrder(state.actorEditOrder, 'transform'),
    actorEditRedoOrder: [],
  }
}

function initialProject(): Project {
  const project = createEmptyPersistableProject()
  return project
}

export const useEditorStore = create<EditorStore>((set, get) => {
  const project = initialProject()
  const firstId = project.actors[0].id

  return {
    workspace: 'welcome' as WorkspacePhase,
    project,
    selectedActorId: firstId,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0,
    playbackDirection: 1,
    playbackEpoch: 0,
    livePosition: { ...DEFAULT_REST_POSITION },
    liveTrail: [],
    showPathComparison: false,
    stageHint: 'default',
    actionAnnouncement: null,
    ...clearEditState(),
    ...clearTransformEditState(),
    ...clearClipEditState(),
    ...clearActorEditOrder(),

    armRecording: () => {
      const { mode } = get()
      if (mode === 'playing' || mode === 'editing') return
      set({ mode: 'armed', liveTrail: [], stageHint: 'default' })
    },

    cancelArm: () => {
      if (get().mode === 'armed') {
        set({ mode: 'idle', pointerId: null })
      }
    },

    beginRecording: (pointerId, position) => {
      const state = get()
      set({
        mode: 'recording',
        pointerId,
        livePosition: position,
        liveTrail: [position],
        playbackHead: 0,
        playbackDirection: 1,
        stageHint: 'default',
        ...clearEditState(),
        ...clearTransformEditState(),
        // New take on the selected actor clears its transform + path edits.
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            transform: emptyTransformTrack(),
            geometryEdit: null,
          }),
        ),
      })
    },

    pushLiveSample: (position) => {
      set((state) => ({
        livePosition: position,
        liveTrail: [...state.liveTrail, position],
      }))
    },

    finishRecording: (recording) => {
      set((state) => {
        const nextProject = withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            recording,
            // Shared Duration is unchanged — take is mapped to normalized progress.
            transform: emptyTransformTrack(),
            geometryEdit: null,
            restPosition: recording
              ? restPositionFromRecording(recording, a.restPosition)
              : a.restPosition,
          }),
        )
        return {
          mode: 'idle' as const,
          pointerId: null,
          liveTrail: [],
          playbackHead: 0,
          ...clearEditState(),
          ...clearTransformEditState(),
          project: nextProject,
          livePosition: recording
            ? {
                x: recording.samples[0].x,
                y: recording.samples[0].y,
              }
            : state.livePosition,
        }
      })
    },

    setIdle: () => set({ mode: 'idle', pointerId: null }),

    setLivePosition: (position) => set({ livePosition: position }),

    setRestPosition: (position) =>
      set((state) => ({
        livePosition: position,
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            restPosition: {
              x: clamp(position.x, 0, 1),
              y: clamp(position.y, 0, 1),
            },
          }),
        ),
      })),

    clearLiveTrail: () => set({ liveTrail: [] }),

    play: () => {
      const state = get()
      if (!projectHasAnyRecording(state.project)) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      const atEnd =
        !state.project.playback.loop && state.playbackHead >= 1
      const head = atEnd ? 0 : state.playbackHead
      set({
        mode: 'playing',
        playbackHead: head,
        playbackDirection: atEnd ? 1 : state.playbackDirection,
        playbackEpoch: state.playbackEpoch + 1,
      })
    },

    pause: () => {
      if (get().mode === 'playing') {
        set({ mode: 'idle' })
      }
    },

    restartPlayback: () => {
      const state = get()
      if (!projectHasAnyRecording(state.project)) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      set({
        mode: 'playing',
        playbackHead: 0,
        playbackDirection: 1,
        playbackEpoch: state.playbackEpoch + 1,
      })
    },

    scrubPlayback: (tNorm) => {
      const state = get()
      if (!projectHasAnyRecording(state.project)) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      set({
        mode: 'idle',
        playbackHead: clamp(tNorm, 0, 1),
        playbackDirection: 1,
      })
    },

    setPlaybackHead: (tNorm) => set({ playbackHead: clamp(tNorm, 0, 1) }),

    setPlaybackDirection: (direction) => set({ playbackDirection: direction }),

    setPlaybackSample: (tNorm, direction) =>
      set({
        playbackHead: clamp(tNorm, 0, 1),
        playbackDirection: direction,
      }),

    stopPlayback: () => set({ mode: 'idle' }),

    setDurationMs: (ms) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            durationMs: clamp(
              ms,
              MIN_PLAYBACK_DURATION_MS,
              MAX_PLAYBACK_DURATION_MS,
            ),
          },
        },
      })),

    setSmoothing: (value) => {
      const state = get()
      const actor = getSelected(state)
      if (actor.geometryEdit || state.geometryEdit) return
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, smoothing: clamp(value, 0, 1) }),
        ),
      })
    },

    setSteadySpeed: (value) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, steadySpeed: clamp(value, 0, 1) }),
        ),
      })),

    setLoop: (loop) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            loop,
          },
        },
        playbackEpoch:
          state.mode === 'playing'
            ? state.playbackEpoch + 1
            : state.playbackEpoch,
        playbackDirection: loop ? state.playbackDirection : 1,
      })),

    setLoopMode: (loopMode) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            loopMode,
          },
        },
        playbackEpoch:
          state.mode === 'playing'
            ? state.playbackEpoch + 1
            : state.playbackEpoch,
        playbackDirection: loopMode === 'repeat' ? 1 : state.playbackDirection,
      })),

    setShowPathComparison: (show) => set({ showPathComparison: show }),

    setActorColor: (color) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              color: normalizeActorColor(color) ?? a.appearance.color,
            },
          }),
        ),
      })),

    setActorSize: (size) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const next = clampActorSize(size)
            return {
              ...a,
              appearance: {
                ...a.appearance,
                width: next,
                height:
                  a.appearance.kind === 'shape' ? next : a.appearance.height,
              },
            }
          },
        ),
      })),

    setActorBorderRadius: (radius) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              borderRadius: clampActorBorderRadius(radius),
            },
          }),
        ),
      })),

    setActorKind: (kind) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            if (kind === 'image' && !a.appearance.image) return a
            return {
              ...a,
              appearance: {
                ...a.appearance,
                kind,
                height:
                  kind === 'shape' ? a.appearance.width : a.appearance.height,
              },
            }
          },
        ),
      })),

    setActorImage: (image) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              kind: 'image',
              image: { ...image },
            },
          }),
        ),
      })),

    clearActorImage: () =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              kind: 'shape',
              height: a.appearance.width,
              image: null,
            },
          }),
        ),
      })),

    setActorImageLabel: (label) =>
      set((state) => {
        const actor = getSelected(state)
        if (!actor.appearance.image) return state
        const next = label.trim().slice(0, 64) || 'Image'
        return {
          project: withSelectedActor(
            state.project,
            state.selectedActorId,
            (a) => ({
              ...a,
              appearance: {
                ...a.appearance,
                image: a.appearance.image
                  ? { ...a.appearance.image, label: next }
                  : null,
              },
            }),
          ),
        }
      }),

    resetRecording: () =>
      set((state) => {
        const actor = getSelected(state)
        return {
          mode: 'idle' as const,
          pointerId: null,
          playbackHead: 0,
          playbackDirection: 1 as const,
          liveTrail: [],
          livePosition: { ...actor.restPosition },
          ...clearEditState(),
          ...clearTransformEditState(),
          project: withSelectedActor(
            state.project,
            state.selectedActorId,
            (a) => ({
              ...a,
              recording: null,
              transform: emptyTransformTrack(),
              geometryEdit: null,
            }),
          ),
        }
      }),

    createNamedProject: (name) => {
      if (!isValidProjectName(name)) return false
      const project = createEmptyPersistableProject(
        captureViewportStageAspect(),
        sanitizeProjectName(name),
      )
      set({
        workspace: 'editing',
        mode: 'idle',
        pointerId: null,
        playbackHead: 0,
        playbackDirection: 1,
        playbackEpoch: get().playbackEpoch + 1,
        liveTrail: [],
        livePosition: { ...DEFAULT_REST_POSITION },
        showPathComparison: false,
        stageHint: 'new-project',
        actionAnnouncement: `Created “${project.name}”. You can start drawing.`,
        selectedActorId: project.actors[0].id,
        ...clearHistoryForActorSwitch(),
        project,
      })
      return true
    },

    newProject: () => {
      get().createNamedProject(DEFAULT_PROJECT_NAME)
    },

    renameProject: (name) => {
      const state = get()
      if (state.workspace !== 'editing') return
      const next = commitProjectName(name, state.project.name)
      if (next === state.project.name) return
      set({
        project: {
          ...state.project,
          name: next,
        },
      })
    },

    enterWelcome: () => {
      const project = createEmptyPersistableProject(captureViewportStageAspect())
      set({
        workspace: 'welcome',
        mode: 'idle',
        pointerId: null,
        playbackHead: 0,
        playbackDirection: 1,
        liveTrail: [],
        livePosition: { ...DEFAULT_REST_POSITION },
        showPathComparison: false,
        stageHint: 'default',
        actionAnnouncement: null,
        selectedActorId: project.actors[0].id,
        ...clearHistoryForActorSwitch(),
        project,
      })
    },

    applyPersistedSnapshot: (snapshot) => {
      const project: Project = {
        version: 1,
        name:
          sanitizeProjectName(snapshot.project.name) || DEFAULT_PROJECT_NAME,
        actors: snapshot.project.actors.map((a) => cloneSceneActor(a)),
        playback: { ...snapshot.project.playback },
        // Preserve the snapshot’s authored aspect (examples and imports).
        stageAspect: clampStageAspect(snapshot.project.stageAspect),
      }
      const first = project.actors[0] ?? createSceneActor({ name: 'Actor 1' })
      if (project.actors.length === 0) {
        project.actors = [first]
      }
      const selectedActorId = first.id
      set({
        workspace: 'editing',
        mode: 'idle',
        pointerId: null,
        playbackHead: 0,
        playbackDirection: 1,
        playbackEpoch: get().playbackEpoch + 1,
        liveTrail: [],
        livePosition: { ...first.restPosition },
        showPathComparison: false,
        stageHint: 'default',
        selectedActorId,
        ...clearHistoryForActorSwitch(),
        geometryEdit: first?.geometryEdit
          ? {
              bakedSmoothing: first.geometryEdit.bakedSmoothing,
              samples: copyPath(first.geometryEdit.samples),
            }
          : null,
        project,
      })
    },

    hasReplaceableAnimation: () => projectHasAnyRecording(get().project),

    announceAction: (message) => set({ actionAnnouncement: message }),

    selectActor: (id) => {
      const state = get()
      if (!findActor(state.project.actors, id)) return
      if (id === state.selectedActorId) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const actor = findActor(state.project.actors, id)!
      const livePosition = selectActorPositionForActor(
        state.project,
        actor,
        state.playbackHead,
        actor.restPosition,
        state.mode,
        {
          geometryEdit: actor.geometryEdit,
          editSession: null,
          editPreview: null,
        },
        false,
      )
      set({
        selectedActorId: id,
        livePosition,
        mode: state.mode === 'playing' ? 'playing' : 'idle',
        ...clearHistoryForActorSwitch(),
        geometryEdit: actor.geometryEdit
          ? {
              bakedSmoothing: actor.geometryEdit.bakedSmoothing,
              samples: copyPath(actor.geometryEdit.samples),
            }
          : null,
      })
    },

    addActor: () => {
      const state = get()
      if (state.project.actors.length >= MAX_ACTORS) {
        set({
          actionAnnouncement: `Actor limit reached (${MAX_ACTORS}).`,
        })
        return null
      }
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return null
      }
      const names = state.project.actors.map((a) => a.name)
      const actor = createSceneActor({
        name: uniqueActorName('Actor', names),
        restPosition: {
          x: clamp(0.35 + state.project.actors.length * 0.06, 0.15, 0.85),
          y: clamp(0.5 + (state.project.actors.length % 3) * 0.05, 0.2, 0.8),
        },
      })
      set({
        project: {
          ...state.project,
          actors: [...state.project.actors, actor],
        },
        selectedActorId: actor.id,
        livePosition: { ...actor.restPosition },
        ...clearHistoryForActorSwitch(),
        actionAnnouncement: `Added ${actor.name}.`,
      })
      return actor.id
    },

    duplicateSelectedActor: () => {
      const state = get()
      if (state.project.actors.length >= MAX_ACTORS) {
        set({
          actionAnnouncement: `Actor limit reached (${MAX_ACTORS}).`,
        })
        return null
      }
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return null
      }
      const source = getSelected(state)
      const names = state.project.actors.map((a) => a.name)
      const copy = duplicateSceneActor(
        source,
        uniqueActorName(`${source.name} copy`, names),
      )
      const index = state.project.actors.findIndex((a) => a.id === source.id)
      const actors = [...state.project.actors]
      actors.splice(index + 1, 0, copy)
      set({
        project: { ...state.project, actors },
        selectedActorId: copy.id,
        livePosition: { ...copy.restPosition },
        ...clearHistoryForActorSwitch(),
        geometryEdit: copy.geometryEdit
          ? {
              bakedSmoothing: copy.geometryEdit.bakedSmoothing,
              samples: copyPath(copy.geometryEdit.samples),
            }
          : null,
        actionAnnouncement: `Duplicated ${source.name}.`,
      })
      return copy.id
    },

    deleteSelectedActor: () => {
      const state = get()
      if (state.project.actors.length <= 1) {
        set({ actionAnnouncement: 'At least one actor is required.' })
        return false
      }
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return false
      }
      const id = state.selectedActorId
      const index = state.project.actors.findIndex((a) => a.id === id)
      const actors = state.project.actors.filter((a) => a.id !== id)
      const next = actors[Math.max(0, index - 1)] ?? actors[0]
      set({
        project: { ...state.project, actors },
        selectedActorId: next.id,
        livePosition: { ...next.restPosition },
        ...clearHistoryForActorSwitch(),
        geometryEdit: next.geometryEdit
          ? {
              bakedSmoothing: next.geometryEdit.bakedSmoothing,
              samples: copyPath(next.geometryEdit.samples),
            }
          : null,
        actionAnnouncement: 'Actor deleted.',
      })
      return true
    },

    renameSelectedActor: (name) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, name: sanitizeActorName(name) }),
        ),
      })),

    renameActor: (id, name) =>
      set((state) => {
        if (!findActor(state.project.actors, id)) return state
        return {
          project: {
            ...state.project,
            actors: mapActor(state.project.actors, id, (a) => ({
              ...a,
              name: sanitizeActorName(name),
            })),
          },
        }
      }),

    commitActorClip: (id, clip) => {
      const state = get()
      const actor = findActor(state.project.actors, id)
      if (!actor) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const next = clampClip(clip)
      const prev = cloneClip(actor.clip)
      if (
        Math.abs(prev.start - next.start) < 1e-9 &&
        Math.abs(prev.end - next.end) < 1e-9
      ) {
        return
      }
      set({
        project: {
          ...state.project,
          actors: mapActor(state.project.actors, id, (a) => ({
            ...a,
            clip: next,
          })),
        },
        selectedActorId: id,
        clipUndoStack: [...state.clipUndoStack, prev].slice(-MAX_UNDO),
        clipRedoStack: [],
        transformRedoStack: [],
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'clip'),
        actorEditRedoOrder: [],
      })
    },

    previewActorClip: (id, clip) => {
      const state = get()
      if (!findActor(state.project.actors, id)) return
      set({
        project: {
          ...state.project,
          actors: mapActor(state.project.actors, id, (a) => ({
            ...a,
            clip: clampClip(clip),
          })),
        },
      })
    },

    beginClipGesture: (id) => {
      const actor = findActor(get().project.actors, id)
      if (!actor) return
      clipGestureBaseline = { id, clip: cloneClip(actor.clip) }
      if (get().selectedActorId !== id) {
        get().selectActor(id)
      }
    },

    finishClipGesture: (id, clip) => {
      const state = get()
      const actor = findActor(state.project.actors, id)
      if (!actor) {
        clipGestureBaseline = null
        return
      }
      const next = clampClip(clip)
      const baseline =
        clipGestureBaseline?.id === id
          ? clipGestureBaseline.clip
          : cloneClip(actor.clip)
      clipGestureBaseline = null
      if (
        Math.abs(baseline.start - next.start) < 1e-9 &&
        Math.abs(baseline.end - next.end) < 1e-9
      ) {
        set({
          project: {
            ...state.project,
            actors: mapActor(state.project.actors, id, (a) => ({
              ...a,
              clip: next,
            })),
          },
        })
        return
      }
      set({
        project: {
          ...state.project,
          actors: mapActor(state.project.actors, id, (a) => ({
            ...a,
            clip: next,
          })),
        },
        selectedActorId: id,
        clipUndoStack: [...state.clipUndoStack, baseline].slice(-MAX_UNDO),
        clipRedoStack: [],
        transformRedoStack: [],
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'clip'),
        actorEditRedoOrder: [],
      })
    },

    undoClip: () => {
      const state = get()
      if (state.clipUndoStack.length === 0) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const previous = state.clipUndoStack[state.clipUndoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneClip(actor.clip)
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, clip: cloneClip(previous) }),
        ),
        clipUndoStack: state.clipUndoStack.slice(0, -1),
        clipRedoStack: [...state.clipRedoStack, current].slice(-MAX_UNDO),
        actorEditOrder: popKindFromOrder(state.actorEditOrder, 'clip'),
        actorEditRedoOrder: pushEditOrder(state.actorEditRedoOrder, 'clip'),
      })
    },

    redoClip: () => {
      const state = get()
      if (state.clipRedoStack.length === 0) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const next = state.clipRedoStack[state.clipRedoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneClip(actor.clip)
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, clip: cloneClip(next) }),
        ),
        clipRedoStack: state.clipRedoStack.slice(0, -1),
        clipUndoStack: [...state.clipUndoStack, current].slice(-MAX_UNDO),
        actorEditRedoOrder: popKindFromOrder(state.actorEditRedoOrder, 'clip'),
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'clip'),
      })
    },

    undoActorEdit: () => {
      const state = get()
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const kind = state.actorEditOrder[state.actorEditOrder.length - 1]
      if (kind === 'transform') {
        get().undoTransform()
        return
      }
      if (kind === 'clip') {
        get().undoClip()
      }
    },

    redoActorEdit: () => {
      const state = get()
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const kind = state.actorEditRedoOrder[state.actorEditRedoOrder.length - 1]
      if (kind === 'transform') {
        get().redoTransform()
        return
      }
      if (kind === 'clip') {
        get().redoClip()
      }
    },

    moveSelectedActor: (direction) =>
      set((state) => {
        const index = state.project.actors.findIndex(
          (a) => a.id === state.selectedActorId,
        )
        const target = index + direction
        if (index < 0 || target < 0 || target >= state.project.actors.length) {
          return state
        }
        const actors = [...state.project.actors]
        const [item] = actors.splice(index, 1)
        actors.splice(target, 0, item)
        return { project: { ...state.project, actors } }
      }),

    enterEditMode: () => {
      const state = get()
      const actor = getSelected(state)
      if (!actor.recording) return
      if (state.mode === 'recording' || state.mode === 'armed') return

      const samples = state.geometryEdit
        ? copyPath(state.geometryEdit.samples)
        : actor.geometryEdit
          ? copyPath(actor.geometryEdit.samples)
          : bakeEditablePathForActor(state.project, actor)
      if (samples.length < 2) return

      const editSession: GeometryEdit = {
        samples,
        bakedSmoothing:
          state.geometryEdit?.bakedSmoothing ??
          actor.geometryEdit?.bakedSmoothing ??
          actor.smoothing,
      }

      set({
        mode: 'editing',
        editSession,
        editPreview: null,
        selectedHandleIndex: state.selectedHandleIndex ?? 0,
        selectedTransformId: null,
      })
    },

    exitEditMode: () => {
      if (get().mode !== 'editing') return
      set({
        mode: 'idle',
        editSession: null,
        editPreview: null,
        pointerId: null,
      })
    },

    restoreRecordedPath: () => {
      const state = get()
      const wasEditing = state.mode === 'editing'
      const nextProject = withSelectedActor(
        state.project,
        state.selectedActorId,
        (a) => ({ ...a, geometryEdit: null }),
      )
      set({
        project: nextProject,
        geometryEdit: null,
        undoStack: [],
        redoStack: [],
        editPreview: null,
        selectedHandleIndex: wasEditing ? 0 : null,
        editSession: null,
      })

      if (wasEditing) {
        const actor = getSelected(get())
        const baked = bakeEditablePathForActor(get().project, actor)
        if (baked.length >= 2) {
          set({
            mode: 'editing',
            editSession: {
              samples: baked,
              bakedSmoothing: actor.smoothing,
            },
            selectedHandleIndex: 0,
          })
        } else {
          set({ mode: 'idle' })
        }
      }
    },

    setSelectedHandleIndex: (index) =>
      set({
        selectedHandleIndex: index,
        selectedTransformId: index !== null ? null : get().selectedTransformId,
      }),

    beginHandleDrag: () => {
      const state = get()
      const base = state.editSession ?? state.geometryEdit
      if (!base) return
      set({ editPreview: copyPath(base.samples) })
    },

    updateEditPreview: (samples) => set({ editPreview: samples }),

    commitHandleEdit: (samples) => {
      const state = get()
      const base = state.editSession ?? state.geometryEdit
      if (!base) return

      const previous = copyPath(base.samples)
      const next: GeometryEdit = {
        bakedSmoothing: base.bakedSmoothing,
        samples: copyPath(samples),
      }

      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: state.mode === 'editing' ? next : null,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        editPreview: null,
      })
    },

    cancelHandleDrag: () => set({ editPreview: null }),

    undoEdit: () => {
      const state = get()
      const current = state.editSession ?? state.geometryEdit
      if (!current || state.undoStack.length === 0) return

      const previous = state.undoStack[state.undoStack.length - 1]
      const next: GeometryEdit = {
        bakedSmoothing: current.bakedSmoothing,
        samples: copyPath(previous),
      }

      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: state.mode === 'editing' ? next : null,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, copyPath(current.samples)].slice(
          -MAX_UNDO,
        ),
        editPreview: null,
      })
    },

    redoEdit: () => {
      const state = get()
      const current = state.editSession ?? state.geometryEdit
      if (!current || state.redoStack.length === 0) return

      const restored = state.redoStack[state.redoStack.length - 1]
      const next: GeometryEdit = {
        bakedSmoothing: current.bakedSmoothing,
        samples: copyPath(restored),
      }

      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: state.mode === 'editing' ? next : null,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, copyPath(current.samples)].slice(
          -MAX_UNDO,
        ),
        editPreview: null,
      })
    },

    selectTransformKeyframe: (id) => {
      const state = get()
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      if (id === null) {
        set({ selectedTransformId: null })
        return
      }
      const actor = getSelected(state)
      const kf = actor.transform.keyframes.find((k) => k.id === id)
      if (!kf) return
      // Keyframe times are actor-local; seek the shared playhead to project time.
      set({
        mode: 'idle',
        selectedTransformId: id,
        selectedHandleIndex: null,
        playbackHead: clamp(localToProject(kf.t, actor.clip), 0, 1),
        playbackDirection: 1,
      })
    },

    upsertTransformAtPlayhead: (rotationDeg, scale) => {
      const state = get()
      const actor = getSelected(state)
      if (!actor.recording) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      const t = projectToLocal(state.playbackHead, actor.clip)
      const { track, keyframeId } = upsertTransformKeyframe(actor.transform, {
        t,
        rotationDeg,
        scale,
        id: state.selectedTransformId ?? undefined,
      })
      set({
        mode: 'idle',
        ...pushTransformHistory(state, track, keyframeId),
      })
    },

    commitTransformKeyframe: (input) => {
      const state = get()
      const actor = getSelected(state)
      if (!actor.recording) return
      if (state.mode === 'editing') return
      if (!actor.transform.keyframes.some((k) => k.id === input.id)) return
      const { track, keyframeId } = upsertTransformKeyframe(
        actor.transform,
        input,
      )
      set({
        mode: 'idle',
        playbackHead: clamp(localToProject(input.t, actor.clip), 0, 1),
        ...pushTransformHistory(state, track, keyframeId),
      })
    },

    deleteSelectedTransform: () => {
      const state = get()
      const id = state.selectedTransformId
      if (!id) return
      const actor = getSelected(state)
      if (!actor.transform.keyframes.some((k) => k.id === id)) return
      const next = removeTransformKeyframe(actor.transform, id)
      set({
        ...pushTransformHistory(state, next, null),
      })
    },

    undoTransform: () => {
      const state = get()
      if (state.mode === 'editing') return
      if (state.transformUndoStack.length === 0) return
      const previous =
        state.transformUndoStack[state.transformUndoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneTransformTrack(actor.transform)
      const selectedStill =
        state.selectedTransformId &&
        previous.keyframes.some((k) => k.id === state.selectedTransformId)
          ? state.selectedTransformId
          : null
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, transform: cloneTransformTrack(previous) }),
        ),
        transformUndoStack: state.transformUndoStack.slice(0, -1),
        transformRedoStack: [...state.transformRedoStack, current].slice(
          -MAX_UNDO,
        ),
        selectedTransformId: selectedStill,
        actorEditOrder: popKindFromOrder(state.actorEditOrder, 'transform'),
        actorEditRedoOrder: pushEditOrder(
          state.actorEditRedoOrder,
          'transform',
        ),
      })
    },

    redoTransform: () => {
      const state = get()
      if (state.mode === 'editing') return
      if (state.transformRedoStack.length === 0) return
      const restored =
        state.transformRedoStack[state.transformRedoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneTransformTrack(actor.transform)
      const selectedStill =
        state.selectedTransformId &&
        restored.keyframes.some((k) => k.id === state.selectedTransformId)
          ? state.selectedTransformId
          : null
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, transform: cloneTransformTrack(restored) }),
        ),
        transformRedoStack: state.transformRedoStack.slice(0, -1),
        transformUndoStack: [...state.transformUndoStack, current].slice(
          -MAX_UNDO,
        ),
        selectedTransformId: selectedStill,
        actorEditRedoOrder: popKindFromOrder(
          state.actorEditRedoOrder,
          'transform',
        ),
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'transform'),
      })
    },
  }
})
