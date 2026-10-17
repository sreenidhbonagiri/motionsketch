import { useEffect } from 'react'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import { isRecordingActive, endDrag } from '../lib/recordingController'
import { CanvasStage } from './CanvasStage'
import { Inspector } from './Inspector'
import { Toolbar } from './Toolbar'

export function EditorShell() {
  usePlaybackClock()

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && isRecordingActive()) {
        endDrag(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f4f6fb] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_50%)]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <div>
          <div className="text-lg font-semibold tracking-tight text-slate-900">
            MotionSketch
          </div>
          <p className="text-xs text-slate-500">
            Demonstrate motion. Export CSS.
          </p>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center px-4 pb-36 pt-2 lg:px-8 lg:pr-80">
        <CanvasStage />
        <p className="mt-4 text-center text-sm text-slate-500">
          Click Record, drag the tile, then Play — or export CSS keyframes.
        </p>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4">
        <div className="pointer-events-auto">
          <Toolbar />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-20 flex justify-center lg:inset-auto lg:right-4 lg:top-20 lg:bottom-auto lg:justify-end">
        <div className="pointer-events-auto w-full max-w-sm lg:w-72">
          <Inspector />
        </div>
      </div>
    </div>
  )
}
