import { useEffect } from 'react'
import { isWorkspaceShortcutBlockedTarget } from '../lib/editorShortcuts'
import {
  getActivePointerId,
  isRecordingActive,
} from '../lib/recordingController'
import { useEditorStore } from '../state/store'
import { useArmRecording } from './useArmRecording'

type Options = {
  shortcutsOpen: boolean
  onOpenShortcuts: () => void
  onCloseShortcuts: () => void
}

/**
 * Space play/pause, Q Record, and ? shortcut sheet. Yields to native Space on
 * buttons/inputs, ignores key-repeat and IME composition, and never interrupts
 * an active recording or path gesture.
 */
export function useEditorShortcuts({
  shortcutsOpen,
  onOpenShortcuts,
  onCloseShortcuts,
}: Options) {
  const armRecording = useArmRecording()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.repeat) return
      if (event.isComposing || event.keyCode === 229) return

      // Shortcut sheet Escape closes itself (gesture Escape handlers stay first
      // via capture elsewhere; this is bubble for dialog UX).
      if (event.key === 'Escape' && shortcutsOpen) {
        event.preventDefault()
        onCloseShortcuts()
        return
      }

      if (isWorkspaceShortcutBlockedTarget(event.target)) return

      // ? opens the sheet (Shift+/ or the ? key). Ignore with modifiers.
      if (
        event.key === '?' ||
        (event.key === '/' && event.shiftKey && !event.metaKey && !event.ctrlKey)
      ) {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        event.preventDefault()
        if (shortcutsOpen) onCloseShortcuts()
        else onOpenShortcuts()
        return
      }

      if (shortcutsOpen) return

      if (event.code === 'Space' || event.key === ' ') {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        const state = useEditorStore.getState()
        // Path add-mode owns Space; editing/recording gestures keep priority.
        if (
          state.mode === 'editing' ||
          state.mode === 'armed' ||
          state.mode === 'recording' ||
          state.pathGestureActive ||
          isRecordingActive() ||
          getActivePointerId() !== null
        ) {
          return
        }
        if (document.querySelector('dialog[open]')) return
        const hasRecording = state.project.actors.some((a) => a.recording)
        if (!hasRecording && state.mode !== 'playing') return
        event.preventDefault()
        if (state.mode === 'playing') state.pause()
        else state.play()
        return
      }

      if (
        (event.code === 'KeyQ' || event.key === 'q' || event.key === 'Q') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        void armRecording()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [armRecording, onCloseShortcuts, onOpenShortcuts, shortcutsOpen])
}
