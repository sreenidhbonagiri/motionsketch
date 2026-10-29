import { useEffect, useId, useState } from 'react'
import { projectToLocal } from '../core/clip'
import {
  DEFAULT_TRANSFORM,
  MAX_TRANSFORM_SCALE,
  MIN_TRANSFORM_SCALE,
  evaluateTransform,
} from '../core/transform'
import { useEditorStore } from '../state/store'

function formatRotation(deg: number): string {
  if (Number.isInteger(deg)) return `${deg}°`
  return `${deg.toFixed(1)}°`
}

function formatScale(scale: number): string {
  if (Number.isInteger(scale)) return `${scale}×`
  return `${scale.toFixed(2)}×`
}

function formatTimePct(t: number): string {
  return `${Math.round(t * 100)}%`
}

/**
 * Compact rotation/scale keyframe controls under Appearance.
 * Slider drags stay local until Add/Update (one history entry per commit).
 */
export function TransformSection() {
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const recording = selectedActor?.recording ?? null
  const transform = selectedActor?.transform ?? { keyframes: [] }
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const mode = useEditorStore((s) => s.mode)
  const selectedId = useEditorStore((s) => s.selectedTransformId)
  const upsertAtPlayhead = useEditorStore((s) => s.upsertTransformAtPlayhead)
  const commitKeyframe = useEditorStore((s) => s.commitTransformKeyframe)
  const deleteSelected = useEditorStore((s) => s.deleteSelectedTransform)
  const selectTransform = useEditorStore((s) => s.selectTransformKeyframe)

  const clip = selectedActor?.clip ?? { start: 0, end: 1 }
  const localHead = projectToLocal(playbackHead, clip)
  const selected = transform.keyframes.find((k) => k.id === selectedId) ?? null
  const evaluated = evaluateTransform(transform, localHead)

  const [rotation, setRotation] = useState(evaluated.rotationDeg)
  const [scale, setScale] = useState(evaluated.scale)
  const [time, setTime] = useState(selected?.t ?? localHead)

  // Sync drafts from selection or playhead evaluation when selection/head changes
  // (not while the user is mid-drag — we key off ids/head, not draft).
  useEffect(() => {
    if (selected) {
      setRotation(selected.rotationDeg)
      setScale(selected.scale)
      setTime(selected.t)
      return
    }
    const at = evaluateTransform(transform, localHead)
    setRotation(at.rotationDeg)
    setScale(at.scale)
    setTime(localHead)
  }, [selectedId, selected, localHead, transform])

  const rotId = useId()
  const scaleId = useId()
  const timeId = useId()

  const editingPath = mode === 'editing'
  const recordingLike = mode === 'armed' || mode === 'recording'
  const disabled = !recording || editingPath || recordingLike

  const nearSelected =
    selected && Math.abs(selected.t - localHead) < 1e-3

  const onAddOrUpdate = () => {
    if (disabled) return
    if (selected && nearSelected) {
      commitKeyframe({
        id: selected.id,
        t: selected.t,
        rotationDeg: rotation,
        scale,
      })
      return
    }
    upsertAtPlayhead(rotation, scale)
  }

  const onUpdateSelected = () => {
    if (disabled || !selected) return
    commitKeyframe({
      id: selected.id,
      t: time,
      rotationDeg: rotation,
      scale,
    })
  }

  if (!recording) {
    return (
      <div
        data-testid="transform-section"
        className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
      >
        <p className="text-sm font-medium text-slate-800">Transform</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Record a path first, then add rotation and scale keyframes along the
          timeline.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="transform-section"
      className="space-y-2.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">Transform</p>
          <p className="text-xs leading-relaxed text-slate-500">
            Rotation (unwrapped °) and uniform scale ({MIN_TRANSFORM_SCALE}–
            {MAX_TRANSFORM_SCALE}) about the actor center. Empty track → 0° /
            1×. Times are progress along Duration.
          </p>
        </div>
        {selected && (
          <button
            type="button"
            data-testid="btn-deselect-transform"
            onClick={() => selectTransform(null)}
            className="shrink-0 rounded-md border border-ms-border bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Deselect
          </button>
        )}
      </div>

      {editingPath && (
        <p
          data-testid="transform-edit-path-hint"
          className="text-xs text-amber-800"
        >
          Finish path editing to change transform keyframes.
        </p>
      )}

      <div className="space-y-2">
        <label
          htmlFor={rotId}
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Rotation</span>
          <span data-testid="transform-rotation-value">
            {formatRotation(rotation)}
          </span>
        </label>
        <input
          id={rotId}
          data-testid="transform-rotation-slider"
          type="range"
          min={-720}
          max={720}
          step={1}
          value={rotation}
          disabled={disabled}
          aria-valuetext={formatRotation(rotation)}
          onChange={(e) => setRotation(Number(e.target.value))}
          className="w-full accent-ms-primary disabled:opacity-40"
        />
        <input
          data-testid="transform-rotation-input"
          type="number"
          min={-3600}
          max={3600}
          step={1}
          value={rotation}
          disabled={disabled}
          aria-label="Rotation in degrees"
          onChange={(e) => setRotation(Number(e.target.value))}
          className="w-full rounded-md border border-ms-border bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor={scaleId}
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Scale</span>
          <span data-testid="transform-scale-value">{formatScale(scale)}</span>
        </label>
        <input
          id={scaleId}
          data-testid="transform-scale-slider"
          type="range"
          min={MIN_TRANSFORM_SCALE}
          max={MAX_TRANSFORM_SCALE}
          step={0.05}
          value={scale}
          disabled={disabled}
          aria-valuetext={formatScale(scale)}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full accent-ms-primary disabled:opacity-40"
        />
      </div>

      {selected && (
        <div className="space-y-2">
          <label
            htmlFor={timeId}
            className="flex items-center justify-between text-sm text-slate-600"
          >
            <span>Keyframe time</span>
            <span data-testid="transform-time-value">{formatTimePct(time)}</span>
          </label>
          <input
            id={timeId}
            data-testid="transform-time-slider"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={time}
            disabled={disabled}
            aria-valuetext={formatTimePct(time)}
            onChange={(e) => setTime(Number(e.target.value))}
            className="w-full accent-ms-primary disabled:opacity-40"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="btn-set-transform-keyframe"
          disabled={disabled}
          onClick={onAddOrUpdate}
          className="rounded-lg bg-ms-primary px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-ms-primary-hover disabled:opacity-40"
        >
          {selected && nearSelected ? 'Update keyframe' : 'Add keyframe'}
        </button>
        {selected && (
          <>
            <button
              type="button"
              data-testid="btn-update-transform-keyframe"
              disabled={disabled}
              onClick={onUpdateSelected}
              className="rounded-lg border border-ms-border bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Apply to selected
            </button>
            <button
              type="button"
              data-testid="btn-delete-transform-keyframe"
              disabled={disabled}
              onClick={deleteSelected}
              className="rounded-lg border border-ms-border bg-white px-2.5 py-1.5 text-sm font-medium text-ms-danger transition hover:bg-red-50 disabled:opacity-40"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {transform.keyframes.length === 0 && (
        <p className="text-xs text-slate-500">
          No keyframes — actor stays at {formatRotation(DEFAULT_TRANSFORM.rotationDeg)}{' '}
          / {formatScale(DEFAULT_TRANSFORM.scale)}.
        </p>
      )}
    </div>
  )
}
