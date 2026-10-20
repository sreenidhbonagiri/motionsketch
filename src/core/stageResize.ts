import { actorDisplaySizePx, clampActorSize } from './actor'
import {
  clampActorTextFontSize,
  cloneActorText,
  estimateTextLayoutSizePx,
  MIN_ACTOR_TEXT_FONT_SIZE,
  MAX_ACTOR_TEXT_FONT_SIZE,
} from './actorText'
import { clamp, clamp01 } from './coords'
import { copyGeometryEdit, copyPath } from './edit'
import { cloneSceneActor } from './sceneActor'
import {
  clampStageAspect,
  MAX_STAGE_ASPECT,
  MIN_STAGE_ASPECT,
} from './stageAspect'
import { MAX_TRANSFORM_SCALE } from './transform'
import {
  MAX_ACTOR_SIZE,
  MIN_ACTOR_SIZE,
  type GeometryEdit,
  type MotionSample,
  type Project,
  type SceneActor,
  type Vec2,
} from './types'

/**
 * Default composition height when migrating aspect-only projects.
 * New projects and explicit resizes persist real Width × Height so
 * same-aspect expansion (e.g. 1600×1000 → 3200×2000) is representable.
 */
export const STAGE_COMPOSITION_HEIGHT = 1000

export const MIN_STAGE_COMPOSITION_EDGE = 200
export const MAX_STAGE_COMPOSITION_EDGE = 8000

/** 3×3 alignment of the previous frame inside the new one. */
export type StageResizeAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

export const DEFAULT_STAGE_RESIZE_ANCHOR: StageResizeAnchor = 'center'

export type StageCompositionSize = {
  width: number
  height: number
}

export type StageResizePlan = {
  ok: true
  before: StageCompositionSize
  after: StageCompositionSize
  beforeAspect: number
  afterAspect: number
  anchor: StageResizeAnchor
  /** Offset of the old frame’s top-left in the new composition (units). */
  offsetX: number
  offsetY: number
  /** Scale for cqmin-based appearance sizes so artwork composition size stays constant. */
  sizeScale: number
  /** True when aspect/size are unchanged (no remap needed). */
  noop: boolean
}

export type StageResizeFailure = {
  ok: false
  error: string
}

export type StageResizeResult = StageResizePlan | StageResizeFailure

function anchorAlign(anchor: StageResizeAnchor): { ax: number; ay: number } {
  switch (anchor) {
    case 'top-left':
      return { ax: 0, ay: 0 }
    case 'top':
      return { ax: 0.5, ay: 0 }
    case 'top-right':
      return { ax: 1, ay: 0 }
    case 'left':
      return { ax: 0, ay: 0.5 }
    case 'center':
      return { ax: 0.5, ay: 0.5 }
    case 'right':
      return { ax: 1, ay: 0.5 }
    case 'bottom-left':
      return { ax: 0, ay: 1 }
    case 'bottom':
      return { ax: 0.5, ay: 1 }
    case 'bottom-right':
      return { ax: 1, ay: 1 }
    default:
      return { ax: 0.5, ay: 0.5 }
  }
}

/** Default composition size derived from aspect (migration / new projects). */
export function compositionSizeFromAspect(
  stageAspect: number,
): StageCompositionSize {
  const aspect = clampStageAspect(stageAspect)
  return {
    width: Math.round(aspect * STAGE_COMPOSITION_HEIGHT),
    height: STAGE_COMPOSITION_HEIGHT,
  }
}

/**
 * Resolve the project’s composition working area.
 * Prefers persisted stageWidth/stageHeight; falls back to aspect × default height.
 */
export function resolveProjectStageSize(project: {
  stageAspect: number
  stageWidth?: number
  stageHeight?: number
}): StageCompositionSize {
  const w = project.stageWidth
  const h = project.stageHeight
  if (
    typeof w === 'number' &&
    typeof h === 'number' &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w >= MIN_STAGE_COMPOSITION_EDGE &&
    h >= MIN_STAGE_COMPOSITION_EDGE &&
    w <= MAX_STAGE_COMPOSITION_EDGE &&
    h <= MAX_STAGE_COMPOSITION_EDGE
  ) {
    return { width: Math.round(w), height: Math.round(h) }
  }
  return compositionSizeFromAspect(project.stageAspect)
}

