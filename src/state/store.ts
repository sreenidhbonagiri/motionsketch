import { create } from 'zustand'
import {
  clampActorBorderRadius,
  clampActorSize,
  normalizeActorColor,
} from '../core/actor'
import { copyPath } from '../core/edit'
import { clamp } from '../core/coords'
import type { PlaybackDirection } from '../core/playback'
import type { PersistedSnapshot } from '../core/persist/document'
import {
  DEFAULT_PROJECT,
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type EditorMode,
  type GeometryEdit,
  type LoopMode,
  type MotionSample,
  type Project,
  type Recording,
  type Vec2,
} from '../core/types'
import { bakeEditablePath } from './selectors'

const MAX_UNDO = 40

interface EditorStore {
  project: Project
  mode: EditorMode
  pointerId: number | null
  playbackHead: number
  /**
   * Path traversal direction for alternate looping (1 forward, -1 backward).
   * Transient — not persisted.
   */
  playbackDirection: PlaybackDirection
  /**
   * Bumped when playback should re-anchor the RAF clock (Play from end,
   * Restart while already playing) without relying on a mode flicker.
   */
  playbackEpoch: number
  livePosition: Vec2
  liveTrail: Vec2[]
  showPathComparison: boolean

  /**
   * Committed geometry edits that persist after leaving Edit mode.
   * Null means playback uses the live-processed recording.
   */
  geometryEdit: GeometryEdit | null
  /** Working path while mode === 'editing' (may equal geometryEdit or a fresh bake). */
  editSession: GeometryEdit | null
  undoStack: MotionSample[][]
  redoStack: MotionSample[][]
  selectedHandleIndex: number | null
  /** Live preview while a handle drag is in progress. */
  editPreview: MotionSample[] | null

  /**
   * Transient stage tip after New project (not persisted).
   * Cleared when the user starts recording again.
   */
  stageHint: 'default' | 'new-project'
  /** Brief action feedback for a polite live region (not persisted). */
  actionAnnouncement: string | null

  armRecording: () => void
  cancelArm: () => void
  beginRecording: (pointerId: number, position: Vec2) => void
  pushLiveSample: (position: Vec2) => void
  finishRecording: (recording: Recording | null) => void
  setIdle: () => void

  setLivePosition: (position: Vec2) => void
  clearLiveTrail: () => void

  play: () => void
  pause: () => void
  /** Jump to the start and begin playing. */
  restartPlayback: () => void
  /**
   * Seek the playhead (0..1). Pauses if currently playing so the actor
   * stays on the scrubbed frame instead of being overwritten by the clock.
   */
  scrubPlayback: (tNorm: number) => void
  setPlaybackHead: (tNorm: number) => void
  setPlaybackDirection: (direction: PlaybackDirection) => void
  stopPlayback: () => void

  setDurationMs: (ms: number) => void
  setSmoothing: (value: number) => void
  setSteadySpeed: (value: number) => void
  setLoop: (loop: boolean) => void
  setLoopMode: (loopMode: LoopMode) => void
  setShowPathComparison: (show: boolean) => void
  setActorColor: (color: string) => void
  /** Square tile size as a fraction of the stage min-side. */
  setActorSize: (size: number) => void
  setActorBorderRadius: (radius: number) => void
  resetRecording: () => void

  /** Full wipe to defaults (separate from Reset, which only clears the take). */
  newProject: () => void
  /** Replace project + committed edits from a validated snapshot; paused at t=0. */
  applyPersistedSnapshot: (snapshot: PersistedSnapshot) => void
  /** True when opening/importing/new would replace an existing animation. */
  hasReplaceableAnimation: () => boolean
  announceAction: (message: string | null) => void

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
}

