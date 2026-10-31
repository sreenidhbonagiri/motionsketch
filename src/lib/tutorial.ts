import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
  STORAGE_KEY,
  type PersistedSnapshot,
} from '../core/persist/document'
import { createSceneActor } from '../core/sceneActor'
import { projectHasAnyRecording } from '../core/sceneActor'
import type { Project } from '../core/types'
import { createPaperPlaneImage } from '../examples/assets'
import { compositionSizeFromAspect } from '../core/stageResize'
import { cloneExampleProject } from '../examples/load'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'

/** Match bundled example stage aspect without importing scene builders. */
const TUTORIAL_STAGE_ASPECT = 16 / 10

/** localStorage — completion or skip survives reloads. */
export const TUTORIAL_PROGRESS_KEY = 'motionsketch.tutorial.v1'

export type TutorialProgressStatus = 'completed' | 'skipped'

export type TutorialProgress = {
  status: TutorialProgressStatus
}

export type TutorialStep = 'draw' | 'play' | 'export'

export type TutorialDrawPhase = 'record' | 'drag'

export const TUTORIAL_DRAW_TITLE = 'Draw your flight'
export const TUTORIAL_DRAW_RECORD = 'Click Record to start.'
export const TUTORIAL_DRAW_DRAG =
  'Drag the plane to draw a path. Release to finish.'

export const TUTORIAL_PLAY_TITLE = 'Watch it move'
export const TUTORIAL_PLAY_IDLE = 'Click Play to watch your flight.'
export const TUTORIAL_PLAY_WATCHING = 'Your flight is playing.'
export const TUTORIAL_PLAY_NEXT = 'Select Next to export your flight.'

export const TUTORIAL_EXPORT_TITLE = 'Use it on your website'
export const TUTORIAL_EXPORT_OPEN = 'Open Export to see your download options.'
export const TUTORIAL_EXPORT_INSIDE =
  'Choose HTML or React, then download the files for your website. You can finish without downloading.'

export const TUTORIAL_SKIP_LABEL = 'Skip tutorial'
export const TUTORIAL_NEXT_LABEL = 'Next'
export const TUTORIAL_FINISH_LABEL = 'Finish tutorial'

export const TUTORIAL_KEEP_TITLE = 'Keep this animation?'
export const TUTORIAL_KEEP_BODY_RESTORE =
  'Keep the practice flight as your project, or restore what you had before the tutorial.'
export const TUTORIAL_KEEP_BODY_FRESH =
  'Keep the practice flight as your project, or start fresh without it.'
export const TUTORIAL_KEEP_CONFIRM = 'Keep this animation'
export const TUTORIAL_KEEP_RESTORE = 'Restore previous project'
export const TUTORIAL_KEEP_FRESH = 'Start fresh'

export const HELP_RECORDING_BLURB =
  'Click Record, drag an element, then release to finish. Short or zero-motion drags are ignored. Try again.'
export const HELP_EXPORT_BLURB =
  'After a path exists, open Export to download a website preview package or other formats.'
export const HELP_RESTART_TUTORIAL_LABEL = 'Restart tutorial'

/** Shown when New / Open / Examples is attempted during an active tutorial. */
export const TUTORIAL_BLOCKS_REPLACE_TITLE = 'Finish the tutorial first'
export const TUTORIAL_BLOCKS_REPLACE_BODY =
  'Skip or finish the tutorial before starting a new project, opening a file, or loading an example.'
export const TUTORIAL_BLOCKS_REPLACE_CONFIRM = 'OK'

export function tutorialTitleForStep(step: TutorialStep): string {
  if (step === 'draw') return TUTORIAL_DRAW_TITLE
  if (step === 'play') return TUTORIAL_PLAY_TITLE
  return TUTORIAL_EXPORT_TITLE
}

export function tutorialProgressLabel(step: TutorialStep): string {
  if (step === 'draw') return '1 of 3'
  if (step === 'play') return '2 of 3'
  return '3 of 3'
}

const TUTORIAL_STAGE = compositionSizeFromAspect(TUTORIAL_STAGE_ASPECT)

/**
 * Practice scene: notebook plane only, no path, Face along path off.
 * Isolated from the gallery Paper plane example (which ships a recorded flight).
 */
export function buildTutorialPracticeProject(): Project {
  return {
    version: 1,
    name: 'Tutorial practice',
    stageAspect: TUTORIAL_STAGE_ASPECT,
    stageWidth: TUTORIAL_STAGE.width,
    stageHeight: TUTORIAL_STAGE.height,
    playback: {
      durationMs: 2000,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [
      createSceneActor({
        id: 'tutorial-plane',
        name: 'Plane',
        appearance: {
          kind: 'image',
          width: 0.17,
          height: 0.17,
          borderRadius: 0,
          color: '#0f766e',
          image: createPaperPlaneImage(),
        },
        recording: null,
        restPosition: { x: 0.28, y: 0.55 },
        smoothing: 0.12,
        steadySpeed: 0.25,
        faceAlongPath: false,
        directionOffsetDeg: 43,
        clip: { start: 0, end: 1, hideBeforeStart: false, hideAfterEnd: false },
      }),
    ],
  }
}

/** Fresh snapshot for the practice canvas (persist-validated clone). */
export function loadTutorialPracticeSnapshot(): PersistedSnapshot {
  const fresh = cloneExampleProject(buildTutorialPracticeProject())
  const built = buildSnapshot(fresh, null, '1970-01-01T00:00:00.000Z')
  const parsed = parseSnapshotJson(serializeSnapshot(built))
  if (!parsed.ok) {
    throw new Error(`Tutorial practice failed validation: ${parsed.error}`)
  }
  return {
    formatVersion: parsed.snapshot.formatVersion,
    savedAt: parsed.snapshot.savedAt,
    project: cloneExampleProject(parsed.snapshot.project),
  }
}

export function readTutorialProgress(): TutorialProgress | null {
  try {
    const raw = localStorage.getItem(TUTORIAL_PROGRESS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('status' in parsed) ||
      (parsed.status !== 'completed' && parsed.status !== 'skipped')
    ) {
      return null
    }
    return { status: parsed.status }
  } catch {
    return null
  }
}

export function writeTutorialProgress(status: TutorialProgressStatus): void {
  try {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({ status } satisfies TutorialProgress),
    )
  } catch {
    // quota / private mode
  }
}

export function clearTutorialProgress(): void {
  try {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY)
  } catch {
    // ignore
  }
}

/** True when localStorage already holds a project blob (returning visitor). */
export function hasSavedProjectInStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return typeof raw === 'string' && raw.length > 0
  } catch {
    // Fail closed — never auto-start if storage is unreadable.
    return true
  }
}

/**
 * Auto-start once for a genuine first visit: no tutorial preference yet and no
 * saved project in storage. Never replaces a returning user’s project.
 */
export function shouldAutoStartTutorial(): boolean {
  return readTutorialProgress() === null && !hasSavedProjectInStorage()
}

/** Snapshot of the live editor project for restore-after-tutorial. */
export function snapshotCurrentProject(project: Project): PersistedSnapshot {
  return buildSnapshot(cloneExampleProject(project), null)
}

export function tutorialProjectHasFlight(project: Project): boolean {
  return projectHasAnyRecording(project)
}

export function snapshotIsEmptyStarter(snapshot: PersistedSnapshot | null): boolean {
  if (!snapshot) return true
  return !projectHasMeaningfulWork(snapshot.project)
}
