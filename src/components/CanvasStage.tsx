import { useEffect, useRef } from 'react'
import { evaluate } from '../core/playback'
import { evaluateTransform } from '../core/transform'
import type { MotionSample, Vec2 } from '../core/types'
import { usePathEditor } from '../hooks/usePathEditor'
import { usePointerRecorder } from '../hooks/usePointerRecorder'
import { useStageSize } from '../hooks/useStageSize'
import { selectActorPosition, selectProcessedPath } from '../state/selectors'
import { useEditorStore } from '../state/store'
import { Actor } from './Actor'
import { PathHandles } from './PathHandles'

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const step = 28
  ctx.fillStyle = '#eef1f6'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(100, 116, 139, 0.28)'
  for (let x = step; x < width; x += step) {
    for (let y = step; y < height; y += step) {
      ctx.beginPath()
      ctx.arc(x, y, 1.05, 0, Math.PI * 2)
      ctx.fill()
    }
  }
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
  ctx.setLineDash(dashed ? [6, 5] : [])
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
  pos: Vec2,
) {
  ctx.save()
  ctx.fillStyle = '#0f766e'
  ctx.beginPath()
  ctx.arc(pos.x * width, pos.y * height, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Full-viewport interactive stage — no inset card or aspect box. */
export function CanvasStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useStageSize(stageRef)

  const project = useEditorStore((s) => s.project)
  const mode = useEditorStore((s) => s.mode)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const livePosition = useEditorStore((s) => s.livePosition)
  const liveTrail = useEditorStore((s) => s.liveTrail)
  const showPathComparison = useEditorStore((s) => s.showPathComparison)
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)
  const selectedHandleIndex = useEditorStore((s) => s.selectedHandleIndex)

  const {
    onActorPointerDown,
    onPointerMove: onRecordPointerMove,
    onPointerUp: onRecordPointerUp,
    onPointerCancel: onRecordPointerCancel,
  } = usePointerRecorder({ stageRef })

  const { handleIndices, workingSamples, onHandlePointerDown } = usePathEditor({
    stageRef,
  })

  const editing = mode === 'editing'
  const pathView = { geometryEdit, editSession, editPreview }
  const processed = selectProcessedPath(project, pathView)
  const rawSamples = project.recording?.samples ?? []
  const position = selectActorPosition(
    project,
    playbackHead,
    livePosition,
    mode,
    pathView,
  )
  const actorTransform = evaluateTransform(
    project.transform ?? { keyframes: [] },
    playbackHead,
  )

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

    if (mode === 'recording' || mode === 'armed') {
      if (liveTrail.length >= 2) {
        drawPath(ctx, size.width, size.height, liveTrail, '#0f766e', 2.5, 0.85)
      }
    } else if (rawSamples.length >= 2) {
      if (showPathComparison && !editing) {
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
          drawPlayhead(
            ctx,
            size.width,
            size.height,
            evaluate(processed, playbackHead),
          )
        }
      }
    }
  }, [
    size,
    mode,
    liveTrail,
    rawSamples,
    processed,
    showPathComparison,
    playbackHead,
    editing,
  ])

  return (
    <div
      ref={stageRef}
      data-testid="stage"
      className="absolute inset-0 touch-none overflow-hidden bg-[#eef1f6]"
      onPointerMove={editing ? undefined : onRecordPointerMove}
      onPointerUp={editing ? undefined : onRecordPointerUp}
      onPointerCancel={editing ? undefined : onRecordPointerCancel}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {size.width > 0 && !editing && (
        <Actor
          actor={project.actor}
          position={position}
          stageWidth={size.width}
          stageHeight={size.height}
          armed={mode === 'armed'}
          recording={mode === 'recording'}
          rotationDeg={actorTransform.rotationDeg}
          scale={actorTransform.scale}
          onPointerDown={onActorPointerDown}
        />
      )}
      {editing && workingSamples && size.width > 0 && (
        <PathHandles
          samples={workingSamples}
          handleIndices={handleIndices}
          selectedIndex={selectedHandleIndex}
          onHandlePointerDown={onHandlePointerDown}
        />
      )}
    </div>
  )
}
