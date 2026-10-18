import { useEffect, useMemo, useRef, useState } from 'react'
import { isActorVisibleAt, projectToLocal } from '../core/clip'
import { evaluate } from '../core/playback'
import { evaluateTransform } from '../core/transform'
import { actorBorderRadiusCssPercent, actorDisplaySizePx } from '../core/actor'
import { selectProcessedPathForActor } from '../state/selectors'
import type { Project } from '../core/types'

interface ExamplePreviewStageProps {
  project: Project
  /** When true (prefers-reduced-motion), never autoplay — user must press Play. */
  reducedMotion: boolean
}

/**
 * Isolated gallery preview — local playhead only; does not touch the editor store.
 * Remount (via key) when switching examples to reset head/playing.
 */
export function ExamplePreviewStage({
  project,
  reducedMotion,
}: ExamplePreviewStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 280, height: 175 })
  const [head, setHead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const headRef = useRef(0)
  const playingRef = useRef(false)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) return
    const durationMs = Math.max(1, project.playback.durationMs)
    const loop = project.playback.loop
    let raf = 0
    let last = performance.now()
    let localHead = headRef.current
    playingRef.current = true

    const tick = (now: number) => {
      if (!playingRef.current) return
      const dt = Math.min(64, now - last)
      last = now
      localHead += dt / durationMs
      if (localHead >= 1) {
        if (loop) {
          localHead = localHead % 1
        } else {
          localHead = 1
          headRef.current = 1
          setHead(1)
          playingRef.current = false
          setPlaying(false)
          return
        }
      }
      headRef.current = localHead
      setHead(localHead)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      playingRef.current = false
      cancelAnimationFrame(raf)
    }
  }, [playing, project.playback.durationMs, project.playback.loop])

  const actors = useMemo(() => {
    return project.actors.map((actor, index) => {
      const path = selectProcessedPathForActor(project, actor, {
        geometryEdit: actor.geometryEdit,
        editSession: null,
        editPreview: null,
      })
      const localT = projectToLocal(head, actor.clip)
      const position =
        path.length >= 2 ? evaluate(path, localT) : { ...actor.restPosition }
      const xf = evaluateTransform(actor.transform, localT)
      const hidden = !isActorVisibleAt(head, actor.clip)
      return { actor, index, position, xf, hidden }
    })
  }, [project, head])

  const aspect = project.stageAspect

  return (
    <div className="space-y-2" data-testid="example-preview">
      <div
        ref={stageRef}
        data-testid="example-preview-stage"
        className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-[#eef1f6]"
        style={{ aspectRatio: `${aspect}` }}
      >
        {actors.map(({ actor, index, position, xf, hidden }) => {
          const { width, height } = actorDisplaySizePx(
            size.width,
            size.height,
            actor.appearance,
          )
          const appearance = actor.appearance
          const style = {
            left: `${position.x * 100}%`,
            top: `${position.y * 100}%`,
            width,
            height,
            zIndex: 10 + index,
            transform: `translate(-50%, -50%) rotate(${xf.rotationDeg}deg) scale(${xf.scale})`,
            visibility: hidden ? ('hidden' as const) : ('visible' as const),
          }
          if (appearance.kind === 'image' && appearance.image) {
            return (
              <img
                key={actor.id}
                alt=""
                draggable={false}
                data-testid={`example-preview-actor-${actor.id}`}
                src={appearance.image.dataUrl}
                className="pointer-events-none absolute object-contain"
                style={style}
              />
            )
          }
          const radius = actorBorderRadiusCssPercent(appearance.borderRadius)
          return (
            <div
              key={actor.id}
              data-testid={`example-preview-actor-${actor.id}`}
              className="pointer-events-none absolute"
              style={{
                ...style,
                borderRadius: `${radius}%`,
                background: appearance.color,
                boxShadow: '0 8px 20px rgba(15,23,42,0.16)',
              }}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="btn-example-preview-play"
          onClick={() => {
            if (playing) {
              playingRef.current = false
              setPlaying(false)
              return
            }
            if (headRef.current >= 1 - 1e-6 && !project.playback.loop) {
              headRef.current = 0
              setHead(0)
            }
            setPlaying(true)
          }}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        {reducedMotion && (
          <p className="text-[11px] text-slate-500">
            Reduced motion is on — press Play to preview.
          </p>
        )}
        {!reducedMotion && !playing && head === 0 && (
          <p className="text-[11px] text-slate-500">Press Play to preview.</p>
        )}
      </div>
    </div>
  )
}
