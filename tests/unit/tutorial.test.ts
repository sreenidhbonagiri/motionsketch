import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildTutorialPracticeProject,
  clearTutorialProgress,
  loadTutorialPracticeSnapshot,
  readTutorialProgress,
  shouldOfferTutorial,
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

describe('tutorial progress storage', () => {
  beforeEach(() => {
    clearTutorialProgress()
  })

  it('offers until completed or skipped', () => {
    expect(shouldOfferTutorial()).toBe(true)
    writeTutorialProgress('skipped')
    expect(shouldOfferTutorial()).toBe(false)
    expect(readTutorialProgress()).toEqual({ status: 'skipped' })
    clearTutorialProgress()
    writeTutorialProgress('completed')
    expect(localStorage.getItem(TUTORIAL_PROGRESS_KEY)).toContain('completed')
    expect(shouldOfferTutorial()).toBe(false)
  })
})
