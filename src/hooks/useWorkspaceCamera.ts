import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  CAMERA_ZOOM_STEP,
  cameraCssTransform,
  fitCamera,
  fitStageLayoutSize,
  isBackgroundPanTarget,
  isSpacePanBlockedTarget,
  panCamera,
  preserveCameraCenterOnLayoutChange,
  zoomCameraAt,
  zoomCameraAtCenter,
  type StageLayoutSize,
  type ViewportSize,
} from '../core/camera'
import {
  getActivePointerId,
  isRecordingActive,
} from '../lib/recordingController'
import { useEditorStore } from '../state/store'

export type WorkspacePanSession = {
  pointerId: number
  lastX: number
  lastY: number
  startPanX: number
  startPanY: number
}

function viewportSizeOf(el: HTMLElement | null): ViewportSize {
  if (!el) return { width: 0, height: 0 }
  return { width: el.offsetWidth, height: el.offsetHeight }
}

function isHandPanKey(event: KeyboardEvent): boolean {
  return event.code === 'KeyH' || event.key === 'h' || event.key === 'H'
}

/**
 * Workspace pan/zoom around a letterboxed stage frame.
 * Camera is view-only; all geometry tools keep using stage-frame rects.
 *
 * Empty-canvas drag pans immediately while idle. Hold H or middle-drag to pan
 * even over actors. While Record is armed, empty-canvas drag does not pan
 * (H / middle-drag still pan); actor drag still starts recording. Handle /
 * Move path / recording gestures keep priority. Space is play/pause (see
 * useEditorShortcuts), not pan.
 */
