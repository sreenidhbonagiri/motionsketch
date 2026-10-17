import { useEffect } from 'react'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import { endDrag, isRecordingActive } from '../lib/recordingController'
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
    <div
      data-testid="app-shell"
      className="relative flex min-h-dvh flex-col bg-[#f4f6fb] text-slate-900 lg:h-dvh lg:max-h-dvh lg:overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_50%)]" />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-3 lg:px-5 lg:py-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold tracking-tight text-slate-900">
            MotionSketch
          </div>
          <p className="text-xs text-slate-500">
            Demonstrate motion. Export CSS.
          </p>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-3 pb-4 lg:flex-row lg:gap-4 lg:px-4 lg:pb-4">
        {/* Stage + toolbar column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div
            data-testid="stage-frame"
            className="relative min-w-0 max-lg:w-full lg:min-h-0 lg:flex-1 lg:[container-type:size]"
          >
            <div className="max-lg:w-full lg:absolute lg:inset-0 lg:grid lg:place-items-center">
              <CanvasStage />
            </div>
          </div>

          <div
            data-testid="toolbar-slot"
            className="flex shrink-0 justify-center px-1"
          >
            <Toolbar />
          </div>

          <p className="shrink-0 text-center text-xs text-slate-500 sm:text-sm">
            Click Record, drag the tile, then Play — or export CSS keyframes.
          </p>
        </div>

        {/* Sidebar: independent scroll on desktop */}
        <div
          data-testid="sidebar-slot"
          className="flex min-h-0 w-full shrink-0 flex-col lg:h-full lg:w-72 lg:max-w-[18rem]"
        >
          <Inspector />
        </div>
      </div>
    </div>
  )
}