/** Keep aspect + dimensions consistent on a project. */
export function withProjectStageSize(
  project: Project,
  size: StageCompositionSize,
): Project {
  const parsed = parseCompositionSize(size.width, size.height)
  if (!parsed.ok) {
    const fallback = compositionSizeFromAspect(project.stageAspect)
    return {
      ...project,
      stageWidth: fallback.width,
      stageHeight: fallback.height,
      stageAspect: clampStageAspect(fallback.width / fallback.height),
    }
  }
  return {
    ...project,
    stageWidth: parsed.size.width,
    stageHeight: parsed.size.height,
    stageAspect: clampStageAspect(parsed.size.width / parsed.size.height),
  }
}

export function parseCompositionSize(
  width: number,
  height: number,
): { ok: true; size: StageCompositionSize } | { ok: false; error: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, error: 'Enter finite Width and Height values.' }
  }
  const w = Math.round(width)
  const h = Math.round(height)
  if (w < MIN_STAGE_COMPOSITION_EDGE || h < MIN_STAGE_COMPOSITION_EDGE) {
    return {
      ok: false,
      error: `Width and Height must be at least ${MIN_STAGE_COMPOSITION_EDGE}.`,
    }
  }
  if (w > MAX_STAGE_COMPOSITION_EDGE || h > MAX_STAGE_COMPOSITION_EDGE) {
    return {
      ok: false,
      error: `Width and Height must be at most ${MAX_STAGE_COMPOSITION_EDGE}.`,
    }
  }
  const aspect = w / h
  if (aspect < MIN_STAGE_ASPECT || aspect > MAX_STAGE_ASPECT) {
    return {
      ok: false,
      error: `That size’s aspect (${aspect.toFixed(2)}) is outside the allowed range (${MIN_STAGE_ASPECT}–${MAX_STAGE_ASPECT}).`,
    }
  }
  return { ok: true, size: { width: w, height: h } }
}

function remapPoint(
  point: Vec2,
  before: StageCompositionSize,
  after: StageCompositionSize,
  offsetX: number,
  offsetY: number,
): Vec2 {
  const px = point.x * before.width + offsetX
  const py = point.y * before.height + offsetY
  return {
    x: px / after.width,
    y: py / after.height,
  }
}

/** Max uniform scale from the transform track (default 1). */
function maxTransformScale(actor: SceneActor): number {
  let max = 1
  for (const key of actor.transform.keyframes) {
    if (Number.isFinite(key.scale)) {
      max = Math.max(max, key.scale)
    }
  }
  // Face-along + transform rotation can orient the box arbitrarily; scale
  // still applies about the path sample. Cap at the authored maximum.
  return Math.min(max, MAX_TRANSFORM_SCALE)
}

/**
 * Artwork size in composition pixels for content-fit.
 * Text uses conservative multiline/wrap layout (never the one-line nominal).
 * Shapes/images use {@link actorDisplaySizePx}.
 */
function artworkSizeComp(
  actor: SceneActor,
  stage: StageCompositionSize,
): { width: number; height: number } | null {
  if (actor.appearance.kind === 'text') {
    if (!actor.appearance.text) return null
    return estimateTextLayoutSizePx(
      stage.width,
      stage.height,
      actor.appearance,
    )
  }
  return actorDisplaySizePx(stage.width, stage.height, actor.appearance)
}

/**
 * Artwork radius in composition units (circle bound for any rotation / facing).
 * Includes max transform scale. Returns null when bounds cannot be established
 * (caller must reject shrink rather than claim a fit).
 */
