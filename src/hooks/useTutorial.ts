import { useCallback, useEffect, useRef, useState } from 'react'
import type { PersistedSnapshot } from '../core/persist/document'
import { projectHasAnyRecording } from '../core/sceneActor'
import { useConfirm } from './useConfirm'
import { getAppPersistenceController } from '../lib/persistenceController'
import { endDrag, isRecordingActive } from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import {
  loadTutorialPracticeSnapshot,
  shouldAutoStartTutorial,
  snapshotCurrentProject,
  snapshotIsEmptyStarter,
  tutorialProjectHasFlight,
  writeTutorialBackup,
  writeTutorialProgress,
  type TutorialDrawPhase,
  type TutorialStep,
  TUTORIAL_BACKUP_WRITE_FAILED,
  TUTORIAL_DRAW_DRAG,
  TUTORIAL_DRAW_RECORD,
  TUTORIAL_EXPORT_INSIDE,
  TUTORIAL_EXPORT_OPEN,
  TUTORIAL_KEEP_BODY_FRESH,
  TUTORIAL_KEEP_BODY_RESTORE,
  TUTORIAL_KEEP_CONFIRM,
  TUTORIAL_KEEP_FRESH,
  TUTORIAL_KEEP_RESTORE,
  TUTORIAL_KEEP_TITLE,
  TUTORIAL_PLAY_IDLE,
  TUTORIAL_PLAY_NEXT,
  TUTORIAL_PLAY_WATCHING,
  tutorialTitleForStep,
} from '../lib/tutorial'

export type TutorialView = {
  step: TutorialStep | null
  drawPhase: TutorialDrawPhase
  coachTitle: string
  coachBody: string
  highlightTestId: string | null
  softHighlight: boolean
  showNext: boolean
  nextIsFinish: boolean
  active: boolean
}

function cancelRecordingChrome() {
  if (isRecordingActive()) endDrag(false)
  const s = useEditorStore.getState()
  if (s.mode === 'armed' || s.mode === 'recording') {
    s.cancelArm()
  }
  if (s.mode === 'playing') s.pause()
  if (s.mode === 'editing') s.exitEditMode()
}

/**
 * Persist the practice canvas via the normal Keep path (unsuspend + replace).
 * Stashes a non-empty pre-tutorial backup first so Restore stays available.
 * A failed backup write aborts the overwrite — practice stays in memory and
 * autosave stays suspended so the original storage blob is untouched.
 */
function keepPracticeProject(options: {
  progress: 'completed' | 'skipped'
  previous: PersistedSnapshot | null
  clearPreviousRef: () => void
  retainPreviousRef: (snap: PersistedSnapshot | null) => void
}): { saved: boolean; backupFailed?: boolean } {
  const controller = getAppPersistenceController()
  const { previous } = options
  const previousEmpty = snapshotIsEmptyStarter(previous)

  // Durable backup before overwriting the main project key.
  if (!previousEmpty && previous) {
    if (!writeTutorialBackup(previous)) {
      cancelRecordingChrome()
      writeTutorialProgress(options.progress)
      // Keep suspended — never overwrite the original save without a backup.
      controller.reportSaveFailure()
      useEditorStore.getState().announceAction(TUTORIAL_BACKUP_WRITE_FAILED)
      options.retainPreviousRef(previous)
      return { saved: false, backupFailed: true }
    }
  }

  cancelRecordingChrome()
  writeTutorialProgress(options.progress)

  // Existing Keep path — do not invent a second persistence channel.
  controller.setAutosaveSuspended(false)
  controller.afterSuccessfulReplace()

  if (controller.getStatus() === 'save-error') {
    // Flight remains the live project; backup (if any) already written.
    options.retainPreviousRef(previous)
    return { saved: false }
  }

  options.clearPreviousRef()
  return { saved: true }
}

