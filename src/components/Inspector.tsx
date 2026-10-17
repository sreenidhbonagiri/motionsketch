import {
  MAX_ACTOR_SIZE,
  MAX_PLAYBACK_DURATION_MS,
  MIN_ACTOR_SIZE,
  MIN_PLAYBACK_DURATION_MS,
} from '../core/types'
import { useEditorStore } from '../state/store'
import { ExportPanel } from './ExportPanel'
import { ProjectPanel } from './ProjectPanel'

function formatDurationSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(2)} s`
}

function formatSizePercent(size: number): string {
  return `${Math.round(size * 100)}% of stage`
}

function formatCornerLabel(radius: number): string {
  if (radius <= 0.01) return 'Square'
  if (radius >= 0.99) return 'Circle'
  return `${Math.round(radius * 100)}%`
}

export function Inspector() {
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const smoothing = useEditorStore((s) => s.project.playback.smoothing)
  const steadySpeed = useEditorStore((s) => s.project.playback.steadySpeed)
  const loop = useEditorStore((s) => s.project.playback.loop)
  const loopMode = useEditorStore((s) => s.project.playback.loopMode)
  const showPathComparison = useEditorStore((s) => s.showPathComparison)
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const mode = useEditorStore((s) => s.mode)
  const hasRecording = useEditorStore((s) => !!s.project.recording)
  const actor = useEditorStore((s) => s.project.actor)
  const setDurationMs = useEditorStore((s) => s.setDurationMs)
  const setSmoothing = useEditorStore((s) => s.setSmoothing)
  const setSteadySpeed = useEditorStore((s) => s.setSteadySpeed)
  const setLoop = useEditorStore((s) => s.setLoop)
  const setLoopMode = useEditorStore((s) => s.setLoopMode)
  const setShowPathComparison = useEditorStore((s) => s.setShowPathComparison)
  const setActorColor = useEditorStore((s) => s.setActorColor)
  const setActorSize = useEditorStore((s) => s.setActorSize)
  const setActorBorderRadius = useEditorStore((s) => s.setActorBorderRadius)

  const steadySpeedLabel =
    steadySpeed <= 0 ? 'Off' : `${Math.round(steadySpeed * 100)}%`
  const smoothingLocked = !!geometryEdit
  const editing = mode === 'editing'
  const actorSize = actor.width

  return (
    <aside
      data-testid="inspector"
      className="flex w-full flex-col rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur lg:h-full lg:min-h-0 lg:overflow-hidden"
    >
      <div className="space-y-4 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <div data-testid="actor-panel" className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Actor</h2>
            <p className="mt-1 text-xs text-slate-500">
              Color, size, and corners — path and timing stay the same.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="actor-color"
              className="flex items-center justify-between gap-2 text-xs text-slate-600"
            >
              <span>Color</span>
              <span data-testid="actor-color-value" className="font-mono text-[11px]">
                {actor.color}
              </span>
            </label>
            <input
              id="actor-color"
              data-testid="actor-color"
              type="color"
              value={actor.color}
              aria-describedby="actor-color-help"
              onChange={(e) => setActorColor(e.target.value)}
              className="h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
            />
            <p
              id="actor-color-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Fill color of the tile.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="actor-size-slider"
              className="flex items-center justify-between text-xs text-slate-600"
            >
              <span>Size</span>
              <span data-testid="actor-size-value">
                {formatSizePercent(actorSize)}
              </span>
            </label>
            <input
              id="actor-size-slider"
              data-testid="actor-size-slider"
              type="range"
              min={MIN_ACTOR_SIZE}
              max={MAX_ACTOR_SIZE}
              step={0.01}
              value={actorSize}
              aria-describedby="actor-size-help"
              onChange={(e) => setActorSize(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <p
              id="actor-size-help"
              data-testid="actor-size-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Relative to the stage’s shorter side. Center stays fixed.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="actor-radius-slider"
              className="flex items-center justify-between text-xs text-slate-600"
            >
              <span>Corners</span>
              <span data-testid="actor-radius-value">
                {formatCornerLabel(actor.borderRadius)}
              </span>
            </label>
            <input
              id="actor-radius-slider"
              data-testid="actor-radius-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={actor.borderRadius}
              aria-describedby="actor-radius-help"
              onChange={(e) => setActorBorderRadius(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <p
              id="actor-radius-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Square through fully round.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-900">Timing</h2>
          <p className="mt-1 text-xs text-slate-500">
            Adjust playback without losing the original take.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="duration-slider"
            className="flex items-center justify-between text-xs text-slate-600"
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
            disabled={!hasRecording}
            aria-describedby="duration-help"
            onChange={(e) => setDurationMs(Number(e.target.value))}
            className="w-full accent-indigo-600 disabled:opacity-40"
          />
          <p
            id="duration-help"
            data-testid="duration-help"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Sets the total playback time. Longer is slower.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="smoothing-slider"
            className="flex items-center justify-between text-xs text-slate-600"
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
            disabled={!hasRecording || smoothingLocked}
            aria-describedby="smoothing-help"
            onChange={(e) => setSmoothing(Number(e.target.value))}
            className="w-full accent-indigo-600 disabled:opacity-40"
          />
          <p
            id="smoothing-help"
            data-testid="smoothing-help"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            {smoothingLocked
              ? 'Smoothing is baked into your path edit. Restore recorded path to change it.'
              : 'Reduces wobble in your drawn path.'}
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="steady-speed-slider"
            className="flex items-center justify-between text-xs text-slate-600"
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
            disabled={!hasRecording}
            aria-describedby="steady-speed-help"
            onChange={(e) => setSteadySpeed(Number(e.target.value))}
            className="w-full accent-indigo-600 disabled:opacity-40"
          />
          <p
            id="steady-speed-help"
            data-testid="steady-speed-help"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Evens out movement speed while keeping pauses.
          </p>
        </div>

        {editing && (
          <p
            data-testid="edit-mode-hint"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Edit mode: drag handles to reshape the path. Timestamps stay fixed.
          </p>
        )}

        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs text-slate-600">
            <span>Loop</span>
            <input
              data-testid="loop-toggle"
              type="checkbox"
              checked={loop}
              disabled={!hasRecording || editing}
              onChange={(e) => setLoop(e.target.checked)}
              className="size-4 accent-indigo-600 disabled:opacity-40"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Off plays once forward. On, choose how it continues.
          </p>

          {loop && (
            <fieldset
              data-testid="loop-mode-fieldset"
              disabled={!hasRecording || editing}
              className="space-y-2 disabled:opacity-40"
            >
              <legend className="sr-only">Loop mode</legend>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  data-testid="loop-mode-repeat"
                  type="radio"
                  name="loop-mode"
                  checked={loopMode === 'repeat'}
                  onChange={() => setLoopMode('repeat')}
                  className="mt-0.5 size-3.5 accent-indigo-600"
                />
                <span>
                  <span className="font-medium">Repeat</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                    Plays again from the start. End and start may jump if they
                    differ — the path is not changed.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  data-testid="loop-mode-alternate"
                  type="radio"
                  name="loop-mode"
                  checked={loopMode === 'alternate'}
                  onChange={() => setLoopMode('alternate')}
                  className="mt-0.5 size-3.5 accent-indigo-600"
                />
                <span>
                  <span className="font-medium">Back and forth</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                    Alternates forward and backward with no jump. Duration is
                    one way; a full cycle takes twice that long.
                  </span>
                </span>
              </label>
            </fieldset>
          )}
        </div>

        <label className="flex items-center justify-between text-xs text-slate-600">
          <span>Compare paths</span>
          <input
            data-testid="path-compare-toggle"
            type="checkbox"
            checked={showPathComparison}
            disabled={!hasRecording || editing}
            onChange={(e) => setShowPathComparison(e.target.checked)}
            className="size-4 accent-indigo-600 disabled:opacity-40"
          />
        </label>
        {showPathComparison && hasRecording && (
          <p
            data-testid="path-compare-legend"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Dashed gray: original recording. Solid indigo: smoothed playback
            path.
          </p>
        )}

        <ProjectPanel />

        <ExportPanel />
      </div>
    </aside>
  )
}
