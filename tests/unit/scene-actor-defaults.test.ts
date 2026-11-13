import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSceneActor,
  DEFAULT_ELEMENT_NAME,
  nextDefaultElementName,
  nextDefaultRestPosition,
  sanitizeActorName,
} from '../../src/core/sceneActor'
import { createEmptyPersistableProject } from '../../src/core/persist/document'
import { projectHasMeaningfulWork } from '../../src/examples/meaningfulWork'
import { useEditorStore } from '../../src/state/store'

describe('element defaults', () => {
  beforeEach(() => {
    const project = createEmptyPersistableProject()
    useEditorStore.setState({
      project,
      selectedActorId: project.actors[0]!.id,
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      liveTrail: [],
      polishSession: null,
      glideSession: null,
      presetSession: null,
      actionAnnouncement: null,
      actorEditOrder: [],
      actorEditRedoOrder: [],
    })
  })

  it('names new empty projects Element 1 without treating them as edited', () => {
    const blank = createEmptyPersistableProject()
    expect(blank.actors[0]!.name).toBe(DEFAULT_ELEMENT_NAME)
    expect(projectHasMeaningfulWork(blank)).toBe(false)
    expect(sanitizeActorName('')).toBe('Element')
    expect(createSceneActor().name).toBe(DEFAULT_ELEMENT_NAME)
  })

  it('nextDefaultElementName skips taken Element N and leaves legacy Actor names', () => {
    expect(nextDefaultElementName(['Actor 1'])).toBe('Element 1')
    expect(nextDefaultElementName(['Element 1', 'Actor 1'])).toBe('Element 2')
    expect(nextDefaultElementName(['Element 1', 'Element 2'])).toBe('Element 3')
  })

  it('nextDefaultRestPosition keeps new rests clear of occupied centers', () => {
    const first = { x: 0.35, y: 0.5 }
    const second = nextDefaultRestPosition([first])
    expect(
      Math.hypot(second.x - first.x, second.y - first.y),
    ).toBeGreaterThanOrEqual(0.14 - 1e-6)
    const third = nextDefaultRestPosition([first, second])
    for (const prior of [first, second]) {
      expect(
        Math.hypot(third.x - prior.x, third.y - prior.y),
      ).toBeGreaterThanOrEqual(0.14 - 1e-6)
    }
    // Separation clears a large default shape half-extent (size 0.22 → 0.11).
    expect(
      Math.hypot(second.x - first.x, second.y - first.y),
    ).toBeGreaterThan(0.11)
  })

  it('addActor uses Element naming and separated rests; duplicate keeps geometry', () => {
    const a0 = useEditorStore.getState().project.actors[0]!
    expect(a0.name).toBe('Element 1')

    const id1 = useEditorStore.getState().addActor()
    expect(id1).toBeTruthy()
    const a1 = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === id1)!
    expect(a1.name).toBe('Element 2')
    expect(
      Math.hypot(
        a1.restPosition.x - a0.restPosition.x,
        a1.restPosition.y - a0.restPosition.y,
      ),
    ).toBeGreaterThanOrEqual(0.14 - 1e-6)

    useEditorStore.getState().selectActor(a0.id)
    const dupId = useEditorStore.getState().duplicateSelectedActor()
    const dup = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === dupId)!
    expect(dup.name).toMatch(/Element 1 copy/)
    expect(dup.restPosition).toEqual(a0.restPosition)
    expect(dup.appearance).toEqual(a0.appearance)
  })
})
