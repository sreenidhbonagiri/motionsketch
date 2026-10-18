import { useEffect, useRef } from 'react'
import { projectToLocal } from '../core/clip'
import { evaluate } from '../core/playback'
import { evaluateTransform } from '../core/transform'
import { findActor } from '../core/sceneActor'
import type { MotionSample, Vec2 } from '../core/types'
import { usePathEditor } from '../hooks/usePathEditor'
import { usePointerRecorder } from '../hooks/usePointerRecorder'
import { useStageSize } from '../hooks/useStageSize'
import {
  selectActorPositionForActor,
  selectProcessedPathForActor,
} from '../state/selectors'
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
  const selected = findActor(project.actors, selectedActorId)
  const pathView = {
    geometryEdit,
    editSession,
    editPreview,
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

    if (mode === 'recording' || mode === 'armed') {
      if (liveTrail.length >= 2) {
        drawPath(ctx, size.width, size.height, liveTrail, '#0f766e', 2.5, 0.85)
      }
    } else if (selected?.recording) {
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
      {size.width > 0 &&
        !editing &&
        project.actors.map((actor, index) => {
          const isSelected = actor.id === selectedActorId
          const position = selectActorPositionForActor(
            project,
            actor,
            playbackHead,
            livePosition,
            mode,
            isSelected ? pathView : {
              geometryEdit: actor.geometryEdit,
              editSession: null,
              editPreview: null,
            },
            isSelected,
          )
          const localT = projectToLocal(playbackHead, actor.clip)
          const xf = evaluateTransform(actor.transform, localT)
          return (
            <Actor
              key={actor.id}
              actor={actor.appearance}
              actorId={actor.id}
              name={actor.name}
              position={position}
              stageWidth={size.width}
              stageHeight={size.height}
              zIndex={10 + index}
              selected={isSelected}
              armed={mode === 'armed' && isSelected}
              recording={mode === 'recording' && isSelected}
              rotationDeg={xf.rotationDeg}
              scale={xf.scale}
              onPointerDown={(e) => onActorPointerDown(actor.id, e)}
            />
          )
        })}
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
