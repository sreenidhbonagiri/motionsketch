import { useCallback, useEffect, useRef, useState } from 'react'
import { clientToNormalized, clientToStageNormalized } from '../core/coords'
import {
  applyHandleDelta,
  applyPathTranslation,
  copyPath,
  cycleHandleIndex,
  cycleWithinHandles,
  findNearbyHandleIndices,
  findNearestPathHit,
  HANDLE_DRAG_THRESHOLD_PX,
  isEndpointHandle,
  limitPathTranslationDelta,
  PATH_ADD_HIT_TOLERANCE_PX,
  PATH_MOVE_HIT_TOLERANCE_PX,
  PATH_MOVE_NUDGE_STEP,
  PATH_MOVE_NUDGE_STEP_SHIFT,
  samplesMatch,
  translatePathSamples,
} from '../core/edit'
import {
  GRID_KEYBOARD_STEP,
  GRID_KEYBOARD_STEP_SHIFT,
  nearestGridPoint,
  resolveSnapTarget,
  snapTranslationForAnchor,
} from '../core/grid'
import type { MotionSample, Vec2 } from '../core/types'
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
  previousSnap: Vec2 | null
  target: HTMLElement
  cleanup: () => void
}

type PendingMovePointer = {
  pointerId: number
  originNorm: { x: number; y: number }
  baseSamples: MotionSample[]
  dragging: boolean
  previousSnap: Vec2 | null
  target: Element
  cleanup: () => void
}

type MoveNudgeGesture = {
  baseline: MotionSample[]
  dx: number
  dy: number
  keys: Set<string>
}

const ARROW_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
])

