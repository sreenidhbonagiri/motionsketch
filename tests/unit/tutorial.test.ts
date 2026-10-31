import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '../../src/core/persist/document'
import {
  buildTutorialPracticeProject,
  clearTutorialProgress,
  hasSavedProjectInStorage,
  loadTutorialPracticeSnapshot,
  readTutorialProgress,
  shouldAutoStartTutorial,
  TUTORIAL_DRAW_DRAG,
  TUTORIAL_DRAW_RECORD,
  TUTORIAL_DRAW_TITLE,
  TUTORIAL_EXPORT_INSIDE,
  TUTORIAL_EXPORT_OPEN,
  TUTORIAL_PLAY_IDLE,
  TUTORIAL_PLAY_NEXT,
  TUTORIAL_PLAY_WATCHING,
  TUTORIAL_PROGRESS_KEY,
  tutorialProgressLabel,
  tutorialTitleForStep,
  writeTutorialProgress,
  HELP_RECORDING_BLURB,
} from '../../src/lib/tutorial'
import { placeTutorialCard } from '../../src/lib/tutorialPlacement'

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

describe('tutorial copy', () => {
  it('uses compact Spectrum-style titles and bodies', () => {
    expect(tutorialTitleForStep('draw')).toBe(TUTORIAL_DRAW_TITLE)
    expect(tutorialProgressLabel('draw')).toBe('1 of 3')
    expect(TUTORIAL_DRAW_RECORD).toBe('Click Record to start.')
    expect(TUTORIAL_DRAW_DRAG).toMatch(/Drag the plane/)
    expect(TUTORIAL_PLAY_IDLE).toMatch(/Click Play/)
    expect(TUTORIAL_PLAY_WATCHING).toBe('Your flight is playing.')
    expect(TUTORIAL_PLAY_NEXT).toMatch(/Select Next/)
    expect(TUTORIAL_EXPORT_OPEN).toMatch(/Open Export/)
    expect(TUTORIAL_EXPORT_INSIDE).toMatch(/HTML or React/)
    expect(HELP_RECORDING_BLURB).not.toContain('—')
  })
})

describe('tutorial placement', () => {
  it('places the draw card above Record without covering it', () => {
    const anchor = {
      top: 700,
      left: 400,
      width: 96,
      height: 32,
      right: 496,
      bottom: 732,
    }
    const placed = placeTutorialCard({
      step: 'draw',
      exportOpen: false,
      vw: 1280,
      vh: 800,
      cardHeight: 120,
      anchor,
      panel: null,
    })
    expect(placed.top + 120).toBeLessThanOrEqual(anchor.top - 4)
    expect(placed.left).toBeGreaterThanOrEqual(10)
    expect(placed.left + placed.width).toBeLessThanOrEqual(1270)
  })

  it('keeps Export-open cards clear of the panel on desktop', () => {
    const panel = {
      top: 80,
      left: 900,
      width: 320,
      height: 500,
      right: 1220,
      bottom: 580,
    }
    const placed = placeTutorialCard({
      step: 'export',
      exportOpen: true,
      vw: 1280,
      vh: 800,
      cardHeight: 140,
      anchor: null,
      panel,
      avoidExtra: [
        {
          top: 200,
          left: 920,
          width: 280,
          height: 40,
          right: 1200,
          bottom: 240,
        },
      ],
    })
    expect(placed.left + placed.width).toBeLessThanOrEqual(panel.left - 4)
  })
})
