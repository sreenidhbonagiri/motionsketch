import { describe, expect, it } from 'vitest'
import {
  canFloatBothWorkspaceCards,
  MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX,
} from '../../src/theme/floatingCard'

describe('floating workspace cards capacity', () => {
  it('allows both cards at 900px and above the clear-stage floor', () => {
    expect(canFloatBothWorkspaceCards(900)).toBe(true)
    expect(canFloatBothWorkspaceCards(1280)).toBe(true)
    expect(canFloatBothWorkspaceCards(MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX)).toBe(
      true,
    )
  })

  it('rejects both cards when clear stage would be too narrow', () => {
    expect(
      canFloatBothWorkspaceCards(MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX - 1),
    ).toBe(false)
    expect(canFloatBothWorkspaceCards(800)).toBe(false)
  })
})
