import { describe, expect, it } from 'vitest'
import {
  canFloatBothWorkspaceCards,
  FOCUSED_SHEET_CONTENT_CLASS,
  FOCUSED_SHEET_CONTENT_MAX_PX,
  MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX,
} from '../../src/theme/floatingCard'

describe('floating workspace cards capacity', () => {
  it('allows both cards at the ~1100px floor and above', () => {
    expect(MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX).toBe(1100)
    expect(canFloatBothWorkspaceCards(1100)).toBe(true)
    expect(canFloatBothWorkspaceCards(1280)).toBe(true)
    expect(canFloatBothWorkspaceCards(MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX)).toBe(
      true,
    )
  })

  it('rejects both cards below the floor (focused sheets instead)', () => {
    expect(
      canFloatBothWorkspaceCards(MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX - 1),
    ).toBe(false)
    expect(canFloatBothWorkspaceCards(900)).toBe(false)
    expect(canFloatBothWorkspaceCards(800)).toBe(false)
  })

  it('caps focused sheet content around 420px without lowering the float floor', () => {
    expect(FOCUSED_SHEET_CONTENT_MAX_PX).toBe(420)
    expect(FOCUSED_SHEET_CONTENT_CLASS).toContain('max-w-[26.25rem]')
    expect(FOCUSED_SHEET_CONTENT_CLASS).toContain('w-full')
    expect(MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX).toBe(1100)
  })
})