const initialPosition: Vec2 = { x: 0.35, y: 0.5 }

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

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: {
    ...DEFAULT_PROJECT,
    actor: { ...DEFAULT_PROJECT.actor },
    playback: { ...DEFAULT_PROJECT.playback },
  },
  mode: 'idle',
  pointerId: null,
  playbackHead: 0,
  playbackDirection: 1,
  playbackEpoch: 0,
  livePosition: initialPosition,
  liveTrail: [],
  showPathComparison: false,
  stageHint: 'default',
  actionAnnouncement: null,
  ...clearEditState(),

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
    set({
      mode: 'recording',
      pointerId,
      livePosition: position,
      liveTrail: [position],
      playbackHead: 0,
      playbackDirection: 1,
      stageHint: 'default',
      ...clearEditState(),
    })
  },

  pushLiveSample: (position) => {
    set((state) => ({
      livePosition: position,
      liveTrail: [...state.liveTrail, position],
    }))
  },

  finishRecording: (recording) => {
    set((state) => ({
      mode: 'idle',
      pointerId: null,
      liveTrail: [],
      playbackHead: 0,
      ...clearEditState(),
      project: {
        ...state.project,
        recording,
        playback: {
          ...state.project.playback,
          durationMs: recording
            ? clamp(
                Math.round(recording.recordedDurationMs),
                MIN_PLAYBACK_DURATION_MS,
                MAX_PLAYBACK_DURATION_MS,
              )
            : state.project.playback.durationMs,
        },
      },
      livePosition: recording
        ? {
            x: recording.samples[0].x,
            y: recording.samples[0].y,
          }
        : state.livePosition,
    }))
  },

  setIdle: () => set({ mode: 'idle', pointerId: null }),

  setLivePosition: (position) => set({ livePosition: position }),

  clearLiveTrail: () => set({ liveTrail: [] }),

  play: () => {
    const state = get()
    if (!state.project.recording) return
    if (
      state.mode === 'editing' ||
      state.mode === 'armed' ||
      state.mode === 'recording'
    ) {
      return
    }
    // End of a non-looping take: Play starts over from the beginning.
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
    if (!state.project.recording) return
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
    if (!state.project.recording) return
    if (
      state.mode === 'editing' ||
      state.mode === 'armed' ||
      state.mode === 'recording'
    ) {
      return
    }
    // Scrubber is path position (0=start, 1=end). Seeking pauses and
    // resumes forward from that point — even if we were playing backward.
    set({
      mode: 'idle',
      playbackHead: clamp(tNorm, 0, 1),
      playbackDirection: 1,
    })
  },

  setPlaybackHead: (tNorm) => set({ playbackHead: clamp(tNorm, 0, 1) }),

  setPlaybackDirection: (direction) => set({ playbackDirection: direction }),

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
    // Committed edits bake spatial smoothing — don't silently reprocess under them.
    if (state.geometryEdit) return
    set({
      project: {
        ...state.project,
        playback: {
          ...state.project.playback,
          smoothing: clamp(value, 0, 1),
        },
      },
    })
  },

  setSteadySpeed: (value) =>
    set((state) => ({
      project: {
        ...state.project,
        playback: {
          ...state.project.playback,
          steadySpeed: clamp(value, 0, 1),
        },
      },
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
      // Re-anchor if currently playing so the clock picks up the new mode.
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
      // Switching to repeat always travels forward from the current head.
      playbackDirection: loopMode === 'repeat' ? 1 : state.playbackDirection,
    })),

  setShowPathComparison: (show) => set({ showPathComparison: show }),

  setActorColor: (color) => {
    const normalized = normalizeActorColor(color)
    if (!normalized) return
    set((state) => ({
      project: {
        ...state.project,
        actor: { ...state.project.actor, color: normalized },
      },
    }))
  },

  setActorSize: (size) => {
    const next = clampActorSize(size)
    set((state) => ({
      project: {
        ...state.project,
        actor: {
          ...state.project.actor,
          width: next,
          height: next,
        },
      },
    }))
  },

  setActorBorderRadius: (radius) =>
    set((state) => ({
      project: {
        ...state.project,
        actor: {
          ...state.project.actor,
          borderRadius: clampActorBorderRadius(radius),
        },
      },
    })),

  resetRecording: () =>
    set((state) => ({
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      playbackDirection: 1,
      liveTrail: [],
      livePosition: initialPosition,
      ...clearEditState(),
      project: {
        ...state.project,
        recording: null,
      },
    })),

  newProject: () =>
    set({
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      playbackDirection: 1,
      liveTrail: [],
      livePosition: initialPosition,
      showPathComparison: false,
      stageHint: 'new-project',
      actionAnnouncement: 'New project created.',
      ...clearEditState(),
      project: {
        version: 1,
        actor: { ...DEFAULT_PROJECT.actor },
        recording: null,
        playback: { ...DEFAULT_PROJECT.playback },
      },
    }),

  applyPersistedSnapshot: (snapshot) => {
    const recording = snapshot.project.recording
    const start = recording
      ? { x: recording.samples[0].x, y: recording.samples[0].y }
      : initialPosition

    set({
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      playbackDirection: 1,
      liveTrail: [],
      livePosition: start,
      showPathComparison: false,
      stageHint: 'default',
      geometryEdit: snapshot.geometryEdit
        ? {
            bakedSmoothing: snapshot.geometryEdit.bakedSmoothing,
            samples: copyPath(snapshot.geometryEdit.samples),
          }
        : null,
      editSession: null,
      undoStack: [],
      redoStack: [],
      selectedHandleIndex: null,
      editPreview: null,
      project: {
        version: 1,
        actor: { ...snapshot.project.actor },
        recording: recording
          ? {
              recordedDurationMs: recording.recordedDurationMs,
              samples: copyPath(recording.samples),
            }
          : null,
        playback: { ...snapshot.project.playback },
      },
    })
  },

  hasReplaceableAnimation: () => !!get().project.recording,

  announceAction: (message) => set({ actionAnnouncement: message }),

  enterEditMode: () => {
    const state = get()
    if (!state.project.recording) return
    if (state.mode === 'recording' || state.mode === 'armed') return

    const samples = state.geometryEdit
      ? copyPath(state.geometryEdit.samples)
      : bakeEditablePath(state.project)
    if (samples.length < 2) return

    const editSession: GeometryEdit = {
      samples,
      bakedSmoothing:
        state.geometryEdit?.bakedSmoothing ?? state.project.playback.smoothing,
    }

    // Pause playback by leaving 'playing'; path editing owns the stage.
    set({
      mode: 'editing',
      editSession,
      editPreview: null,
      selectedHandleIndex: state.selectedHandleIndex ?? 0,
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
    const wasEditing = get().mode === 'editing'
    set({
      geometryEdit: null,
      undoStack: [],
      redoStack: [],
      editPreview: null,
      selectedHandleIndex: wasEditing ? 0 : null,
      editSession: null,
    })

    if (wasEditing) {
      const state = get()
      const baked = bakeEditablePath(state.project)
      if (baked.length >= 2) {
        set({
          mode: 'editing',
          editSession: {
            samples: baked,
            bakedSmoothing: state.project.playback.smoothing,
          },
          selectedHandleIndex: 0,
        })
      } else {
        set({ mode: 'idle' })
      }
    }
  },

  setSelectedHandleIndex: (index) => set({ selectedHandleIndex: index }),

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
      geometryEdit: next,
      editSession: state.mode === 'editing' ? next : null,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, copyPath(current.samples)].slice(-MAX_UNDO),
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
      geometryEdit: next,
      editSession: state.mode === 'editing' ? next : null,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, copyPath(current.samples)].slice(-MAX_UNDO),
      editPreview: null,
    })
  },
}))
