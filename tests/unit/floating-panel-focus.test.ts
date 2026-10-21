import { describe, expect, it } from 'vitest'
import { shouldReturnFocusOnClose } from '../../src/components/FloatingPanel'

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
    restore.setAttribute('data-testid', 'btn-project')
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
