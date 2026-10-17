import { actorBorderRadiusCssPercent } from '../actor'
import { clamp01 } from '../coords'
import type { Actor, Keyframe, LoopMode, MotionSample } from '../types'
import { buildKeyframes, buildKeyframesFromProcessed } from './format'

function formatOffset(offset: number): string {
  const pct = offset * 100
  if (Number.isInteger(pct)) return `${pct}%`
  return `${pct.toFixed(2)}%`
}

function formatCq(value: number, unit: 'cqw' | 'cqh', digits = 3): string {
  return `${(clamp01(value) * 100).toFixed(digits)}${unit}`
}

function animationTiming(
  durationMs: number,
  loop: boolean,
  loopMode: LoopMode,
): string {
  const duration = `${Math.round(durationMs)}ms`
  if (!loop) {
    return `${duration} linear forwards`
  }
  if (loopMode === 'alternate') {
    // infinite alternate reverses keyframe timing (including pauses) each pass.
    return `${duration} linear infinite alternate`
  }
  return `${duration} linear infinite`
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
  loop?: boolean
  loopMode?: LoopMode
  animationName?: string
}): string {
  const {
    keyframes,
    durationMs,
    actor,
    loop = false,
    loopMode = 'repeat',
    animationName = 'motionsketch',
  } = options

  if (keyframes.length === 0) {
    return '/* No recording to export */\n'
  }

  const widthCq = (actor.width * 100).toFixed(2)
  const radiusPct = actorBorderRadiusCssPercent(actor.borderRadius).toFixed(2)
  const start = keyframes[0]
  const timing = animationTiming(durationMs, loop, loopMode)

  const loopNote = !loop
    ? ' * Loop: off (plays once, forwards).'
    : loopMode === 'alternate'
      ? ' * Loop: back and forth (animation-direction: alternate). Duration is one way; a full cycle is 2×.'
      : ' * Loop: repeat (infinite). End and start may jump if they differ — no bridging segment is added.'

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
${loopNote}
 *
 * Browser support: container query units (cqw/cqh/cqmin).
 * Fallback for a fixed-size stage (replace the cq* lengths with px):
 *   Ncqw  → (N / 100) * stageWidth
 *   Ncqh  → (N / 100) * stageHeight
 *   Ncqmin → (N / 100) * min(stageWidth, stageHeight)
 * Example: 24.209cqh on a 600px-tall stage → (24.209 / 100) * 600 = 145.254px
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
  animation: ${animationName} ${timing};
  will-change: transform;
}

@keyframes ${animationName} {
${frames}
}
`
}

export function exportCssFromRecording(options: {
  samples: MotionSample[]
  smoothing: number
  steadySpeed?: number
  durationMs: number
  actor: Actor
  loop?: boolean
  loopMode?: LoopMode
  /** When set, export this processed path (edit-aware) instead of reprocessing raw. */
  processedPath?: MotionSample[] | null
}): string {
  const keyframes = options.processedPath?.length
    ? buildKeyframesFromProcessed(options.processedPath)
    : buildKeyframes(
        options.samples,
        options.smoothing,
        options.steadySpeed ?? 0,
      )
  return generateCssSnippet({
    keyframes,
    durationMs: options.durationMs,
    actor: options.actor,
    loop: options.loop ?? false,
    loopMode: options.loopMode ?? 'repeat',
  })
}
