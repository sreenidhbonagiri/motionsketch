import { beforeEach, describe, expect, it } from 'vitest'
import type { MotionSample, Recording } from '../../src/core/types'
import { useEditorStore } from '../../src/state/store'

function makeRecording(): Recording {
  const samples: MotionSample[] = Array.from({ length: 20 }, (_, i) => ({
    t: i * 50,
    x: 0.2 + i * 0.03,
    y: 0.5,
  }))
  return {
    samples,
    recordedDurationMs: samples[samples.length - 1].t,
  }
}

describe('playback store controls', () => {
  beforeEach(() => {
    useEditorStore.setState({
      project: {
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
          durationMs: 1000,
          smoothing: 0.35,
          steadySpeed: 0,
          loop: false,
          loopMode: 'repeat',
        },
      stageAspect: 1.6,
        transform: { keyframes: [] },
      },
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      playbackDirection: 1,
      playbackEpoch: 0,
      livePosition: { x: 0.2, y: 0.5 },
      liveTrail: [],
      showPathComparison: false,
      geometryEdit: null,
      editSession: null,
      selectedTransformId: null,
      transformUndoStack: [],
      transformRedoStack: [],
      undoStack: [],
      redoStack: [],
      selectedHandleIndex: null,
      editPreview: null,
      stageHint: 'default',
      actionAnnouncement: null,
    })
  })

  it('play resumes from the current head and pause holds it', () => {
    useEditorStore.setState({ playbackHead: 0.4 })
    useEditorStore.getState().play()
    expect(useEditorStore.getState().mode).toBe('playing')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.4)

    useEditorStore.setState({ playbackHead: 0.55 })
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().mode).toBe('idle')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.55)

    useEditorStore.getState().play()
    expect(useEditorStore.getState().mode).toBe('playing')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.55)
  })

  it('play from the end of a non-looping take restarts at 0', () => {
    useEditorStore.setState({ playbackHead: 1, mode: 'idle' })
    useEditorStore.getState().play()
    expect(useEditorStore.getState().mode).toBe('playing')
    expect(useEditorStore.getState().playbackHead).toBe(0)
    expect(useEditorStore.getState().playbackEpoch).toBe(1)
  })

  it('restart jumps to the beginning and plays', () => {
    useEditorStore.setState({ playbackHead: 0.7, mode: 'playing', playbackEpoch: 2 })
    useEditorStore.getState().restartPlayback()
    expect(useEditorStore.getState().mode).toBe('playing')
    expect(useEditorStore.getState().playbackHead).toBe(0)
    expect(useEditorStore.getState().playbackEpoch).toBe(3)
  })

  it('scrubbing pauses and seeks immediately', () => {
    useEditorStore.setState({ mode: 'playing', playbackHead: 0.2 })
    useEditorStore.getState().scrubPlayback(0.65)
    expect(useEditorStore.getState().mode).toBe('idle')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.65)
  })

  it('blocks play/scrub/restart while recording or editing', () => {
    useEditorStore.setState({ mode: 'recording', playbackHead: 0.1 })
    useEditorStore.getState().play()
    useEditorStore.getState().restartPlayback()
    useEditorStore.getState().scrubPlayback(0.9)
    expect(useEditorStore.getState().mode).toBe('recording')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.1)

    useEditorStore.setState({ mode: 'editing', playbackHead: 0.2 })
    useEditorStore.getState().play()
    useEditorStore.getState().restartPlayback()
    useEditorStore.getState().scrubPlayback(0.9)
    expect(useEditorStore.getState().mode).toBe('editing')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.2)
  })

  it('keeps a valid head when duration changes and does not autoplay', () => {
    useEditorStore.setState({ playbackHead: 0.8, mode: 'idle' })
    useEditorStore.getState().setDurationMs(2000)
    expect(useEditorStore.getState().mode).toBe('idle')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.8)
    expect(useEditorStore.getState().project.playback.durationMs).toBe(2000)
  })

  it('preserves loop setting independently of playhead', () => {
    useEditorStore.getState().setLoop(true)
    useEditorStore.setState({ playbackHead: 0.9 })
    useEditorStore.getState().play()
    expect(useEditorStore.getState().project.playback.loop).toBe(true)
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.9)
  })

  it('scrubbing pauses and resets direction to forward', () => {
    useEditorStore.setState({
      mode: 'playing',
      playbackHead: 0.7,
      playbackDirection: -1,
    })
    useEditorStore.getState().scrubPlayback(0.3)
    expect(useEditorStore.getState().mode).toBe('idle')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.3)
    expect(useEditorStore.getState().playbackDirection).toBe(1)
  })

  it('setPlaybackSample commits head and direction atomically', () => {
    useEditorStore.getState().setPlaybackSample(0.62, -1)
    const state = useEditorStore.getState()
    expect(state.playbackHead).toBeCloseTo(0.62)
    expect(state.playbackDirection).toBe(-1)
  })

  it('resume after reverse pause keeps direction for elapsed remap', () => {
    useEditorStore.getState().setLoop(true)
    useEditorStore.getState().setLoopMode('alternate')
    useEditorStore.setState({
      mode: 'idle',
      playbackHead: 0.67,
      playbackDirection: -1,
    })
    useEditorStore.getState().play()
    expect(useEditorStore.getState().mode).toBe('playing')
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.67)
    expect(useEditorStore.getState().playbackDirection).toBe(-1)
  })

  it('changing loop mode while playing re-anchors without stopping', () => {
    useEditorStore.getState().setLoop(true)
    useEditorStore.setState({
      mode: 'playing',
      playbackHead: 0.4,
      playbackDirection: -1,
      playbackEpoch: 5,
    })
    useEditorStore.getState().setLoopMode('alternate')
    expect(useEditorStore.getState().mode).toBe('playing')
    expect(useEditorStore.getState().project.playback.loopMode).toBe('alternate')
    expect(useEditorStore.getState().playbackEpoch).toBe(6)
    expect(useEditorStore.getState().playbackHead).toBeCloseTo(0.4)

    useEditorStore.getState().setLoopMode('repeat')
    expect(useEditorStore.getState().playbackDirection).toBe(1)
    expect(useEditorStore.getState().playbackEpoch).toBe(7)
  })
})
