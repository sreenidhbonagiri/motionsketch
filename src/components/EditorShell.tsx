import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Check,
  CircleAlert,
  CircleHelp,
  Library,
  PanelLeft,
  PanelRight,
  Upload,
  X,
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
import { BringToLifePanel } from './BringToLifePanel'
import { GlidePanel } from './GlidePanel'
import { HelpPanel } from './HelpPanel'
import { InspectorPanel, type InspectorTab } from './InspectorPanel'
import { PlaybackDock } from './PlaybackDock'
import {
  canFloatBothWorkspaceCards,
  FLOATING_ELEMENTS_SLOT_CLASS,
  FLOATING_INSPECTOR_WIDTH_CLASS,
  FOCUSED_CAMERA_CHROME_CLASS,
  FOCUSED_PANEL_SPLIT_ROWS_CLASS,
  FOCUSED_PANEL_SPLIT_ROWS_SHORT_CLASS,
  FOCUSED_SHEET_CHROME_CLASS,
  FOCUSED_SHEET_CONTENT_CLASS,
  floatingWorkspaceCardClass,
  floatingWorkspaceCardSlotClass,
} from '../theme/floatingCard'
import { PolishPanel } from './PolishPanel'
import { PresetPanel } from './PresetPanel'
import { ProjectNameInput } from './ProjectNameInput'
import { ShortcutSheet } from './ShortcutSheet'
import { TutorialCoach } from './TutorialCoach'

const EXAMPLES_HINT_KEY = 'motionsketch.examplesHintDismissed'

const headerBtn =
  'inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06]'
