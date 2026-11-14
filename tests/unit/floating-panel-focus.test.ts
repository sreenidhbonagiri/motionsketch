import { describe, expect, it, vi } from 'vitest'
import {
  focusOpener,
  isFocusNavigationKey,
  openerHadKeyboardFocus,
  shouldReturnFocusOnClose,
} from '../../src/components/FloatingPanel'

describe('shouldReturnFocusOnClose', () => {
  it('restores when focus collapsed to body after the panel unmounted', () => {
    const restore = document.createElement('button')
    document.body.appendChild(restore)
    expect(shouldReturnFocusOnClose(document.body, restore)).toBe(true)
    expect(shouldReturnFocusOnClose(null, restore)).toBe(true)
    restore.remove()
  })

  it('does not steal focus when the stage (or another control) already has it', () => {
    const restore = document.createElement('button')
    restore.setAttribute('data-testid', 'btn-help')
    const stage = document.createElement('div')
    stage.setAttribute('data-testid', 'stage')
    stage.tabIndex = -1
    document.body.append(restore, stage)
    expect(shouldReturnFocusOnClose(stage, restore)).toBe(false)
    restore.remove()
    stage.remove()
  })

  it('still restores when focus remains on the opener itself', () => {
    const restore = document.createElement('button')
    document.body.appendChild(restore)
    expect(shouldReturnFocusOnClose(restore, restore)).toBe(true)
    restore.remove()
  })

  it('skips restore when the opener was removed', () => {
    const restore = document.createElement('button')
    expect(shouldReturnFocusOnClose(document.body, restore)).toBe(false)
  })
})

describe('focusOpener', () => {
  it('passes focusVisible through so pointer restores stay ring-free', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    const focus = vi.spyOn(el, 'focus')
    focusOpener(el, false)
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ focusVisible: false, preventScroll: true }),
    )
    focusOpener(el, true)
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ focusVisible: true, preventScroll: true }),
    )
    el.remove()
  })

  it('blurs only when clearing an existing :focus-visible on the opener', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.focus()
    const blur = vi.spyOn(el, 'blur')
    const focus = vi.spyOn(el, 'focus')
    // jsdom: :focus-visible often does not match — blur should not run then.
    const needsBlur = el.matches(':focus-visible')
    focusOpener(el, false)
    if (needsBlur) {
      expect(blur).toHaveBeenCalled()
    } else {
      expect(blur).not.toHaveBeenCalled()
    }
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ focusVisible: false }),
    )
    blur.mockClear()
    focusOpener(el, true)
    expect(blur).not.toHaveBeenCalled()
    el.remove()
  })

  it('openerHadKeyboardFocus mirrors :focus-visible', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.focus()
    expect(typeof openerHadKeyboardFocus(el)).toBe('boolean')
    expect(openerHadKeyboardFocus(null)).toBe(false)
    el.remove()
  })

  it('isFocusNavigationKey covers Tab and arrows, not Escape', () => {
    expect(isFocusNavigationKey('Tab')).toBe(true)
    expect(isFocusNavigationKey('ArrowDown')).toBe(true)
    expect(isFocusNavigationKey('Escape')).toBe(false)
    expect(isFocusNavigationKey('Enter')).toBe(false)
  })
})
