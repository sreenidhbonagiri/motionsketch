import {
  actorBorderRadiusCssPercent,
  actorContentAspect,
  coerceActor,
} from '../actor'
import {
  actorTextFontCss,
  actorTextHtmlInner,
  sanitizeCssCommentText,
} from '../actorText'
import { clampClip, fullClip, isFullClip, localToProject } from '../clip'
import { clamp01 } from '../coords'
import {
  formatCssAspectRatio,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import {
  buildHeadingTrack,
  evaluateActorRotationDeg,
  formatFacingFidelityWarningPlain,
  HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
  HEADING_EXPORT_ERROR_PROBE_COUNT,
  HEADING_EXPORT_MAX_OFFSETS,
  headingExportOffsets,
  mergeExportLocalOffsets,
  pauseExportOffsets,
} from '../faceAlongPath'
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
import { makeGeometryEdit } from '../edit'
import { selectProcessedPathForActor } from '../../state/selectors'
import { evaluateKeyframes } from './consistency'
import { buildKeyframesFromProcessed } from './format'
import {
  MS_MOTION_OK_CLASS,
  resolveExportScope,
  scopedActorClass,
  scopedActorSelector,
  scopedAnimationName,
  scopedStageSelector,
  scopedVisibilityAnimationName,
  type ExportCssOptions,
  type ExportScope,
} from './sceneScope'
import {
  coercePlaybackTrigger,
  MS_WAITING_CLASS,
  triggerNeedsJavaScript,
  VIEWPORT_TRIGGER_THRESHOLD,
} from './triggers'

export type { ExportCssOptions, ExportScope } from './sceneScope'
export {
  fingerprintProjectScene,
  resolveExportScope,
  MS_MOTION_OK_CLASS,
} from './sceneScope'

/**
 * CSS keyframe percentage precision. Export starts at {@link CSS_OFFSET_MIN_DECIMALS}
 * and raises digits until every distinct project time gets a unique percentage
 * (up to {@link CSS_OFFSET_MAX_DECIMALS}). Preview evaluates continuously in float
 * space, so it already distinguishes the same times; export matches that intent
 * instead of collapsing poses that only collide after rounding.
 *
 * At max decimals the quantum is 10^-6 percent of the timeline (1e-8 normalized).
 * If two times still collide, the later percentage is nudged by one quantum so
 * both poses remain (never drop a later keyframe to keep an earlier one).
 */
export const CSS_OFFSET_MIN_DECIMALS = 2
export const CSS_OFFSET_MAX_DECIMALS = 6

const PROJECT_T_MERGE_EPS = 1e-12

function formatOffsetWithDigits(offset: number, digits: number): string {
  const pct = clamp01(offset) * 100
  const factor = 10 ** digits
  const rounded = Math.round(pct * factor) / factor
  if (Number.isInteger(rounded)) return `${rounded}%`
  return `${rounded.toFixed(digits)}%`
}

/** @deprecated Prefer {@link formatProjectOffsets} for keyframe lists. */
export function formatOffset(offset: number): string {
  return formatOffsetWithDigits(offset, CSS_OFFSET_MIN_DECIMALS)
}

/**
 * Format project-timeline offsets as unique CSS percentages.
 * Preserves every distinct evaluation time (adaptive precision / nudge).
 */
export function formatProjectOffsets(projectTs: number[]): string[] {
  const n = projectTs.length
  if (n === 0) return []

  for (
    let digits = CSS_OFFSET_MIN_DECIMALS;
    digits <= CSS_OFFSET_MAX_DECIMALS;
    digits++
  ) {
    const formatted = projectTs.map((t) => formatOffsetWithDigits(t, digits))
    if (new Set(formatted).size === formatted.length) return formatted
  }

  const digits = CSS_OFFSET_MAX_DECIMALS
  const quantum = 10 ** -digits
  const used = new Set<string>()
  const out: string[] = []
  for (const t of projectTs) {
    let pct =
      Math.round(clamp01(t) * 100 * 10 ** digits) / 10 ** digits
    let key = formatOffsetWithDigits(pct / 100, digits)
    let guard = 0
    while (used.has(key) && guard < 10_000) {
      if (pct < 100) {
        pct = Math.min(100, pct + quantum)
      } else {
        // Corner case: stuck at 100% — step backward from 100.
        pct = Math.max(0, 100 - quantum * (guard + 1))
      }
      key = formatOffsetWithDigits(pct / 100, digits)
      guard++
    }
    used.add(key)
    out.push(key)
  }
  return out
}

/**
 * When two samples share the same project time, keep a single pose.
 * Prefer local 1 (final), then local 0 (initial), else the later sample.
 */
function mergeSameProjectTime(
  samples: Array<{ projectT: number; localT: number }>,
): Array<{ projectT: number; localT: number }> {
  const out: Array<{ projectT: number; localT: number }> = []
  for (const sample of samples) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.projectT - sample.projectT) <= PROJECT_T_MERGE_EPS) {
      const prevFinal = prev.localT >= 1 - 1e-12
      const sampleFinal = sample.localT >= 1 - 1e-12
      const prevInitial = prev.localT <= 1e-12
      const sampleInitial = sample.localT <= 1e-12
      if (sampleFinal || (prevInitial && !sampleInitial && !prevFinal)) {
        out[out.length - 1] = sample
      }
      continue
    }
    out.push(sample)
  }
  return out
}