const headerBtnPrimary =
  'inline-flex h-8 min-h-8 items-center gap-1.5 rounded-full bg-ms-export px-3 text-xs font-medium text-white shadow-[var(--ms-shadow-sm)] transition hover:bg-ms-export-hover'

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
  const bringToLifeSession = useEditorStore((s) => s.bringToLifeSession)
  const motionPreviewSession =
    !!polishSession ||
    !!glideSession ||
    !!presetSession ||
    !!bringToLifeSession
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
  /** While renaming, compact the saved status to the check + accessible label. */
  const [renamingProject, setRenamingProject] = useState(false)
  /** Scroll to re-apply after Export temporarily unmounts the Inspector. */
  const [inspectorScrollRestore, setInspectorScrollRestore] = useState(0)
  const captureInspectorScroll = () => {
    const panel = document.querySelector('[data-testid="inspector-panel"]')
    if (!(panel instanceof HTMLElement)) {
      setInspectorScrollRestore(0)
      return
    }
    if (panel.scrollHeight > panel.clientHeight + 1) {
      setInspectorScrollRestore(panel.scrollTop)
      return
    }
    let node: HTMLElement | null = panel.parentElement
    while (node) {
      const cs = getComputedStyle(node)
      if (
        (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        setInspectorScrollRestore(node.scrollTop)
        return
      }
      node = node.parentElement
    }
    setInspectorScrollRestore(panel.scrollTop)
  }
  // Focused Elements/Inspector sheets when width is phone-like OR height is
  // too short for canvas + Inspector together (no silent panel close).
  // Also when both floating cards would leave too little clear stage width.
  const [narrowViewport, setNarrowViewport] = useState(false)
  const [shortViewport, setShortViewport] = useState(false)
  const [viewportWidthPx, setViewportWidthPx] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  )
  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 767px)')
    const mqShort = window.matchMedia('(max-height: 560px)')
    const sync = () => {
      setNarrowViewport(mqNarrow.matches)
      setShortViewport(mqShort.matches)
      setViewportWidthPx(window.innerWidth)
    }
    sync()
    mqNarrow.addEventListener('change', sync)
    mqShort.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mqNarrow.removeEventListener('change', sync)
      mqShort.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])
  // Both cards open + not enough clear stage → focused sheets (not squeeze /
  // silent close). Single-card floating still allowed at mid widths.
  const bothCardsCrowded =
    actorsOpen &&
    inspectorOpen &&
    !canFloatBothWorkspaceCards(viewportWidthPx)
  const useFocusedChrome =
    narrowViewport || shortViewport || bothCardsCrowded

  const closePanel = useCallback(() => setOpenPanel(null), [])
  const closeExamples = useCallback(() => setExamplesOpen(false), [])
  const closeChrome = useCallback(() => {
    setOpenPanel(null)
    setExamplesOpen(false)
  }, [])
  const ensureExportOpen = useCallback(() => {
    setExamplesOpen(false)
    captureInspectorScroll()
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

  const isFocusedLayout = () => {
    if (typeof window === 'undefined') return false
    if (
      window.matchMedia('(max-width: 767px)').matches ||
      window.matchMedia('(max-height: 560px)').matches
    ) {
      return true
    }
    // Crowded both-cards mode uses the same sheet toggles as phone.
    return (
      actorsOpen &&
      inspectorOpen &&
      !canFloatBothWorkspaceCards(window.innerWidth)
    )
  }

  const openInspector = useCallback((tab: InspectorTab) => {
    setInspectorTab(tab)
    setOpenPanel(null)
    setExamplesOpen(false)
    // Opening Inspector while Elements is already open on a crowded width
    // must use focused sheets — not float both.
    const wouldCrowdBoth =
      actorsOpen && !canFloatBothWorkspaceCards(window.innerWidth)
    if (isFocusedLayout() || wouldCrowdBoth) {
      setInspectorOpen(true)
      writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, true)
      setMobilePane('inspector')
      return
    }
    setInspectorOpen(true)
    writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, true)
  }, [actorsOpen])

  const closeInspectorDesktop = useCallback(() => {
    setInspectorOpen(false)
    writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, false)
  }, [])

  const toggleActors = () => {
    const wouldCrowdBoth =
      !actorsOpen &&
      inspectorOpen &&
      !canFloatBothWorkspaceCards(window.innerWidth)
    if (isFocusedLayout() || wouldCrowdBoth) {
      setMobilePane((prev) => {
        const next = prev === 'elements' ? null : 'elements'
        if (next === 'elements') {
          setActorsOpen(true)
          writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, true)
        } else if (prev === 'elements') {
          // Closing the focused sheet keeps the other panel's pref intact.
          setActorsOpen(false)
          writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, false)
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
    const wouldCrowdBoth =
      !inspectorOpen &&
      actorsOpen &&
      !canFloatBothWorkspaceCards(window.innerWidth)
    if (isFocusedLayout() || wouldCrowdBoth) {
      setMobilePane((prev) => {
        const next = prev === 'inspector' ? null : 'inspector'
        if (next === 'inspector') {
          setInspectorOpen(true)
          writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, true)
        } else if (prev === 'inspector') {
          setInspectorOpen(false)
          writePanelOpenPref(INSPECTOR_PANEL_OPEN_KEY, false)
        }
        return next
      })
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

  // Motion preview needs a visible stage and reachable Apply/Cancel. Panel
  // splits keep the stage mounted; leave Elements so Apply/Cancel stay clear.
  useEffect(() => {
    if (!motionPreviewSession) return
    if (useFocusedChrome && mobilePane === 'elements') setMobilePane(null)
    const id = window.requestAnimationFrame(() => {
      const panel =
        document.querySelector<HTMLElement>('[data-testid="polish-panel"]') ??
        document.querySelector<HTMLElement>('[data-testid="glide-panel"]') ??
        document.querySelector<HTMLElement>('[data-testid="preset-panel"]') ??
        document.querySelector<HTMLElement>(
          '[data-testid="bring-to-life-panel"]',
        )
      const focusTarget =
        panel?.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled])',
        ) ?? panel
      focusTarget?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [motionPreviewSession, useFocusedChrome, mobilePane])

  // When the viewport becomes focused/crowded while both panels were floating,
  // show one sheet — do not silently clear prefs. Stage-back still leaves
  // mobilePane null until the user opens a panel again.
  const wasFocusedChromeRef = useRef(useFocusedChrome)
  useEffect(() => {
    const enteredFocused = useFocusedChrome && !wasFocusedChromeRef.current
    wasFocusedChromeRef.current = useFocusedChrome
    if (!enteredFocused) return
    if (mobilePane) return
    if (inspectorOpen) {
      setMobilePane('inspector')
      return
    }
    if (actorsOpen) setMobilePane('elements')
  }, [useFocusedChrome, mobilePane, inspectorOpen, actorsOpen])

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
  // Export must not stack over Inspector — hide while Export is open; restore
  // when it closes without clearing open prefs or moving the camera.
  const exportOpen = openPanel === 'export'
  const showInspectorDesktop = inspectorOpen && !exportOpen
  const showElementsMobile = mobilePane === 'elements' && !editing
  const showInspectorMobile = mobilePane === 'inspector' && !exportOpen
  // Focused chrome (phone or short height): one pane at a time. Else docked.
  // Desktop: Elements + Inspector float over the stage (no reserved columns).
  // Focused Elements/Inspector: stage above + panel below (~half usable height).
  const showElementsFloating =
    !useFocusedChrome && showElementsDesktop
  const showElementsSheet = useFocusedChrome && showElementsMobile
  const showInspectorFloating =
    !useFocusedChrome && showInspectorDesktop
  const showInspectorSheet = useFocusedChrome && showInspectorMobile
  const elementsSplitLayout = showElementsSheet
  const inspectorSplitLayout = showInspectorSheet
  const panelSplitLayout = elementsSplitLayout || inspectorSplitLayout
  const backToStage = () => setMobilePane(null)
  // Static Tailwind class strings only (JIT will not emit dynamic templates).
  // Neither side panel takes a desktop grid column (floating cards instead).
  const workspaceCols = 'md:grid-cols-[minmax(0,1fr)]'
  const workspaceRows = panelSplitLayout
    ? shortViewport
      ? FOCUSED_PANEL_SPLIT_ROWS_SHORT_CLASS
      : FOCUSED_PANEL_SPLIT_ROWS_CLASS
    : 'grid-rows-[minmax(10rem,1fr)_auto] md:grid-rows-[minmax(0,1fr)_auto]'
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
          exportOpen={exportOpen}
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
            <div data-testid="app-wordmark" className="ms-wordmark">
              MotionSketch
            </div>
            <div className="flex min-w-0 flex-nowrap items-baseline gap-x-1.5">
              <ProjectNameInput
                committedName={projectName}
                onCommit={renameProject}
                onEditingChange={setRenamingProject}
              />
              {saveLabel && (
                <p
                  data-testid="header-save-status"
                  title={saveLabel}
                  aria-label={saveLabel}
                  className={
                    status === 'save-error' || status === 'restore-error'
                      ? 'ms-caption ms-caption-lg inline-flex min-w-0 shrink items-center gap-1 font-medium text-amber-800'
                      : 'ms-caption ms-caption-lg inline-flex min-w-0 shrink items-center gap-1'
                  }
                >
                  {status === 'saved' && !practiceSuspended ? (
                    <>
                      <Check
                        className={
                          renamingProject
                            ? 'size-3.5 shrink-0 text-ms-success'
                            : 'size-3.5 shrink-0 text-ms-success md:hidden'
                        }
                        aria-hidden
                        strokeWidth={2.25}
                      />
                      <span
                        className={
                          renamingProject
                            ? 'sr-only'
                            : 'min-w-0 truncate max-md:sr-only'
                        }
                      >
                        {saveLabel}
                      </span>
                    </>
                  ) : status === 'save-error' || status === 'restore-error' ? (
                    <>
                      <CircleAlert
                        className="size-3.5 shrink-0 text-amber-800 md:hidden"
                        aria-hidden
                        strokeWidth={2.25}
                      />
                      <span className="min-w-0 truncate max-md:sr-only">
                        {saveLabel}
                      </span>
                    </>
                  ) : (
                    <span className="min-w-0 truncate">{saveLabel}</span>
                  )}
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
            className={`${headerBtn} select-none`}
          >
            <PanelLeft className="size-3.5" aria-hidden />
            <span className="hidden md:inline">Elements</span>
          </button>
          <button
            type="button"
            data-testid="btn-toggle-inspector-pane"
            aria-pressed={
              useFocusedChrome
                ? mobilePane === 'inspector'
                : inspectorOpen
            }
            aria-label="Inspector"
            title="Inspector"
            onClick={toggleInspectorPane}
            className={`${headerBtn} select-none`}
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
            aria-label="Examples"
            aria-haspopup="dialog"
            aria-expanded={examplesOpen}
            onClick={openExamples}
            className={headerBtn}
            title="Examples"
          >
            <Library className="size-3.5 md:hidden" aria-hidden />
            <span className="hidden md:inline">Examples</span>
          </button>
          <div className="relative">
            <button
              type="button"
              data-testid="btn-export"
              aria-expanded={exportOpen}
              aria-controls="export-panel-root"
              onClick={() => {
                setExamplesOpen(false)
                setOpenPanel((prev) => {
                  if (prev !== 'export') captureInspectorScroll()
                  return prev === 'export' ? null : 'export'
                })
              }}
              className={hasRecording ? headerBtnPrimary : headerBtn}
            >
              <Upload className="size-3.5" aria-hidden />
              Export
            </button>
            <FloatingPanel
              id="export"
              title="Export"
              open={exportOpen}
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

      {/* Focused phone/short: camera chrome outside the drawing stage cell. */}
      {useFocusedChrome && (
        <div
          id="ms-workspace-camera-slot"
          data-testid="workspace-camera-chrome"
          className={FOCUSED_CAMERA_CHROME_CLASS}
        />
      )}

      {/* Main workspace grid */}
      <div
        data-testid="editor-workspace"
        data-inspector-split={inspectorSplitLayout ? 'true' : undefined}
        data-elements-split={elementsSplitLayout ? 'true' : undefined}
        className={`grid min-h-0 flex-1 overflow-hidden grid-cols-1 ${workspaceRows} ${workspaceCols}`}
      >
        {/* Stage — measures this cell as its viewport (kept mounted under panel splits). */}
        <section
          data-testid="stage-viewport"
          className={
            panelSplitLayout
              ? 'relative min-h-0 min-w-0 overflow-hidden bg-[var(--ms-canvas)]'
              : 'relative min-h-[10rem] min-w-0 overflow-hidden bg-[var(--ms-canvas)] md:min-h-0'
          }
          data-elements-floating={showElementsFloating ? 'true' : undefined}
          data-inspector-floating={showInspectorFloating ? 'true' : undefined}
        >
          <CanvasStage
            floatingElements={showElementsFloating}
            floatingInspector={showInspectorFloating}
            externalCameraChrome={useFocusedChrome}
          />
          {showElementsFloating && (
            <div
              data-testid="actor-list-slot"
              className={FLOATING_ELEMENTS_SLOT_CLASS}
            >
              <div className={floatingWorkspaceCardClass}>
                <ActorList
                  variant="docked"
                  forceOpen
                  fillHeight={false}
                  onOpenChange={(open) => {
                    setActorsOpen(open)
                    writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, open)
                    if (!open) setMobilePane((p) => (p === 'elements' ? null : p))
                  }}
                />
              </div>
            </div>
          )}
          {showInspectorFloating && (
            <div
              data-testid="inspector-slot"
              className={`${floatingWorkspaceCardSlotClass} ${FLOATING_INSPECTOR_WIDTH_CLASS}`}
            >
              <div className={floatingWorkspaceCardClass}>
                <InspectorPanel
                  tab={inspectorTab}
                  onTabChange={setInspectorTab}
                  onClose={closeInspectorDesktop}
                  motionSummary={motionSummary}
                  fillHeight={false}
                  restoreScrollTop={inspectorScrollRestore}
                />
              </div>
            </div>
          )}
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

        {/* Elements — focused split under stage; desktop uses floating card on stage. */}
        {showElementsSheet && (
          <aside
            data-testid="actor-list-slot"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-ms-border bg-white"
          >
            <div className="flex shrink-0 justify-end border-b border-ms-border">
              <div className={`${FOCUSED_SHEET_CHROME_CLASS} justify-end`}>
                <button
                  type="button"
                  data-testid="btn-elements-back-to-stage"
                  onClick={backToStage}
                  aria-label="Close elements"
                  title="Close elements"
                  className="inline-flex h-8 min-h-8 select-none items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06]"
                >
                  <X className="size-3.5" aria-hidden strokeWidth={2} />
                  Close elements
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                data-testid="focused-sheet-content"
                className={FOCUSED_SHEET_CONTENT_CLASS}
              >
                <ActorList
                  variant="docked"
                  forceOpen
                  fillHeight
                  hideHeaderClose
                  onOpenChange={(open) => {
                    setActorsOpen(open)
                    writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, open)
                    if (!open)
                      setMobilePane((p) => (p === 'elements' ? null : p))
                  }}
                />
              </div>
            </div>
          </aside>
        )}

        {/* Inspector — focused split (stage above); desktop uses floating card on stage.
            Close + tabs share sticky chrome; measured height becomes scroll-padding. */}
        {showInspectorSheet && (
          <div
            data-testid="inspector-slot"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-ms-border bg-white"
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                data-testid="focused-sheet-content"
                className={FOCUSED_SHEET_CONTENT_CLASS}
              >
                <InspectorPanel
                  tab={inspectorTab}
                  onTabChange={setInspectorTab}
                  onBackToStage={backToStage}
                  motionSummary={motionSummary}
                  fillHeight
                  restoreScrollTop={inspectorScrollRestore}
                />
              </div>
            </div>
          </div>
        )}

        {/* Bottom transport — compact dock; Timing is a dialog, not a panel. */}
        <div
          data-testid="toolbar-slot"
          className={`col-span-full flex flex-col items-stretch gap-0 border-t border-ms-border bg-white shadow-[0_-4px_14px_rgb(15_23_42_/_0.04)] ${
            editing
              ? 'min-h-0 shrink-0 overflow-visible max-h-[min(42vh,14rem)]'
              : motionPreviewSession
                ? 'min-h-0 shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain max-h-[min(48vh,20rem)] md:max-h-[min(44vh,18rem)]'
                : `min-h-0 overflow-hidden ${
                    panelSplitLayout
                      ? 'max-h-[min(26vh,9rem)] md:max-h-[min(24vh,8.5rem)]'
                      : shortViewport
                        ? 'max-h-[min(36vh,10rem)]'
                        : 'max-h-[min(26vh,9rem)] md:max-h-[min(24vh,8.5rem)]'
                  }`
          } md:col-start-1 md:col-end-2`}
        >
          {(polishSession ||
            glideSession ||
            presetSession ||
            bringToLifeSession) && (
            <div
              data-testid="motion-preview-slot"
              className="flex w-full shrink-0 justify-center px-2 pt-2"
            >
              {polishSession && <PolishPanel />}
              {glideSession && <GlidePanel />}
              {presetSession && <PresetPanel />}
              {bringToLifeSession && <BringToLifePanel />}
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
