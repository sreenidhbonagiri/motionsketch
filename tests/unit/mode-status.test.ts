import { describe, expect, it } from 'vitest'
import {
  ADD_POINT_PLACEMENT_COARSE,
  ADD_POINT_PLACEMENT_FINE,
  ARMED_ANNOUNCEMENT,
  ARMED_INSTRUCTION,
  resolveModeStatus,
} from '../../src/lib/modeStatus'

describe('resolveModeStatus', () => {
  const base = {
    pathTool: 'edit-points' as const,
    pathAddMode: false,
    pathGestureActive: false,
    coarsePointer: false,
    hasAnyRecording: true,
    hasSelectedRecording: true,
    actorLabel: 'Actor 1',
  }

  it('shows Edit points label and reshape instruction', () => {
    const status = resolveModeStatus({ ...base, mode: 'editing' })
    expect(status).toMatchObject({
      kind: 'edit-points',
      label: 'Edit points',
      instruction: expect.stringContaining('Drag a point to reshape the path.'),
    })
    expect(status?.instruction).toMatch(/Arrow keys nudge/)
  })

  it('adapts Edit points for coarse pointers without keyboard guidance', () => {
    const status = resolveModeStatus({
      ...base,
      mode: 'editing',
      coarsePointer: true,
    })
    expect(status?.instruction).toBe('Drag a point to reshape the path.')
  })

  it('shows Move path label and reposition instruction', () => {
    const status = resolveModeStatus({
      ...base,
      mode: 'editing',
      pathTool: 'move-path',
    })
    expect(status).toMatchObject({
      kind: 'move-path',
      label: 'Move path',
      instruction: expect.stringContaining('Drag the path to reposition it.'),
    })
    expect(status?.instruction).toMatch(/arrow keys/i)
  })

  it('shows Add point with placement guidance, not Edit points copy', () => {
    const status = resolveModeStatus({
      ...base,
      mode: 'editing',
      pathAddMode: true,
    })
    expect(status).toEqual({
      kind: 'add-point',
      label: 'Add point',
      instruction: ADD_POINT_PLACEMENT_FINE,
    })
    expect(status?.instruction).not.toMatch(/reshape the path/i)
  })

  it('uses Tap in Add point guidance on coarse pointers', () => {
    const status = resolveModeStatus({
      ...base,
      mode: 'editing',
      pathAddMode: true,
      coarsePointer: true,
    })
    expect(status?.instruction).toBe(ADD_POINT_PLACEMENT_COARSE)
  })

  it('clears instructions while a path gesture is active', () => {
    for (const pathTool of ['edit-points', 'move-path'] as const) {
      const status = resolveModeStatus({
        ...base,
        mode: 'editing',
        pathTool,
        pathGestureActive: true,
      })
      expect(status?.label).toBeTruthy()
      expect(status?.instruction).toBeNull()
    }
  })

  it('retains Ready — drag to draw path for armed mode', () => {
    const status = resolveModeStatus({ ...base, mode: 'armed' })
    expect(status).toEqual({
      kind: 'armed',
      label: 'Ready',
      instruction: ARMED_INSTRUCTION,
    })
    expect(`${status!.label} — ${status!.instruction}`).toBe(ARMED_ANNOUNCEMENT)
  })

  it('shows Recording label and stop guidance', () => {
    const status = resolveModeStatus({ ...base, mode: 'recording' })
    expect(status).toEqual({
      kind: 'recording',
      label: 'Recording',
      instruction: 'Release to finish, or Stop.',
    })
  })

  it('returns null when idle with a selected recording', () => {
    expect(resolveModeStatus({ ...base, mode: 'idle' })).toBeNull()
  })
})