export function useWorkspaceCamera(viewportRef: RefObject<HTMLElement | null>) {
  const camera = useEditorStore((s) => s.camera)
  const setCamera = useEditorStore((s) => s.setCamera)
  const cameraFitNonce = useEditorStore((s) => s.cameraFitNonce)
  const stageAspect = useEditorStore((s) => s.project.stageAspect)
  const pathGestureActive = useEditorStore((s) => s.pathGestureActive)
  const pathAddMode = useEditorStore((s) => s.pathAddMode)
  const pathTool = useEditorStore((s) => s.pathTool)
  const mode = useEditorStore((s) => s.mode)
  const noteArmedCanvasMiss = useEditorStore((s) => s.noteArmedCanvasMiss)

  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 })
  const [layout, setLayout] = useState<StageLayoutSize>({ width: 0, height: 0 })
  const [handHeld, setHandHeld] = useState(false)
  const [panning, setPanning] = useState(false)

  const panSessionRef = useRef<WorkspacePanSession | null>(null)
  const captureElRef = useRef<HTMLElement | null>(null)
  const layoutRef = useRef(layout)
  const viewportRefState = useRef(viewport)
  const handHeldRef = useRef(false)
  const gestureBusyRef = useRef(false)

  layoutRef.current = layout
  viewportRefState.current = viewport
  handHeldRef.current = handHeld

  const gestureBusy =
    isRecordingActive() || pathGestureActive || getActivePointerId() !== null
  gestureBusyRef.current = gestureBusy

  /** H / middle override, or empty-canvas pan when no geometry gesture is active. */
  const handPanActive = handHeld && !gestureBusy
  // Armed empty-canvas must not pan; H-held pan still uses handPanActive.
  const backgroundPanEnabled = !gestureBusy && mode !== 'armed'

  const syncLayout = useCallback(
    (nextViewport: ViewportSize, opts?: { fit?: boolean }) => {
      const nextLayout = fitStageLayoutSize(nextViewport, stageAspect)
      const prevLayout = layoutRef.current
      const prevViewport = viewportRefState.current
      setViewport(nextViewport)
      setLayout(nextLayout)
      if (nextLayout.width <= 0 || nextLayout.height <= 0) return
      if (opts?.fit || prevLayout.width <= 0) {
        setCamera(fitCamera(nextViewport, nextLayout))
        return
      }
      const cam = useEditorStore.getState().camera
      setCamera(
        preserveCameraCenterOnLayoutChange(
          cam,
          prevLayout,
          nextLayout,
          prevViewport,
          nextViewport,
        ),
      )
    },
    [setCamera, stageAspect],
  )

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      syncLayout(viewportSizeOf(el))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewportRef, syncLayout])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    syncLayout(viewportSizeOf(el), { fit: true })
  }, [cameraFitNonce, stageAspect, viewportRef, syncLayout])

  const endPanSession = useCallback(
    (opts?: { revert?: boolean }) => {
      const session = panSessionRef.current
      const el = captureElRef.current
      if (session && el) {
        try {
          if (el.hasPointerCapture(session.pointerId)) {
            el.releasePointerCapture(session.pointerId)
          }
        } catch {
          // ignore
        }
      }
      if (opts?.revert && session) {
        setCamera({
          ...useEditorStore.getState().camera,
          panX: session.startPanX,
          panY: session.startPanY,
        })
      }
      panSessionRef.current = null
      captureElRef.current = null
      setPanning(false)
    },
    [setCamera],
  )

  const beginPan = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (panSessionRef.current) return false
      if (gestureBusyRef.current) return false
      event.preventDefault()
      event.stopPropagation()
      const target = event.currentTarget
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // tests / inactive ids
      }
      captureElRef.current = target
      const cam = useEditorStore.getState().camera
      panSessionRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        startPanX: cam.panX,
        startPanY: cam.panY,
      }
      setPanning(true)
      return true
    },
    [],
  )

  const onViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (gestureBusyRef.current) return

      // Middle button always pans over elements (when idle of geometry gestures).
      if (event.button === 1) {
        beginPan(event)
        return
      }

      if (event.button !== 0) return

      if (handHeldRef.current) {
        beginPan(event)
        return
      }

      // Armed: empty-canvas drag must not pan or record — keep armed and nudge.
      if (mode === 'armed') {
        if (isBackgroundPanTarget(event.target, { excludeStageFrame: false })) {
          event.preventDefault()
          noteArmedCanvasMiss()
        }
        return
      }

      // Add-point mode owns clicks on the stage frame; still allow pan outside.
      const excludeStageFrame =
        mode === 'editing' && pathAddMode && pathTool === 'edit-points'
      if (
        !isBackgroundPanTarget(event.target, {
          excludeStageFrame,
        })
      ) {
        return
      }
      beginPan(event)
    },
    [beginPan, mode, noteArmedCanvasMiss, pathAddMode, pathTool],
  )

  const onViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = panSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      event.preventDefault()
      const dx = event.clientX - session.lastX
      const dy = event.clientY - session.lastY
      session.lastX = event.clientX
      session.lastY = event.clientY
      setCamera(panCamera(useEditorStore.getState().camera, dx, dy))
    },
    [setCamera],
  )

  const onViewportPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = panSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      endPanSession()
    },
    [endPanSession],
  )

  const onViewportPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = panSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      endPanSession({ revert: true })
    },
    [endPanSession],
  )

  const fitStage = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const vp = viewportSizeOf(el)
    const nextLayout = fitStageLayoutSize(vp, stageAspect)
    setViewport(vp)
    setLayout(nextLayout)
    setCamera(fitCamera(vp, nextLayout))
  }, [setCamera, stageAspect, viewportRef])

  const zoomBy = useCallback(
    (factor: number, around: 'center' | { x: number; y: number }) => {
      const cam = useEditorStore.getState().camera
      const next = cam.zoom * factor
      if (around === 'center') {
        setCamera(zoomCameraAtCenter(cam, next, viewportRefState.current))
      } else {
        setCamera(zoomCameraAt(cam, next, around.x, around.y))
      }
    },
    [setCamera],
  )

  const zoomIn = useCallback(() => zoomBy(CAMERA_ZOOM_STEP, 'center'), [zoomBy])
  const zoomOut = useCallback(
    () => zoomBy(1 / CAMERA_ZOOM_STEP, 'center'),
    [zoomBy],
  )

  // H = temporary pan-over-everything. Ignore while typing / form controls.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isHandPanKey(event)) return
      if (event.repeat) return
      if (event.isComposing || event.keyCode === 229) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isSpacePanBlockedTarget(event.target)) return
      if (gestureBusyRef.current) return
      event.preventDefault()
      if (handHeldRef.current) return
      handHeldRef.current = true
      setHandHeld(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isHandPanKey(event)) return
      if (!handHeldRef.current) return
      handHeldRef.current = false
      setHandHeld(false)
      // End an in-flight hand-pan; keep the pan offset (view-only).
      if (panSessionRef.current) endPanSession()
    }
    const onBlur = () => {
      if (panSessionRef.current) endPanSession({ revert: true })
      if (handHeldRef.current) {
        handHeldRef.current = false
        setHandHeld(false)
      }
    }
    const onKeyEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (panSessionRef.current) {
        event.preventDefault()
        endPanSession({ revert: true })
      }
    }
    // Suppress the browser’s middle-click autoscroll affordance on the stage.
    const onAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return
      const el = viewportRef.current
      if (!el || !(event.target instanceof Node) || !el.contains(event.target)) {
        return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('keydown', onKeyEscape, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('auxclick', onAuxClick, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('keydown', onKeyEscape, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('auxclick', onAuxClick, true)
      endPanSession()
      handHeldRef.current = false
    }
  }, [endPanSession, viewportRef])

  // Deliberate zoom only: ctrl/meta + wheel (trackpad pinch). No plain scroll hijack.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const factor = event.deltaY < 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP
      const fine = Math.abs(event.deltaY) < 8
      const stepped = fine
        ? event.deltaY < 0
          ? 1.06
          : 1 / 1.06
        : factor
      const cam = useEditorStore.getState().camera
      setCamera(zoomCameraAt(cam, cam.zoom * stepped, x, y))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setCamera, viewportRef])

  return {
    camera,
    layout,
    viewport,
    handHeld,
    handPanActive,
    backgroundPanEnabled,
    panning,
    worldTransform: cameraCssTransform(camera),
    fitStage,
    zoomIn,
    zoomOut,
    onViewportPointerDown,
    onViewportPointerMove,
    onViewportPointerUp,
    onViewportPointerCancel,
  }
}
