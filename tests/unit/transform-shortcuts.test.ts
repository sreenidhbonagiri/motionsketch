import { describe, expect, it } from 'vitest'
import { isEditableKeyboardTarget } from '../../src/hooks/useTransformShortcuts'

describe('transform keyboard target guards', () => {
  it('treats inputs, textareas, selects, and contenteditable as editable', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const nested = document.createElement('span')
    editable.appendChild(nested)

    expect(isEditableKeyboardTarget(input)).toBe(true)
    expect(isEditableKeyboardTarget(textarea)).toBe(true)
    expect(isEditableKeyboardTarget(select)).toBe(true)
    expect(isEditableKeyboardTarget(editable)).toBe(true)
    expect(isEditableKeyboardTarget(nested)).toBe(true)
  })

  it('allows shortcuts on buttons and non-editable surfaces', () => {
    const button = document.createElement('button')
    const div = document.createElement('div')
    expect(isEditableKeyboardTarget(button)).toBe(false)
    expect(isEditableKeyboardTarget(div)).toBe(false)
    expect(isEditableKeyboardTarget(null)).toBe(false)
  })
})