export function useTutorial(opts: {
  openPanel: string | null
  closePanels: () => void
  /** Keep Export open after a successful Keep (finish from Export step). */
  ensureExportOpen: () => void
}) {
  const confirm = useConfirm()
  const closePanels = opts.closePanels
  const ensureExportOpen = opts.ensureExportOpen

  const [step, setStep] = useState<TutorialStep | null>(null)
  const [hasPlayed, setHasPlayed] = useState(false)
  const previousRef = useRef<PersistedSnapshot | null>(null)
  const leavingRef = useRef(false)
  const autoStartedRef = useRef(false)
  const active = step !== null

  const mode = useEditorStore((s) => s.mode)
  const hasRecording = useEditorStore((s) =>
    projectHasAnyRecording(s.project),
  )
  const applyPersistedSnapshot = useEditorStore((s) => s.applyPersistedSnapshot)

  const drawPhase: TutorialDrawPhase =
    mode === 'armed' || mode === 'recording' ? 'drag' : 'record'

  useEffect(() => {
    if (!active) return
    if (mode === 'playing') setHasPlayed(true)
  }, [active, mode])

  // Draw → Play after a successful recording (miss / zero-motion stays on draw).
  useEffect(() => {
    if (step !== 'draw') return
    if (hasRecording && mode === 'idle') {
      setStep('play')
      setHasPlayed(false)
    }
  }, [step, hasRecording, mode])

  const beginPractice = useCallback(() => {
    closePanels()
    cancelRecordingChrome()
    const controller = getAppPersistenceController()
    previousRef.current = snapshotCurrentProject(
      useEditorStore.getState().project,
    )
    controller.setAutosaveSuspended(true)
    applyPersistedSnapshot(loadTutorialPracticeSnapshot())
    setHasPlayed(false)
    setStep('draw')
  }, [applyPersistedSnapshot, closePanels])

  // After persistence hydrate (runs before first paint), auto-start once for
  // genuine new visitors — never when a saved project exists.
  useEffect(() => {
    if (autoStartedRef.current) return
    if (!shouldAutoStartTutorial()) return
    autoStartedRef.current = true
    beginPractice()
  }, [beginPractice])

  const endTutorialChrome = useCallback(
    (options?: { fromExport?: boolean }) => {
      setStep(null)
      setHasPlayed(false)
      if (options?.fromExport) {
        ensureExportOpen()
      } else {
        closePanels()
      }
    },
    [closePanels, ensureExportOpen],
  )

  /**
   * Finish (and legacy choice dialog): Keep vs Restore / Start fresh.
   * Escape / backdrop abort — stay on practice; backup untouched.
   */
  const finishTutorial = useCallback(
    async (options?: {
      fromExport?: boolean
      returnFocus?: HTMLElement | null
    }) => {
      if (leavingRef.current) return
      leavingRef.current = true
      try {
        const controller = getAppPersistenceController()
        const current = useEditorStore.getState().project
        const previous = previousRef.current
        const hadFlight = tutorialProjectHasFlight(current)
        const previousEmpty = snapshotIsEmptyStarter(previous)
        const fromExport = options?.fromExport === true

        let keep = false
        if (hadFlight) {
          const choice = await confirm({
            title: TUTORIAL_KEEP_TITLE,
            body: previousEmpty
              ? TUTORIAL_KEEP_BODY_FRESH
              : TUTORIAL_KEEP_BODY_RESTORE,
            confirmLabel: TUTORIAL_KEEP_CONFIRM,
            cancelLabel: previousEmpty
              ? TUTORIAL_KEEP_FRESH
              : TUTORIAL_KEEP_RESTORE,
            // Cancel discards the practice flight — do not focus it for Space.
            initialFocus: 'confirm',
            // Escape / backdrop leave the tutorial and practice flight intact.
            passiveDismiss: 'abort',
            returnFocus: options?.returnFocus ?? null,
            testId: 'tutorial-keep-confirm',
            confirmTestId: 'btn-tutorial-keep',
            cancelTestId: previousEmpty
              ? 'btn-tutorial-start-fresh'
              : 'btn-tutorial-restore',
          })
          if (choice === null) {
            // Passive dismiss — stay on the practice project; backup untouched.
            return
          }
          keep = choice
        }

        if (keep) {
          keepPracticeProject({
            progress: 'completed',
            previous,
            clearPreviousRef: () => {
              previousRef.current = null
            },
            retainPreviousRef: (snap) => {
              previousRef.current = snap
            },
          })
          endTutorialChrome({ fromExport })
          return
        }

        // Restore / start fresh — close practice Export before swapping projects.
        // Explicit only (not Skip / Escape / passive). Do not clear a durable
        // tutorial backup here — that key is owned by Project-panel restore and
        // may refer to an earlier recoverable project than previousRef.
        cancelRecordingChrome()
        writeTutorialProgress('completed')
        closePanels()
        if (previous) {
          applyPersistedSnapshot(previous)
        }
        previousRef.current = null
        controller.resumeAutosavePreservingStorage()
        setStep(null)
        setHasPlayed(false)
      } finally {
        leavingRef.current = false
      }
    },
    [applyPersistedSnapshot, closePanels, confirm, endTutorialChrome],
  )

  /**
   * Skip ends the tutorial and keeps the practice project (existing Keep path).
   * Never restores the pre-tutorial backup — that stays for an explicit action.
   */
  const skipTutorial = useCallback(
    (_returnFocus?: HTMLElement | null) => {
      if (leavingRef.current) return
      leavingRef.current = true
      try {
        const previous = previousRef.current
        keepPracticeProject({
          progress: 'skipped',
          previous,
          clearPreviousRef: () => {
            previousRef.current = null
          },
          retainPreviousRef: (snap) => {
            previousRef.current = snap
          },
        })
        endTutorialChrome()
      } finally {
        leavingRef.current = false
      }
    },
    [endTutorialChrome],
  )

  const goNext = useCallback(
    (returnFocus?: HTMLElement | null) => {
      if (step === 'play') {
        setStep('export')
        return
      }
      if (step === 'export') {
        void finishTutorial({ fromExport: true, returnFocus })
      }
    },
    [step, finishTutorial],
  )

  const restartTutorial = useCallback(() => {
    // Reset practice without replacing the stashed pre-tutorial project.
    closePanels()
    cancelRecordingChrome()
    getAppPersistenceController().setAutosaveSuspended(true)
    if (!previousRef.current) {
      previousRef.current = snapshotCurrentProject(
        useEditorStore.getState().project,
      )
    }
    applyPersistedSnapshot(loadTutorialPracticeSnapshot())
    setHasPlayed(false)
    setStep('draw')
  }, [applyPersistedSnapshot, closePanels])

  let coachTitle = ''
  let coachBody = ''
  let highlightTestId: string | null = null
  let softHighlight = false
  let showNext = false
  let nextIsFinish = false

  if (step === 'draw') {
    coachTitle = tutorialTitleForStep('draw')
    // Soft ring only — heavy dim hides the nearby coach card.
    softHighlight = true
    if (drawPhase === 'drag') {
      // Highlight the plane for the gesture; card stays near Record.
      coachBody = TUTORIAL_DRAW_DRAG
      highlightTestId = 'actor'
    } else {
      coachBody = TUTORIAL_DRAW_RECORD
      highlightTestId = 'btn-record'
    }
  } else if (step === 'play') {
    coachTitle = tutorialTitleForStep('play')
    softHighlight = true
    if (mode === 'playing') {
      coachBody = TUTORIAL_PLAY_WATCHING
      highlightTestId = 'btn-pause'
    } else if (hasPlayed) {
      coachBody = TUTORIAL_PLAY_NEXT
      highlightTestId = 'btn-play'
    } else {
      coachBody = TUTORIAL_PLAY_IDLE
      highlightTestId = 'btn-play'
    }
    showNext = hasPlayed && mode !== 'playing'
  } else if (step === 'export') {
    coachTitle = tutorialTitleForStep('export')
    const exportOpen = opts.openPanel === 'export'
    coachBody = exportOpen ? TUTORIAL_EXPORT_INSIDE : TUTORIAL_EXPORT_OPEN
    // Highlight Export chrome only while the panel is closed.
    highlightTestId = exportOpen ? null : 'btn-export'
    softHighlight = true
    showNext = true
    nextIsFinish = true
  }

  const view: TutorialView = {
    step,
    drawPhase,
    coachTitle,
    coachBody,
    highlightTestId,
    softHighlight,
    showNext,
    nextIsFinish,
    active,
  }

  return {
    view,
    skipTutorial,
    goNext,
    restartTutorial,
    beginPractice,
  }
}
