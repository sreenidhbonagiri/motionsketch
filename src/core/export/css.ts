import {
  actorBorderRadiusCssPercent,
  actorContentAspect,
} from '../actor'
import { clamp01 } from '../coords'
import {
  formatCssAspectRatio,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import {
  evaluateTransform,
  formatTransformCss,
} from '../transform'
import type {
  Actor,
  Keyframe,
  LoopMode,
  MotionSample,
  TransformTrack,
} from '../types'
import { evaluateKeyframes } from './consistency'
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
    return `${duration} linear infinite alternate`
  }
  return `${duration} linear infinite`
}

function actorBoxRules(actor: Actor): {
  sizeDecl: string
  shapeDecls: string
  htmlExample: string
  imageNote: string
} {
  const size = (actor.width * 100).toFixed(2)
  const aspect = actorContentAspect(actor)

  if (actor.kind === 'image' && actor.image) {
    const aspectCss =
      aspect >= 1
        ? `${aspect.toFixed(4)} / 1`
        : `1 / ${(1 / aspect).toFixed(4)}`
    // Longer edge = size * cqmin; shorter follows aspect-ratio.
    const sizeDecl =
      aspect >= 1
        ? `  width: ${size}cqmin;\n  height: auto;\n  aspect-ratio: ${aspectCss};`
        : `  height: ${size}cqmin;\n  width: auto;\n  aspect-ratio: ${aspectCss};`
    return {
      sizeDecl,
      shapeDecls: `  object-fit: contain;
  background: transparent;
  border: none;
  padding: 0;`,
      htmlExample: `<div class="stage"><img class="actor" src="your-image.png" alt="${actor.image.label.replace(/"/g, '')}" /></div>`,
      imageNote: ` * Image actor: CSS alone does NOT embed the image bytes.
 * Host the file yourself (or use the HTML demo export, which embeds a data URL).
 * Use an <img class="actor"> with the same intrinsic aspect ratio as in the editor.
 * Sizing: the longer edge is ${size}cqmin (fraction of the stage’s shorter side); the image is contained in that box.`,
    }
  }

  const radiusPct = actorBorderRadiusCssPercent(actor.borderRadius).toFixed(2)
  return {
    sizeDecl: `  width: ${size}cqmin;\n  aspect-ratio: 1;`,
    shapeDecls: `  border-radius: ${radiusPct}%;
  background: ${actor.color};`,
    htmlExample: '<div class="stage"><div class="actor"></div></div>',
    imageNote: '',
  }
}

/**
 * Union of position keyframe offsets and transform key times.
 * Position and transform are evaluated independently at each required time.
 */
export function unionExportOffsets(
  positionKeyframes: Keyframe[],
  transform: TransformTrack | null | undefined,
): number[] {
  const offsets = new Set<number>()
  for (const kf of positionKeyframes) {
    offsets.add(clamp01(kf.offset))
  }
  if (transform) {
    for (const k of transform.keyframes) {
      offsets.add(clamp01(k.t))
    }
  }
  return [...offsets].sort((a, b) => a - b)
}

function cssTransformAt(
  x: number,
  y: number,
  rotationDeg: number,
  scale: number,
  includeRotateScale: boolean,
): string {
  const pos = `translate3d(${formatCq(x, 'cqw')}, ${formatCq(y, 'cqh')}, 0) translate(-50%, -50%)`
  if (!includeRotateScale) return pos
  return `${pos} ${formatTransformCss(rotationDeg, scale)}`
}

/**
 * Transform-based CSS export using container query units.
 *
 * Positioning model:
 * - `.stage` is `position: relative` and `container-type: size`
 * - Actor center is at `(x * 100cqw, y * 100cqh)` of the stage
 * - `translate(-50%, -50%)` centers the actor on that point (element-relative)
 * - rotate/scale follow centering so they orbit the actor center, not the path
 * - Size uses cqmin: longer box edge = actor.width × min(stageW, stageH)
 */