function artworkRadiusComp(
  actor: SceneActor,
  stage: StageCompositionSize,
): number | null {
  const display = artworkSizeComp(actor, stage)
  if (!display || !(display.width > 0) || !(display.height > 0)) return null
  const scale = maxTransformScale(actor)
  return (Math.hypot(display.width, display.height) / 2) * scale
}

function collectPathCenters(actor: SceneActor): Vec2[] {
  const points: Vec2[] = [{ ...actor.restPosition }]
  if (actor.recording) {
    for (const s of actor.recording.samples) {
      points.push({ x: s.x, y: s.y })
    }
  }
  if (actor.geometryEdit) {
    for (const s of actor.geometryEdit.samples) {
      points.push({ x: s.x, y: s.y })
    }
  }
  return points
}

export type ContentFitFailure = {
  ok: false
  error: string
}

/**
 * Content-fit guarantee: after remap, every path/rest sample center and the
 * artwork disk around it must lie inside the new composition frame [0,W]×[0,H].
 *
 * Includes original recordings (Restore), geometry edits, and rest poses.
 * Transform track is rotation/scale only (no translate). Facing/rotation use a
 * circumcircle. Text uses conservative wrapped/multiline layout bounds — never
 * a one-line underestimate. If text/shape bounds cannot be established, shrink
 * is rejected (expand with sizeScale≈1 still allowed when radius is null only
 * for empty/invalid text — treated as reject for safety on any non-fit path).
 */
function contentFitsAfterRemap(
  actors: SceneActor[],
  before: StageCompositionSize,
  after: StageCompositionSize,
  offsetX: number,
  offsetY: number,
): { ok: true } | ContentFitFailure {
  const eps = 1e-6
  for (const actor of actors) {
    const radius = artworkRadiusComp(actor, before)
    if (radius === null) {
      return {
        ok: false,
        error:
          `Cannot verify whether “${actor.name}” fits the new stage (text or artwork bounds are unreliable). Expand instead of shrinking, or simplify that actor’s appearance first.`,
      }
    }
    for (const p of collectPathCenters(actor)) {
      const cx = p.x * before.width + offsetX
      const cy = p.y * before.height + offsetY
      if (
        cx - radius < -eps ||
        cy - radius < -eps ||
        cx + radius > after.width + eps ||
        cy + radius > after.height + eps
      ) {
        return {
          ok: false,
          error:
            'That size would cut off existing motion or artwork. Content must stay inside the new frame, including path samples (original and edited), rest positions, and actor/text bounds at max transform scale (wrapped/multiline text included). Expand the stage, or choose an anchor that keeps current content inside. Shrinking past content is not supported yet.',
        }
      }
    }
  }
  return { ok: true }
}

function appearanceWouldClamp(
  actor: SceneActor,
  sizeScale: number,
): string | null {
  if (Math.abs(sizeScale - 1) <= 1e-9) return null
  const nextW = actor.appearance.width * sizeScale
  const nextH = actor.appearance.height * sizeScale
  if (
    nextW < MIN_ACTOR_SIZE - 1e-12 ||
    nextW > MAX_ACTOR_SIZE + 1e-12 ||
    nextH < MIN_ACTOR_SIZE - 1e-12 ||
    nextH > MAX_ACTOR_SIZE + 1e-12
  ) {
    return `That size would force actor “${actor.name}” outside the allowed artwork size range (${MIN_ACTOR_SIZE}–${MAX_ACTOR_SIZE} of the shorter stage side). Choose a closer size so proportions stay exact.`
  }
  const text = actor.appearance.text
  if (text) {
    const nextFont = text.fontSize * sizeScale
    if (
      nextFont < MIN_ACTOR_TEXT_FONT_SIZE - 1e-12 ||
      nextFont > MAX_ACTOR_TEXT_FONT_SIZE + 1e-12
    ) {
      return `That size would force text on “${actor.name}” outside the allowed font-size range. Choose a closer size so text stays exact.`
    }
  }
  return null
}

/**
 * Plan a stage resize that preserves composition-space geometry (no stretch).
 * Rejects shrinks that would place existing content (paths + artwork extents)
 * outside the new frame, and rejects size scales that would clamp appearance.
 */
