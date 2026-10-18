import { useCallback, useEffect, useRef } from 'react'
import { clientToNormalized } from '../core/coords'
import {
  applyHandleDelta,
  copyPath,
  cycleHandleIndex,
  cycleWithinHandles,
  findNearbyHandleIndices,
  findNearestPathHit,
  HANDLE_DRAG_THRESHOLD_PX,
  isEndpointHandle,
  PATH_ADD_HIT_TOLERANCE_PX,
} from '../core/edit'
import type { MotionSample } from '../core/types'
import { isEditableKeyboardTarget } from './useTransformShortcuts'
import { useEditorStore } from '../state/store'

interface UsePathEditorOptions {
  stageRef: React.RefObject<HTMLElement | null>
}

type PendingHandlePointer = {
  pointerId: number
  handleIndex: number
  cluster: number[]
  /** Selection before this pointerdown (for overlap cycling on tap). */
  prevSelected: number | null
  originClient: { x: number; y: number }
  originNorm: { x: number; y: number }
  baseSamples: MotionSample[]
  dragging: boolean
  target: HTMLElement
}

export function usePathEditor({ stageRef }: UsePathEditorOptions) {
  const mode = useEditorStore((s) => s.mode)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)
  const pathAddMode = useEditorStore((s) => s.pathAddMode)
  const pathAddCandidateIndex = useEditorStore((s) => s.pathAddCandidateIndex)
  const stageAspect = useEditorStore((s) => s.project.stageAspect)
  const beginHandleDrag = useEditorStore((s) => s.beginHandleDrag)
  const updateEditPreview = useEditorStore((s) => s.updateEditPreview)
  const commitHandleEdit = useEditorStore((s) => s.commitHandleEdit)
  const cancelHandleDrag = useEditorStore((s) => s.cancelHandleDrag)
  const setSelectedHandleIndex = useEditorStore((s) => s.setSelectedHandleIndex)
  const setPathAddCandidateIndex = useEditorStore(
    (s) => s.setPathAddCandidateIndex,
  )
  const addPathHandleAt = useEditorStore((s) => s.addPathHandleAt)
  const removeSelectedPathHandle = useEditorStore(
    (s) => s.removeSelectedPathHandle,
  )
  const setPathAddMode = useEditorStore((s) => s.setPathAddMode)
  const undoEdit = useEditorStore((s) => s.undoEdit)
  const redoEdit = useEditorStore((s) => s.redoEdit)
  const announceAction = useEditorStore((s) => s.announceAction)

  const pendingRef = useRef<PendingHandlePointer | null>(null)

  const workingSamples = editPreview ?? editSession?.samples ?? null

  const handleIndices = editSession ? editSession.handleIndices : []

  const finishDrag = useCallback(
    (pointerId: number, commit: boolean) => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== pointerId) return

      if (pending.dragging) {
        if (commit) {
          const preview = useEditorStore.getState().editPreview
          if (preview) commitHandleEdit(preview)
          else cancelHandleDrag()
        } else {
          cancelHandleDrag()
        }
      }
      pendingRef.current = null
    },
    [commitHandleEdit, cancelHandleDrag],
  )

  const onHandlePointerDown = useCallback(
    (handleIndex: number, event: React.PointerEvent<HTMLElement>) => {
      if (mode !== 'editing' || !editSession) return
      if (pathAddMode) return

      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return

      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      const cluster = findNearbyHandleIndices(
        editSession.samples,
        editSession.handleIndices,
        localX,
        localY,
        rect.width,
        rect.height,
      )
      const effectiveCluster =
        cluster.length > 0 ? cluster : [handleIndex]

      const prevSelected = useEditorStore.getState().selectedHandleIndex
      let pick: number
      if (
        prevSelected !== null &&
        effectiveCluster.includes(prevSelected)
      ) {
        // Keep current selection so a drag reshapes the active handle;
        // a tap without movement cycles on pointerup.
        pick = prevSelected
      } else {
        // Closest handle in the cluster to the pointer (screen space).
        let best = effectiveCluster[0]!
        let bestDist = Infinity
        for (const index of effectiveCluster) {
          const sample = editSession.samples[index]
          if (!sample) continue
          const dist = Math.hypot(
            localX - sample.x * rect.width,
            localY - sample.y * rect.height,
          )
          if (dist < bestDist) {
            bestDist = dist
            best = index
          }
        }
        pick = best
      }

      const pointer = clientToNormalized(event.clientX, event.clientY, rect)
      const base = copyPath(editSession.samples)
      pendingRef.current = {
        pointerId: event.pointerId,
        handleIndex: pick,
        cluster: effectiveCluster,
        prevSelected,
        originClient: { x: event.clientX, y: event.clientY },
        originNorm: { x: pointer.x, y: pointer.y },
        baseSamples: base,
        dragging: false,
        target: event.currentTarget,
      }
      setSelectedHandleIndex(pick)

      const target = event.currentTarget
      const pointerId = event.pointerId
      const aspect = useEditorStore.getState().project.stageAspect

      const onMove = (e: PointerEvent) => {
        const pending = pendingRef.current
        if (!pending || e.pointerId !== pointerId) return
        const movedPx = Math.hypot(
          e.clientX - pending.originClient.x,
          e.clientY - pending.originClient.y,
        )
        if (!pending.dragging) {
          if (movedPx < HANDLE_DRAG_THRESHOLD_PX) return
          pending.dragging = true
          beginHandleDrag()
          updateEditPreview(pending.baseSamples)
        }
        const stageRect = stageRef.current?.getBoundingClientRect()
        if (!stageRect) return
        const p = clientToNormalized(e.clientX, e.clientY, stageRect)
        const delta = {
          x: p.x - pending.originNorm.x,
          y: p.y - pending.originNorm.y,
        }
        updateEditPreview(
          applyHandleDelta(
            pending.baseSamples,
            pending.handleIndex,
            delta,
            { stageAspect: aspect },
          ),
        )
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        const pending = pendingRef.current
        cleanup()
        if (
          pending &&
          !pending.dragging &&
          pending.cluster.length > 1 &&
          pending.prevSelected !== null &&
          pending.cluster.includes(pending.prevSelected)
        ) {
          const next = cycleWithinHandles(
            pending.cluster,
            pending.handleIndex,
          )
          setSelectedHandleIndex(next)
        }
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
      pathAddMode,
      stageRef,
      setSelectedHandleIndex,
      beginHandleDrag,
      updateEditPreview,
      finishDrag,
    ],
  )

  const tryAddAtClient = useCallback(
    (clientX: number, clientY: number) => {
      const session = useEditorStore.getState().editSession
      const rect = stageRef.current?.getBoundingClientRect()
      if (!session || !rect) return false
      const hit = findNearestPathHit(
        session.samples,
        clientX - rect.left,
        clientY - rect.top,
        rect.width,
        rect.height,
        useEditorStore.getState().project.stageAspect,
      )
      if (!hit || hit.distancePx > PATH_ADD_HIT_TOLERANCE_PX) {
        announceAction('Click closer to the path to add a point.')
        setPathAddCandidateIndex(null)
        return false
      }
      setPathAddCandidateIndex(hit.sampleIndex)
      return addPathHandleAt(hit.sampleIndex)
    },
    [
      stageRef,
      announceAction,
      setPathAddCandidateIndex,
      addPathHandleAt,
    ],
  )

  const onStagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (mode !== 'editing' || !pathAddMode || !editSession) return
      if (event.button !== 0) return
      event.preventDefault()
      tryAddAtClient(event.clientX, event.clientY)
    },
    [mode, pathAddMode, editSession, tryAddAtClient],
  )

  const onStagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (mode !== 'editing' || !pathAddMode || !editSession) return
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      const hit = findNearestPathHit(
        editSession.samples,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        stageAspect,
      )
      if (!hit || hit.distancePx > PATH_ADD_HIT_TOLERANCE_PX) {
        setPathAddCandidateIndex(null)
        return
      }
      setPathAddCandidateIndex(hit.sampleIndex)
    },
    [
      mode,
      pathAddMode,
      editSession,
      stageRef,
      stageAspect,
      setPathAddCandidateIndex,
    ],
  )

  useEffect(() => {
    if (mode !== 'editing' || !editSession) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return

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

      const addMode = useEditorStore.getState().pathAddMode
      const session = useEditorStore.getState().editSession
      if (!session) return

      if (key === 'Escape' && addMode) {
        event.preventDefault()
        setPathAddMode(false)
        return
      }

      if (addMode) {
        let candidate =
          useEditorStore.getState().pathAddCandidateIndex ??
          Math.floor(session.samples.length / 2)
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          event.preventDefault()
          const step = event.shiftKey ? 4 : 1
          candidate =
            key === 'ArrowRight'
              ? Math.min(session.samples.length - 1, candidate + step)
              : Math.max(0, candidate - step)
          setPathAddCandidateIndex(candidate)
          return
        }
        if (key === 'Enter' || key === ' ') {
          event.preventDefault()
          addPathHandleAt(candidate)
          return
        }
        return
      }

      if (key === '[' || key === ']') {
        event.preventDefault()
        const current = useEditorStore.getState().selectedHandleIndex
        const next = cycleHandleIndex(
          session.handleIndices,
          current,
          key === ']' ? 1 : -1,
        )
        if (next !== null) setSelectedHandleIndex(next)
        return
      }

      if (key === 'Delete' || key === 'Backspace') {
        const selected = useEditorStore.getState().selectedHandleIndex
        if (selected === null) return
        if (isEndpointHandle(session.samples.length, selected)) {
          announceAction(
            'Start and end points can’t be removed — they keep the path anchored.',
          )
          event.preventDefault()
          return
        }
        event.preventDefault()
        removeSelectedPathHandle()
        return
      }

      const selected = useEditorStore.getState().selectedHandleIndex
      if (selected === null) return

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
      const aspect = useEditorStore.getState().project.stageAspect
      commitHandleEdit(
        applyHandleDelta(base, selected, { x: dx, y: dy }, {
          stageAspect: aspect,
        }),
      )
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    mode,
    editSession,
    undoEdit,
    redoEdit,
    commitHandleEdit,
    setPathAddMode,
    setPathAddCandidateIndex,
    addPathHandleAt,
    removeSelectedPathHandle,
    announceAction,
    setSelectedHandleIndex,
  ])

  return {
    workingSamples,
    handleIndices,
    selectedHandleIndex,
    pathAddMode,
    pathAddCandidateIndex,
    onHandlePointerDown,
    onStagePointerDown,
    onStagePointerMove,
  }
}