/**
 * Build project-timeline sample times for an actor clip, including explicit
 * initial/final holds. Local offsets are remapped into [start, end].
 * Distinct project times are preserved; CSS percentage uniquifying happens in
 * {@link formatProjectOffsets} at emit time.
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

  return mergeSameProjectTime(samples)
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
      // Placeholder alt only — never interpolate the user label into the CSS header.
      htmlExample: `<img class="${className}" src="your-image.png" alt="Actor image" />`,
      imageNote: ` * Image actor (.${className}): CSS alone does NOT embed the image bytes.
 * Host the file yourself (or use the HTML demo export, which embeds data URLs).
 * Use an <img class="${className}"> with the same intrinsic aspect ratio as in the editor.`,
    }
  }

  if (actor.kind === 'text' && actor.text) {
    const fontSize = (actor.text.fontSize * 100).toFixed(2)
    const fontStack = actorTextFontCss(actor.text.fontFamily)
    return {
      sizeDecl: `  width: ${size}cqmin;\n  height: auto;`,
      shapeDecls: `  background: transparent;
  color: ${actor.color};
  font-size: ${fontSize}cqmin;
  font-weight: ${actor.text.fontWeight};
  font-family: ${fontStack};
  text-align: ${actor.text.align};
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.25;
  box-sizing: border-box;`,
      // Placeholder only — never interpolate authored copy into the CSS file header.
      htmlExample: `<div class="${className}">Your text here</div>`,
      imageNote: ` * Text actor (.${className}): CSS alone does NOT include the copy.
 * Put the text inside a matching element, e.g. <div class="${className}">Your text here</div>
 * Use real text (not an image). Newlines and wrapping follow white-space: pre-wrap.
 * System font stacks are self-contained; glyph shapes can vary by device.
 * HTML demo / web package exports embed the escaped copy; this CSS file does not.`,
    }
  }

  const radiusPct = actorBorderRadiusCssPercent(actor.borderRadius).toFixed(2)
  return {
    sizeDecl: `  width: ${size}cqmin;\n  aspect-ratio: 1;`,
    shapeDecls: `  border-radius: ${radiusPct}%;
  background: ${actor.color};`,
    htmlExample: `<div class="${className}"></div>`,
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

/**
 * Discrete visibility keyframes matching {@link isActorVisibleAt}:
 * visible at start; when hide-after is on, hidden at and after end.
 * Uses step-end on each interval (no epsilon keyframe times, no step-start).
 * Paired as a second animation so motion stays linear.
 */