export function planStageResize(args: {
  stageAspect: number
  stageWidth?: number
  stageHeight?: number
  actors: SceneActor[]
  width: number
  height: number
  anchor?: StageResizeAnchor
}): StageResizeResult {
  const parsed = parseCompositionSize(args.width, args.height)
  if (!parsed.ok) return parsed

  const before = resolveProjectStageSize({
    stageAspect: args.stageAspect,
    stageWidth: args.stageWidth,
    stageHeight: args.stageHeight,
  })
  const after = parsed.size
  const beforeAspect = clampStageAspect(before.width / before.height)
  const afterAspect = clampStageAspect(after.width / after.height)
  const anchor = args.anchor ?? DEFAULT_STAGE_RESIZE_ANCHOR
  const { ax, ay } = anchorAlign(anchor)
  const offsetX = ax * (after.width - before.width)
  const offsetY = ay * (after.height - before.height)
  const minBefore = Math.min(before.width, before.height)
  const minAfter = Math.min(after.width, after.height)
  const sizeScale = minBefore / minAfter

  const noop =
    before.width === after.width &&
    before.height === after.height &&
    Math.abs(beforeAspect - afterAspect) < 1e-9

  if (!noop) {
    const fit = contentFitsAfterRemap(
      args.actors,
      before,
      after,
      offsetX,
      offsetY,
    )
    if (!fit.ok) return fit
    for (const actor of args.actors) {
      const clampError = appearanceWouldClamp(actor, sizeScale)
      if (clampError) return { ok: false, error: clampError }
    }
  }

  return {
    ok: true,
    before,
    after,
    beforeAspect,
    afterAspect,
    anchor,
    offsetX,
    offsetY,
    sizeScale,
    noop,
  }
}

function remapSample(
  sample: MotionSample,
  plan: StageResizePlan,
): MotionSample {
  const p = remapPoint(
    sample,
    plan.before,
    plan.after,
    plan.offsetX,
    plan.offsetY,
  )
  return {
    ...sample,
    x: clamp01(p.x),
    y: clamp01(p.y),
  }
}

function remapGeometryEdit(
  edit: GeometryEdit,
  plan: StageResizePlan,
): GeometryEdit {
  const copy = copyGeometryEdit(edit)
  return {
    ...copy,
    samples: copy.samples.map((s) => remapSample(s, plan)),
  }
}

function remapActor(actor: SceneActor, plan: StageResizePlan): SceneActor {
  const next = cloneSceneActor(actor)
  const rest = remapPoint(
    next.restPosition,
    plan.before,
    plan.after,
    plan.offsetX,
    plan.offsetY,
  )
  next.restPosition = { x: clamp01(rest.x), y: clamp01(rest.y) }

  if (next.recording) {
    next.recording = {
      ...next.recording,
      samples: copyPath(next.recording.samples).map((s) =>
        remapSample(s, plan),
      ),
    }
  }
  if (next.geometryEdit) {
    next.geometryEdit = remapGeometryEdit(next.geometryEdit, plan)
  }

  if (!plan.noop && Math.abs(plan.sizeScale - 1) > 1e-9) {
    // Plan already rejected clamp-forcing scales; apply exact scaled values.
    const width = next.appearance.width * plan.sizeScale
    const height = next.appearance.height * plan.sizeScale
    next.appearance = {
      ...next.appearance,
      width,
      height,
      text: next.appearance.text
        ? {
            ...cloneActorText(next.appearance.text),
            fontSize: next.appearance.text.fontSize * plan.sizeScale,
          }
        : null,
    }
    // Defensive: never write out-of-range values even if plan and apply diverge.
    if (
      Math.abs(clampActorSize(width) - width) > 1e-12 ||
      Math.abs(clampActorSize(height) - height) > 1e-12 ||
      (next.appearance.text &&
        Math.abs(
          clampActorTextFontSize(next.appearance.text.fontSize) -
            next.appearance.text.fontSize,
        ) > 1e-12)
    ) {
      throw new Error('stage resize applied a clamping size scale')
    }
  }

  return next
}

