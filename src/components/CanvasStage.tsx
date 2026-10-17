import { useEffect, useRef } from 'react'
import { evaluate } from '../core/playback'
import type { MotionSample, Vec2 } from '../core/types'
import { usePointerRecorder } from '../hooks/usePointerRecorder'
import { useStageSize } from '../hooks/useStageSize'
import { selectActorPosition, selectProcessedPath } from '../state/selectors'
import { useEditorStore } from '../state/store'
import { Actor } from './Actor'

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const step = 28
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)'
  for (let x = step; x < width; x += step) {
    for (let y = step; y < height; y += step) {
      ctx.beginPath()
      ctx.arc(x, y, 1.1, 0, Math.PI * 2)
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
  ctx.fillStyle = '#4f46e5'
  ctx.beginPath()
  ctx.arc(pos.x * width, pos.y * height, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

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

  const {
    onActorPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = usePointerRecorder({ stageRef })

  const position = selectActorPosition(
    project,
    playbackHead,
    livePosition,
    mode,
  )

  const processed = selectProcessedPath(project)
  const rawSamples = project.recording?.samples ?? []

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width <= 0 || size.height <= 0) return

    const dpr = size.dpr
    canvas.width = Math.floor(size.width * dpr)
    canvas.height = Math.floor(size.height * dpr)
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawGrid(ctx, size.width, size.height)

    if (mode === 'recording' && liveTrail.length >= 2) {
      drawPath(ctx, size.width, size.height, liveTrail, '#ef4444', 2.5, 0.9)
    } else if (rawSamples.length >= 2) {
      if (showPathComparison) {
        drawPath(
          ctx,
          size.width,
          size.height,
          rawSamples,
          '#94a3b8',
          1.75,
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
          '#4f46e5',
          2.5,
          0.95,
          false,
        )
        const head = evaluate(processed, playbackHead)
        drawPlayhead(ctx, size.width, size.height, head)
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
  ])

  return (
    <div
      ref={stageRef}
      data-testid="stage"
      className="relative aspect-[16/10] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.08)] touch-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {size.width > 0 && (
        <Actor
          actor={project.actor}
          position={position}
          stageWidth={size.width}
          stageHeight={size.height}
          armed={mode === 'armed'}
          recording={mode === 'recording'}
          onPointerDown={onActorPointerDown}
        />
      )}
    </div>
  )
}
