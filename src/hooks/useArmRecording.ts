import { useCallback } from 'react'
import { useConfirm } from './useConfirm'
import { useEditorStore } from '../state/store'
import { findActor } from '../core/sceneActor'
import { getActivePointerId, isRecordingActive } from '../lib/recordingController'

/**
 * Same Record path as the dock button: confirm before replacing an existing
 * path, then arm. Returns false when a gesture is already active or the user
 * cancels the confirm dialog.
 */
export function useArmRecording() {
  const confirm = useConfirm()

  return useCallback(async (): Promise<boolean> => {
    const state = useEditorStore.getState()
    if (
      state.mode === 'armed' ||
      state.mode === 'recording' ||
      state.mode === 'editing' ||
      state.pathGestureActive ||
      state.polishSession ||
      state.glideSession ||
      state.presetSession ||
      isRecordingActive() ||
      getActivePointerId() !== null
    ) {
      return false
    }
    if (document.querySelector('dialog[open]')) return false

    const actor =
      findActor(state.project.actors, state.selectedActorId) ??
      state.project.actors[0]
    const hasPath = Boolean(actor?.recording)
    if (hasPath) {
      const label = actor?.name ?? 'this element'
      const ok = await confirm({
        title: `Re-record “${label}”?`,
        body: 'This replaces only that element’s path and transform keyframes. Shared Duration stays the same.',
        confirmLabel: 'Replace recording',
        testId: 'rerecord-confirm',
        confirmTestId: 'btn-rerecord-confirm',
        cancelTestId: 'btn-rerecord-cancel',
        bodyTestId: 'rerecord-confirm-copy',
      })
      if (!ok) return false
    }
    useEditorStore.getState().setPlaybackHead(0)
    useEditorStore.getState().armRecording()
    return true
  }, [confirm])
}
