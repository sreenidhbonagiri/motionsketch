import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '../../src/core/persist/document'
import {
  buildTutorialPracticeProject,
  clearTutorialProgress,
  hasSavedProjectInStorage,
  loadTutorialPracticeSnapshot,
  readTutorialProgress,
  shouldAutoStartTutorial,
  TUTORIAL_PROGRESS_KEY,
  writeTutorialProgress,
} from '../../src/lib/tutorial'

describe('tutorial practice project', () => {
  it('uses the notebook plane with no path and Face along path off', () => {
    const project = buildTutorialPracticeProject()
    expect(project.actors).toHaveLength(1)
    const plane = project.actors[0]!
    expect(plane.appearance.kind).toBe('image')
    expect(plane.appearance.image?.label).toBe('Paper plane')
    expect(plane.recording).toBeNull()
    expect(plane.faceAlongPath).toBe(false)
  })

  it('round-trips through persist validation', () => {
    const snap = loadTutorialPracticeSnapshot()
    expect(snap.project.actors[0]?.recording).toBeNull()
    expect(snap.project.actors[0]?.faceAlongPath).toBe(false)
    expect(snap.project.name).toBe('Tutorial practice')
  })
})

describe('tutorial progress + auto-start', () => {
  beforeEach(() => {
    clearTutorialProgress()
    localStorage.removeItem(STORAGE_KEY)
  })

  it('auto-starts only with empty storage and no preference', () => {
    expect(hasSavedProjectInStorage()).toBe(false)
    expect(shouldAutoStartTutorial()).toBe(true)
    writeTutorialProgress('skipped')
    expect(shouldAutoStartTutorial()).toBe(false)
    clearTutorialProgress()
    localStorage.setItem(STORAGE_KEY, '{"formatVersion":14}')
    expect(hasSavedProjectInStorage()).toBe(true)
    expect(shouldAutoStartTutorial()).toBe(false)
  })

  it('remembers completed and skipped', () => {
    writeTutorialProgress('completed')
    expect(readTutorialProgress()).toEqual({ status: 'completed' })
    expect(localStorage.getItem(TUTORIAL_PROGRESS_KEY)).toContain('completed')
  })
})
