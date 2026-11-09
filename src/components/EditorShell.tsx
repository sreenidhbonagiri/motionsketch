import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  CircleHelp,
  FolderKanban,
  PanelLeft,
  PanelRight,
  Upload,
} from 'lucide-react'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { useEditorShortcuts } from '../hooks/useEditorShortcuts'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { useTransformShortcuts } from '../hooks/useTransformShortcuts'
import { useTutorial } from '../hooks/useTutorial'
import {
  EMPTY_BOARD_RECORD_HINT_COARSE,
  EMPTY_BOARD_RECORD_HINT_FINE,
  FIRST_USE_HEADLINE,
  FIRST_USE_NEXT_STEP_COARSE,
  FIRST_USE_NEXT_STEP_FINE,
} from '../lib/modeStatus'
import { endDrag, isRecordingActive } from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import { projectHasAnyRecording } from '../core/sceneActor'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'
import {
  ACTORS_PANEL_OPEN_KEY,
  readPanelOpenPref,
  writePanelOpenPref,
} from '../lib/panelOpenPref'
import { ActorList } from './ActorList'
import { CanvasStage } from './CanvasStage'
import { ClipTimeline } from './ClipTimeline'
import { ExampleGallery } from './ExampleGallery'
import { ExportPanel } from './ExportPanel'
import { FloatingPanel, type ChromePanel } from './FloatingPanel'
import { GlidePanel } from './GlidePanel'
import { HelpPanel } from './HelpPanel'
import { InspectorPanel, type InspectorTab } from './InspectorPanel'
import { PlaybackDock } from './PlaybackDock'
import { PolishPanel } from './PolishPanel'
import { PresetPanel } from './PresetPanel'
import { ProjectNameInput } from './ProjectNameInput'
import { ShortcutSheet } from './ShortcutSheet'
import { TutorialCoach } from './TutorialCoach'

const EXAMPLES_HINT_KEY = 'motionsketch.examplesHintDismissed'

const headerBtn =
  'inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06]'
const headerBtnPrimary =
  'inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg bg-ms-primary px-2.5 text-xs font-medium text-white transition hover:bg-ms-primary-hover'

type MobilePane = 'elements' | 'inspector' | null

/**
 * Docked editor: slim header, Elements sidebar, center stage, right inspector,
 * bottom Timing + transport. Layout uses CSS grid/flex — panels reserve space
 * instead of floating over the stage.
 */
