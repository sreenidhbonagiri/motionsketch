import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
  type PersistedSnapshot,
} from '../core/persist/document'
import { createSceneActor } from '../core/sceneActor'
import { projectHasAnyRecording } from '../core/sceneActor'
import type { Project } from '../core/types'
import { createPaperPlaneImage } from '../examples/assets'
import { compositionSizeFromAspect } from '../core/stageResize'
import { cloneExampleProject } from '../examples/load'

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

export const TUTORIAL_OFFER_HEADLINE = 'Draw motion. Ship it to your website.'

export const TUTORIAL_OFFER_BODY =
  'A one-minute practice flight with the notebook paper plane — or jump straight in.'

export const TUTORIAL_TRY_LABEL = 'Try a quick tutorial'
export const TUTORIAL_START_CREATING_LABEL = 'Start creating'

export const TUTORIAL_DRAW_RECORD =
  'Click Record, then drag the plane to draw its flight.'
export const TUTORIAL_DRAW_DRAG = 'Drag the plane to draw its flight.'
export const TUTORIAL_PLAY =
  'Press Play to watch your flight. Then continue when you are ready.'
export const TUTORIAL_EXPORT =
  'Open Export to download a preview and files for your website. You do not need to download to finish.'

export const TUTORIAL_SKIP_LABEL = 'Skip'
export const TUTORIAL_NEXT_LABEL = 'Next'
export const TUTORIAL_FINISH_LABEL = 'Finish'

export const TUTORIAL_KEEP_TITLE = 'Keep this animation?'
export const TUTORIAL_KEEP_BODY =
  'Keep the practice flight as your project, or restore what you had before the tutorial.'
export const TUTORIAL_KEEP_CONFIRM = 'Keep this animation'
export const TUTORIAL_KEEP_RESTORE = 'Restore previous project'

export const HELP_RECORDING_BLURB =
  'Click Record, then drag an actor on the stage to draw a path. Cancel while armed restores idle without a take. Short or zero-motion drags are ignored — try again.'
export const HELP_EXPORT_BLURB =
  'After a path exists, open Export to download a website preview package or other formats. Copy and download feedback stay in Export and Project.'
export const HELP_RESTART_TUTORIAL_LABEL = 'Restart tutorial'

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
    // quota / private mode — offer may reappear
  }
}

export function clearTutorialProgress(): void {
  try {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY)
  } catch {
    // ignore
  }
}

export function shouldOfferTutorial(): boolean {
  return readTutorialProgress() === null
}

/** Snapshot of the live editor project for restore-after-tutorial. */
export function snapshotCurrentProject(project: Project): PersistedSnapshot {
  return buildSnapshot(cloneExampleProject(project), null)
}

export function tutorialProjectHasFlight(project: Project): boolean {
  return projectHasAnyRecording(project)
}
