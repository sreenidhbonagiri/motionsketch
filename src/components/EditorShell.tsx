import {
  useCallback,
  useEffect,
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
import { AdjustPanel } from './AdjustPanel'
import { AppearancePanel } from './AppearancePanel'
import { CanvasStage } from './CanvasStage'
import { ExampleGallery } from './ExampleGallery'
import { ExportPanel } from './ExportPanel'
import { GlidePanel } from './GlidePanel'
import { HelpPanel } from './HelpPanel'
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
import { TutorialCoach } from './TutorialCoach'
import { projectHasAnyRecording } from '../core/sceneActor'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'

const EXAMPLES_HINT_KEY = 'motionsketch.examplesHintDismissed'

/** Quiet control inside the slim header clusters. */
const headerBtn =
  'inline-flex h-7 min-h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06]'
/** Primary Export once a path exists. */
const headerBtnPrimary =
  'inline-flex h-7 min-h-7 items-center gap-1 rounded-lg bg-ms-primary px-2.5 text-xs font-medium text-white transition hover:bg-ms-primary-hover active:bg-ms-primary-pressed'
const headerCluster =
  'flex min-w-0 max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-ms-border bg-white/85 p-1 shadow-[var(--ms-shadow-sm)] backdrop-blur-xl'

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
  const headerRef = useRef<HTMLElement>(null)
  const toolbarSlotRef = useRef<HTMLDivElement>(null)
  // Header clearance for sheets / camera — no toast offset (tutorial coach is overlay-only).
  const [headerClearancePx, setHeaderClearancePx] = useState(96)
  // Actors panel sits above Sequence + dock; clearance tracks the live stack height.
  const [toolbarClearancePx, setToolbarClearancePx] = useState(96)

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

  const { view: tutorial, skipTutorial, goNext, restartTutorial } = useTutorial({
    openPanel,
    closePanels: closeChrome,
    ensureExportOpen,
  })

  const togglePanel = (id: ChromePanel) => {
    setExamplesOpen(false)
    setOpenPanel((prev) => (prev === id ? null : id))
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
      // ignore quota / private mode
    }
  }

  const isEmptyProject = useEditorStore((s) => !projectHasMeaningfulWork(s.project))
  const project = useEditorStore((s) => s.project)
  const projectName = project.name
  const renameProject = useEditorStore((s) => s.renameProject)

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
      setHeaderClearancePx(Math.ceil(el.getBoundingClientRect().height) + gapPx)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const slot = toolbarSlotRef.current
    if (!slot) return
    const gapPx = 8
    const update = () => {
      const stack = slot.firstElementChild
      if (!(stack instanceof HTMLElement)) return
      const top = stack.getBoundingClientRect().top
      const fromBottom = Math.max(0, window.innerHeight - top)
      setToolbarClearancePx(Math.ceil(fromBottom) + gapPx)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(slot)
    const stack = slot.firstElementChild
    if (stack instanceof HTMLElement) ro.observe(stack)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [editing, polishSession, glideSession, presetSession, hasRecording])

  const coarsePointer = useCoarsePointer()
  // Narrow sheets cover the dock; inert only there so desktop dock stays usable
  // under Adjust / Appearance / Export.
  const [narrowViewport, setNarrowViewport] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(max-width: 639px)').matches
  })
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = () => setNarrowViewport(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const sheetCoversChrome = !!openPanel && narrowViewport

  // Empty-board cue — hide once any take exists; dock covers armed/recording.
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
  // After tutorial is done/skipped, keep a dismissible empty-board tip.
  const showFirstUseIntro =
    !tutorial.active &&
    !tipBusy &&
    !hasRecording &&
    isEmptyProject &&
    !hintDismissed &&
    !examplesOpen
  // After dismiss (or non-empty untitled board), keep a screen-reader target for Record/Play.
  const showEmptyBoardSrHint =
    !tipBusy && !hasRecording && !showFirstUseIntro && !tutorial.active

  // Sheets + workspace zoom clear the measured header only (coach is overlay).
  const sheetTopPx = headerClearancePx

  return (
    <div
      data-testid="app-shell"
      className="fixed inset-0 overflow-hidden bg-[var(--ms-canvas)] text-ms-ink antialiased"
      style={{
        ['--ms-sheet-top' as string]: `${sheetTopPx}px`,
      }}
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

      {tutorial.active && tutorial.step && (
        <TutorialCoach
          step={tutorial.step}
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

      {/* Slim cohesive header — stacks on narrow so clusters never clip horizontally.
          When a panel is open, raise above the bottom dock so sheet actions stay reachable. */}
      <header
        ref={headerRef}
        className={`pointer-events-none absolute inset-x-0 top-0 flex flex-col items-stretch gap-1.5 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:px-3 sm:pt-3 ${
          openPanel ? 'z-50' : 'z-40'
        }`}
      >
        {/*
          Panels stay outside the blurred cluster so max-sm:fixed anchors to the
          viewport (backdrop-filter on an ancestor would trap fixed positioning).
        */}
        <div className="pointer-events-auto relative w-full min-w-0 sm:max-w-[min(100%,28rem)]">
          <div className={`${headerCluster} w-full`}>
            <div className="flex min-w-0 flex-1 flex-col justify-center px-1.5 py-0.5">
              <span className="hidden text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:block">
                MotionSketch
              </span>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <ProjectNameInput
                  committedName={projectName}
                  onCommit={renameProject}
                />
                {saveLabel && (
                  <p
                    data-testid="header-save-status"
                    className={
                      status === 'saved'
                        ? 'text-[10px] text-slate-500'
                        : 'text-[10px] font-medium text-amber-800'
                    }
                  >
                    {saveLabel}
                  </p>
                )}
              </div>
            </div>

            <div
              className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-900/10 sm:block"
              aria-hidden
            />

            <button
              type="button"
              data-testid="btn-project"
              aria-expanded={openPanel === 'project'}
              aria-controls="project-panel-root"
              onClick={() => togglePanel('project')}
              className={headerBtn}
            >
              <span aria-hidden className="text-slate-400">
                ▦
              </span>
              Project
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
              onClick={() => togglePanel('help')}
              className={headerBtn}
            >
              Help
            </button>
          </div>
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
          <FloatingPanel
            id="help"
            title="Help"
            open={openPanel === 'help'}
            onClose={closePanel}
            align="left"
          >
            <HelpPanel
              onRestartTutorial={() => {
                closePanel()
                restartTutorial()
              }}
            />
          </FloatingPanel>
        </div>

        <div className="pointer-events-auto relative w-full min-w-0 sm:w-auto">
          <div className={`${headerCluster} w-full justify-end sm:w-auto`}>
            <button
              type="button"
              data-testid="btn-adjust"
              aria-expanded={openPanel === 'adjust'}
              aria-controls="adjust-panel-root"
              onClick={() => togglePanel('adjust')}
              className={headerBtn}
            >
              <span aria-hidden className="text-slate-400">
                ⚙
              </span>
              Adjust
              {hasRecording && (
                <span
                  data-testid="adjust-summary"
                  className="rounded-md bg-slate-900/[0.06] px-1 py-px text-[10px] font-medium tabular-nums text-slate-600"
                >
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="btn-appearance"
              aria-expanded={openPanel === 'appearance'}
              aria-controls="appearance-panel-root"
              onClick={() => togglePanel('appearance')}
              className={headerBtn}
            >
              {actorIsImage ? (
                <img
                  aria-hidden
                  data-testid="appearance-swatch"
                  src={actor.image!.dataUrl}
                  alt=""
                  className="inline-block size-3 rounded-sm border border-slate-300 object-contain bg-white"
                />
              ) : (
                <span
                  aria-hidden
                  data-testid="appearance-swatch"
                  className="inline-block size-3 rounded-sm border border-slate-300"
                  style={{ background: actorColor }}
                />
              )}
              Appearance
            </button>

            <button
              type="button"
              data-testid="btn-export"
              aria-expanded={openPanel === 'export'}
              aria-controls="export-panel-root"
              onClick={() => togglePanel('export')}
              className={hasRecording ? headerBtnPrimary : headerBtn}
            >
              <span
                aria-hidden
                className={hasRecording ? 'text-slate-300' : 'text-slate-400'}
              >
                ↗
              </span>
              Export
            </button>
          </div>
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
                  the animation to your website (HTML or React)
                  — or open Advanced exports for CSS-only, your own HTML, and the
                  project file.
                </p>
              )}
            </div>
          </FloatingPanel>
        </div>
      </header>

      {/* Actor list — left, above Sequence + dock (clearance from live stack height).
          z-35 stacks above the toolbar (z-30) so the narrow Actors sheet is not
          covered by Sequence, and stays under the header (z-40).
          On narrow, expanded Actors floats as a fixed sheet (see ActorList) so the
          body is not crushed when Sequence owns the toolbar clearance.
          On narrow chrome sheets, inert the slot (prefs stay open). */}
      {!editing && (
        <div
          data-testid="actor-list-slot"
          className="pointer-events-none absolute left-3 z-[35] flex sm:left-4"
          style={{
            bottom: `max(${toolbarClearancePx}px, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))`,
            // Keep at least the toggle row when Sequence + dock dominate (desktop /
            // collapsed). Expanded narrow Actors ignores this via position:fixed.
            maxHeight: `max(2.75rem, calc(100dvh - env(safe-area-inset-top, 0px) - ${sheetTopPx}px - ${toolbarClearancePx}px))`,
          }}
          {...(sheetCoversChrome
            ? ({ inert: true, 'aria-hidden': true } as Record<string, unknown>)
            : {})}
        >
          <ActorList />
        </div>
      )}

      {/* Bottom dock — min-h-0 so Sequence can shrink and scroll inside the slot.
          While path-editing, stack above chrome panels (z-50) so Move path /
          Edit points stay reachable under a tall Adjust sheet. Otherwise keep
          z-30 under the header. Narrow sheets inert without collapsing prefs. */}
      <div
        ref={toolbarSlotRef}
        data-testid="toolbar-slot"
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 overflow-clip px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:pt-6 sm:pb-4 ${
          editing ? 'z-[60]' : 'z-30'
        }`}
        style={{
          // Never climb into the measured header.
          maxHeight: `calc(100dvh - ${sheetTopPx}px)`,
        }}
        {...(sheetCoversChrome && !editing
          ? ({ inert: true, 'aria-hidden': true } as Record<string, unknown>)
          : {})}
      >
        <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center gap-2 overflow-clip">
          {!editing &&
            !polishSession &&
            !glideSession &&
            !presetSession && <ClipTimeline />}
          {polishSession && <PolishPanel />}
          {glideSession && <GlidePanel />}
          {presetSession && <PresetPanel />}
          <PlaybackDock />
          {showFirstUseIntro && (
            <div
              id="stage-empty-hint"
              data-testid="stage-empty-hint"
              className="pointer-events-auto flex w-full max-w-sm flex-col gap-1.5 rounded-xl border border-ms-border bg-white/90 px-3.5 py-2.5 text-center shadow-[var(--ms-shadow-sm)] backdrop-blur-xl"
            >
              <p
                data-testid="first-use-headline"
                className="text-sm font-semibold tracking-tight text-slate-900"
              >
                {FIRST_USE_HEADLINE}
              </p>
              <p
                data-testid="first-use-next-step"
                className="text-xs leading-snug text-slate-600"
              >
                {firstUseNextStep}
              </p>
              <div className="mt-0.5 flex items-center justify-center gap-2">
                <button
                  type="button"
                  data-testid="btn-try-example"
                  onClick={openExamples}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-800 underline-offset-2 transition hover:bg-slate-900/[0.05] hover:underline"
                >
                  Try an example
                </button>
                <button
                  type="button"
                  data-testid="btn-dismiss-examples-hint"
                  onClick={dismissFirstUseIntro}
                  className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Dismiss introduction"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {showEmptyBoardSrHint && (
            <p id="stage-empty-hint" data-testid="stage-empty-hint" className="sr-only">
              {emptyBoardHelp}
            </p>
          )}
        </div>
      </div>

      {examplesOpen && <ExampleGallery onClose={closeExamples} />}
    </div>
  )
}
