import type { Actor, Keyframe } from '../types'
import { clamp01 } from '../coords'
import { buildKeyframes } from './format'

function formatOffset(offset: number): string {
  const pct = offset * 100
  if (Number.isInteger(pct)) return `${pct}%`
  return `${pct.toFixed(2)}%`
}

function formatCq(value: number, unit: 'cqw' | 'cqh', digits = 3): string {
  return `${(clamp01(value) * 100).toFixed(digits)}${unit}`
}

/**
 * Transform-based CSS export using container query units.
 *
 * Positioning model:
 * - `.stage` is `position: relative` and `container-type: size`
 * - Actor center is at `(x * 100cqw, y * 100cqh)` of the stage
 * - `translate(-50%, -50%)` centers the actor on that point (element-relative)
 * - Actor size uses `cqmin` so it matches editor sizing (fraction of min side)
 *
 * This preserves non-square stage fidelity without animating layout properties.
 * Requires a modern browser with container query length units (cqw/cqh/cqmin).
 */
export function generateCssSnippet(options: {
  keyframes: Keyframe[]
  durationMs: number
  actor: Actor
  animationName?: string
}): string {
  const {
    keyframes,
    durationMs,
    actor,
    animationName = 'motionsketch',
  } = options

  if (keyframes.length === 0) {
    return '/* No recording to export */\n'
  }

  const widthCq = (actor.width * 100).toFixed(2)
  const radiusPct = (actor.borderRadius * 50).toFixed(2)
  const start = keyframes[0]

  const frames = keyframes
    .map((kf) => {
      const x = formatCq(kf.x, 'cqw')
      const y = formatCq(kf.y, 'cqh')
      return `  ${formatOffset(kf.offset)} { transform: translate3d(${x}, ${y}, 0) translate(-50%, -50%); }`
    })
    .join('\n')

  return `/* MotionSketch export
 *
 * Positioning assumptions:
 * - Place .actor inside a .stage with position: relative and container-type: size.
 * - Coordinates are normalized stage fractions: x→cqw, y→cqh (works for non-square stages).
 * - Actor width uses cqmin (fraction of the stage's shorter axis), matching the editor.
 * - Animation uses transform only (compositor-friendly); timing-function is linear.
 *
 * Browser support: container query units (cqw/cqh/cqmin). Fallback: use a fixed-size
 * stage and replace cqw/cqh with px (value * stageWidth/Height).
 *
 * Example HTML:
 * <div class="stage"><div class="actor"></div></div>
 */
.stage {
  position: relative;
  container-type: size;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.actor {
  position: absolute;
  left: 0;
  top: 0;
  width: ${widthCq}cqmin;
  aspect-ratio: 1;
  border-radius: ${radiusPct}%;
  background: ${actor.color};
  transform: translate3d(${formatCq(start.x, 'cqw')}, ${formatCq(start.y, 'cqh')}, 0) translate(-50%, -50%);
  animation: ${animationName} ${Math.round(durationMs)}ms linear forwards;
  will-change: transform;
}

@keyframes ${animationName} {
${frames}
}
`
}

export function exportCssFromRecording(options: {
  samples: import('../types').MotionSample[]
  smoothing: number
  durationMs: number
  actor: Actor
}): string {
  const keyframes = buildKeyframes(options.samples, options.smoothing)
  return generateCssSnippet({
    keyframes,
    durationMs: options.durationMs,
    actor: options.actor,
  })
}