export function buildVisibilityKeyframesCss(
  clip: ActorClip,
): { initialHidden: boolean; frames: string } | null {
  const c = clampClip(clip)
  // start≈0: already at/after start — skip a no-op pre-roll segment.
  const hideBefore = c.hideBeforeStart && c.start > 1e-9
  // end≈1 still needs a 100% hidden stop when hide-after is enabled.
  const hideAfter = c.hideAfterEnd
  if (!hideBefore && !hideAfter) return null

  type VisStop = {
    t: number
    visible: boolean
    /** Timing for the interval after this stop. */
    after: 'step-end' | null
  }
  const stops: VisStop[] = []

  if (hideBefore) {
    stops.push({ t: 0, visible: false, after: 'step-end' })
    stops.push({
      t: c.start,
      visible: true,
      after: hideAfter ? 'step-end' : null,
    })
  } else {
    stops.push({
      t: 0,
      visible: true,
      after: hideAfter ? 'step-end' : null,
    })
  }

  if (hideAfter) {
    const last = stops[stops.length - 1]
    if (Math.abs(last.t - c.end) > 1e-9) {
      if (last.after === null) last.after = 'step-end'
      stops.push({ t: c.end, visible: false, after: null })
    } else {
      last.visible = false
      last.after = null
    }
    if (c.end < 1 - 1e-9) {
      const endStop = stops[stops.length - 1]
      if (endStop.after === null) endStop.after = 'step-end'
      stops.push({ t: 1, visible: false, after: null })
    }
  } else if (stops[stops.length - 1].t < 1 - 1e-9) {
    const last = stops[stops.length - 1]
    if (last.after === null) last.after = 'step-end'
    stops.push({ t: 1, visible: last.visible, after: null })
  }

  const pcts = formatProjectOffsets(stops.map((s) => s.t))
  const frames = stops
    .map((s, i) => {
      const vis = s.visible ? 'visible' : 'hidden'
      const timing =
        s.after === 'step-end'
          ? ' animation-timing-function: step-end;'
          : ''
      return `  ${pcts[i]} { visibility: ${vis};${timing} }`
    })
    .join('\n')

  return { initialHidden: hideBefore, frames }
}

export interface FacingExportFidelityNotice {
  /** Peak sampled unwrapped error for this actor (°). */
  maxErrDeg: number
  /** Technical CSS comment text. */
  cssComment: string
  /** Plain-language Export panel message. */
  plainMessage: string
  actorName: string
}

