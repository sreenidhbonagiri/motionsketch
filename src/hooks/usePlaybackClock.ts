import { useEffect, useRef } from 'react'
import { tNormFromElapsed } from '../core/playback'
import { useEditorStore } from '../state/store'

export function usePlaybackClock(): void {
  const mode = useEditorStore((s) => s.mode)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const loop = useEditorStore((s) => s.project.playback.loop)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const setPlaybackHead = useEditorStore((s) => s.setPlaybackHead)
  const stopPlayback = useEditorStore((s) => s.stopPlayback)

  const originHeadRef = useRef(0)
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

    originHeadRef.current = playbackHead
    startedAtRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed =
        (now - startedAtRef.current) + originHeadRef.current * durationMs
      const { tNorm, finished } = tNormFromElapsed(elapsed, durationMs, loop)
      setPlaybackHead(tNorm)

      if (finished) {
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
    // Intentionally only restart clock when entering play or duration/loop change mid-play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, durationMs, loop, setPlaybackHead, stopPlayback])
}
