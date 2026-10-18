import { useEffect } from 'react'
import { useEditorStore } from '../state/store'

/** True when the event target is (or is inside) a native editable control. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false
  const el = target instanceof Element ? target : target.parentElement
  if (!el) return false
  if (el.closest('input, textarea, select')) return true
  let node: Element | null = el
  while (node) {
    if (node instanceof HTMLElement) {
      const attr = node.getAttribute('contenteditable')
      if (attr !== null && attr.toLowerCase() !== 'false') return true
      if (node.isContentEditable) return true
    }
    node = node.parentElement
  }
  return false
}

/**
 * Keyboard undo/redo for placement/clip/transform edits, plus transform
 * keyframe delete. Never intercepts typing or native editing in form fields /
 * contenteditable. Delete/Backspace only runs when a transform keyframe is
 * selected.
 */
export function useTransformShortcuts() {
  const mode = useEditorStore((s) => s.mode)
  const undoActorEdit = useEditorStore((s) => s.undoActorEdit)
  const redoActorEdit = useEditorStore((s) => s.redoActorEdit)
  const deleteSelected = useEditorStore((s) => s.deleteSelectedTransform)
  const selectTransform = useEditorStore((s) => s.selectTransformKeyframe)

  useEffect(() => {
    if (mode === 'editing' || mode === 'armed' || mode === 'recording') return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isEditableKeyboardTarget(event.target)) return

      const key = event.key
      if (
        (event.metaKey || event.ctrlKey) &&
        key.toLowerCase() === 'z' &&
        !event.shiftKey
      ) {
        const order = useEditorStore.getState().actorEditOrder
        if (order.length === 0) return
        event.preventDefault()
        undoActorEdit()
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        (key.toLowerCase() === 'y' ||
          (key.toLowerCase() === 'z' && event.shiftKey))
      ) {
        const order = useEditorStore.getState().actorEditRedoOrder
        if (order.length === 0) return
        event.preventDefault()
        redoActorEdit()
        return
      }
      if (key === 'Escape') {
        if (!useEditorStore.getState().selectedTransformId) return
        selectTransform(null)
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        // Require an explicit selected keyframe (e.g. marker focus/selection).
        const selected = useEditorStore.getState().selectedTransformId
        if (!selected) return
        event.preventDefault()
        deleteSelected()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, undoActorEdit, redoActorEdit, deleteSelected, selectTransform])
}
