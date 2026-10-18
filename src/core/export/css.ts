import {
  actorBorderRadiusCssPercent,
  actorContentAspect,
  coerceActor,
} from '../actor'
import { clampClip, isFullClip, localToProject } from '../clip'
import { clamp01 } from '../coords'
import {
  formatCssAspectRatio,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import { cssActorClass, cssAnimationName } from '../sceneActor'
import {
  evaluateTransform,
  formatTransformCss,
} from '../transform'
import type {
  Actor,
  ActorClip,
  Keyframe,
  LoopMode,
  MotionSample,
  Project,
  SceneActor,
  TransformTrack,
} from '../types'
import { selectProcessedPathForActor } from '../../state/selectors'
import { evaluateKeyframes } from './consistency'
import { buildKeyframesFromProcessed } from './format'

function formatOffset(offset: number): string {
  const pct = clamp01(offset) * 100
  // Two decimals keep nearby clip boundaries distinct without CSS collisions.
  const rounded = Math.round(pct * 100) / 100
  if (Number.isInteger(rounded)) return `${rounded}%`
  return `${rounded.toFixed(2)}%`
}

/**
 * Build project-timeline sample times for an actor clip, including explicit
 * initial/final holds. Local offsets are remapped into [start, end].
 */
export function projectTimelineSamples(
  localOffsets: number[],
  clip: ActorClip,
): Array<{ projectT: number; localT: number }> {
  const c = clampClip(clip)
  const locals =
    localOffsets.length > 0
      ? [...localOffsets].sort((a, b) => a - b)
      : [0, 1]
  if (locals[0] > 0) locals.unshift(0)
  if (locals[locals.length - 1] < 1) locals.push(1)

  const samples: Array<{ projectT: number; localT: number }> = []
  if (c.start > 1e-9) {
    samples.push({ projectT: 0, localT: 0 })
  }
  for (const localT of locals) {
    samples.push({
      projectT: localToProject(localT, c),
      localT: clamp01(localT),
    })
  }
  if (c.end < 1 - 1e-9) {
    samples.push({ projectT: 1, localT: 1 })
  }

  // Collapse samples that round to the same CSS percentage; keep first.
  const seen = new Set<string>()
  const unique: Array<{ projectT: number; localT: number }> = []
  for (const sample of samples) {
    const key = formatOffset(sample.projectT)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(sample)
  }
  return unique
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

function actorBoxRules(
  actor: Actor,
  className: string,
): {
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
      htmlExample: `<div class="stage"><img class="${className}" src="your-image.png" alt="${actor.image.label.replace(/"/g, '')}" /></div>`,
      imageNote: ` * Image actor (.${className}): CSS alone does NOT embed the image bytes.
 * Host the file yourself (or use the HTML demo export, which embeds data URLs).
 * Use an <img class="${className}"> with the same intrinsic aspect ratio as in the editor.`,
    }
  }

  const radiusPct = actorBorderRadiusCssPercent(actor.borderRadius).toFixed(2)
  return {
    sizeDecl: `  width: ${size}cqmin;\n  aspect-ratio: 1;`,
    shapeDecls: `  border-radius: ${radiusPct}%;
  background: ${actor.color};`,
    htmlExample: `<div class="stage"><div class="${className}"></div></div>`,
    imageNote: '',
  }
}

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

