import { useId } from 'react'
import { useEditorStore } from '../state/store'

function formatOffset(deg: number): string {
  if (Number.isInteger(deg)) return `${deg}°`
  return `${deg.toFixed(1)}°`
}

/**
 * Optional path-facing controls under Appearance.
 * Heading is evaluated from the same processed path as playback/export.
 */
export function FaceAlongPathSection() {
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const mode = useEditorStore((s) => s.mode)
  const setFaceAlongPath = useEditorStore((s) => s.setFaceAlongPath)
  const setDirectionOffsetDeg = useEditorStore((s) => s.setDirectionOffsetDeg)

  const toggleId = useId()
  const offsetId = useId()
  const helpId = useId()
  const offsetHelpId = useId()

  if (!selectedActor) return null

  const recording = selectedActor.recording
  const enabled = selectedActor.faceAlongPath
  const offset = selectedActor.directionOffsetDeg
  const recordingLike = mode === 'armed' || mode === 'recording'
  const disabled = !recording || recordingLike

  return (
    <div
      data-testid="face-along-path-section"
      className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">Face along path</p>
          <p id={helpId} className="text-xs leading-relaxed text-slate-500">
            Turns the actor to follow its movement. Path heading is a base
            rotation; transform keyframes and Direction offset add to it. With
            Alternate loop, poses reverse along the same angles — the actor does
            not turn around to face backward travel.
          </p>
        </div>
      </div>

      {enabled && recording && (
        <p
          data-testid="face-along-continue-note"
          className="text-xs leading-relaxed text-amber-800/90"
        >
          Continue path is unavailable while Face along path is on. Facing uses
          the whole stroke, so continuing would change earlier facing.
        </p>
      )}

      <label
        htmlFor={toggleId}
        className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
      >
        <input
          id={toggleId}
          data-testid="face-along-path-toggle"
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(e) => setFaceAlongPath(e.target.checked)}
          className="size-3.5 accent-ms-primary disabled:opacity-40"
        />
        <span>Face along path</span>
      </label>

      {!recording && (
        <p className="text-xs text-slate-500">
          Record a path first to enable facing.
        </p>
      )}

      {enabled && recording && (
        <div className="space-y-2 pt-0.5">
          <label
            htmlFor={offsetId}
            className="flex items-center justify-between text-sm text-slate-600"
          >
            <span>Direction offset</span>
            <span data-testid="direction-offset-value">
              {formatOffset(offset)}
            </span>
          </label>
          <p id={offsetHelpId} className="text-xs leading-relaxed text-slate-500">
            Align images that face up, right, or another direction (degrees).
          </p>
          <input
            id={offsetId}
            data-testid="direction-offset-slider"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={Math.min(180, Math.max(-180, offset))}
            disabled={disabled}
            aria-valuetext={formatOffset(offset)}
            aria-describedby={offsetHelpId}
            onChange={(e) => setDirectionOffsetDeg(Number(e.target.value))}
            className="w-full accent-ms-primary disabled:opacity-40"
          />
          <input
            data-testid="direction-offset-input"
            type="number"
            min={-3600}
            max={3600}
            step={1}
            value={offset}
            disabled={disabled}
            aria-label="Direction offset in degrees"
            aria-describedby={offsetHelpId}
            onChange={(e) => setDirectionOffsetDeg(Number(e.target.value))}
            className="w-full rounded-md border border-ms-border bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
          />
        </div>
      )}
    </div>
  )
}
