import { useId } from 'react'
import { useEditorStore } from '../state/store'
import { HelpDisclosure } from './HelpDisclosure'

function formatOffset(deg: number): string {
  if (Number.isInteger(deg)) return `${deg}°`
  return `${deg.toFixed(1)}°`
}

/**
 * Optional path-facing controls under Appearance.
 * Heading is evaluated from the same processed path as playback/export.
 */
export function FaceAlongPathSection({
  showHelp = true,
}: {
  /** When false, Style-tab About Style owns the explanations. */
  showHelp?: boolean
}) {
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
      {enabled && recording && (
        <p
          data-testid="face-along-continue-note"
          className="text-xs leading-relaxed text-amber-800/90"
        >
          Extend path is unavailable while Face along path is on. Facing uses
          the whole stroke, so extending would change earlier facing.
        </p>
      )}

      <label
        htmlFor={toggleId}
        className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800"
      >
        <input
          id={toggleId}
          data-testid="face-along-path-toggle"
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          aria-describedby={showHelp ? helpId : undefined}
          onChange={(e) => setFaceAlongPath(e.target.checked)}
          className="size-3.5 accent-ms-primary disabled:opacity-40"
        />
        <span>Face along path</span>
      </label>
      {showHelp && (
        <HelpDisclosure id={helpId} summary="About facing">
          {recording
            ? 'Turns the element to follow its movement. Path heading is a base rotation; transform keyframes and Direction offset add to it. With Alternate loop, poses reverse along the same angles. The element does not turn around to face backward travel.'
            : 'Record a path first to enable facing. Turns the element to follow its movement once a path exists.'}
        </HelpDisclosure>
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
            aria-label="Direction offset in degrees"
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
            onChange={(e) => setDirectionOffsetDeg(Number(e.target.value))}
            className="w-full rounded-md border border-ms-border bg-white px-2 py-1 text-sm tabular-nums text-slate-800 disabled:opacity-40"
          />
        </div>
      )}
    </div>
  )
}
