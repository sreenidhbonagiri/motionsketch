import { useCallback, useEffect, useRef, useState } from 'react'
import type { PersistedSnapshot } from '../core/persist/document'
import { projectHasAnyRecording } from '../core/sceneActor'
import { useConfirm } from './useConfirm'
import { getAppPersistenceController } from '../lib/persistenceController'
import { endDrag, isRecordingActive } from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import {
  loadTutorialPracticeSnapshot,
  shouldOfferTutorial,
  snapshotCurrentProject,
  tutorialProjectHasFlight,
  writeTutorialProgress,
  type TutorialDrawPhase,
  type TutorialStep,
  TUTORIAL_DRAW_DRAG,
  TUTORIAL_DRAW_RECORD,
  TUTORIAL_EXPORT,
  TUTORIAL_KEEP_BODY,
  TUTORIAL_KEEP_CONFIRM,
  TUTORIAL_KEEP_RESTORE,
  TUTORIAL_KEEP_TITLE,
  TUTORIAL_PLAY,
} from '../lib/tutorial'

export type TutorialUiPhase = 'offer' | 'active' | 'idle'

export type TutorialView = {
  phase: TutorialUiPhase
  step: TutorialStep | null
  drawPhase: TutorialDrawPhase
  coachBody: string
  highlightTestId: string | null
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
}) {
  const confirm = useConfirm()
  const closePanels = opts.closePanels
  const openPanel = opts.openPanel

  const [offerOpen, setOfferOpen] = useState(() => shouldOfferTutorial())
  const [step, setStep] = useState<TutorialStep | null>(null)
  const [hasPlayed, setHasPlayed] = useState(false)
  const previousRef = useRef<PersistedSnapshot | null>(null)
  const leavingRef = useRef(false)
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

  // Draw → Play after a successful take (failed / zero-motion stays on draw).
  useEffect(() => {
    if (step !== 'draw') return
    if (hasRecording && mode === 'idle') {
      setStep('play')
      setHasPlayed(false)
    }
  }, [step, hasRecording, mode])

  const restoreOrKeep = useCallback(
    async (progress: 'completed' | 'skipped') => {
      if (leavingRef.current) return
      leavingRef.current = true
      try {
        const controller = getAppPersistenceController()
        const current = useEditorStore.getState().project
        const previous = previousRef.current
        const hadFlight = tutorialProjectHasFlight(current)

        let keep = false
        if (hadFlight) {
          keep = await confirm({
            title: TUTORIAL_KEEP_TITLE,
            body: TUTORIAL_KEEP_BODY,
            confirmLabel: TUTORIAL_KEEP_CONFIRM,
            cancelLabel: TUTORIAL_KEEP_RESTORE,
            testId: 'tutorial-keep-confirm',
            confirmTestId: 'btn-tutorial-keep',
            cancelTestId: 'btn-tutorial-restore',
          })
        }

        cancelRecordingChrome()
        closePanels()
        writeTutorialProgress(progress)

        if (keep) {
          previousRef.current = null
          controller.afterSuccessfulReplace()
        } else if (previous) {
          applyPersistedSnapshot(previous)
          previousRef.current = null
          controller.resumeAutosavePreservingStorage()
        } else {
          previousRef.current = null
          controller.resumeAutosavePreservingStorage()
        }

        setStep(null)
        setHasPlayed(false)
        setOfferOpen(false)
      } finally {
        leavingRef.current = false
      }
    },
    [applyPersistedSnapshot, closePanels, confirm],
  )

  // Export step completes when Export opens (download not required).
  useEffect(() => {
    if (step !== 'export') return
    if (openPanel !== 'export') return
    void restoreOrKeep('completed')
  }, [step, openPanel, restoreOrKeep])

  const beginPractice = useCallback(() => {
    closePanels()
    cancelRecordingChrome()
    const controller = getAppPersistenceController()
    previousRef.current = snapshotCurrentProject(
      useEditorStore.getState().project,
    )
    controller.setAutosaveSuspended(true)
    applyPersistedSnapshot(loadTutorialPracticeSnapshot())
    setOfferOpen(false)
    setHasPlayed(false)
    setStep('draw')
  }, [applyPersistedSnapshot, closePanels])

  const skipTutorial = useCallback(() => {
    void restoreOrKeep('skipped')
  }, [restoreOrKeep])

  const dismissOffer = useCallback(() => {
    writeTutorialProgress('skipped')
    setOfferOpen(false)
  }, [])

  const goNext = useCallback(() => {
    if (step === 'play') {
      setStep('export')
    }
  }, [step])

  const restartTutorial = useCallback(() => {
    beginPractice()
  }, [beginPractice])

  let coachBody = ''
  let highlightTestId: string | null = null
  let showNext = false
  const nextIsFinish = false

  if (step === 'draw') {
    if (drawPhase === 'drag') {
      coachBody = TUTORIAL_DRAW_DRAG
      highlightTestId = 'actor'
    } else {
      coachBody = TUTORIAL_DRAW_RECORD
      highlightTestId = 'btn-record'
    }
  } else if (step === 'play') {
    coachBody = TUTORIAL_PLAY
    highlightTestId = mode === 'playing' ? 'btn-pause' : 'btn-play'
    showNext = hasPlayed && mode !== 'playing'
  } else if (step === 'export') {
    coachBody = TUTORIAL_EXPORT
    highlightTestId = 'btn-export'
  }

  const view: TutorialView = {
    phase: active ? 'active' : offerOpen ? 'offer' : 'idle',
    step,
    drawPhase,
    coachBody,
    highlightTestId,
    showNext,
    nextIsFinish,
    active,
  }

  return {
    view,
    offerOpen: offerOpen && !active,
    beginPractice,
    dismissOffer,
    skipTutorial,
    goNext,
    restartTutorial,
  }
}
