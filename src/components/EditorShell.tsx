import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { useTransformShortcuts } from '../hooks/useTransformShortcuts'
import {
  AFTER_PATH_WEBSITE_HINT,
  afterPathWebsiteHintProjectKey,
  EMPTY_BOARD_RECORD_HINT_COARSE,
  EMPTY_BOARD_RECORD_HINT_FINE,
  readAfterPathWebsiteHintDismissedKeys,
  writeAfterPathWebsiteHintDismissedKeys,
} from '../lib/modeStatus'
import { endDrag, isRecordingActive } from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import { AdjustPanel } from './AdjustPanel'
import { AppearancePanel } from './AppearancePanel'
import { CanvasStage } from './CanvasStage'
import { ExampleGallery } from './ExampleGallery'
import { ExportPanel } from './ExportPanel'
import { GlidePanel } from './GlidePanel'
import { PresetPanel } from './PresetPanel'
import { ProjectNameInput } from './ProjectNameInput'
import {
  FloatingPanel,
  type ChromePanel,
} from './FloatingPanel'
import { ActorList } from './ActorList'
import { ClipTimeline } from './ClipTimeline'
import { PlaybackDock } from './PlaybackDock'
import { PolishPanel } from './PolishPanel'
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
  const actionAnnouncement = useEditorStore((s) => s.actionAnnouncement)
  const hasRecording = useEditorStore((s) =>
    projectHasAnyRecording(s.project),
  )
  const mode = useEditorStore((s) => s.mode)
  const editing = mode === 'editing'
  const polishSession = useEditorStore((s) => s.polishSession)
  const glideSession = useEditorStore((s) => s.glideSession)
  const presetSession = useEditorStore((s) => s.presetSession)
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
  // Per-project dismissals for this browser tab session (see modeStatus helpers).
  const [afterPathHintDismissedKeys, setAfterPathHintDismissedKeys] = useState(
    () => readAfterPathWebsiteHintDismissedKeys(),
  )
  const afterPathToastTextId = useId()
  const headerRef = useRef<HTMLElement>(null)
  // Toast top tracks measured header height so wrapped mobile chrome never overlaps.
  const [toastTopPx, setToastTopPx] = useState(96)

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
  const project = useEditorStore((s) => s.project)
  const projectName = project.name
  const renameProject = useEditorStore((s) => s.renameProject)
  const afterPathProjectKey = afterPathWebsiteHintProjectKey(project)

  const dismissAfterPathWebsiteHint = () => {
    setAfterPathHintDismissedKeys((prev) => {
      const next = new Set(prev)
      next.add(afterPathProjectKey)
      writeAfterPathWebsiteHintDismissedKeys(next)
      return next
    })
  }

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && isRecordingActive()) {
        endDrag(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const gapPx = 8
    const update = () => {
      setToastTopPx(Math.ceil(el.getBoundingClientRect().height) + gapPx)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const coarsePointer = useCoarsePointer()
  // Empty-board Record cue — hide once any take exists; dock covers armed/recording.
  const tipBusy =
    mode !== 'idle' ||
    !!polishSession ||
    !!glideSession ||
    !!presetSession
  const emptyTip =
    !tipBusy && !hasRecording
      ? coarsePointer
        ? EMPTY_BOARD_RECORD_HINT_COARSE
        : EMPTY_BOARD_RECORD_HINT_FINE
      : null
  // Top toast: after a path, idle only; dismissible per project for this tab session.
  // Hide while a chrome panel is open — toast still competes for layout/hit-testing
  // with Export/Adjust scroll bodies even when inert for keyboard.
  const showAfterPathWebsiteToast =
    !tipBusy &&
    hasRecording &&
    openPanel === null &&
    !afterPathHintDismissedKeys.has(afterPathProjectKey)

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

      {/*
        Post-path website cue — top offset from measured header height (z-30 <
        header z-40) so Project / Export never overlap. Non-blocking; pointer
        events only on the toast itself.
      */}
      {showAfterPathWebsiteToast && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3 sm:px-4"
          style={{ top: toastTopPx }}
        >
          <div
            role="status"
            data-testid="after-path-website-toast"
            aria-describedby={afterPathToastTextId}
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-md"
          >
            <p
              id={afterPathToastTextId}
              className="min-w-0 flex-1 pt-0.5 leading-relaxed"
            >
              {AFTER_PATH_WEBSITE_HINT}
            </p>
            <button
              type="button"
              data-testid="btn-dismiss-after-path-toast"
              onClick={dismissAfterPathWebsiteHint}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Dismiss website export tip"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top chrome — pointer-events only on controls.
          When a floating panel is open, raise above the bottom dock (also z-40)
          so mobile panel actions are not covered by Sequence / Playback. */}
      <header
        ref={headerRef}
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:pt-4 ${
          openPanel ? 'z-50' : 'z-40'
        }`}
      >
        <div className="pointer-events-auto relative flex min-w-0 flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/80 bg-white/90 px-2.5 py-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] backdrop-blur-md">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                MotionSketch
              </span>
            </div>
            <ProjectNameInput
              committedName={projectName}
              onCommit={renameProject}
            />
            {saveLabel && (
              <p
                data-testid="header-save-status"
                className={
                  status === 'saved'
                    ? 'text-xs text-slate-500'
                    : 'text-xs font-medium text-amber-800'
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
              summary={
                hasRecording
                  ? 'Download for your website, or other ways'
                  : 'Create a path first'
              }
            >
              <div className="p-3">
                {hasRecording ? (
                  <ExportPanel />
                ) : (
                  <p
                    data-testid="export-empty"
                    className="text-sm text-slate-500"
                  >
                    Create a path (Record, Import SVG, or a Motion preset) to
                    download a website package — or open Other ways for React,
                    your own HTML, CSS-only, and the project file.
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

      {/* Bottom dock — min-h-0 so Sequence can shrink and scroll inside the slot.
          While path-editing, stack above chrome panels (z-50) so Move path /
          Edit points stay reachable under a tall Adjust sheet. Otherwise keep
          z-40 so an open Export panel can cover Sequence (mobile layout). */}
      <div
        data-testid="toolbar-slot"
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[100dvh] flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:pb-4 ${
          editing ? 'z-[60]' : 'z-40'
        }`}
      >
        <div className="flex min-h-0 w-full max-w-2xl flex-col items-center gap-2">
          {!editing &&
            !polishSession &&
            !glideSession &&
            !presetSession && <ClipTimeline />}
          {polishSession && <PolishPanel />}
          {glideSession && <GlidePanel />}
          {presetSession && <PresetPanel />}
          <PlaybackDock />
          {emptyTip && (
            <p
              id="stage-empty-hint"
              data-testid="stage-empty-hint"
              className="pointer-events-auto rounded-full border border-white/60 bg-white/85 px-3 py-1 text-center text-xs text-slate-600 shadow-sm backdrop-blur-md"
            >
              {emptyTip}
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