function generateActorCssBlock(options: {
  actor: SceneActor
  index: number
  actorCount: number
  durationMs: number
  loop: boolean
  loopMode: LoopMode
  processedPath: MotionSample[]
  stageAspect: number
  scope: ExportScope
}): { css: string; facingFidelity: FacingExportFidelityNotice | null } {
  const className = scopedActorClass(options.index, options.actorCount)
  const selector = scopedActorSelector(options.scope, options.index)
  const animName = scopedAnimationName(options.scope, options.index)
  const visName = scopedVisibilityAnimationName(options.scope, options.index)
  const appearance = coerceActor(options.actor.appearance)
  const box = actorBoxRules(appearance, className)
  const track = options.actor.transform
  const faceAlong = options.actor.faceAlongPath === true
  const includeXf = track.keyframes.length > 0 || faceAlong
  const stageAspect = options.stageAspect
  const headingTrack = faceAlong
    ? buildHeadingTrack(options.processedPath, stageAspect)
    : undefined
  const timing = animationTiming(
    options.durationMs,
    options.loop,
    options.loopMode,
  )
  const clip = clampClip(options.actor.clip)
  const vis = buildVisibilityKeyframesCss(clip)
  const visAnimDecl = vis ? `, ${visName} ${timing}` : ''
  const visInitial = vis?.initialHidden
    ? `\n  visibility: hidden;`
    : ''
  const visKeyframes = vis
    ? `

@keyframes ${visName} {
${vis.frames}
}
`
    : ''

  const rotationAt = (localT: number) =>
    evaluateActorRotationDeg(
      options.actor,
      options.processedPath,
      localT,
      stageAspect,
      headingTrack,
    )

  if (options.processedPath.length < 2) {
    // Static actor — rest position; optional discrete visibility animation.
    const x = options.actor.restPosition.x
    const y = options.actor.restPosition.y
    const xf = evaluateTransform(track, 0)
    // No path → facing contributes only the direction offset (if enabled).
    const rotation = faceAlong
      ? rotationAt(0)
      : xf.rotationDeg
    const animLine = vis
      ? `\n  animation: ${visName} ${timing};`
      : ''
    return {
      css: `${selector} {
  position: absolute;
  left: 0;
  top: 0;
${box.sizeDecl}
${box.shapeDecls}
  transform: ${cssTransformAt(x, y, rotation, xf.scale, includeXf)};
  display: block;
  box-sizing: border-box;
  z-index: ${options.index + 1};${visInitial}${animLine}
}
${visKeyframes}`,
      facingFidelity: null,
    }
  }

  const keyframes = buildKeyframesFromProcessed(options.processedPath)
  const baseOffsets = unionExportOffsets(keyframes, track)
  let localOffsets = baseOffsets
  let faceFidelityNote = ''
  let facingFidelity: FacingExportFidelityNotice | null = null
  if (faceAlong) {
    const merged = mergeExportLocalOffsets(
      baseOffsets,
      headingExportOffsets(options.processedPath, stageAspect),
      HEADING_EXPORT_MAX_OFFSETS,
      rotationAt,
      HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
      pauseExportOffsets(options.processedPath, stageAspect),
    )
    localOffsets = merged.offsets
    if (merged.fidelityWarning) {
      faceFidelityNote = `\n  /* ${merged.fidelityWarning} */`
      facingFidelity = {
        maxErrDeg: merged.maxErrDeg,
        cssComment: merged.fidelityWarning,
        plainMessage: formatFacingFidelityWarningPlain(
          merged.maxErrDeg,
          HEADING_EXPORT_ANGULAR_TOLERANCE_DEG,
          options.actor.name,
        ),
        actorName: options.actor.name,
      }
    }
  }
  const timeline = projectTimelineSamples(localOffsets, clip)
  const cssOffsets = formatProjectOffsets(timeline.map((s) => s.projectT))
  const startLocal = timeline[0]?.localT ?? 0
  const startPos = evaluateKeyframes(keyframes, startLocal)
  const startXf = evaluateTransform(track, startLocal)
  const startRotation = rotationAt(startLocal)

  const frames = timeline
    .map(({ localT }, index) => {
      const pos = evaluateKeyframes(keyframes, localT)
      const xf = evaluateTransform(track, localT)
      const rotation = rotationAt(localT)
      return `  ${cssOffsets[index]} { transform: ${cssTransformAt(pos.x, pos.y, rotation, xf.scale, includeXf)}; }`
    })
    .join('\n')

  const clipNote = isFullClip(clip)
    ? ''
    : `\n  /* Clip ${(clip.start * 100).toFixed(1)}%–${(clip.end * 100).toFixed(1)}% of shared timeline (holds outside). */`
  const visNote = vis
    ? `\n  /* Visibility is a separate discrete animation (no fades). */`
    : ''
  const faceNote = faceAlong
    ? `\n  /* Face along path: heading + direction offset + transform track (additive). Alternate retraces poses without turning to face reverse travel. Sampled angular export check: ≤${HEADING_EXPORT_ANGULAR_TOLERANCE_DEG}° over ${HEADING_EXPORT_ERROR_PROBE_COUNT} probe times (not a continuous bound). */${faceFidelityNote}`
    : ''
  const css = `${selector} {
  position: absolute;
  left: 0;
  top: 0;
${box.sizeDecl}
${box.shapeDecls}
  transform: ${cssTransformAt(startPos.x, startPos.y, startRotation, startXf.scale, includeXf)};
  animation: ${animName} ${timing}${visAnimDecl};
  will-change: transform;
  display: block;
  box-sizing: border-box;
  z-index: ${options.index + 1};${visInitial}${clipNote}${visNote}${faceNote}
}

@keyframes ${animName} {
${frames}
}
${visKeyframes}`
  return { css, facingFidelity }
}

export interface ProjectCssExport {
  css: string
  /** Plain-language facing fidelity notices (export still proceeds). */
  facingFidelityWarnings: FacingExportFidelityNotice[]
}

/**
 * Multi-actor CSS export: one scoped scene root + stage; unique keyframes per scene.
 * Prefer {@link buildProjectCssExport} when the Export panel needs fidelity notices.
 */
export function generateProjectCss(
  project: Project,
  options: ExportCssOptions = {},
): string {
  return buildProjectCssExport(project, options).css
}

/**
 * Build scoped CSS plus any face-along sampled-fidelity warnings for the UI.
 */
