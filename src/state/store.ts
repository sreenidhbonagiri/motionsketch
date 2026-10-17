import { create } from 'zustand'
import { copyPath } from '../core/edit'
import { clamp } from '../core/coords'
import {
  DEFAULT_PROJECT,
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type EditorMode,
  type GeometryEdit,
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
  setPlaybackHead: (tNorm: number) => void
  stopPlayback: () => void

  setDurationMs: (ms: number) => void
  setSmoothing: (value: number) => void
  setSteadySpeed: (value: number) => void
  setLoop: (loop: boolean) => void
  setShowPathComparison: (show: boolean) => void
  resetRecording: () => void

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
  livePosition: initialPosition,
  liveTrail: [],
  showPathComparison: false,
  ...clearEditState(),

  armRecording: () => {
    const { mode } = get()
    if (mode === 'playing' || mode === 'editing') return
    set({ mode: 'armed', liveTrail: [] })
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
    set({ mode: 'playing' })
  },

  pause: () => {
    if (get().mode === 'playing') {
      set({ mode: 'idle' })
    }
  },

  setPlaybackHead: (tNorm) => set({ playbackHead: clamp(tNorm, 0, 1) }),

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
    })),

  setShowPathComparison: (show) => set({ showPathComparison: show }),

  resetRecording: () =>
    set((state) => ({
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      liveTrail: [],
      livePosition: initialPosition,
      ...clearEditState(),
      project: {
        ...state.project,
        recording: null,
      },
    })),

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
