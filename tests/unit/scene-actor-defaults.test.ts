import { describe, expect, it } from 'vitest'
import {
  createSceneActor,
  DEFAULT_ELEMENT_NAME,
  nextDefaultElementName,
  nextDefaultRestPosition,
  sanitizeActorName,
} from '../../src/core/sceneActor'
import { createEmptyPersistableProject } from '../../src/core/persist/document'
import { projectHasMeaningfulWork } from '../../src/examples/meaningfulWork'

describe('element defaults', () => {
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
})