export function buildProjectCssExport(
  project: Project,
  options: ExportCssOptions = {},
): ProjectCssExport {
  const durationMs = project.playback.durationMs
  const loop = project.playback.loop
  const loopMode = project.playback.loopMode
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const stageAspect = project.stageAspect
  const aspectCss = formatCssAspectRatio(stageAspect)
  const scope = resolveExportScope(project, options)

  const hasAnyMotion = project.actors.some((a) => !!a.recording)
  if (!hasAnyMotion) {
    return {
      css: '/* No recording to export */\n',
      facingFidelityWarnings: [],
    }
  }

  const loopNote = !loop
    ? ' * Loop: off (plays once, forwards) — shared by every actor.'
    : loopMode === 'alternate'
      ? ' * Loop: back and forth (animation-direction: alternate). Duration is one way; a full cycle is 2×. Shared timeline.'
      : ' * Loop: repeat (infinite). Shared timeline for every actor. End and start may jump if they differ — no bridging segment is added.'

  const triggerNote = (() => {
    switch (trigger) {
      case 'page-load':
        return ' * Playback trigger: page-load (CSS starts immediately; no controller required).'
      case 'click':
        return ` * Playback trigger: click/tap — requires MotionSketchTrigger JS. Root starts with .${MS_WAITING_CLASS} (paused at 0%).`
      case 'hover':
        return ` * Playback trigger: hover/focus — requires MotionSketchTrigger JS. Root starts with .${MS_WAITING_CLASS}.`
      case 'viewport':
        return ` * Playback trigger: enter-viewport (~${Math.round(VIEWPORT_TRIGGER_THRESHOLD * 100)}% visible, once) — requires MotionSketchTrigger JS. Root starts with .${MS_WAITING_CLASS}.`
      default:
        return ''
    }
  })()

  const jsNote = triggerNeedsJavaScript(trigger)
    ? ` * JavaScript required: include ms-trigger.js (web package) or the HTML demo controller. Download CSS alone is not enough for this trigger.\n *`
    : ' *'

  const actorCount = project.actors.length
  // Header example markup uses placeholders for text (no authored copy in comments).
  const htmlPartsForComment = project.actors.map((actor, index) => {
    const appearance = coerceActor(actor.appearance)
    return sanitizeCssCommentText(
      actorBoxRules(appearance, scopedActorClass(index, actorCount)).htmlExample,
    )
  })

  const imageNotes = project.actors
    .map((actor, i) => {
      const appearance = coerceActor(actor.appearance)
      return actorBoxRules(
        appearance,
        scopedActorClass(i, actorCount),
      ).imageNote
    })
    .filter(Boolean)
    .map(sanitizeCssCommentText)
    .join('\n *\n')

  const facingFidelityWarnings: FacingExportFidelityNotice[] = []
  const actorBlocks = project.actors
    .map((actor, index) => {
      const processed = selectProcessedPathForActor(project, actor, {
        geometryEdit: actor.geometryEdit,
        editSession: null,
        editPreview: null,
      })
      const block = generateActorCssBlock({
        actor,
        index,
        actorCount,
        durationMs,
        loop,
        loopMode,
        processedPath: processed,
        stageAspect: project.stageAspect,
        scope,
      })
      if (block.facingFidelity) {
        facingFidelityWarnings.push(block.facingFidelity)
      }
      return block.css
    })
    .join('\n')

  const stageSelector = scopedStageSelector(scope)
  const waitingBlock = triggerNeedsJavaScript(trigger)
    ? `
/* Hold at project progress 0 until MotionSketchTrigger removes .${MS_WAITING_CLASS}. */
.${scope.rootClass}.${MS_WAITING_CLASS} [class^="ms-actor"] {
  animation-play-state: paused !important;
}
`
    : ''
  const reducedMotionBlock = `
@media (prefers-reduced-motion: reduce) {
  .${scope.rootClass}:not(.${MS_MOTION_OK_CLASS}) [class^="ms-actor"] {
    animation: none !important;
    /* Keep a meaningful static pose visible (base transform); ignore clip hide flags. */
    visibility: visible !important;
  }
}
`

  const css = `/* MotionSketch scoped scene export
 *
 * Scene isolation:
 * - Wrap markup in <div class="${scope.rootClass}"> so rules never touch host .stage/.actor.
 * - Keyframe names include a content fingerprint (${scope.sceneId}); project title alone is not used.
 * - For a second independently controlled copy of the same scene, re-export with
 *   instancePrefix (e.g. "hero-") or rename the root class + keyframe prefix together.
 * - This stylesheet does not reset host page styles outside .${scope.rootClass}.
 *
 * Reduced motion:
 * - Under prefers-reduced-motion: reduce, animations stay off until the scene root
 *   also has class "${MS_MOTION_OK_CLASS}" (set by an explicit Play control).
 * - Automatic triggers never override reduced-motion; Play opts in.
 * - The static pose uses each actor’s base transform (clip-start / rest) and forces
 *   visibility so hide-before/hide-after cannot blank the scene.
 *
 * Playback trigger:
${triggerNote}
${jsNote}
 * Looping scenes keep running after a trigger until paused or restarted.
 * Embedding API (when JS is included): MotionSketchTrigger.init(root, options),
 *   .play() / .pause() / .resume() / .restart() / .destroy().
 *
 * Positioning:
 * - Place actors inside .${scope.stageClass} (position: relative; container-type: size).
 * - Shared Duration / loop / loopMode drive every actor’s animation together.
 * - Per-actor clips remap motion onto a start–end interval; outside that range the actor holds its first/last pose.
 * - Optional hide-before/hide-after use a separate discrete visibility animation (step timing; no fades).
 *   At an exact step-end keyframe time, Firefox still shows the previous value and
 *   jumps immediately afterward; Chromium/WebKit apply the new value at that time.
 *   Editor JS stays inclusive at start / hidden at end. Continuous playback hides
 *   the mismatch; pausing CSS/WAAPI on the exact boundary in Firefox can disagree.
 * - Coordinates are normalized stage fractions: x→cqw, y→cqh (works for non-square stages).
 * - Actor size uses cqmin (fraction of the stage's shorter axis) for the longer box edge.
 * - Motion uses transform with linear timing; visibility is orthogonal (visibility + step-*).
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
 * <div class="${scope.rootClass}${triggerNeedsJavaScript(trigger) ? ` ${MS_WAITING_CLASS}` : ''}" data-ms-scene="${scope.sceneId}">
 *   <div class="${scope.stageClass}">
 *     ${htmlPartsForComment.join('\n *     ')}
 *   </div>
 * </div>
 */
${stageSelector} {
  position: relative;
  container-type: size;
  width: 100%;
  aspect-ratio: ${aspectCss};
  overflow: hidden;
}

${actorBlocks}
${waitingBlock}${reducedMotionBlock}`
  return { css, facingFidelityWarnings }
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
    glide: 0,
    transform: options.transform ?? { keyframes: [] },
    geometryEdit: null,
    clip: fullClip(),
    faceAlongPath: false,
    directionOffsetDeg: 0,
  }
  const project: Project = {
    version: 1,
    name: 'Export',
    actors: [fakeActor],
    playback: {
      durationMs: options.durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
      trigger: 'page-load',
    },
    stageAspect: options.stageAspect ?? LEGACY_STAGE_ASPECT,
  }
  // Inject processed path via geometryEdit samples mapped from keyframes
  if (options.keyframes.length >= 2) {
    const ge = makeGeometryEdit(
      options.keyframes.map((k) => ({
        t: k.offset * Math.max(1, options.durationMs),
        x: k.x,
        y: k.y,
      })),
      0,
    )
    project.actors[0]!.geometryEdit = ge
    project.actors[0]!.recording = {
      recordedDurationMs: options.durationMs,
      samples: ge.samples,
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
    name: 'Export',
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
        glide: 0,
        transform: options.transform ?? { keyframes: [] },
        geometryEdit: options.processedPath?.length
          ? makeGeometryEdit(options.processedPath, options.smoothing)
          : null,
        clip: fullClip(),
        faceAlongPath: false,
        directionOffsetDeg: 0,
      },
    ],
    playback: {
      durationMs: options.durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
      trigger: 'page-load',
    },
    stageAspect: options.stageAspect ?? LEGACY_STAGE_ASPECT,
  }
  return generateProjectCss(project)
}

export function exportCssFromProject(
  project: Project,
  options: ExportCssOptions = {},
): string {
  return generateProjectCss(project, options)
}

/** Build scene-root + stage markup matching {@link exportCssFromProject}. */
export function buildExportSceneMarkup(
  project: Project,
  options: ExportCssOptions = {},
): { scope: ExportScope; html: string } {
  const scope = resolveExportScope(project, options)
  const actorCount = project.actors.length
  const actors = project.actors
    .map((actor, index) => {
      const cls = scopedActorClass(index, actorCount)
      const appearance = coerceActor(actor.appearance)
      if (appearance.kind === 'image' && appearance.image) {
        return `<img class="${cls}" src="${appearance.image.dataUrl.replace(/"/g, '')}" alt="${appearance.image.label.replace(/"/g, '&quot;')}" />`
      }
      if (appearance.kind === 'text' && appearance.text) {
        return `<div class="${cls}">${actorTextHtmlInner(appearance.text.content)}</div>`
      }
      return `<div class="${cls}"></div>`
    })
    .join('\n    ')
  const html = `<div class="${scope.rootClass}" data-ms-scene="${scope.sceneId}">
  <div class="${scope.stageClass}">
    ${actors}
  </div>
</div>`
  return { scope, html }
}