/** Apply a planned resize to a project (pure). */
export function applyStageResizePlan(
  project: Project,
  plan: StageResizePlan,
): Project {
  const sized = withProjectStageSize(project, plan.after)
  if (plan.noop) {
    return {
      ...sized,
      actors: project.actors.map((a) => cloneSceneActor(a)),
    }
  }
  return {
    ...sized,
    actors: project.actors.map((a) => remapActor(a, plan)),
  }
}

/**
 * Convenience: plan + apply. Returns failure without mutating.
 */
export function resizeProjectStage(
  project: Project,
  width: number,
  height: number,
  anchor: StageResizeAnchor = DEFAULT_STAGE_RESIZE_ANCHOR,
):
  | { ok: true; project: Project; plan: StageResizePlan }
  | StageResizeFailure {
  const size = resolveProjectStageSize(project)
  const plan = planStageResize({
    stageAspect: project.stageAspect,
    stageWidth: size.width,
    stageHeight: size.height,
    actors: project.actors,
    width,
    height,
    anchor,
  })
  if (!plan.ok) return plan
  return {
    ok: true,
    project: applyStageResizePlan(project, plan),
    plan,
  }
}

/** Clamp draft width/height inputs for controlled fields. */
export function clampCompositionDraft(value: number): number {
  if (!Number.isFinite(value)) return STAGE_COMPOSITION_HEIGHT
  return clamp(
    Math.round(value),
    MIN_STAGE_COMPOSITION_EDGE,
    MAX_STAGE_COMPOSITION_EDGE,
  )
}

export const STAGE_RESIZE_ANCHORS: StageResizeAnchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

export function stageResizeAnchorLabel(anchor: StageResizeAnchor): string {
  switch (anchor) {
    case 'top-left':
      return 'Top left'
    case 'top':
      return 'Top'
    case 'top-right':
      return 'Top right'
    case 'left':
      return 'Left'
    case 'center':
      return 'Center'
    case 'right':
      return 'Right'
    case 'bottom-left':
      return 'Bottom left'
    case 'bottom':
      return 'Bottom'
    case 'bottom-right':
      return 'Bottom right'
  }
}

/** Undo/redo payload for one stage resize (project-global). */
export type StageResizeSnapshot = {
  beforeAspect: number
  afterAspect: number
  beforeActors: SceneActor[]
  afterActors: SceneActor[]
  beforeSize: StageCompositionSize
  afterSize: StageCompositionSize
  anchor: StageResizeAnchor
}

export function captureStageResizeSnapshot(args: {
  before: Project
  after: Project
  plan: StageResizePlan
}): StageResizeSnapshot {
  return {
    beforeAspect: args.plan.beforeAspect,
    afterAspect: args.plan.afterAspect,
    beforeActors: args.before.actors.map((a) => cloneSceneActor(a)),
    afterActors: args.after.actors.map((a) => cloneSceneActor(a)),
    beforeSize: { ...args.plan.before },
    afterSize: { ...args.plan.after },
    anchor: args.plan.anchor,
  }
}

export function applyStageResizeSnapshot(
  project: Project,
  snap: StageResizeSnapshot,
  direction: 'undo' | 'redo',
): Project {
  if (direction === 'undo') {
    return withProjectStageSize(
      {
        ...project,
        actors: snap.beforeActors.map((a) => cloneSceneActor(a)),
      },
      snap.beforeSize,
    )
  }
  return withProjectStageSize(
    {
      ...project,
      actors: snap.afterActors.map((a) => cloneSceneActor(a)),
    },
    snap.afterSize,
  )
}

/** Composition-space point from a normalized sample (for tests / diagnostics). */
export function toCompositionPoint(
  point: Vec2,
  size: StageCompositionSize,
  offsetX = 0,
  offsetY = 0,
): Vec2 {
  return {
    x: point.x * size.width - offsetX,
    y: point.y * size.height - offsetY,
  }
}
