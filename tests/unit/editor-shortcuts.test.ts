import { describe, expect, it } from 'vitest'
import {
  EDITOR_SHORTCUTS,
  isWorkspaceShortcutBlockedTarget,
} from '../../src/lib/editorShortcuts'

describe('editorShortcuts', () => {
  it('lists only documented working shortcuts', () => {
    expect(EDITOR_SHORTCUTS.map((s) => s.id)).toEqual([
      'play-pause',
      'record',
      'pan-hand',
      'pan-middle',
      'pan-empty',
      'undo',
      'redo',
      'escape',
      'shortcuts',
    ])
  })

  it('blocks buttons, inputs, and sliders for workspace shortcuts', () => {
    const button = document.createElement('button')
    const input = document.createElement('input')
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    const plain = document.createElement('div')
    expect(isWorkspaceShortcutBlockedTarget(button)).toBe(true)
    expect(isWorkspaceShortcutBlockedTarget(input)).toBe(true)
    expect(isWorkspaceShortcutBlockedTarget(slider)).toBe(true)
    expect(isWorkspaceShortcutBlockedTarget(plain)).toBe(false)
  })
})
