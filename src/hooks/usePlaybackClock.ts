import { useEffect, useRef } from 'react'
import {
  elapsedFromPlayhead,
  tNormFromElapsed,
  type PlaybackDirection,
} from '../core/playback'
import { useEditorStore } from '../state/store'

export function usePlaybackClock(): void {
  const mode = useEditorStore((s) => s.mode)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const loop = useEditorStore((s) => s.project.playback.loop)
  const loopMode = useEditorStore((s) => s.project.playback.loopMode)
  const playbackEpoch = useEditorStore((s) => s.playbackEpoch)
  const setPlaybackHead = useEditorStore((s) => s.setPlaybackHead)
  const setPlaybackDirection = useEditorStore((s) => s.setPlaybackDirection)
  const stopPlayback = useEditorStore((s) => s.stopPlayback)

  const originElapsedRef = useRef(0)
  const startedAtRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode !== 'playing') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    const state = useEditorStore.getState()
    originElapsedRef.current = elapsedFromPlayhead(
      state.playbackHead,
      state.playbackDirection,
      durationMs,
      loop,
      loopMode,
    )
    startedAtRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startedAtRef.current + originElapsedRef.current
      const sample = tNormFromElapsed(elapsed, durationMs, loop, loopMode)
      setPlaybackHead(sample.tNorm)
      setPlaybackDirection(sample.direction)

      if (sample.finished) {
        stopPlayback()
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    durationMs,
    loop,
    loopMode,
    playbackEpoch,
    setPlaybackHead,
    setPlaybackDirection,
    stopPlayback,
  ])
}

export type { PlaybackDirection }