function generateActorCssBlock(options: {
  actor: SceneActor
  index: number
  actorCount: number
  durationMs: number
  loop: boolean
  loopMode: LoopMode
  processedPath: MotionSample[]
}): string {
  const className = cssActorClass(options.index, options.actorCount)
  const animName = cssAnimationName(options.index, options.actorCount)
  const appearance = coerceActor(options.actor.appearance)
  const box = actorBoxRules(appearance, className)
  const track = options.actor.transform
  const includeXf = track.keyframes.length > 0
  const timing = animationTiming(
    options.durationMs,
    options.loop,
    options.loopMode,
  )

  if (options.processedPath.length < 2) {
    // Static actor — rest position, optional identity transform hold.
    const x = options.actor.restPosition.x
    const y = options.actor.restPosition.y
    const xf = evaluateTransform(track, 0)
    const tag = appearance.kind === 'image' ? 'img' : 'div'
    void tag
    return `.${className} {
  position: absolute;
  left: 0;
  top: 0;
${box.sizeDecl}
${box.shapeDecls}
  transform: ${cssTransformAt(x, y, xf.rotationDeg, xf.scale, includeXf)};
  display: block;
  box-sizing: border-box;
  z-index: ${options.index + 1};
}
`
  }

  const keyframes = buildKeyframesFromProcessed(options.processedPath)
  const localOffsets = unionExportOffsets(keyframes, track)
  const clip = clampClip(options.actor.clip)
  const timeline = projectTimelineSamples(localOffsets, clip)
  const startLocal = timeline[0]?.localT ?? 0
  const startPos = evaluateKeyframes(keyframes, startLocal)
  const startXf = evaluateTransform(track, startLocal)

  const frames = timeline
    .map(({ projectT, localT }) => {
      const pos = evaluateKeyframes(keyframes, localT)
      const xf = evaluateTransform(track, localT)
      return `  ${formatOffset(projectT)} { transform: ${cssTransformAt(pos.x, pos.y, xf.rotationDeg, xf.scale, includeXf)}; }`
    })
    .join('\n')

  const clipNote = isFullClip(clip)
    ? ''
    : `\n  /* Clip ${(clip.start * 100).toFixed(1)}%–${(clip.end * 100).toFixed(1)}% of shared timeline (holds outside). */`

  return `.${className} {
  position: absolute;
  left: 0;
  top: 0;
${box.sizeDecl}
${box.shapeDecls}
  transform: ${cssTransformAt(startPos.x, startPos.y, startXf.rotationDeg, startXf.scale, includeXf)};
  animation: ${animName} ${timing};
  will-change: transform;
  display: block;
  box-sizing: border-box;
  z-index: ${options.index + 1};${clipNote}
}

@keyframes ${animName} {
${frames}
}
`
}

/**
 * Multi-actor CSS export: one shared stage + timeline; unique class/animation per actor.
 */
export function generateProjectCss(project: Project): string {
  const durationMs = project.playback.durationMs
  const loop = project.playback.loop
  const loopMode = project.playback.loopMode
  const stageAspect = project.stageAspect
  const aspectCss = formatCssAspectRatio(stageAspect)

  const hasAnyMotion = project.actors.some((a) => !!a.recording)
  if (!hasAnyMotion) {
    return '/* No recording to export */\n'
  }

  const loopNote = !loop
    ? ' * Loop: off (plays once, forwards) — shared by every actor.'
    : loopMode === 'alternate'
      ? ' * Loop: back and forth (animation-direction: alternate). Duration is one way; a full cycle is 2×. Shared timeline.'
      : ' * Loop: repeat (infinite). Shared timeline for every actor. End and start may jump if they differ — no bridging segment is added.'

  const actorCount = project.actors.length
  const htmlParts = project.actors.map((actor, index) => {
    const cls = cssActorClass(index, actorCount)
    if (actor.appearance.kind === 'image' && actor.appearance.image) {
      return `<img class="${cls}" src="actor-${index + 1}.png" alt="${actor.name.replace(/"/g, '')}" />`
    }
    return `<div class="${cls}"></div>`
  })

  const imageNotes = project.actors
    .map((actor, i) => {
      if (actor.appearance.kind !== 'image' || !actor.appearance.image) return ''
      return actorBoxRules(
        actor.appearance,
        cssActorClass(i, actorCount),
      ).imageNote
    })
    .filter(Boolean)
    .join('\n *\n')

  const actorBlocks = project.actors
    .map((actor, index) => {
      const processed = selectProcessedPathForActor(project, actor, {
        geometryEdit: actor.geometryEdit,
        editSession: null,
        editPreview: null,
      })
      return generateActorCssBlock({
        actor,
        index,
        actorCount,
        durationMs,
        loop,
        loopMode,
        processedPath: processed,
      })
    })
    .join('\n')

  return `/* MotionSketch multi-actor export
 *
 * Positioning assumptions:
 * - Place each actor element inside a .stage with position: relative and container-type: size.
 * - Shared Duration / loop / loopMode drive every actor’s animation together.
 * - Per-actor clips remap motion onto a start–end interval; outside that range the actor holds its first/last pose (timing ≠ visibility).
 * - Coordinates are normalized stage fractions: x→cqw, y→cqh (works for non-square stages).
 * - Actor size uses cqmin (fraction of the stage's shorter axis) for the longer box edge.
 * - Animation uses transform only (compositor-friendly); timing-function is linear.
 * - Transform order: translate → center → rotate → scale.
${loopNote}
 *${imageNotes ? `\n${imageNotes}\n *` : ''}
 * Browser support: container query units (cqw/cqh/cqmin).
 * Fallback for a fixed-size stage (replace the cq* lengths with px):
 *   Ncqw  → (N / 100) * stageWidth
 *   Ncqh  → (N / 100) * stageHeight
 *   Ncqmin → (N / 100) * min(stageWidth, stageHeight)
 *
 * Example HTML:
 * <div class="stage">
 *   ${htmlParts.join('\n *   ')}
 * </div>
 */
.stage {
  position: relative;
  container-type: size;
  width: 100%;
  aspect-ratio: ${aspectCss};
  overflow: hidden;
}

${actorBlocks}`
}

