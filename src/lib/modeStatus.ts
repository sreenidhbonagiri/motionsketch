import {
  CONTINUE_PATH_ANNOUNCEMENT,
  CONTINUE_PATH_INSTRUCTION,
} from '../core/continuePath'
import type { PathEditTool } from '../core/edit'
import type { EditorMode } from '../core/types'

export { CONTINUE_PATH_ANNOUNCEMENT, CONTINUE_PATH_INSTRUCTION }

export type ModeStatusKind =
  | 'edit-points'
  | 'move-path'
  | 'add-point'
  | 'armed'
  | 'recording'
  | 'info'

export type ModeStatus = {
  kind: ModeStatusKind
  /** Compact mode / tool label shown in the dock. */
  label: string
  /**
   * Short visible instruction. Null while a path gesture is active so drag
   * feedback is not contradicted by idle placement copy.
   */
  instruction: string | null
}

/** Existing Add point placement guidance (Click → Tap on coarse pointers). */
export const ADD_POINT_PLACEMENT_FINE =
  'The ghost sits on the sample that will become the handle. Click near the path, or use ←/→ then Enter / Place here. Shape stays until you drag.'

export const ADD_POINT_PLACEMENT_COARSE =
  'The ghost sits on the sample that will become the handle. Tap near the path, or use ←/→ then Enter / Place here. Shape stays until you drag.'

/** Armed-record guidance — same drag verb for mouse, touch, and SR/keyboard focus. */
export const ARMED_INSTRUCTION = 'Drag the actor to draw its path.'

export const ARMED_ANNOUNCEMENT = `Ready — ${ARMED_INSTRUCTION}`

export const EMPTY_BOARD_RECORD_HINT_FINE =
  'Draw a path to make CSS motion for your site — click Record, then drag the actor.'

export const EMPTY_BOARD_RECORD_HINT_COARSE =
  'Draw a path to make CSS motion for your site — tap Record, then drag the actor.'

/** After a path exists — next step toward using the motion on a website. */
export const AFTER_PATH_WEBSITE_HINT =
  'Play to preview, then open Export → Download for your website.'

/**
 * sessionStorage key for dismissed after-path toasts.
 * Value: JSON string[] of {@link afterPathWebsiteHintProjectKey} entries.
 * Dismissal lasts for the current browser tab session, per project identity
 * (name + first actor id). A New project gets a new actor id, so the toast
 * can appear again after that project’s first path.
 */
export const AFTER_PATH_WEBSITE_HINT_DISMISSED_KEY =
  'motionsketch.afterPathWebsiteHintDismissed.v1'

export function afterPathWebsiteHintProjectKey(project: {
  name: string
  actors: ReadonlyArray<{ id: string }>
}): string {
  return `${project.name}::${project.actors[0]?.id ?? ''}`
}

export function readAfterPathWebsiteHintDismissedKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(AFTER_PATH_WEBSITE_HINT_DISMISSED_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((k): k is string => typeof k === 'string'))
  } catch {
    return new Set()
  }
}

export function writeAfterPathWebsiteHintDismissedKeys(keys: Set<string>) {
  try {
    sessionStorage.setItem(
      AFTER_PATH_WEBSITE_HINT_DISMISSED_KEY,
      JSON.stringify([...keys]),
    )
  } catch {
    // ignore quota / private mode
  }
}

export function resolveModeStatus(input: {
  mode: EditorMode
  pathTool: PathEditTool
  pathAddMode: boolean
  pathGestureActive: boolean
  coarsePointer: boolean
  hasAnyRecording: boolean
  hasSelectedRecording: boolean
  actorLabel: string
  /** When armed/recording, distinguish replace vs continue-path. */
  recordingIntent?: 'replace' | 'continue'
}): ModeStatus | null {
  const {
    mode,
    pathTool,
    pathAddMode,
    pathGestureActive,
    coarsePointer,
    hasAnyRecording,
    hasSelectedRecording,
    actorLabel,
    recordingIntent = 'replace',
  } = input

  if (mode === 'editing') {
    if (pathTool === 'move-path') {
      return {
        kind: 'move-path',
        label: 'Move path',
        instruction: pathGestureActive
          ? null
          : coarsePointer
            ? 'Drag the path to reposition it.'
            : 'Drag the path to reposition it. Focus the path, then arrow keys nudge (Shift for larger steps).',
      }
    }
    if (pathAddMode) {
      return {
        kind: 'add-point',
        label: 'Add point',
        instruction: pathGestureActive
          ? null
          : coarsePointer
            ? ADD_POINT_PLACEMENT_COARSE
            : ADD_POINT_PLACEMENT_FINE,
      }
    }
    return {
      kind: 'edit-points',
      label: 'Edit points',
      instruction: pathGestureActive
        ? null
        : coarsePointer
          ? 'Drag a point to reshape the path.'
          : 'Drag a point to reshape the path. Arrow keys nudge; [ ] cycle.',
    }
  }

  if (mode === 'armed') {
    if (recordingIntent === 'continue') {
      return {
        kind: 'armed',
        label: 'Continue',
        instruction: CONTINUE_PATH_INSTRUCTION,
      }
    }
    return {
      kind: 'armed',
      label: 'Ready',
      instruction: ARMED_INSTRUCTION,
    }
  }

  if (mode === 'recording') {
    if (recordingIntent === 'continue') {
      return {
        kind: 'recording',
        label: 'Continuing',
        instruction: 'Release to join, Escape to cancel.',
      }
    }
    return {
      kind: 'recording',
      label: 'Recording',
      instruction: 'Release to finish, or Stop.',
    }
  }

  if (hasAnyRecording && !hasSelectedRecording) {
    return {
      kind: 'info',
      label: '',
      instruction: `“${actorLabel}” has no path yet. Record for this actor to edit or reset its take. Play still uses other actors’ takes.`,
    }
  }

  if (mode === 'playing') {
    return {
      kind: 'info',
      label: '',
      instruction: 'Pause before editing the path.',
    }
  }

  return null
}
