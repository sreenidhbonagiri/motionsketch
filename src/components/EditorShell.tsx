import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ArrowLeft,
  CircleHelp,
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
  INSPECTOR_PANEL_OPEN_KEY,
  readPanelOpenPref,
  writePanelOpenPref,
} from '../lib/panelOpenPref'
import { ActorList } from './ActorList'
import { CanvasStage } from './CanvasStage'
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
  'inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg bg-ms-export px-2.5 text-xs font-medium text-white transition hover:bg-ms-export-hover'

type MobilePane = 'elements' | 'inspector' | null

/**
 * Canvas-first docked editor: large stage by default; Elements and Inspector
 * open on demand and reserve layout space (never float over the canvas).
 * Timing is an on-demand dialog from the playback dock.
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
  const motionPreviewSession =
    !!polishSession || !!glideSession || !!presetSession
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
  // Fresh workspace: side panels closed so the canvas owns the first paint.
  const [actorsOpen, setActorsOpen] = useState(() =>
    readPanelOpenPref(ACTORS_PANEL_OPEN_KEY, false),
  )
  const [inspectorOpen, setInspectorOpen] = useState(() =>
    readPanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, false),
  )
  // Focused Elements/Inspector sheets when width is phone-like OR height is
  // too short for canvas + Inspector together (no silent panel close).
  const [narrowViewport, setNarrowViewport] = useState(false)
  const [shortViewport, setShortViewport] = useState(false)
  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 767px)')
    const mqShort = window.matchMedia('(max-height: 560px)')
    const sync = () => {
      setNarrowViewport(mqNarrow.matches)
      setShortViewport(mqShort.matches)
    }
    sync()
    mqNarrow.addEventListener('change', sync)
    mqShort.addEventListener('change', sync)
    return () => {
      mqNarrow.removeEventListener('change', sync)
      mqShort.removeEventListener('change', sync)
    }
  }, [])
  const useFocusedChrome = narrowViewport || shortViewport

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
  const shortcutsReturnFocusRef = useRef<HTMLElement | null>(null)
  const openShortcuts = useCallback((opener?: HTMLElement | null) => {
    setExamplesOpen(false)
    // Keep Help mounted so Keyboard shortcuts can receive focus on close.
    // Prefer the explicit opener (Help button); otherwise the prior focus.
    const active = document.activeElement
    shortcutsReturnFocusRef.current =
      opener ??
      (active instanceof HTMLElement ? active : null)
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

  const isFocusedLayout = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 767px)').matches ||
      window.matchMedia('(max-height: 560px)').matches)

  const openInspector = useCallback((tab: InspectorTab) => {
    setInspectorTab(tab)
    setOpenPanel(null)
    setExamplesOpen(false)
    if (isFocusedLayout()) {
      setMobilePane('inspector')
      return
    }
    setInspectorOpen(true)
    writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, true)
  }, [])

  const closeInspectorDesktop = useCallback(() => {
    setInspectorOpen(false)
    writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, false)
  }, [])

  const toggleActors = () => {
    if (isFocusedLayout()) {
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
    if (isFocusedLayout()) {
      setMobilePane((prev) => (prev === 'inspector' ? null : 'inspector'))
      return
    }
    setInspectorOpen((prev) => {
      const next = !prev
      writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, next)
      return next
    })
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

  // Motion preview needs a visible stage and reachable Apply/Cancel. On focused
  // chrome, leave the inspector sheet so the stage cell is not 0×0.
  useEffect(() => {
    if (!motionPreviewSession) return
    if (useFocusedChrome) setMobilePane(null)
    const id = window.requestAnimationFrame(() => {
      const panel =
        document.querySelector<HTMLElement>('[data-testid="polish-panel"]') ??
        document.querySelector<HTMLElement>('[data-testid="glide-panel"]') ??
        document.querySelector<HTMLElement>('[data-testid="preset-panel"]')
      const focusTarget =
        panel?.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled])',
        ) ?? panel
      focusTarget?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [motionPreviewSession, useFocusedChrome])

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

  const showElementsDesktop = actorsOpen && !editing
  const showInspectorDesktop = inspectorOpen
  const showElementsMobile = mobilePane === 'elements' && !editing
  const showInspectorMobile = mobilePane === 'inspector'
  // Focused chrome (phone or short height): one sheet at a time. Else docked.
  const showElementsPane = useFocusedChrome
    ? showElementsMobile
    : showElementsDesktop
  const showInspectorPane = useFocusedChrome
    ? showInspectorMobile
    : showInspectorDesktop
  // When Elements or Inspector is open in focused mode, that pane owns the
  // workspace — stage is hidden so the dock cannot crush a tiny canvas.
  const phoneTaskPane =
    useFocusedChrome && (showInspectorMobile || showElementsMobile)
  const backToStage = () => setMobilePane(null)
  // Static Tailwind class strings only (JIT will not emit dynamic templates).
  const workspaceCols = showElementsDesktop
    ? showInspectorDesktop
      ? 'md:grid-cols-[minmax(0,min(14rem,24%))_minmax(0,1fr)_minmax(0,min(18rem,30%))]'
      : 'md:grid-cols-[minmax(0,min(14rem,24%))_minmax(0,1fr)]'
    : showInspectorDesktop
      ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,min(18rem,32%))]'
      : 'md:grid-cols-[minmax(0,1fr)]'
  const motionSummary = hasRecording
    ? `${(durationMs / 1000).toFixed(1)}s`
    : null

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

      <ShortcutSheet
        open={shortcutsOpen}
        onClose={closeShortcuts}
        returnFocusRef={shortcutsReturnFocusRef}
      />

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
              useFocusedChrome ? showElementsMobile : showElementsDesktop
            }
            aria-label="Elements"
            title="Elements"
            onClick={toggleActors}
            className={headerBtn}
          >
            <PanelLeft className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Elements</span>
          </button>
          <button
            type="button"
            data-testid="btn-toggle-inspector-pane"
            aria-pressed={
              useFocusedChrome ? showInspectorMobile : showInspectorDesktop
            }
            aria-label="Inspector"
            title="Inspector"
            onClick={toggleInspectorPane}
            className={headerBtn}
          >
            <PanelRight className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Inspector</span>
          </button>
          <button
            type="button"
            data-testid="btn-help"
            aria-label="Help"
            title="Help"
            aria-expanded={openPanel === 'help'}
            aria-controls="help-panel-root"
            onClick={() => {
              setExamplesOpen(false)
              setOpenPanel((prev) => (prev === 'help' ? null : 'help'))
            }}
            className={headerBtn}
          >
            <CircleHelp className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Help</span>
          </button>
          <button
            type="button"
            data-testid="btn-examples"
            aria-haspopup="dialog"
            aria-expanded={examplesOpen}
            onClick={openExamples}
            className={`${headerBtn} max-md:px-1.5`}
            title="Examples"
          >
            <span className="md:hidden">Ex.</span>
            <span className="hidden md:inline">Examples</span>
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
                onOpenShortcuts={openShortcuts}
              />
            </FloatingPanel>
          </div>
        </div>
      </header>

      {/* Main workspace grid */}
      <div
        data-testid="editor-workspace"
        className={`grid min-h-0 flex-1 overflow-hidden grid-cols-1 ${
          phoneTaskPane
            ? 'grid-rows-[minmax(0,1fr)_auto]'
            : 'grid-rows-[minmax(10rem,1fr)_auto]'
        } ${workspaceCols} md:grid-rows-[minmax(0,1fr)_auto]`}
      >
        {/* Elements — left sidebar on desktop; full-height sheet on phone */}
        {showElementsPane && (
          <aside
            data-testid="actor-list-slot"
            className={`flex min-h-0 min-w-0 flex-col bg-white/80 md:row-span-2 md:border-r md:border-ms-border ${
              useFocusedChrome ? 'border-0' : 'border-b border-ms-border'
            }`}
          >
            {useFocusedChrome && (
              <div className="flex shrink-0 items-center gap-1 border-b border-ms-border px-1.5 py-1">
                <button
                  type="button"
                  data-testid="btn-elements-back-to-stage"
                  onClick={backToStage}
                  className="inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06]"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Stage
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <ActorList
                variant="docked"
                forceOpen
                onOpenChange={(open) => {
                  setActorsOpen(open)
                  writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, open)
                  if (!open) setMobilePane((p) => (p === 'elements' ? null : p))
                }}
              />
            </div>
          </aside>
        )}

        {/* Stage — measures this cell as its viewport */}
        <section
          data-testid="stage-viewport"
          className={
            phoneTaskPane
              ? 'hidden'
              : 'relative min-h-[10rem] min-w-0 overflow-hidden bg-[var(--ms-canvas)] md:min-h-0'
          }
          aria-hidden={phoneTaskPane || undefined}
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
                id="stage-empty-hint"
                data-testid="stage-empty-hint"
                className="mt-1 text-sm text-slate-600"
              >
                <span data-testid="first-use-next-step">{firstUseNextStep}</span>
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
              id="stage-empty-hint"
              data-testid="stage-empty-hint"
              className="sr-only"
            >
              {emptyBoardHelp}
            </p>
          )}
        </section>

        {/* Inspector — right column on desktop; full-height sheet on phone */}
        {showInspectorPane && (
          <div
            data-testid="inspector-slot"
            className="min-h-0 min-w-0 bg-white/90 md:row-span-2 md:border-l md:border-ms-border"
          >
            <InspectorPanel
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              onBackToStage={useFocusedChrome ? backToStage : undefined}
              onClose={useFocusedChrome ? undefined : closeInspectorDesktop}
              motionSummary={motionSummary}
            />
          </div>
        )}

        {/* Bottom transport — compact dock; Timing is a dialog, not a panel. */}
        <div
          data-testid="toolbar-slot"
          className={`col-span-full flex flex-col items-stretch gap-0 border-t border-ms-border bg-white/95 ${
            editing
              ? 'min-h-0 shrink-0 overflow-visible max-h-[min(42vh,14rem)]'
              : motionPreviewSession
                ? 'min-h-0 shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain max-h-[min(48vh,20rem)] md:max-h-[min(44vh,18rem)]'
                : `min-h-0 overflow-hidden ${
                    phoneTaskPane
                      ? 'max-md:max-h-[min(22vh,9rem)] max-h-[min(26vh,10rem)]'
                      : shortViewport
                        ? 'max-h-[min(36vh,10rem)]'
                        : 'max-h-[min(26vh,9rem)] md:max-h-[min(24vh,8.5rem)]'
                  }`
          } ${
            showElementsDesktop
              ? 'md:col-start-2 md:col-end-3'
              : 'md:col-start-1 md:col-end-2'
          }`}
        >
          {(polishSession || glideSession || presetSession) && (
            <div
              data-testid="motion-preview-slot"
              className="flex w-full shrink-0 justify-center px-2 pt-2"
            >
              {polishSession && <PolishPanel />}
              {glideSession && <GlidePanel />}
              {presetSession && <PresetPanel />}
            </div>
          )}
          <div className="shrink-0">
            <PlaybackDock />
          </div>
        </div>
      </div>

      {examplesOpen && <ExampleGallery onClose={closeExamples} />}
    </div>
  )
}
