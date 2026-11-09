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
import { useEditorShortcuts } from '../hooks/useEditorShortcuts'
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
import { ShortcutSheet } from './ShortcutSheet'
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
import {
  ACTORS_PANEL_OPEN_KEY,
  readPanelOpenPref,
  SEQUENCE_PANEL_OPEN_KEY,
} from '../lib/panelOpenPref'

const EXAMPLES_HINT_KEY = 'motionsketch.examplesHintDismissed'
// Open Elements sheet on a narrow viewport: preferred body, and the smallest
// band that still keeps the collapse row. The toolbar keeps the dock, the
// Timing header, and its own padding. When Timing is expanded too, also keep
// a body tall enough that Start at, Move for, and Apply can scroll into view.
const NARROW_ACTORS_PREFERRED_PX = 272
const NARROW_ACTORS_MIN_PX = 120
const TIMING_HEADER_PX = 44
// Leaves the narrow Elements sheet about 108px on a 560px phone: Collapse,
// plus a scrollport tall enough for Add. Timing's body stays near 80px, so
// Start at / Move for / Apply fit when scrolled into it.
const TIMING_BODY_MIN_PX = 72
// The help block is ~160px at this column width and grows when text wraps.
// The list floor keeps that scrollport above the 48px wheel target after the
// dock gains a wrapped status line; only the timing reserve above its own
// floor is given up.
const ELEMENTS_LIST_FLOOR_PX = 112
const TIMING_BODY_FLOOR_PX = 56
const TOOLBAR_CHROME_PX = 36
const PANEL_GAP_PX = 8
const ACTORS_SHEET_LEFT_PX = 12
// Desktop Elements sheet: sm:left-4 + 16rem. Timing column is max-w-2xl.
const DESKTOP_ACTORS_RIGHT_PX = 16 + 256
const TIMING_MAX_PX = 672
const SLOT_PAD_X_PX = 12

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
  const { status, practiceSuspended } = useProjectPersistence()
  const saveLabel = statusLabel(status, { practice: practiceSuspended })
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
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
  const [viewportHeightPx, setViewportHeightPx] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )
  const [viewportWidthPx, setViewportWidthPx] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  )
  const [dockHeightPx, setDockHeightPx] = useState(176)
  // Space from the viewport bottom to the top of the dock, so right-hand
  // chrome panels stop above Play rather than using the whole Timing stack.
  const [dockClearancePx, setDockClearancePx] = useState(192)
  const [cameraLeftPx, setCameraLeftPx] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  )
  const [cameraBottomPx, setCameraBottomPx] = useState(0)
  const [actorsOpen, setActorsOpen] = useState(() =>
    readPanelOpenPref(ACTORS_PANEL_OPEN_KEY, false),
  )
  const [sequenceOpen, setSequenceOpen] = useState(() =>
    readPanelOpenPref(SEQUENCE_PANEL_OPEN_KEY, false),
  )
  const onActorsOpenChange = useCallback((open: boolean) => {
    setActorsOpen(open)
  }, [])
  const onSequenceOpenChange = useCallback((open: boolean) => {
    setSequenceOpen(open)
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
    const bar = document.querySelector('[data-testid="workspace-camera-bar"]')
    if (!(bar instanceof HTMLElement)) return
    const update = () => {
      const rect = bar.getBoundingClientRect()
      setCameraLeftPx(Math.floor(rect.left))
      setCameraBottomPx(Math.ceil(rect.bottom))
    }
    update()
    // ResizeObserver misses a pure move. The bar's top is the header clearance,
    // so measure again once that clearance settles.
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [headerClearancePx])

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
      setViewportHeightPx(window.innerHeight)
      setViewportWidthPx(window.innerWidth)
      const dock = slot.querySelector('[data-testid="playback-dock"]')
      if (dock instanceof HTMLElement) {
        const dockRect = dock.getBoundingClientRect()
        setDockHeightPx(Math.ceil(dockRect.height))
        setDockClearancePx(
          Math.ceil(window.innerHeight - dockRect.top) + gapPx,
        )
      }
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
  // Room between the header and the Sequence/dock stack. Below this, an in-slot
  // list is crushed into the header; the open list floats instead (see ActorList).
  const actorListCramped =
    viewportHeightPx - sheetTopPx - toolbarClearancePx < 280
  // Narrow open Elements shares the column with Timing. Reserve a band under
  // the header and stop the sheet before the whole camera bar (zoom + Fit).
  const reserveActorsBand = narrowViewport && actorsOpen && !editing
  // Only while Timing is expanded. A collapsed Timing pill does not take a body,
  // so Elements keeps the full preferred band.
  const timingBodyBudgetPx =
    reserveActorsBand && sequenceOpen && hasRecording ? TIMING_BODY_MIN_PX : 0
  let actorsRoomPx = Math.max(
    0,
    viewportHeightPx -
      sheetTopPx -
      dockHeightPx -
      TIMING_HEADER_PX -
      timingBodyBudgetPx -
      TOOLBAR_CHROME_PX -
      PANEL_GAP_PX,
  )
  // A wrapped dock line shrinks this room into the 40s. Give the Elements
  // scrollport its floor back from Timing's spare, and stop before Timing's
  // own scrollport would fall through 48px.
  if (
    timingBodyBudgetPx > 0 &&
    actorsRoomPx < ELEMENTS_LIST_FLOOR_PX &&
    timingBodyBudgetPx > TIMING_BODY_FLOOR_PX
  ) {
    const give = Math.min(
      ELEMENTS_LIST_FLOOR_PX - actorsRoomPx,
      timingBodyBudgetPx - TIMING_BODY_FLOOR_PX,
    )
    actorsRoomPx += give
  }
  const actorsReservePx = reserveActorsBand
    ? Math.min(
        NARROW_ACTORS_PREFERRED_PX,
        actorsRoomPx >= NARROW_ACTORS_MIN_PX
          ? actorsRoomPx
          : Math.max(44, actorsRoomPx),
      )
    : 0
  const actorsInsetPx = reserveActorsBand ? actorsReservePx + PANEL_GAP_PX : 0
  const actorsMaxWidthPx = Math.min(
    256,
    Math.max(0, cameraLeftPx - ACTORS_SHEET_LEFT_PX - PANEL_GAP_PX),
  )
  // Centered Timing (max-w-2xl) inside the toolbar slot after an optional left inset.
  const timingSpan = (padLeft: number) => {
    const inner = Math.max(0, viewportWidthPx - padLeft - SLOT_PAD_X_PX)
    const width = Math.min(TIMING_MAX_PX, inner)
    const left = padLeft + Math.max(0, (inner - width) / 2)
    return { left, right: left + width }
  }
  const actorsOpenDesktop = !narrowViewport && actorsOpen && !editing
  const bareTiming = timingSpan(0)
  const timingOverlapsActors =
    actorsOpenDesktop &&
    bareTiming.left < DESKTOP_ACTORS_RIGHT_PX + PANEL_GAP_PX
  const toolbarPadLeftPx = timingOverlapsActors
    ? DESKTOP_ACTORS_RIGHT_PX + PANEL_GAP_PX
    : 0
  const placedTiming = timingSpan(toolbarPadLeftPx)
  const timingReachesCamera =
    cameraBottomPx > 0 &&
    placedTiming.right > cameraLeftPx + 1 &&
    placedTiming.left < viewportWidthPx
  const stackTopPx = sheetTopPx + actorsInsetPx
  const cameraFloorPx = cameraBottomPx + PANEL_GAP_PX
  // Drop the stack under the whole camera bar only when Timing would run
  // through it. Wide layouts whose Timing column stays left of the bar are unchanged.
  const topLimitPx =
    timingReachesCamera && cameraFloorPx > stackTopPx ? cameraFloorPx : stackTopPx

  return (
    <div
      data-testid="app-shell"
      className="fixed inset-0 overflow-hidden bg-[var(--ms-canvas)] text-ms-ink antialiased"
      style={{
        ['--ms-sheet-top' as string]: `${sheetTopPx}px`,
        ['--ms-toolbar-clearance' as string]: `${toolbarClearancePx}px`,
        ['--ms-dock-clearance' as string]: `${dockClearancePx}px`,
        ['--ms-actors-max-w' as string]: `${actorsMaxWidthPx}px`,
        ...(actorsReservePx > 0
          ? { ['--ms-actors-reserve' as string]: `${actorsReservePx}px` }
          : {}),
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
              <span className="hidden text-xs font-semibold uppercase tracking-wide text-ms-muted sm:block">
                MotionSketch
              </span>
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
              onOpenShortcuts={() => {
                closePanel()
                openShortcuts()
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
                  className="rounded-md bg-slate-900/[0.06] px-1 py-px text-xs font-medium tabular-nums text-ms-ink"
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
                  the animation to your website (HTML or React), or open Advanced
                  exports for CSS-only, your own HTML, and the project file.
                </p>
              )}
            </div>
          </FloatingPanel>
        </div>
      </header>

      {/* Actor list — left, above Sequence + dock (clearance from live stack height).
          z-35 stacks above the toolbar (z-30) so the narrow Actors sheet is not
          covered by Sequence, and stays under the header (z-40).
          On narrow, and on desktop when Timing leaves too little room, the open
          list floats as a fixed sheet (see ActorList) so it is not crushed into
          the header when Sequence owns the toolbar clearance.
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
          <ActorList
            floatOpen={actorListCramped}
            onOpenChange={onActorsOpenChange}
          />
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
          // Never climb into the measured header. Narrow open Elements keeps
          // its reserved band. When Timing would cross the Elements sheet or
          // the camera bar, inset or drop the stack so those controls stay
          // clickable on their own.
          maxHeight: `calc(100dvh - ${topLimitPx}px)`,
          ...(toolbarPadLeftPx > 0 ? { paddingLeft: `${toolbarPadLeftPx}px` } : {}),
        }}
        {...(sheetCoversChrome && !editing
          ? ({ inert: true, 'aria-hidden': true } as Record<string, unknown>)
          : {})}
      >
        <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center gap-2 overflow-clip">
          {!editing &&
            !polishSession &&
            !glideSession &&
            !presetSession && (
              <ClipTimeline onOpenChange={onSequenceOpenChange} />
            )}
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
                className="text-sm leading-snug text-ms-ink"
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