export function usePathEditor({ stageRef }: UsePathEditorOptions) {
  const mode = useEditorStore((s) => s.mode)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)
  const pathAddMode = useEditorStore((s) => s.pathAddMode)
  const pathTool = useEditorStore((s) => s.pathTool)
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
  const smoothSelectedBend = useEditorStore((s) => s.smoothSelectedBend)
  const makeSelectedCorner = useEditorStore((s) => s.makeSelectedCorner)
  const setPathAddMode = useEditorStore((s) => s.setPathAddMode)
  const setPathTool = useEditorStore((s) => s.setPathTool)
  const setPathGestureActive = useEditorStore((s) => s.setPathGestureActive)
  const undoEdit = useEditorStore((s) => s.undoEdit)
  const redoEdit = useEditorStore((s) => s.redoEdit)
  const announceAction = useEditorStore((s) => s.announceAction)

  const pendingRef = useRef<PendingHandlePointer | null>(null)
  const pendingMoveRef = useRef<PendingMovePointer | null>(null)
  const moveNudgeRef = useRef<MoveNudgeGesture | null>(null)
  const movePathFocusedRef = useRef(false)
  const [moveHovered, setMoveHovered] = useState(false)
  const [moveDragging, setMoveDragging] = useState(false)
  const [movePathFocused, setMovePathFocused] = useState(false)

  const workingSamples = editPreview ?? editSession?.samples ?? null
  const handleIndices = editSession ? editSession.handleIndices : []
  const moveTool = mode === 'editing' && pathTool === 'move-path'

  const clearSnapChrome = useCallback(() => {
    useEditorStore.getState().setSnapIndicator(null)
  }, [])

  const finishDrag = useCallback(
    (pointerId: number, commit: boolean) => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== pointerId) return

      pending.cleanup()
      if (pending.dragging) {
        if (commit) {
          const preview = useEditorStore.getState().editPreview
          if (preview) commitHandleEdit(preview)
          else cancelHandleDrag()
        } else {
          cancelHandleDrag()
        }
      } else {
        // Selection-only click: pointerdown arms the gesture flag — clear it.
        setPathGestureActive(false)
      }
      pendingRef.current = null
      clearSnapChrome()
    },
    [commitHandleEdit, cancelHandleDrag, setPathGestureActive, clearSnapChrome],
  )

  const finishMoveDrag = useCallback(
    (pointerId: number, commit: boolean) => {
      const pending = pendingMoveRef.current
      if (!pending || pending.pointerId !== pointerId) return

      pending.cleanup()
      if (pending.dragging) {
        if (commit) {
          const preview = useEditorStore.getState().editPreview
          if (preview && !samplesMatch(pending.baseSamples, preview)) {
            commitHandleEdit(preview)
          } else {
            cancelHandleDrag()
          }
        } else {
          cancelHandleDrag()
        }
      } else {
        setPathGestureActive(false)
      }
      pendingMoveRef.current = null
      setMoveDragging(false)
      clearSnapChrome()
    },
    [commitHandleEdit, cancelHandleDrag, setPathGestureActive, clearSnapChrome],
  )

  const endMoveNudge = useCallback(
    (commit: boolean) => {
      const gesture = moveNudgeRef.current
      if (!gesture) return
      moveNudgeRef.current = null
      const state = useEditorStore.getState()
      if (commit && state.mode === 'editing' && state.editSession) {
        const preview = state.editPreview
        if (preview && !samplesMatch(gesture.baseline, preview)) {
          commitHandleEdit(preview)
          return
        }
      }
      cancelHandleDrag()
      useEditorStore.getState().setSnapIndicator(null)
    },
    [commitHandleEdit, cancelHandleDrag],
  )

  /** Drop pointer/keyboard path gestures without leaving preview or capture stuck. */
  const discardAllPathGestures = useCallback(() => {
    if (pendingMoveRef.current) {
      const pending = pendingMoveRef.current
      pending.cleanup()
      pendingMoveRef.current = null
      setMoveDragging(false)
    }
    if (pendingRef.current) {
      pendingRef.current.cleanup()
      pendingRef.current = null
    }
    if (moveNudgeRef.current) {
      moveNudgeRef.current = null
    }
    cancelHandleDrag()
    setPathGestureActive(false)
    useEditorStore.getState().setSnapIndicator(null)
  }, [cancelHandleDrag, setPathGestureActive])

  const onHandlePointerDown = useCallback(
    (handleIndex: number, event: React.PointerEvent<HTMLElement>) => {
      if (mode !== 'editing' || !editSession) return
      if (pathAddMode || pathTool === 'move-path') return

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
        pick = prevSelected
      } else {
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
        const baseHandle = pending.baseSamples[pending.handleIndex]!
        let target = {
          x: baseHandle.x + (p.x - pending.originNorm.x),
          y: baseHandle.y + (p.y - pending.originNorm.y),
        }
        const snapOn = useEditorStore.getState().snapToGrid
        if (snapOn) {
          const resolved = resolveSnapTarget(
            target,
            stageRect.width,
            stageRect.height,
            pending.previousSnap,
          )
          pending.previousSnap = resolved.snapped
          if (resolved.snapped) {
            target = resolved.snapped
            useEditorStore.getState().setSnapIndicator(resolved.snapped)
          } else {
            useEditorStore.getState().setSnapIndicator(null)
          }
        } else {
          pending.previousSnap = null
          useEditorStore.getState().setSnapIndicator(null)
        }
        const delta = {
          x: target.x - baseHandle.x,
          y: target.y - baseHandle.y,
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

      pendingRef.current = {
        pointerId,
        handleIndex: pick,
        cluster: effectiveCluster,
        prevSelected,
        originClient: { x: event.clientX, y: event.clientY },
        originNorm: { x: pointer.x, y: pointer.y },
        baseSamples: base,
        dragging: false,
        previousSnap: null,
        target,
        cleanup,
      }
      setPathGestureActive(true)
      setSelectedHandleIndex(pick)
      useEditorStore.getState().setSnapIndicator(null)

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onCancel)
    },
    [
      mode,
      editSession,
      pathAddMode,
      pathTool,
      stageRef,
      setSelectedHandleIndex,
      setPathGestureActive,
      beginHandleDrag,
      updateEditPreview,
      finishDrag,
    ],
  )

  const onMovePathPointerDown = useCallback(
    (event: React.PointerEvent<SVGElement>) => {
      if (mode !== 'editing' || pathTool !== 'move-path' || !editSession) return
      if (event.button !== 0) return

      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      const hit = findNearestPathHit(
        editPreview ?? editSession.samples,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        stageAspect,
      )
      if (!hit || hit.distancePx > PATH_MOVE_HIT_TOLERANCE_PX) return

      event.preventDefault()
      event.stopPropagation()
      endMoveNudge(true)

      const origin = clientToStageNormalized(event.clientX, event.clientY, rect)
      const base = copyPath(editSession.samples)
      const target = event.currentTarget
      const pointerId = event.pointerId
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // ignore
      }

      const onMove = (e: PointerEvent) => {
        const pending = pendingMoveRef.current
        if (!pending || e.pointerId !== pointerId) return
        const stageRect = stageRef.current?.getBoundingClientRect()
        if (!stageRect) return
        const p = clientToStageNormalized(e.clientX, e.clientY, stageRect)
        const rawDelta = {
          x: p.x - pending.originNorm.x,
          y: p.y - pending.originNorm.y,
        }
        const movedPx = Math.hypot(
          rawDelta.x * stageRect.width,
          rawDelta.y * stageRect.height,
        )
        if (!pending.dragging) {
          if (movedPx < HANDLE_DRAG_THRESHOLD_PX) return
          pending.dragging = true
          setMoveDragging(true)
          beginHandleDrag()
        }
        const anchor = pending.baseSamples[0]!
        const snapOn = useEditorStore.getState().snapToGrid
        const { delta, idealSnap, actualAnchor } = snapTranslationForAnchor(
          { x: anchor.x, y: anchor.y },
          rawDelta,
          (d) => limitPathTranslationDelta(pending.baseSamples, d),
          snapOn,
          stageRect.width,
          stageRect.height,
          pending.previousSnap,
        )
        pending.previousSnap = idealSnap
        // Marker shows the reachable anchor (honest when bounds clip snap).
        if (snapOn && pending.dragging) {
          useEditorStore.getState().setSnapIndicator(actualAnchor)
        } else {
          useEditorStore.getState().setSnapIndicator(null)
        }
        updateEditPreview(translatePathSamples(pending.baseSamples, delta))
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        cleanup()
        finishMoveDrag(pointerId, true)
      }

      const onCancel = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        cleanup()
        finishMoveDrag(pointerId, false)
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

      pendingMoveRef.current = {
        pointerId,
        originNorm: origin,
        baseSamples: base,
        dragging: false,
        previousSnap: null,
        target,
        cleanup,
      }
      setPathGestureActive(true)
      setMoveDragging(false)
      useEditorStore.getState().setSnapIndicator(null)

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onCancel)
    },
    [
      mode,
      pathTool,
      editSession,
      editPreview,
      stageRef,
      stageAspect,
      beginHandleDrag,
      updateEditPreview,
      finishMoveDrag,
      endMoveNudge,
      setPathGestureActive,
    ],
  )

  const onMovePathPointerMove = useCallback(
    (event: React.PointerEvent<SVGElement>) => {
      if (mode !== 'editing' || pathTool !== 'move-path' || !editSession) {
        setMoveHovered(false)
        return
      }
      if (pendingMoveRef.current?.dragging) {
        setMoveHovered(true)
        return
      }
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      const samples = editPreview ?? editSession.samples
      const hit = findNearestPathHit(
        samples,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        stageAspect,
      )
      setMoveHovered(!!hit && hit.distancePx <= PATH_MOVE_HIT_TOLERANCE_PX)
    },
    [mode, pathTool, editSession, editPreview, stageRef, stageAspect],
  )

  const onMovePathPointerLeave = useCallback(() => {
    if (!pendingMoveRef.current?.dragging) setMoveHovered(false)
  }, [])

  const onMovePathFocus = useCallback(() => {
    movePathFocusedRef.current = true
    setMovePathFocused(true)
  }, [])

  const onMovePathBlur = useCallback(() => {
    movePathFocusedRef.current = false
    setMovePathFocused(false)
    endMoveNudge(true)
  }, [endMoveNudge])

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
      if (pathTool === 'move-path') return
      if (event.button !== 0) return
      event.preventDefault()
      tryAddAtClient(event.clientX, event.clientY)
    },
    [mode, pathAddMode, pathTool, editSession, tryAddAtClient],
  )

  const onStagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (mode !== 'editing' || !pathAddMode || !editSession) return
      if (pathTool === 'move-path') return
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
      pathTool,
      editSession,
      stageRef,
      stageAspect,
      setPathAddCandidateIndex,
    ],
  )

  useEffect(() => {
    if (mode !== 'editing' || !editSession) {
      discardAllPathGestures()
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return

      const key = event.key
      if (
        (event.metaKey || event.ctrlKey) &&
        key.toLowerCase() === 'z' &&
        !event.shiftKey
      ) {
        event.preventDefault()
        endMoveNudge(true)
        undoEdit()
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        (key.toLowerCase() === 'y' ||
          (key.toLowerCase() === 'z' && event.shiftKey))
      ) {
        event.preventDefault()
        endMoveNudge(true)
        redoEdit()
        return
      }

      const tool = useEditorStore.getState().pathTool
      const addMode = useEditorStore.getState().pathAddMode
      const session = useEditorStore.getState().editSession
      if (!session) return

      if (tool === 'move-path') {
        if (!movePathFocusedRef.current) return
        if (!ARROW_KEYS.has(key)) return
        event.preventDefault()

        const snapOn = useEditorStore.getState().snapToGrid
        const step = snapOn
          ? event.shiftKey
            ? GRID_KEYBOARD_STEP_SHIFT
            : GRID_KEYBOARD_STEP
          : event.shiftKey
            ? PATH_MOVE_NUDGE_STEP_SHIFT
            : PATH_MOVE_NUDGE_STEP
        let dx = 0
        let dy = 0
        if (key === 'ArrowLeft') dx = -step
        else if (key === 'ArrowRight') dx = step
        else if (key === 'ArrowUp') dy = -step
        else if (key === 'ArrowDown') dy = step

        let gesture = moveNudgeRef.current
        if (!gesture) {
          gesture = {
            baseline: copyPath(session.samples),
            dx: 0,
            dy: 0,
            keys: new Set(),
          }
          moveNudgeRef.current = gesture
          setPathGestureActive(true)
          beginHandleDrag()
        }
        gesture.keys.add(key)
        // Held-key repeats accumulate on the gesture baseline (one undo later).
        gesture.dx += dx
        gesture.dy += dy
        const anchor = gesture.baseline[0]!
        if (snapOn) {
          const rawAnchor = {
            x: anchor.x + gesture.dx,
            y: anchor.y + gesture.dy,
          }
          const snapped = nearestGridPoint(rawAnchor)
          const delta = limitPathTranslationDelta(gesture.baseline, {
            x: snapped.x - anchor.x,
            y: snapped.y - anchor.y,
          })
          const actual = {
            x: anchor.x + delta.x,
            y: anchor.y + delta.y,
          }
          useEditorStore.getState().setSnapIndicator(actual)
          updateEditPreview(translatePathSamples(gesture.baseline, delta))
        } else {
          useEditorStore.getState().setSnapIndicator(null)
          updateEditPreview(
            applyPathTranslation(gesture.baseline, {
              x: gesture.dx,
              y: gesture.dy,
            }),
          )
        }
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

      if (key === 's' || key === 'S') {
        event.preventDefault()
        smoothSelectedBend()
        return
      }
      if (key === 'c' || key === 'C') {
        event.preventDefault()
        makeSelectedCorner()
        return
      }

      const selected = useEditorStore.getState().selectedHandleIndex
      if (selected === null) return

      const snapOn = useEditorStore.getState().snapToGrid
      const step = snapOn
        ? event.shiftKey
          ? GRID_KEYBOARD_STEP_SHIFT
          : GRID_KEYBOARD_STEP
        : event.shiftKey
          ? 0.02
          : 0.005
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
      const handle = base[selected]!
      if (snapOn) {
        const target = nearestGridPoint({
          x: handle.x + dx,
          y: handle.y + dy,
        })
        dx = target.x - handle.x
        dy = target.y - handle.y
      }
      commitHandleEdit(
        applyHandleDelta(base, selected, { x: dx, y: dy }, {
          stageAspect: aspect,
        }),
      )
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (!moveNudgeRef.current) return
      if (!ARROW_KEYS.has(event.key)) return
      const gesture = moveNudgeRef.current
      gesture.keys.delete(event.key)
      if (gesture.keys.size === 0) {
        endMoveNudge(true)
      }
    }

    // Capture phase: cancel gestures before FloatingPanel closes on Escape.
    // stopImmediatePropagation — other window capture listeners (panels) must
    // not also handle this key after the gesture claims it.
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isEditableKeyboardTarget(event.target)) return
      const addMode = useEditorStore.getState().pathAddMode
      if (pendingMoveRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        finishMoveDrag(pendingMoveRef.current.pointerId, false)
        return
      }
      if (moveNudgeRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        endMoveNudge(false)
        announceAction('Move cancelled.')
        return
      }
      if (pendingRef.current?.dragging) {
        event.preventDefault()
        event.stopImmediatePropagation()
        finishDrag(pendingRef.current.pointerId, false)
        return
      }
      if (addMode) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPathAddMode(false)
      }
    }

    const resolveOpenNudge = () => {
      // Tab switch / window blur can drop keyup — commit the preview so an
      // undo gesture is never left open.
      if (moveNudgeRef.current) endMoveNudge(true)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') resolveOpenNudge()
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', resolveOpenNudge)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', resolveOpenNudge)
      document.removeEventListener('visibilitychange', onVisibility)
      // Leaving edit mode or remounting must not keep capture/nudge alive.
      discardAllPathGestures()
    }
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
    smoothSelectedBend,
    makeSelectedCorner,
    announceAction,
    setSelectedHandleIndex,
    beginHandleDrag,
    updateEditPreview,
    endMoveNudge,
    finishMoveDrag,
    finishDrag,
    discardAllPathGestures,
    setPathGestureActive,
  ])

  // Switching Edit points ↔ Move path drops the other tool's in-flight gesture.
  useEffect(() => {
    if (mode !== 'editing') return
    if (pathTool === 'move-path') {
      if (pendingRef.current) {
        finishDrag(pendingRef.current.pointerId, false)
      }
    } else {
      movePathFocusedRef.current = false
      if (pendingMoveRef.current) {
        finishMoveDrag(pendingMoveRef.current.pointerId, false)
      }
      if (moveNudgeRef.current) {
        endMoveNudge(false)
      }
    }
  }, [mode, pathTool, finishDrag, finishMoveDrag, endMoveNudge])

  // Entering Add point discards an unfinished reshape/move preview.
  useEffect(() => {
    if (mode !== 'editing' || !pathAddMode) return
    if (pendingRef.current) finishDrag(pendingRef.current.pointerId, false)
    if (pendingMoveRef.current) {
      finishMoveDrag(pendingMoveRef.current.pointerId, false)
    }
    if (moveNudgeRef.current) endMoveNudge(false)
  }, [mode, pathAddMode, finishDrag, finishMoveDrag, endMoveNudge])

  return {
    workingSamples,
    handleIndices,
    selectedHandleIndex,
    pathAddMode,
    pathAddCandidateIndex,
    pathTool,
    moveTool,
    moveHovered: moveTool && (moveHovered || movePathFocused),
    moveDragging: moveTool && moveDragging,
    setPathTool,
    onHandlePointerDown,
    onStagePointerDown,
    onStagePointerMove,
    onMovePathPointerDown,
    onMovePathPointerMove,
    onMovePathPointerLeave,
    onMovePathFocus,
    onMovePathBlur,
  }
}
