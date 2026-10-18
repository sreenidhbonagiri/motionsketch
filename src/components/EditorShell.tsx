import { useCallback, useEffect, useState } from 'react'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { useTransformShortcuts } from '../hooks/useTransformShortcuts'
import { endDrag, isRecordingActive } from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import { AdjustPanel } from './AdjustPanel'
import { AppearancePanel } from './AppearancePanel'
import { CanvasStage } from './CanvasStage'
import { ExampleGallery } from './ExampleGallery'
import { ExportPanel } from './ExportPanel'
import {
  FloatingPanel,
  type ChromePanel,
} from './FloatingPanel'
import { ActorList } from './ActorList'
import { ClipTimeline } from './ClipTimeline'
import { PlaybackDock } from './PlaybackDock'
import { ProjectPanel } from './ProjectPanel'
import { projectHasAnyRecording } from '../core/sceneActor'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'

const EXAMPLES_HINT_KEY = 'motionsketch.examplesHintDismissed'

const chromeBtn =
  'inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-800 shadow-[0_6px_20px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:bg-white'

export function EditorShell() {
  usePlaybackClock()
  useTransformShortcuts()
  const { status } = useProjectPersistence()
  const saveLabel = statusLabel(status)
  const stageHint = useEditorStore((s) => s.stageHint)
  const actionAnnouncement = useEditorStore((s) => s.actionAnnouncement)
  const hasRecording = useEditorStore((s) =>
    projectHasAnyRecording(s.project),
  )
  const mode = useEditorStore((s) => s.mode)
  const editing = mode === 'editing'
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const actor = useEditorStore((s) => {
    const id = s.selectedActorId
    return (
      s.project.actors.find((a) => a.id === id)?.appearance ??
      s.project.actors[0]?.appearance
    )
  })
  const actorColor = actor?.color ?? '#4f46e5'
  const actorIsImage = actor?.kind === 'image' && !!actor.image

  const [openPanel, setOpenPanel] = useState<ChromePanel | null>(null)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(EXAMPLES_HINT_KEY) === '1'
    } catch {
      return false
    }
  })

  const closePanel = useCallback(() => setOpenPanel(null), [])
  const closeExamples = useCallback(() => setExamplesOpen(false), [])

  const togglePanel = (id: ChromePanel) => {
    setExamplesOpen(false)
    setOpenPanel((prev) => (prev === id ? null : id))
  }

  const openExamples = () => {
    setOpenPanel(null)
    setExamplesOpen(true)
  }

  const dismissExamplesHint = () => {
    setHintDismissed(true)
    try {
      sessionStorage.setItem(EXAMPLES_HINT_KEY, '1')
    } catch {
      // ignore quota / private mode
    }
  }

  const isEmptyProject = useEditorStore((s) => !projectHasMeaningfulWork(s.project))
  const showExamplesHint = isEmptyProject && !hintDismissed && !examplesOpen

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
      : !hasRecording
        ? 'Record, drag the tile, then Play.'
        : null

  return (
    <div
      data-testid="app-shell"
      className="fixed inset-0 overflow-hidden bg-[#eef1f6] text-slate-900 antialiased"
    >
      <div
        data-testid="action-live-region"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {actionAnnouncement ?? ''}
      </div>

      {/* Full-viewport interactive stage (only drawing surface) */}
      <CanvasStage />

      {/* Top chrome — pointer-events only on controls */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:pt-4"
      >
        <div className="pointer-events-auto relative flex min-w-0 flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/80 bg-white/90 px-2.5 py-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] backdrop-blur-md">
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              MotionSketch
            </div>
            {saveLabel && (
              <p
                data-testid="header-save-status"
                className={
                  status === 'saved'
                    ? 'text-xs text-slate-500'
                    : 'text-xs text-amber-800'
                }
              >
                {saveLabel}
              </p>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              data-testid="btn-project"
              aria-expanded={openPanel === 'project'}
              aria-controls="project-panel-root"
              onClick={() => togglePanel('project')}
              className={chromeBtn}
            >
              <span aria-hidden className="text-slate-500">
                ▦
              </span>
              Project
            </button>
            <FloatingPanel
              id="project"
              title="Project"
              open={openPanel === 'project'}
              onClose={closePanel}
              align="left"
            >
              <div data-testid="project-menu">
                <ProjectPanel />
              </div>
            </FloatingPanel>
          </div>

          <button
            type="button"
            data-testid="btn-examples"
            aria-haspopup="dialog"
            aria-expanded={examplesOpen}
            onClick={openExamples}
            className={chromeBtn}
          >
            Examples
          </button>
        </div>

        <div className="pointer-events-auto relative flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <button
              type="button"
              data-testid="btn-adjust"
              aria-expanded={openPanel === 'adjust'}
              aria-controls="adjust-panel-root"
              onClick={() => togglePanel('adjust')}
              className={chromeBtn}
            >
              <span aria-hidden className="text-slate-500">
                ⚙
              </span>
              Adjust
              {hasRecording && (
                <span
                  data-testid="adjust-summary"
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-600"
                >
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </button>
            <FloatingPanel
              id="adjust"
              title="Adjust"
              open={openPanel === 'adjust'}
              onClose={closePanel}
              align="right"
              summary={
                hasRecording
                  ? `Duration ${(durationMs / 1000).toFixed(2)} s`
                  : 'No animation yet'
              }
            >
              <AdjustPanel />
            </FloatingPanel>
          </div>

          <div className="relative">
            <button
              type="button"
              data-testid="btn-appearance"
              aria-expanded={openPanel === 'appearance'}
              aria-controls="appearance-panel-root"
              onClick={() => togglePanel('appearance')}
              className={chromeBtn}
            >
              {actorIsImage ? (
                <img
                  aria-hidden
                  data-testid="appearance-swatch"
                  src={actor.image!.dataUrl}
                  alt=""
                  className="inline-block size-3.5 rounded-sm border border-slate-300 object-contain bg-white"
                />
              ) : (
                <span
                  aria-hidden
                  data-testid="appearance-swatch"
                  className="inline-block size-3.5 rounded-sm border border-slate-300"
                  style={{ background: actorColor }}
                />
              )}
              Appearance
            </button>
            <FloatingPanel
              id="appearance"
              title="Appearance"
              open={openPanel === 'appearance'}
              onClose={closePanel}
              align="right"
              summary={
                actorIsImage ? (
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <img
                      src={actor.image!.dataUrl}
                      alt=""
                      className="inline-block size-3 rounded-sm border border-slate-300 object-contain bg-white"
                    />
                    {actor.image!.label}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-3 rounded-sm border border-slate-300"
                      style={{ background: actorColor }}
                    />
                    {actorColor}
                  </span>
                )
              }
            >
              <AppearancePanel />
            </FloatingPanel>
          </div>

          <div className="relative">
            <button
              type="button"
              data-testid="btn-export"
              aria-expanded={openPanel === 'export'}
              aria-controls="export-panel-root"
              onClick={() => togglePanel('export')}
              className={chromeBtn}
            >
              <span aria-hidden className="text-slate-500">
                ↗
              </span>
              Export
            </button>
            <FloatingPanel
              id="export"
              title="Export"
              open={openPanel === 'export'}
              onClose={closePanel}
              align="right"
              summary={hasRecording ? 'CSS and HTML demo' : 'Record first'}
            >
              <div className="p-3">
                {hasRecording ? (
                  <ExportPanel />
                ) : (
                  <p
                    data-testid="export-empty"
                    className="text-sm text-slate-500"
                  >
                    Record an animation to export CSS or an HTML demo.
                  </p>
                )}
              </div>
            </FloatingPanel>
          </div>
        </div>
      </header>

      {/* Actor list — left, above the dock */}
      {!editing && (
        <div className="pointer-events-none absolute bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-3 z-40 sm:bottom-24 sm:left-4">
          <ActorList />
        </div>
      )}

      {/* Bottom dock */}
      <div
        data-testid="toolbar-slot"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:pb-4"
      >
        <div className="flex w-full max-w-2xl flex-col items-center gap-2">
          {!editing && <ClipTimeline />}
          <PlaybackDock />
          {editing && (
            <p
              data-testid="edit-mode-hint"
              className="pointer-events-auto rounded-full border border-white/70 bg-white/90 px-3 py-1 text-center text-xs text-slate-600 shadow-sm backdrop-blur-md"
            >
              Edit mode: drag handles to reshape the path. Timestamps stay
              fixed.
            </p>
          )}
          {tip && (
            <p
              data-testid="stage-empty-hint"
              className="pointer-events-auto rounded-full border border-white/60 bg-white/85 px-3 py-1 text-center text-xs text-slate-600 shadow-sm backdrop-blur-md"
            >
              {tip}
            </p>
          )}
          {showExamplesHint && (
            <div
              data-testid="examples-empty-hint"
              className="pointer-events-auto flex max-w-md items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow-sm backdrop-blur-md"
            >
              <button
                type="button"
                data-testid="btn-try-example"
                onClick={openExamples}
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Try an example
              </button>
              <span className="text-slate-500">to explore a starter scene.</span>
              <button
                type="button"
                data-testid="btn-dismiss-examples-hint"
                onClick={dismissExamplesHint}
                className="ml-1 rounded-md px-1.5 py-0.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Dismiss example hint"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {examplesOpen && <ExampleGallery onClose={closeExamples} />}
    </div>
  )
}
