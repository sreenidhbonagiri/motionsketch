import { useCallback, useEffect, useRef } from 'react'
import { clientToNormalized } from '../core/coords'
import {
  applyHandleDelta,
  copyPath,
  defaultInfluenceRadius,
  selectHandleIndices,
} from '../core/edit'
import type { MotionSample } from '../core/types'
import { useEditorStore } from '../state/store'

interface UsePathEditorOptions {
  stageRef: React.RefObject<HTMLElement | null>
}

export function usePathEditor({ stageRef }: UsePathEditorOptions) {
  const mode = useEditorStore((s) => s.mode)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)
  const beginHandleDrag = useEditorStore((s) => s.beginHandleDrag)
  const updateEditPreview = useEditorStore((s) => s.updateEditPreview)
  const commitHandleEdit = useEditorStore((s) => s.commitHandleEdit)
  const cancelHandleDrag = useEditorStore((s) => s.cancelHandleDrag)
  const setSelectedHandleIndex = useEditorStore((s) => s.setSelectedHandleIndex)
  const undoEdit = useEditorStore((s) => s.undoEdit)
  const redoEdit = useEditorStore((s) => s.redoEdit)

  const dragRef = useRef<{
    pointerId: number
    handleIndex: number
    origin: { x: number; y: number }
    baseSamples: MotionSample[]
  } | null>(null)

  const workingSamples = editPreview ?? editSession?.samples ?? null

  const handleIndices = workingSamples
    ? selectHandleIndices(workingSamples.length)
    : []

  const finishDrag = useCallback(
    (pointerId: number, commit: boolean) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId) return

      if (commit) {
        const preview = useEditorStore.getState().editPreview
        if (preview) commitHandleEdit(preview)
        else cancelHandleDrag()
      } else {
        cancelHandleDrag()
      }
      dragRef.current = null
    },
    [commitHandleEdit, cancelHandleDrag],
  )

  const onHandlePointerDown = useCallback(
    (handleIndex: number, event: React.PointerEvent<HTMLElement>) => {
      if (mode !== 'editing' || !editSession) return

      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return

      const pointer = clientToNormalized(event.clientX, event.clientY, rect)
      const base = copyPath(editSession.samples)
      dragRef.current = {
        pointerId: event.pointerId,
        handleIndex,
        origin: { x: pointer.x, y: pointer.y },
        baseSamples: base,
      }
      setSelectedHandleIndex(handleIndex)
      beginHandleDrag()
      updateEditPreview(base)

      const target = event.currentTarget
      const pointerId = event.pointerId

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId || !dragRef.current) return
        const stageRect = stageRef.current?.getBoundingClientRect()
        if (!stageRect) return
        const p = clientToNormalized(e.clientX, e.clientY, stageRect)
        const delta = {
          x: p.x - dragRef.current.origin.x,
          y: p.y - dragRef.current.origin.y,
        }
        updateEditPreview(
          applyHandleDelta(
            dragRef.current.baseSamples,
            dragRef.current.handleIndex,
            delta,
            defaultInfluenceRadius(dragRef.current.baseSamples.length),
          ),
        )
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        cleanup()
        finishDrag(pointerId, true)
      }

      const onCancel = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        cleanup()
        finishDrag(pointerId, false)
      }

      const cleanup = () => {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onCancel)
        try {
          target.releasePointerCapture(pointerId)
        } catch {
          // already released
        }
      }

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onCancel)
    },
    [
      mode,
      editSession,
      stageRef,
      setSelectedHandleIndex,
      beginHandleDrag,
      updateEditPreview,
      finishDrag,
    ],
  )

  useEffect(() => {
    if (mode !== 'editing' || !editSession) return

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key
      if (
        (event.metaKey || event.ctrlKey) &&
        key.toLowerCase() === 'z' &&
        !event.shiftKey
      ) {
        event.preventDefault()
        undoEdit()
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        (key.toLowerCase() === 'y' ||
          (key.toLowerCase() === 'z' && event.shiftKey))
      ) {
        event.preventDefault()
        redoEdit()
        return
      }

      const selected = useEditorStore.getState().selectedHandleIndex
      const session = useEditorStore.getState().editSession
      if (selected === null || !session) return

      const step = event.shiftKey ? 0.02 : 0.005
      let dx = 0
      let dy = 0
      if (key === 'ArrowLeft') dx = -step
      else if (key === 'ArrowRight') dx = step
      else if (key === 'ArrowUp') dy = -step
      else if (key === 'ArrowDown') dy = step
      else return

      event.preventDefault()
      const preview = useEditorStore.getState().editPreview
      const base = preview ?? session.samples
      commitHandleEdit(
        applyHandleDelta(
          base,
          selected,
          { x: dx, y: dy },
          defaultInfluenceRadius(base.length),
        ),
      )
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, editSession, undoEdit, redoEdit, commitHandleEdit])

  return {
    workingSamples,
    handleIndices,
    selectedHandleIndex,
    onHandlePointerDown,
  }
}
