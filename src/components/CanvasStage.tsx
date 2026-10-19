import { useEffect, useRef } from 'react'
import { isActorVisibleAt, projectToLocal } from '../core/clip'
import { gridLineCoords } from '../core/grid'
import { evaluateActorRotationDeg } from '../core/faceAlongPath'
import { evaluate } from '../core/playback'
import { evaluateTransform } from '../core/transform'
import { applyMotionStateToActor } from '../core/motionPresets'
import { findActor } from '../core/sceneActor'
import type { MotionSample, Vec2 } from '../core/types'
import { usePathEditor } from '../hooks/usePathEditor'
import { usePointerRecorder } from '../hooks/usePointerRecorder'
import { useStageSize } from '../hooks/useStageSize'
import { selectProcessedPathForActor } from '../state/selectors'
import { useEditorStore } from '../state/store'
import { Actor } from './Actor'
import { PathHandles } from './PathHandles'
import { PathMoveOverlay } from './PathMoveOverlay'

/** Draw the shared project-space lattice (same points used for snap targets). */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#eef1f6'
  ctx.fillRect(0, 0, width, height)

  const lines = gridLineCoords()
  // Moderately darker than the old CSS-pixel field so dots read clearly
  // without competing with paths/actors.
  ctx.fillStyle = 'rgba(71, 85, 105, 0.48)'
  for (const nx of lines) {
    for (const ny of lines) {
      const x = nx * width
      const y = ny * height
      ctx.beginPath()
      ctx.arc(x, y, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  point: Vec2,
) {
  const x = point.x * width
  const y = point.y * height
  ctx.save()
  ctx.strokeStyle = 'rgba(15, 118, 110, 0.9)'
  ctx.fillStyle = 'rgba(45, 212, 191, 0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // Crosshair ticks for non-color cue.
  ctx.beginPath()
  ctx.moveTo(x - 9, y)
  ctx.lineTo(x - 4, y)
  ctx.moveTo(x + 4, y)
  ctx.lineTo(x + 9, y)
  ctx.moveTo(x, y - 9)
  ctx.lineTo(x, y - 4)
  ctx.moveTo(x, y + 4)
  ctx.lineTo(x, y + 9)
  ctx.stroke()
  ctx.restore()
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: Array<Vec2 | MotionSample>,
  color: string,
  lineWidth: number,
  alpha: number,
  dashed = false,
) {
  if (samples.length < 2) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (dashed) ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(samples[0].x * width, samples[0].y * height)
  for (let i = 1; i < samples.length; i++) {
    ctx.lineTo(samples[i].x * width, samples[i].y * height)
  }
  ctx.stroke()
  ctx.restore()
}

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  position: Vec2,
) {
  ctx.save()
  ctx.fillStyle = '#0f766e'
  ctx.beginPath()
  ctx.arc(position.x * width, position.y * height, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPolishRoundingHighlight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: Array<Vec2 | MotionSample>,
  targetIndex: number,
  neighborhood: { lo: number; hi: number } | null,
) {
  if (samples.length < 2) return
  const target = samples[targetIndex]
  if (!target) return

  ctx.save()
  if (
    neighborhood &&
    neighborhood.hi > neighborhood.lo &&
    neighborhood.lo >= 0 &&
    neighborhood.hi < samples.length
  ) {
    ctx.strokeStyle = '#b45309'
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    const start = samples[neighborhood.lo]!
    ctx.moveTo(start.x * width, start.y * height)
    for (let i = neighborhood.lo + 1; i <= neighborhood.hi; i++) {
      const s = samples[i]!
      ctx.lineTo(s.x * width, s.y * height)
    }
    ctx.stroke()
  }

  ctx.globalAlpha = 1
  ctx.fillStyle = '#f59e0b'
  ctx.strokeStyle = '#92400e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(target.x * width, target.y * height, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Full-viewport interactive stage — no inset card or aspect box. */
export function CanvasStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useStageSize(stageRef)

  const project = useEditorStore((s) => s.project)
  const selectedActorId = useEditorStore((s) => s.selectedActorId)
  const mode = useEditorStore((s) => s.mode)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const livePosition = useEditorStore((s) => s.livePosition)
  const liveTrail = useEditorStore((s) => s.liveTrail)
  const showPathComparison = useEditorStore((s) => s.showPathComparison)
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)
  const pathGestureActive = useEditorStore((s) => s.pathGestureActive)
  const polishSession = useEditorStore((s) => s.polishSession)
  const glideSession = useEditorStore((s) => s.glideSession)
  const presetSession = useEditorStore((s) => s.presetSession)
  const snapIndicator = useEditorStore((s) => s.snapIndicator)

  const {
    onActorPointerDown,
    onPointerMove: onRecordPointerMove,
    onPointerUp: onRecordPointerUp,
    onPointerCancel: onRecordPointerCancel,
  } = usePointerRecorder({ stageRef })

  const {
    handleIndices,
    workingSamples,
    onHandlePointerDown,
    onStagePointerDown,
    onStagePointerMove,
    pathAddMode,
    pathAddCandidateIndex,
    pathTool,
    moveTool,
    moveHovered,
    moveDragging,
    onMovePathPointerDown,
    onMovePathPointerMove,
    onMovePathPointerLeave,
    onMovePathFocus,
    onMovePathBlur,
  } = usePathEditor({
    stageRef,
  })

  const editing = mode === 'editing'
  const selectedRaw = findActor(project.actors, selectedActorId)
  const presetPreviewActive =
    !!presetSession && presetSession.compareMode === 'preset'
  const selected =
    selectedRaw && presetPreviewActive
      ? applyMotionStateToActor(selectedRaw, presetSession.proposed)
      : selectedRaw
  const pathView = {
    geometryEdit: presetPreviewActive
      ? null
      : geometryEdit,
    editSession: presetPreviewActive ? null : editSession,
    editPreview: presetPreviewActive ? null : editPreview,
    // Glide preview: proposed strength. Original: committed actor.glide
    // (omit override — never force 0, which would hide an already-applied Glide).
    glideOverride:
      glideSession?.compareMode === 'glide'
        ? glideSession.strength
        : undefined,
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width <= 0 || size.height <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.width * dpr)
    canvas.height = Math.floor(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    drawGrid(ctx, size.width, size.height)

    if (snapIndicator) {
      drawSnapIndicator(ctx, size.width, size.height, snapIndicator)
    }

    if (mode === 'recording' || mode === 'armed') {
      if (liveTrail.length >= 2) {
        drawPath(ctx, size.width, size.height, liveTrail, '#0f766e', 2.5, 0.85)
      }
    } else if (selected?.recording) {
      if (polishSession) {
        const original = polishSession.baseline.samples
        const polished = polishSession.previewSamples
        if (original.length >= 2) {
          drawPath(
            ctx,
            size.width,
            size.height,
            original,
            '#94a3b8',
            2.25,
            0.75,
            true,
          )
        }
        if (polished.length >= 2) {
          drawPath(
            ctx,
            size.width,
            size.height,
            polished,
            '#0f766e',
            2.75,
            0.95,
          )
        }
        if (
          polishSession.allowRoundingAtPoint &&
          polishSession.roundingTargetIndex !== null
        ) {
          drawPolishRoundingHighlight(
            ctx,
            size.width,
            size.height,
            polished.length >= 2 ? polished : original,
            polishSession.roundingTargetIndex,
            polishSession.roundingNeighborhood,
          )
        }
      } else {
        const rawSamples = selected.recording.samples
        const processed = selectProcessedPathForActor(
          project,
          selected,
          pathView,
        )
        if (showPathComparison && !editing && rawSamples.length >= 2) {
          drawPath(
            ctx,
            size.width,
            size.height,
            rawSamples,
            '#94a3b8',
            2,
            0.7,
            true,
          )
        }
        if (processed.length >= 2) {
          drawPath(
            ctx,
            size.width,
            size.height,
            processed,
            '#0f766e',
            2.75,
            0.95,
          )
          if (!editing) {
            const localT = projectToLocal(playbackHead, selected.clip)
            drawPlayhead(
              ctx,
              size.width,
              size.height,
              evaluate(processed, localT),
            )
          }
        }
      }
    }
  }, [
    size,
    mode,
    liveTrail,
    selected,
    project,
    pathView,
    showPathComparison,
    playbackHead,
    editing,
    polishSession,
    snapIndicator,
  ])

  return (
    <div
      ref={stageRef}
      data-testid="stage"
      data-path-add-mode={editing && pathAddMode ? 'true' : 'false'}
      data-path-tool={editing ? pathTool : undefined}
      data-path-gesture={editing && pathGestureActive ? 'true' : 'false'}
      className={`absolute inset-0 touch-none overflow-hidden bg-[#eef1f6] ${
        editing && pathAddMode ? 'cursor-crosshair' : ''
      }`}
      onPointerDown={
        editing && pathAddMode && pathTool === 'edit-points'
          ? onStagePointerDown
          : undefined
      }
      onPointerMove={
        editing
          ? pathAddMode && pathTool === 'edit-points'
            ? onStagePointerMove
            : undefined
          : onRecordPointerMove
      }
      onPointerUp={editing ? undefined : onRecordPointerUp}
      onPointerCancel={editing ? undefined : onRecordPointerCancel}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {size.width > 0 &&
        !editing &&
        project.actors.map((actor, index) => {
          const isSelected = actor.id === selectedActorId
          const viewActor =
            isSelected && presetPreviewActive && presetSession
              ? applyMotionStateToActor(actor, presetSession.proposed)
              : actor
          // Recording/armed need the active actor visible for dragging.
          // Normal playback/idle never silently reveals a selected hidden actor.
          const forceVisible =
            isSelected && (mode === 'armed' || mode === 'recording')
          const hidden =
            !forceVisible && !isActorVisibleAt(playbackHead, viewActor.clip)
          const actorView = isSelected
            ? pathView
            : {
                geometryEdit: viewActor.geometryEdit,
                editSession: null,
                editPreview: null,
              }
          // One path lookup per actor: position + facing share the same array
          // (warm Glide/steady caches return identical references).
          const path = selectProcessedPathForActor(
            project,
            viewActor,
            actorView,
          )
          const localT = projectToLocal(playbackHead, viewActor.clip)
          const xf = evaluateTransform(viewActor.transform, localT)
          let position = viewActor.restPosition
          if (isSelected && (mode === 'recording' || mode === 'armed')) {
            position = livePosition
          } else if (path.length === 0) {
            if (isSelected && mode === 'idle') position = livePosition
          } else {
            position = evaluate(path, localT)
          }
          const rotationDeg = evaluateActorRotationDeg(
            viewActor,
            path,
            localT,
            project.stageAspect,
          )
          return (
            <Actor
              key={actor.id}
              actor={viewActor.appearance}
              actorId={actor.id}
              name={viewActor.name}
              position={position}
              stageWidth={size.width}
              stageHeight={size.height}
              zIndex={10 + index}
              selected={isSelected}
              armed={mode === 'armed' && isSelected}
              recording={mode === 'recording' && isSelected}
              hidden={hidden}
              rotationDeg={rotationDeg}
              scale={xf.scale}
              onPointerDown={(e) => onActorPointerDown(actor.id, e)}
            />
          )
        })}
      {editing &&
        !polishSession &&
        workingSamples &&
        size.width > 0 &&
        moveTool && (
        <PathMoveOverlay
          samples={workingSamples}
          hovered={moveHovered}
          dragging={moveDragging}
          snapAnchor={
            moveDragging && snapIndicator ? snapIndicator : null
          }
          onPointerDown={onMovePathPointerDown}
          onPointerMove={onMovePathPointerMove}
          onPointerLeave={onMovePathPointerLeave}
          onFocus={onMovePathFocus}
          onBlur={onMovePathBlur}
        />
      )}
      {editing &&
        !polishSession &&
        workingSamples &&
        size.width > 0 &&
        !moveTool && (
        <PathHandles
          samples={workingSamples}
          handleIndices={handleIndices}
          selectedIndex={selectedHandleIndex}
          candidateIndex={pathAddCandidateIndex}
          addMode={pathAddMode}
          onHandlePointerDown={onHandlePointerDown}
        />
      )}
    </div>
  )
}