export function generateCssSnippet(options: {
  keyframes: Keyframe[]
  durationMs: number
  actor: Actor
  loop?: boolean
  loopMode?: LoopMode
  animationName?: string
  stageAspect?: number
  transform?: TransformTrack | null
}): string {
  const {
    keyframes,
    durationMs,
    actor,
    loop = false,
    loopMode = 'repeat',
    animationName = 'motionsketch',
    stageAspect = LEGACY_STAGE_ASPECT,
    transform = null,
  } = options
  const aspectCss = formatCssAspectRatio(stageAspect)

  if (keyframes.length === 0) {
    return '/* No recording to export */\n'
  }

  const track = transform ?? { keyframes: [] }
  const includeXf = track.keyframes.length > 0
  const offsets = unionExportOffsets(keyframes, track)

  const startPos = evaluateKeyframes(keyframes, offsets[0] ?? 0)
  const startXf = evaluateTransform(track, offsets[0] ?? 0)
  const timing = animationTiming(durationMs, loop, loopMode)
  const box = actorBoxRules(actor)

  const loopNote = !loop
    ? ' * Loop: off (plays once, forwards).'
    : loopMode === 'alternate'
      ? ' * Loop: back and forth (animation-direction: alternate). Duration is one way; a full cycle is 2×.'
      : ' * Loop: repeat (infinite). End and start may jump if they differ — no bridging segment is added.'

  const xfNote = includeXf
    ? ' * Transform: rotate/scale keyframes (linear, unwrapped degrees). Order: translate → center → rotate → scale.'
    : ''

  const frames = offsets
    .map((offset) => {
      const pos = evaluateKeyframes(keyframes, offset)
      const xf = evaluateTransform(track, offset)
      return `  ${formatOffset(offset)} { transform: ${cssTransformAt(pos.x, pos.y, xf.rotationDeg, xf.scale, includeXf)}; }`
    })
    .join('\n')

  const imageBlock = box.imageNote ? `\n${box.imageNote}\n *` : ''

  return `/* MotionSketch export
 *
 * Positioning assumptions:
 * - Place .actor inside a .stage with position: relative and container-type: size.
 * - Coordinates are normalized stage fractions: x→cqw, y→cqh (works for non-square stages).
 * - Actor size uses cqmin (fraction of the stage's shorter axis) for the longer box edge.
 * - Animation uses transform only (compositor-friendly); timing-function is linear.
${loopNote}
${xfNote}
 *${imageBlock}
 * Browser support: container query units (cqw/cqh/cqmin).
 * Fallback for a fixed-size stage (replace the cq* lengths with px):
 *   Ncqw  → (N / 100) * stageWidth
 *   Ncqh  → (N / 100) * stageHeight
 *   Ncqmin → (N / 100) * min(stageWidth, stageHeight)
 *
 * Example HTML:
 * ${box.htmlExample}
 */
.stage {
  position: relative;
  container-type: size;
  width: 100%;
  aspect-ratio: ${aspectCss};
  overflow: hidden;
}

.actor {
  position: absolute;
  left: 0;
  top: 0;
${box.sizeDecl}
${box.shapeDecls}
  transform: ${cssTransformAt(startPos.x, startPos.y, startXf.rotationDeg, startXf.scale, includeXf)};
  animation: ${animationName} ${timing};
  will-change: transform;
  display: block;
  box-sizing: border-box;
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
  stageAspect?: number
  processedPath?: MotionSample[] | null
  transform?: TransformTrack | null
}): string {
  const stageAspect = options.stageAspect ?? LEGACY_STAGE_ASPECT
  const keyframes = options.processedPath?.length
    ? buildKeyframesFromProcessed(options.processedPath)
    : buildKeyframes(
        options.samples,
        options.smoothing,
        options.steadySpeed ?? 0,
        stageAspect,
      )
  return generateCssSnippet({
    keyframes,
    durationMs: options.durationMs,
    actor: options.actor,
    loop: options.loop ?? false,
    loopMode: options.loopMode ?? 'repeat',
    stageAspect,
    transform: options.transform ?? null,
  })
}
