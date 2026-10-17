import { create } from 'zustand'
import {
  DEFAULT_PROJECT,
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type EditorMode,
  type Project,
  type Recording,
  type Vec2,
} from '../core/types'
import { clamp } from '../core/coords'

interface EditorStore {
  project: Project
  mode: EditorMode
  pointerId: number | null
  playbackHead: number
  /** Live actor center while dragging / recording */
  livePosition: Vec2
  liveTrail: Vec2[]
  /** Optional overlay of raw vs processed paths (off by default). */
  showPathComparison: boolean

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
  setLoop: (loop: boolean) => void
  setShowPathComparison: (show: boolean) => void
  resetRecording: () => void
}

const initialPosition: Vec2 = { x: 0.35, y: 0.5 }

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: { ...DEFAULT_PROJECT, actor: { ...DEFAULT_PROJECT.actor } },
  mode: 'idle',
  pointerId: null,
  playbackHead: 0,
  livePosition: initialPosition,
  liveTrail: [],
  showPathComparison: false,

  armRecording: () => {
    const { mode } = get()
    if (mode === 'playing') return
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
    if (!get().project.recording) return
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
          durationMs: clamp(ms, MIN_PLAYBACK_DURATION_MS, MAX_PLAYBACK_DURATION_MS),
        },
      },
    })),

  setSmoothing: (value) =>
    set((state) => ({
      project: {
        ...state.project,
        playback: {
          ...state.project.playback,
          smoothing: clamp(value, 0, 1),
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
      project: {
        ...state.project,
        recording: null,
      },
    })),
}))
