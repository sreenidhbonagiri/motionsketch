import { useEffect } from 'react'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { endDrag, isRecordingActive } from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import { CanvasStage } from './CanvasStage'
import { Inspector } from './Inspector'
import { PlaybackTimeline } from './PlaybackTimeline'
import { Toolbar } from './Toolbar'

export function EditorShell() {
  usePlaybackClock()
  const { status } = useProjectPersistence()
  const saveLabel = statusLabel(status)
  const stageHint = useEditorStore((s) => s.stageHint)
  const actionAnnouncement = useEditorStore((s) => s.actionAnnouncement)
  const hasRecording = useEditorStore((s) => !!s.project.recording)

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && isRecordingActive()) {
        endDrag(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  const tip =
    stageHint === 'new-project' && !hasRecording
      ? 'New project ready. Click Record to create an animation.'
      : 'Click Record, drag the tile, then Play — or export CSS keyframes.'

  return (
    <div
      data-testid="app-shell"
      className="relative flex min-h-dvh flex-col bg-[#f4f6fb] text-slate-900 lg:h-dvh lg:max-h-dvh lg:overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_50%)]" />

      {/* Polite live region: announces without moving keyboard focus */}
      <div
        data-testid="action-live-region"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {actionAnnouncement ?? ''}
      </div>

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold tracking-tight text-slate-900">
            MotionSketch
          </div>
          <p className="text-xs text-slate-500">
            Demonstrate motion. Export CSS.
          </p>
        </div>
        {saveLabel && (
          <p
            data-testid="header-save-status"
            className={
              status === 'saved'
                ? 'shrink-0 text-right text-[11px] text-slate-500'
                : 'shrink-0 text-right text-[11px] text-amber-800'
            }
          >
            {saveLabel}
          </p>
        )}
      </header>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-3 pb-4 lg:flex-row lg:gap-4 lg:px-4 lg:pb-4">
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
            className="flex shrink-0 flex-col items-center gap-1.5 px-1"
          >
            <Toolbar />
            <PlaybackTimeline />
          </div>

          <p
            data-testid="stage-empty-hint"
            className="shrink-0 text-center text-xs text-slate-500 sm:text-sm"
          >
            {tip}
          </p>
        </div>

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