/** @deprecated single-actor helper — prefer generateProjectCss */
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
  const fakeActor: SceneActor = {
    id: 'legacy',
    name: 'Actor 1',
    appearance: options.actor,
    recording:
      options.keyframes.length >= 2
        ? {
            recordedDurationMs: options.durationMs,
            samples: options.keyframes.map((k) => ({
              t: k.offset * options.durationMs,
              x: k.x,
              y: k.y,
            })),
          }
        : null,
    restPosition: options.keyframes[0]
      ? { x: options.keyframes[0].x, y: options.keyframes[0].y }
      : { x: 0.5, y: 0.5 },
    smoothing: 0,
    steadySpeed: 0,
    transform: options.transform ?? { keyframes: [] },
    geometryEdit: null,
    clip: { start: 0, end: 1 },
  }
  const project: Project = {
    version: 1,
    actors: [fakeActor],
    playback: {
      durationMs: options.durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
    },
    stageAspect: options.stageAspect ?? LEGACY_STAGE_ASPECT,
  }
  // Inject processed path via geometryEdit samples mapped from keyframes
  if (options.keyframes.length >= 2) {
    project.actors[0].geometryEdit = {
      bakedSmoothing: 0,
      samples: options.keyframes.map((k) => ({
        t: k.offset * Math.max(1, options.durationMs),
        x: k.x,
        y: k.y,
      })),
    }
    project.actors[0].recording = {
      recordedDurationMs: options.durationMs,
      samples: project.actors[0].geometryEdit.samples,
    }
  }
  return generateProjectCss(project)
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
  const project: Project = {
    version: 1,
    actors: [
      {
        id: 'a1',
        name: 'Actor 1',
        appearance: options.actor,
        recording:
          options.samples.length >= 2
            ? {
                recordedDurationMs: options.durationMs,
                samples: options.samples,
              }
            : null,
        restPosition: options.samples[0]
          ? { x: options.samples[0].x, y: options.samples[0].y }
          : { x: 0.5, y: 0.5 },
        smoothing: options.smoothing,
        steadySpeed: options.steadySpeed ?? 0,
        transform: options.transform ?? { keyframes: [] },
        geometryEdit: options.processedPath?.length
          ? {
              bakedSmoothing: options.smoothing,
              samples: options.processedPath,
            }
          : null,
        clip: { start: 0, end: 1 },
      },
    ],
    playback: {
      durationMs: options.durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
    },
    stageAspect: options.stageAspect ?? LEGACY_STAGE_ASPECT,
  }
  return generateProjectCss(project)
}

export function exportCssFromProject(project: Project): string {
  return generateProjectCss(project)
}
