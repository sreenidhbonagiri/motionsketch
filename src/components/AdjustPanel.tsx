import {
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
} from '../core/types'
import { useEditorStore } from '../state/store'
import { MotionPresets } from './MotionPresets'
import { SvgPathImport } from './SvgPathImport'

function formatDurationSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(2)} s`
}

export function AdjustPanel() {
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const smoothing = selectedActor?.smoothing ?? 0
  const steadySpeed = selectedActor?.steadySpeed ?? 0
  const loop = useEditorStore((s) => s.project.playback.loop)
  const loopMode = useEditorStore((s) => s.project.playback.loopMode)
  const showPathComparison = useEditorStore((s) => s.showPathComparison)
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const mode = useEditorStore((s) => s.mode)
  const hasAnyRecording = useEditorStore((s) =>
    s.project.actors.some((a) => !!a.recording),
  )
  const selectedHasRecording = !!selectedActor?.recording
  const setDurationMs = useEditorStore((s) => s.setDurationMs)
  const setSmoothing = useEditorStore((s) => s.setSmoothing)
  const setSteadySpeed = useEditorStore((s) => s.setSteadySpeed)
  const setLoop = useEditorStore((s) => s.setLoop)
  const setLoopMode = useEditorStore((s) => s.setLoopMode)
  const setShowPathComparison = useEditorStore((s) => s.setShowPathComparison)

  const steadySpeedLabel =
    steadySpeed <= 0 ? 'Off' : `${Math.round(steadySpeed * 100)}%`
  const smoothingLocked = !!geometryEdit || !!selectedActor?.geometryEdit
  const editing = mode === 'editing'

  return (
    <div data-testid="adjust-panel" className="space-y-4 p-3">
      <p className="text-xs text-slate-500">
        Duration and loop are shared. Smoothing and Steady Speed apply to{' '}
        <span className="font-medium text-slate-700">
          {selectedActor?.name ?? 'the selected actor'}
        </span>
        .
      </p>

      <SvgPathImport />

      <MotionPresets />

      <div className="space-y-2">
        <label
          htmlFor="duration-slider"
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Duration</span>
          <span data-testid="duration-value">
            {formatDurationSeconds(durationMs)}
          </span>
        </label>
        <input
          id="duration-slider"
          data-testid="duration-slider"
          type="range"
          min={MIN_PLAYBACK_DURATION_MS}
          max={MAX_PLAYBACK_DURATION_MS}
          step={50}
          value={durationMs}
          disabled={!hasAnyRecording}
          aria-describedby="duration-help"
          onChange={(e) => setDurationMs(Number(e.target.value))}
          className="w-full accent-teal-700 disabled:opacity-40"
        />
        <p
          id="duration-help"
          data-testid="duration-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          Total playback time for the project. Changing Duration scales the
          Sequence proportionally — each actor keeps the same relative start and
          Move for. Longer Duration plays the same motions more slowly.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="smoothing-slider"
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Smoothing</span>
          <span data-testid="smoothing-value">
            {Math.round(smoothing * 100)}%
          </span>
        </label>
        <input
          id="smoothing-slider"
          data-testid="smoothing-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={smoothing}
          disabled={!selectedHasRecording || smoothingLocked}
          aria-describedby="smoothing-help"
          onChange={(e) => setSmoothing(Number(e.target.value))}
          className="w-full accent-teal-700 disabled:opacity-40"
        />
        <p
          id="smoothing-help"
          data-testid="smoothing-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          {smoothingLocked
            ? 'Smoothing is baked into your path edit. Restore recorded path to change it.'
            : 'Reduces wobble in your drawn path.'}
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="steady-speed-slider"
          className="flex items-center justify-between text-sm text-slate-600"
        >
          <span>Steady Speed</span>
          <span data-testid="steady-speed-value">{steadySpeedLabel}</span>
        </label>
        <input
          id="steady-speed-slider"
          data-testid="steady-speed-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={steadySpeed}
          disabled={!selectedHasRecording}
          aria-describedby="steady-speed-help"
          onChange={(e) => setSteadySpeed(Number(e.target.value))}
          className="w-full accent-teal-700 disabled:opacity-40"
        />
        <p
          id="steady-speed-help"
          data-testid="steady-speed-help"
          className="text-xs leading-relaxed text-slate-500"
        >
          {selectedHasRecording
            ? 'Evens out movement speed while keeping pauses. Glide (dock) adds ease-in/out after this — they compose, they are not the same control.'
            : 'Record a path for this actor to adjust Steady Speed.'}
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-sm text-slate-600">
          <span>Loop</span>
          <input
            data-testid="loop-toggle"
            type="checkbox"
            checked={loop}
            disabled={!hasAnyRecording || editing}
            onChange={(e) => setLoop(e.target.checked)}
            className="size-4 accent-teal-700 disabled:opacity-40"
          />
        </label>
        <p className="text-xs leading-relaxed text-slate-500">
          Shared for the project. Off plays once forward. On, choose how it
          continues.
        </p>

        {loop && (
          <fieldset
            data-testid="loop-mode-fieldset"
            disabled={!hasAnyRecording || editing}
            className="space-y-2 disabled:opacity-40"
          >
            <legend className="sr-only">Loop mode</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                data-testid="loop-mode-repeat"
                type="radio"
                name="loop-mode"
                checked={loopMode === 'repeat'}
                onChange={() => setLoopMode('repeat')}
                className="mt-0.5 size-3.5 accent-teal-700"
              />
              <span>
                <span className="font-medium">Repeat</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  Plays again from the start. End and start may jump if they
                  differ — the path is not changed.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                data-testid="loop-mode-alternate"
                type="radio"
                name="loop-mode"
                checked={loopMode === 'alternate'}
                onChange={() => setLoopMode('alternate')}
                className="mt-0.5 size-3.5 accent-teal-700"
              />
              <span>
                <span className="font-medium">Back and forth</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  Alternates forward and backward with no jump. Duration is one
                  way; a full cycle takes twice that long.
                </span>
              </span>
            </label>
          </fieldset>
        )}
      </div>

      <label className="flex items-center justify-between text-sm text-slate-600">
        <span>Compare paths</span>
        <input
          data-testid="path-compare-toggle"
          type="checkbox"
          checked={showPathComparison}
          disabled={!selectedHasRecording || editing}
          onChange={(e) => setShowPathComparison(e.target.checked)}
          className="size-4 accent-teal-700 disabled:opacity-40"
        />
      </label>
      {showPathComparison && selectedHasRecording && (
        <p
          data-testid="path-compare-legend"
          className="text-xs leading-relaxed text-slate-500"
        >
          Dashed gray: original recording. Solid teal: smoothed playback path.
        </p>
      )}
    </div>
  )
}