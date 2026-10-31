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
  writeTutorialProgress,
  type TutorialDrawPhase,
  type TutorialStep,
  TUTORIAL_DRAW_DRAG,
  TUTORIAL_DRAW_RECORD,
  TUTORIAL_EXPORT,
  TUTORIAL_KEEP_BODY_FRESH,
  TUTORIAL_KEEP_BODY_RESTORE,
  TUTORIAL_KEEP_CONFIRM,
  TUTORIAL_KEEP_FRESH,
  TUTORIAL_KEEP_RESTORE,
  TUTORIAL_KEEP_TITLE,
  TUTORIAL_PLAY_IDLE,
  TUTORIAL_PLAY_WATCHING,
} from '../lib/tutorial'

export type TutorialView = {
  step: TutorialStep | null
  drawPhase: TutorialDrawPhase
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

  const restoreOrKeep = useCallback(
    async (
      progress: 'completed' | 'skipped',
      options?: { fromExport?: boolean },
    ) => {
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
          keep = await confirm({
            title: TUTORIAL_KEEP_TITLE,
            body: previousEmpty
              ? TUTORIAL_KEEP_BODY_FRESH
              : TUTORIAL_KEEP_BODY_RESTORE,
            confirmLabel: TUTORIAL_KEEP_CONFIRM,
            cancelLabel: previousEmpty
              ? TUTORIAL_KEEP_FRESH
              : TUTORIAL_KEEP_RESTORE,
            testId: 'tutorial-keep-confirm',
            confirmTestId: 'btn-tutorial-keep',
            cancelTestId: previousEmpty
              ? 'btn-tutorial-start-fresh'
              : 'btn-tutorial-restore',
          })
        }

        cancelRecordingChrome()
        writeTutorialProgress(progress)

        if (keep) {
          previousRef.current = null
          controller.afterSuccessfulReplace()
          setStep(null)
          setHasPlayed(false)
          if (fromExport) {
            ensureExportOpen()
          } else {
            closePanels()
          }
        } else {
          // Restore / start fresh — close practice Export before swapping projects.
          closePanels()
          if (previous) {
            applyPersistedSnapshot(previous)
          }
          previousRef.current = null
          controller.resumeAutosavePreservingStorage()
          setStep(null)
          setHasPlayed(false)
        }
      } finally {
        leavingRef.current = false
      }
    },
    [applyPersistedSnapshot, closePanels, confirm, ensureExportOpen],
  )

  const skipTutorial = useCallback(() => {
    void restoreOrKeep('skipped')
  }, [restoreOrKeep])

  const goNext = useCallback(() => {
    if (step === 'play') {
      setStep('export')
      return
    }
    if (step === 'export') {
      void restoreOrKeep('completed', { fromExport: true })
    }
  }, [step, restoreOrKeep])

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

  let coachBody = ''
  let highlightTestId: string | null = null
  let softHighlight = false
  let showNext = false
  let nextIsFinish = false

  if (step === 'draw') {
    if (drawPhase === 'drag') {
      coachBody = TUTORIAL_DRAW_DRAG
      highlightTestId = 'actor'
    } else {
      coachBody = TUTORIAL_DRAW_RECORD
      highlightTestId = 'btn-record'
    }
  } else if (step === 'play') {
    if (mode === 'playing') {
      coachBody = TUTORIAL_PLAY_WATCHING
      highlightTestId = 'btn-pause'
      softHighlight = true
    } else {
      coachBody = TUTORIAL_PLAY_IDLE
      highlightTestId = 'btn-play'
    }
    showNext = hasPlayed && mode !== 'playing'
  } else if (step === 'export') {
    coachBody = TUTORIAL_EXPORT
    // Highlight Export chrome only while the panel is closed.
    highlightTestId = opts.openPanel === 'export' ? null : 'btn-export'
    softHighlight = opts.openPanel === 'export'
    showNext = true
    nextIsFinish = true
  }

  const view: TutorialView = {
    step,
    drawPhase,
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
