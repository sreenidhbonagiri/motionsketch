import type { PathEditTool } from '../core/edit'
import type { EditorMode } from '../core/types'

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

export function resolveModeStatus(input: {
  mode: EditorMode
  pathTool: PathEditTool
  pathAddMode: boolean
  pathGestureActive: boolean
  coarsePointer: boolean
  hasAnyRecording: boolean
  hasSelectedRecording: boolean
  actorLabel: string
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
    return {
      kind: 'armed',
      label: 'Ready',
      instruction: 'drag the actor.',
    }
  }

  if (mode === 'recording') {
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