export function EditorShell() {
  usePlaybackClock()
  useTransformShortcuts()

  const mode = useEditorStore((s) => s.mode)
  const editing = mode === 'editing'
  const hasRecording = useEditorStore((s) =>
    projectHasAnyRecording(s.project),
  )
  const actionAnnouncement = useEditorStore((s) => s.actionAnnouncement)
  const polishSession = useEditorStore((s) => s.polishSession)
  const glideSession = useEditorStore((s) => s.glideSession)
  const presetSession = useEditorStore((s) => s.presetSession)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)

  const [openPanel, setOpenPanel] = useState<ChromePanel | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('style')
  const [mobilePane, setMobilePane] = useState<MobilePane>(null)
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(EXAMPLES_HINT_KEY) === '1'
    } catch {
      return false
    }
  })
  const [actorsOpen, setActorsOpen] = useState(() =>
    readPanelOpenPref(ACTORS_PANEL_OPEN_KEY, true),
  )
  const [narrowViewport, setNarrowViewport] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setNarrowViewport(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const closePanel = useCallback(() => setOpenPanel(null), [])
  const closeExamples = useCallback(() => setExamplesOpen(false), [])
  const closeChrome = useCallback(() => {
    setOpenPanel(null)
    setExamplesOpen(false)
  }, [])
  const ensureExportOpen = useCallback(() => {
    setExamplesOpen(false)
    setOpenPanel('export')
  }, [])
  const openShortcuts = useCallback(() => {
    setExamplesOpen(false)
    setOpenPanel(null)
    setShortcutsOpen(true)
  }, [])
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])

  const { view: tutorial, skipTutorial, goNext, restartTutorial } = useTutorial({
    openPanel,
    closePanels: closeChrome,
    ensureExportOpen,
  })

  useEditorShortcuts({
    shortcutsOpen,
    onOpenShortcuts: openShortcuts,
    onCloseShortcuts: closeShortcuts,
  })

  const openInspector = useCallback((tab: InspectorTab) => {
    setInspectorTab(tab)
    setMobilePane('inspector')
    setOpenPanel(null)
    setExamplesOpen(false)
  }, [])

  const toggleActors = () => {
    const narrow =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches
    if (narrow) {
      setMobilePane((prev) => {
        const next = prev === 'elements' ? null : 'elements'
        if (next === 'elements') {
          setActorsOpen(true)
          writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, true)
        }
        return next
      })
      return
    }
    setActorsOpen((prev) => {
      const next = !prev
      writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, next)
      return next
    })
  }

  const toggleInspectorPane = () => {
    setMobilePane((prev) => (prev === 'inspector' ? null : 'inspector'))
  }

  const openExamples = () => {
    setOpenPanel(null)
    setExamplesOpen(true)
  }

  const dismissFirstUseIntro = () => {
    setHintDismissed(true)
    try {
      sessionStorage.setItem(EXAMPLES_HINT_KEY, '1')
    } catch {
      // ignore
    }
  }

  const isEmptyProject = useEditorStore((s) => !projectHasMeaningfulWork(s.project))
  const project = useEditorStore((s) => s.project)
  const projectName = project.name
  const renameProject = useEditorStore((s) => s.renameProject)
  const { status, practiceSuspended } = useProjectPersistence()
  const saveLabel = statusLabel(status, { practice: practiceSuspended })

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && isRecordingActive()) {
        endDrag(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    const onOpenInspector = (event: Event) => {
      const tab = (event as CustomEvent<InspectorTab>).detail
      if (tab !== 'style' && tab !== 'motion' && tab !== 'project') return
      openInspector(tab)
    }
    window.addEventListener('ms-open-inspector', onOpenInspector)
    return () => window.removeEventListener('ms-open-inspector', onOpenInspector)
  }, [openInspector])

  const coarsePointer = useCoarsePointer()
  const tipBusy =
    mode !== 'idle' ||
    !!polishSession ||
    !!glideSession ||
    !!presetSession ||
    tutorial.active
  const emptyBoardHelp = coarsePointer
    ? EMPTY_BOARD_RECORD_HINT_COARSE
    : EMPTY_BOARD_RECORD_HINT_FINE
  const firstUseNextStep = coarsePointer
    ? FIRST_USE_NEXT_STEP_COARSE
    : FIRST_USE_NEXT_STEP_FINE
  const showFirstUseIntro =
    !tutorial.active &&
    !tipBusy &&
    !hasRecording &&
    isEmptyProject &&
    !hintDismissed &&
    !examplesOpen
  const showEmptyBoardSrHint =
    !tipBusy && !hasRecording && !showFirstUseIntro && !tutorial.active

  const sessionChrome = polishSession || glideSession || presetSession
  const showElementsDesktop = actorsOpen && !editing
  const showElementsMobile = mobilePane === 'elements' && !editing
  const showInspectorMobile = mobilePane === 'inspector'
  // Phone: mount only the explicit sheet. Desktop: mount the sidebar when open.
  const showElementsPane = narrowViewport
    ? showElementsMobile
    : showElementsDesktop
  const showInspectorPane = !narrowViewport || showInspectorMobile

  return (
    <div
      data-testid="app-shell"
      className="fixed inset-0 flex flex-col overflow-hidden bg-[var(--ms-canvas)] text-ms-ink antialiased"
    >
      <div
        data-testid="action-live-region"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {actionAnnouncement ?? ''}
      </div>

      <ShortcutSheet open={shortcutsOpen} onClose={closeShortcuts} />

      {tutorial.active && tutorial.step && (
        <TutorialCoach
          step={tutorial.step}
          title={tutorial.coachTitle}
          body={tutorial.coachBody}
          highlightTestId={tutorial.highlightTestId}
          softHighlight={tutorial.softHighlight}
          exportOpen={openPanel === 'export'}
          showNext={tutorial.showNext}
          nextIsFinish={tutorial.nextIsFinish}
          onSkip={skipTutorial}
          onNext={goNext}
        />
      )}

      {/* Slim header — brand, name, essential chrome */}
      <header
        data-testid="editor-header"
        className="relative z-40 flex shrink-0 items-center gap-2 border-b border-ms-border bg-white/95 px-3 py-1.5 sm:px-4"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
              MotionSketch
            </div>
            <div className="flex min-w-0 flex-nowrap items-baseline gap-x-1.5">
              <ProjectNameInput
                committedName={projectName}
                onCommit={renameProject}
              />
              {saveLabel && (
                <p
                  data-testid="header-save-status"
                  title={saveLabel}
                  className={
                    status === 'save-error' || status === 'restore-error'
                      ? 'min-w-0 shrink truncate text-xs font-medium text-amber-800'
                      : 'min-w-0 shrink truncate text-xs text-ms-muted'
                  }
                >
                  {saveLabel}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-testid="btn-toggle-elements-pane"
            aria-pressed={
              narrowViewport ? showElementsMobile : showElementsDesktop
            }
            aria-label="Elements"
            title="Elements"
            onClick={toggleActors}
            className={headerBtn}
          >
            <PanelLeft className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Elements</span>
          </button>
          <button
            type="button"
            data-testid="btn-toggle-inspector-pane"
            aria-pressed={showInspectorMobile}
            aria-label="Inspector"
            title="Inspector"
            onClick={toggleInspectorPane}
            className={`${headerBtn} sm:hidden`}
          >
            <PanelRight className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            data-testid="btn-project"
            aria-expanded={inspectorTab === 'project'}
            onClick={() => openInspector('project')}
            className={`${headerBtn} max-sm:hidden`}
          >
            <FolderKanban className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Project</span>
          </button>
          <button
            type="button"
            data-testid="btn-examples"
            aria-haspopup="dialog"
            aria-expanded={examplesOpen}
            onClick={openExamples}
            className={headerBtn}
          >
            Examples
          </button>
          <button
            type="button"
            data-testid="btn-help"
            aria-expanded={openPanel === 'help'}
            aria-controls="help-panel-root"
            onClick={() => {
              setExamplesOpen(false)
              setOpenPanel((prev) => (prev === 'help' ? null : 'help'))
            }}
            className={headerBtn}
          >
            <CircleHelp className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Help</span>
          </button>
          <button
            type="button"
            data-testid="btn-appearance"
            aria-expanded={inspectorTab === 'style'}
            onClick={() => openInspector('style')}
            className={`${headerBtn} max-sm:hidden`}
          >
            Style
          </button>
          <button
            type="button"
            data-testid="btn-adjust"
            aria-expanded={inspectorTab === 'motion'}
            onClick={() => openInspector('motion')}
            className={`${headerBtn} max-sm:hidden`}
          >
            Motion
            {hasRecording && (
              <span
                data-testid="adjust-summary"
                className="rounded-md bg-slate-900/[0.06] px-1 py-px text-xs font-medium tabular-nums text-ms-ink"
              >
                {(durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </button>
          <div className="relative">
            <button
              type="button"
              data-testid="btn-export"
              aria-expanded={openPanel === 'export'}
              aria-controls="export-panel-root"
              onClick={() => {
                setExamplesOpen(false)
                setOpenPanel((prev) => (prev === 'export' ? null : 'export'))
              }}
              className={hasRecording ? headerBtnPrimary : headerBtn}
            >
              <Upload className="size-3.5" aria-hidden />
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
                    Create a path (Record, Import SVG, or a Motion preset) to add
                    the animation to your website (HTML or React), or open
                    Advanced exports for CSS-only, your own HTML, and the project
                    file.
                  </p>
                )}
              </div>
            </FloatingPanel>
            <FloatingPanel
              id="help"
              title="Help"
              open={openPanel === 'help'}
              onClose={closePanel}
              align="right"
            >
              <HelpPanel
                onRestartTutorial={() => {
                  closePanel()
                  restartTutorial()
                }}
                onOpenShortcuts={() => {
                  closePanel()
                  openShortcuts()
                }}
              />
            </FloatingPanel>
          </div>
        </div>
      </header>

      {/* Main workspace grid */}
      <div
        data-testid="editor-workspace"
        className={`grid min-h-0 flex-1 overflow-hidden grid-cols-1 ${
          showInspectorPane && narrowViewport
            ? 'grid-rows-[minmax(10rem,1fr)_minmax(11rem,38%)_auto]'
            : showElementsPane && narrowViewport
              ? 'grid-rows-[minmax(8rem,40%)_minmax(10rem,1fr)_auto]'
              : 'grid-rows-[minmax(10rem,1fr)_auto]'
        } ${
          showElementsDesktop
            ? 'sm:grid-cols-[16rem_minmax(0,1fr)_minmax(16rem,20rem)]'
            : 'sm:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]'
        } sm:grid-rows-[minmax(0,1fr)_auto]`}
      >
        {/* Elements — left sidebar on desktop; explicit sheet on phone */}
        {showElementsPane && (
          <aside
            data-testid="actor-list-slot"
            className="min-h-0 min-w-0 border-b border-ms-border bg-white/80 sm:row-span-2 sm:border-b-0 sm:border-r"
          >
            <ActorList
              variant="docked"
              forceOpen
              onOpenChange={(open) => {
                setActorsOpen(open)
                writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, open)
                if (!open) setMobilePane((p) => (p === 'elements' ? null : p))
              }}
            />
          </aside>
        )}

        {/* Stage — measures this cell as its viewport */}
        <section
          data-testid="stage-viewport"
          className="relative min-h-[10rem] min-w-0 overflow-hidden bg-[var(--ms-canvas)] sm:min-h-0"
        >
          <CanvasStage />
          {showFirstUseIntro && (
            <div
              data-testid="first-use-intro"
              className="pointer-events-auto absolute bottom-3 left-1/2 z-20 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border border-ms-border bg-white/92 p-3 shadow-[var(--ms-shadow)] backdrop-blur-xl"
            >
              <p
                data-testid="first-use-headline"
                className="text-sm font-semibold text-slate-800"
              >
                {FIRST_USE_HEADLINE}
              </p>
              <p
                data-testid="first-use-next-step"
                className="mt-1 text-sm text-slate-600"
              >
                {firstUseNextStep}
              </p>
              <p
                data-testid="stage-empty-hint"
                className="mt-1 text-xs text-slate-500"
              >
                {emptyBoardHelp}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="btn-try-example"
                  onClick={openExamples}
                  className={headerBtnPrimary}
                >
                  Try an example
                </button>
                <button
                  type="button"
                  data-testid="btn-dismiss-first-use"
                  onClick={dismissFirstUseIntro}
                  className={headerBtn}
                >
                  Dismiss introduction
                </button>
              </div>
            </div>
          )}
          {showEmptyBoardSrHint && (
            <p
              id="empty-board-sr-hint"
              data-testid="stage-empty-hint"
              className="sr-only"
            >
              {emptyBoardHelp}
            </p>
          )}
        </section>

        {/* Inspector — right column on desktop; reserved sheet on phone */}
        {showInspectorPane && (
          <div
            data-testid="inspector-slot"
            className="min-h-0 min-w-0 border-ms-border bg-white/90 max-sm:border-t sm:row-span-2 sm:border-l"
          >
            <InspectorPanel tab={inspectorTab} onTabChange={setInspectorTab} />
          </div>
        )}

        {/* Bottom Timing + transport — in normal flow, never covers the stage */}
        <div
          data-testid="toolbar-slot"
          className={`col-span-full flex min-h-0 max-h-[min(48vh,22rem)] flex-col items-stretch gap-0 overflow-hidden border-t border-ms-border bg-white/92 sm:max-h-[min(42vh,20rem)] ${
            showElementsDesktop
              ? 'sm:col-start-2 sm:col-end-3'
              : 'sm:col-start-1 sm:col-end-2'
          }`}
        >
          {!editing && !sessionChrome && hasRecording && (
            <div className="min-h-0 max-h-[min(40vh,18rem)] overflow-hidden border-b border-ms-border">
              <ClipTimeline />
            </div>
          )}
          {polishSession && <PolishPanel />}
          {glideSession && <GlidePanel />}
          {presetSession && <PresetPanel />}
          <div className="shrink-0 px-2 py-2 sm:px-3">
            <PlaybackDock />
          </div>
        </div>
      </div>

      {examplesOpen && <ExampleGallery onClose={closeExamples} />}
    </div>
  )
}
