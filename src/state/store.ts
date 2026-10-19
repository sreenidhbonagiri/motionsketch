import { create } from 'zustand'
import {
  clampActorBorderRadius,
  clampActorSize,
  ensureActorText,
  normalizeActorColor,
} from '../core/actor'
import {
  clampActorTextFontSize,
  DEFAULT_ACTOR_TEXT,
  sanitizeActorTextContent,
} from '../core/actorText'
import type { ActorImageAsset } from '../core/imageAsset'
import type { ActorTextAlign, ActorTextFont } from '../core/types'
import {
  addHandleIndex,
  copyGeometryEdit,
  copyPath,
  formatHandleSelectionAnnouncement,
  makeCornerAtHandle,
  makeCornerAvailability,
  makeGeometryEdit,
  MAX_PATH_HANDLES,
  type PathEditTool,
  removeHandleIndex,
  samplesMatch,
  smoothBendAtHandle,
  smoothBendAvailability,
} from '../core/edit'
import { applyGlide, DEFAULT_GLIDE_STRENGTH } from '../core/glide'
import { selectProcessedPathForActor } from './selectors'
import {
  polishMotion,
  polishRoundingAvailability,
} from '../core/polish'
import { clamp } from '../core/coords'
import type { PlaybackDirection } from '../core/playback'
import type { PersistedSnapshot } from '../core/persist/document'
import { createEmptyPersistableProject } from '../core/persist/document'
import {
  commitProjectName,
  DEFAULT_PROJECT_NAME,
  isValidProjectName,
  sanitizeProjectName,
} from '../core/projectName'
import { captureViewportStageAspect, clampStageAspect } from '../core/stageAspect'
import {
  clampClip,
  clipsEqual,
  cloneClip,
  localToProject,
  projectToLocal,
} from '../core/clip'
import {
  cloneSceneActor,
  createSceneActor,
  DEFAULT_REST_POSITION,
  duplicateSceneActor,
  findActor,
  mapActor,
  MAX_ACTORS,
  projectHasAnyRecording,
  restPositionFromRecording,
  sanitizeActorName,
  uniqueActorName,
} from '../core/sceneActor'
import {
  cloneTransformTrack,
  emptyTransformTrack,
  removeTransformKeyframe,
  upsertTransformKeyframe,
} from '../core/transform'
import {
  MAX_PLAYBACK_DURATION_MS,
  MIN_PLAYBACK_DURATION_MS,
  type ActorClip,
  type EditorMode,
  type GeometryEdit,
  type LoopMode,
  type MotionSample,
  type PlaybackTrigger,
  type Project,
  type Recording,
  type SceneActor,
  type TransformTrack,
  type Vec2,
} from '../core/types'
import { clampDirectionOffsetDeg } from '../core/faceAlongPath'
import { cancelIdleDrag } from '../lib/recordingController'
import {
  bakeEditablePathForActor,
  selectActorPositionForActor,
} from './selectors'

/** Ephemeral Polish motion preview — never persisted until Apply. */
export type PolishSession = {
  baseline: GeometryEdit
  previewSamples: MotionSample[]
  strength: number
  changed: boolean
  reason: string | null
  timingAdjusted: boolean
  maxDeviation: number
  /**
   * Sample index captured when Polish opened (selected interior handle).
   * Temporary UI only — not written into geometry or exports.
   */
  roundingTargetIndex: number | null
  allowRoundingAtPoint: boolean
  roundingUnavailableReason: string | null
  roundingNeighborhood: { lo: number; hi: number } | null
}

/** Default Polish strength when an actor has no remembered preference. */
export const DEFAULT_POLISH_STRENGTH = 0.55

const MAX_UNDO = 40

/** Ephemeral Glide timing preview — never persisted until Apply. */
export type GlideSession = {
  /** Preview strength (0..1). */
  strength: number
  /** Which timing drives the actor during the session. */
  compareMode: 'original' | 'glide'
  changed: boolean
  reason: string | null
  segmentsAdjusted: number
}

/** Chronological actor-edit kinds for unified placement/clip/transform undo. */
export type ActorEditKind = 'transform' | 'clip' | 'placement' | 'glide'

const PLACEMENT_NOOP_EPS = 1e-9

function cloneRestPosition(position: Vec2): Vec2 {
  return { x: position.x, y: position.y }
}

function restPositionsEqual(a: Vec2, b: Vec2): boolean {
  return (
    Math.abs(a.x - b.x) < PLACEMENT_NOOP_EPS &&
    Math.abs(a.y - b.y) < PLACEMENT_NOOP_EPS
  )
}

interface EditorStore {
  project: Project
  selectedActorId: string
  mode: EditorMode
  pointerId: number | null
  playbackHead: number
  playbackDirection: PlaybackDirection
  playbackEpoch: number
  livePosition: Vec2
  liveTrail: Vec2[]
  showPathComparison: boolean
  /**
   * Snap placement / path edits to the editor grid. Local preference only —
   * not project data, not exported, not autosaved. Off by default.
   */
  snapToGrid: boolean
  /** Ephemeral snap/anchor marker in normalized coords (editor chrome only). */
  snapIndicator: Vec2 | null

  /**
   * Working geometry for the selected actor (mirrors actor.geometryEdit when idle).
   * Path undo/redo apply only to this selection — stacks clear on actor change.
   */
  geometryEdit: GeometryEdit | null
  editSession: GeometryEdit | null
  /** Full geometry snapshots (samples + handleIndices) for path undo/redo. */
  undoStack: GeometryEdit[]
  redoStack: GeometryEdit[]
  selectedHandleIndex: number | null
  editPreview: MotionSample[] | null
  /** When true, stage clicks near the path add an editable handle. */
  pathAddMode: boolean
  /** Ghost sample index while choosing where to add (keyboard / hover). */
  pathAddCandidateIndex: number | null
  /** Edit points (handles) vs whole-path translation while in Edit path mode. */
  pathTool: PathEditTool
  /**
   * True while a pointer/keyboard path gesture is in flight (including before
   * the drag threshold). Floating panels must not steal Escape meanwhile.
   */
  pathGestureActive: boolean
  /** Non-destructive Polish motion preview (null when inactive). */
  polishSession: PolishSession | null
  /**
   * Last-used Polish strength per actor id. Local UI preference only — not
   * project data, not exported, not autosaved. Survives Cancel/reopen in-session.
   */
  polishStrengthByActorId: Record<string, number>
  /** Non-destructive Glide timing preview (null when inactive). */
  glideSession: GlideSession | null
  /** Previous glide amounts for undo (selected actor). */
  glideUndoStack: number[]
  glideRedoStack: number[]

  selectedTransformId: string | null
  transformUndoStack: TransformTrack[]
  transformRedoStack: TransformTrack[]

  /** Selection-scoped clip timing history (one gesture → one entry). */
  clipUndoStack: ActorClip[]
  clipRedoStack: ActorClip[]

  /** Selection-scoped unrecorded placement history (one drag → one entry). */
  placementUndoStack: Vec2[]
  placementRedoStack: Vec2[]

  /**
   * Chronological order of completed placement/clip/transform edits for the
   * selected actor. Dock + keyboard undo/redo pop the most recent kind first.
   */
  actorEditOrder: ActorEditKind[]
  actorEditRedoOrder: ActorEditKind[]

  stageHint: 'default' | 'new-project'
  actionAnnouncement: string | null

  armRecording: () => void
  cancelArm: () => void
  beginRecording: (pointerId: number, position: Vec2) => void
  pushLiveSample: (position: Vec2) => void
  finishRecording: (recording: Recording | null) => void
  setIdle: () => void

  setLivePosition: (position: Vec2) => void
  /**
   * Silently set rest + live (no history). Prefer
   * {@link commitActorPlacement} for user placement drags.
   */
  setRestPosition: (position: Vec2) => void
  /**
   * Commit unrecorded actor placement as one undo entry (no-op if unchanged
   * or the actor already has a recording).
   */
  commitActorPlacement: (position: Vec2) => void
  undoPlacement: () => void
  redoPlacement: () => void
  clearLiveTrail: () => void

  play: () => void
  pause: () => void
  restartPlayback: () => void
  scrubPlayback: (tNorm: number) => void
  setPlaybackHead: (tNorm: number) => void
  setPlaybackDirection: (direction: PlaybackDirection) => void
  setPlaybackSample: (tNorm: number, direction: PlaybackDirection) => void
  stopPlayback: () => void

  setDurationMs: (ms: number) => void
  setSmoothing: (value: number) => void
  setSteadySpeed: (value: number) => void
  setLoop: (loop: boolean) => void
  setLoopMode: (loopMode: LoopMode) => void
  setPlaybackTrigger: (trigger: PlaybackTrigger) => void
  setShowPathComparison: (show: boolean) => void
  setSnapToGrid: (on: boolean) => void
  setSnapIndicator: (point: Vec2 | null) => void
  setActorColor: (color: string) => void
  setActorSize: (size: number) => void
  setActorBorderRadius: (radius: number) => void
  setActorKind: (kind: 'shape' | 'image' | 'text') => void
  setActorImage: (image: ActorImageAsset) => void
  clearActorImage: () => void
  setActorImageLabel: (label: string) => void
  setActorTextContent: (content: string) => void
  setActorTextFontSize: (fontSize: number) => void
  setActorTextWeight: (weight: 400 | 700) => void
  setActorTextAlign: (align: 'left' | 'center' | 'right') => void
  setActorTextFontFamily: (fontFamily: 'system' | 'serif' | 'mono') => void
  setFaceAlongPath: (on: boolean) => void
  setDirectionOffsetDeg: (degrees: number) => void
  /** Clear the selected actor’s recording, path edits, and transform track. */
  resetRecording: () => void

  /**
   * Create a fresh board with the given name.
   * Returns false when the name is invalid (caller should show validation).
   */
  createNamedProject: (name: string) => boolean
  /** Fresh untitled canvas (used by New project). */
  newProject: () => void
  /** Rename the project title only — does not touch actors or history. */
  renameProject: (name: string) => void
  applyPersistedSnapshot: (snapshot: PersistedSnapshot) => void
  hasReplaceableAnimation: () => boolean
  announceAction: (message: string | null) => void

  selectActor: (id: string) => void
  addActor: () => string | null
  duplicateSelectedActor: () => string | null
  deleteSelectedActor: () => boolean
  renameSelectedActor: (name: string) => void
  /** Rename a specific actor by id (ignores selection). */
  renameActor: (id: string, name: string) => void
  moveSelectedActor: (direction: -1 | 1) => void

  /** Commit a full clip replace for an actor (one undo step). */
  commitActorClip: (id: string, clip: ActorClip) => void
  /** Live preview while dragging (no history). */
  previewActorClip: (id: string, clip: ActorClip) => void
  /** Begin a clip drag/resize; pairs with finishClipGesture. */
  beginClipGesture: (id: string) => void
  finishClipGesture: (id: string, clip: ActorClip) => void
  undoClip: () => void
  redoClip: () => void
  /** Undo the most recent placement, clip, or transform edit for the selected actor. */
  undoActorEdit: () => void
  redoActorEdit: () => void

  enterEditMode: () => void
  exitEditMode: () => void
  restoreRecordedPath: () => void
  setSelectedHandleIndex: (index: number | null) => void
  setPathAddMode: (on: boolean) => void
  setPathAddCandidateIndex: (index: number | null) => void
  setPathTool: (tool: PathEditTool) => void
  setPathGestureActive: (active: boolean) => void
  /** Add handle at sample index; geometry unchanged. Returns false on failure. */
  addPathHandleAt: (sampleIndex: number) => boolean
  /** Remove selected interior handle; geometry unchanged. */
  removeSelectedPathHandle: () => boolean
  /** Local Smooth bend at the selected interior handle. */
  smoothSelectedBend: () => boolean
  /** Local Make corner at the selected interior handle. */
  makeSelectedCorner: () => boolean
  beginHandleDrag: () => void
  updateEditPreview: (samples: MotionSample[]) => void
  commitHandleEdit: (samples: MotionSample[]) => void
  cancelHandleDrag: () => void
  undoEdit: () => void
  redoEdit: () => void

  beginPolishSession: () => boolean
  setPolishStrength: (strength: number) => void
  setPolishAllowRounding: (allow: boolean) => void
  applyPolish: () => boolean
  cancelPolish: () => void

  beginGlideSession: () => boolean
  setGlideCompareMode: (mode: 'original' | 'glide') => void
  setGlideStrength: (strength: number) => void
  applyGlide: () => boolean
  cancelGlide: () => void
  undoGlide: () => void
  redoGlide: () => void

  selectTransformKeyframe: (id: string | null) => void
  upsertTransformAtPlayhead: (rotationDeg: number, scale: number) => void
  commitTransformKeyframe: (input: {
    id: string
    t: number
    rotationDeg: number
    scale: number
  }) => void
  deleteSelectedTransform: () => void
  undoTransform: () => void
  redoTransform: () => void
}

function clearEditState() {
  return {
    geometryEdit: null as GeometryEdit | null,
    editSession: null as GeometryEdit | null,
    undoStack: [] as GeometryEdit[],
    redoStack: [] as GeometryEdit[],
    selectedHandleIndex: null as number | null,
    editPreview: null as MotionSample[] | null,
    pathAddMode: false,
    pathAddCandidateIndex: null as number | null,
    pathTool: 'edit-points' as PathEditTool,
    pathGestureActive: false,
    polishSession: null as PolishSession | null,
    glideSession: null as GlideSession | null,
  }
}

function rememberedPolishStrength(
  byActor: Record<string, number>,
  actorId: string,
): number {
  const remembered = byActor[actorId]
  return typeof remembered === 'number'
    ? clamp(remembered, 0, 1)
    : DEFAULT_POLISH_STRENGTH
}

function withPolishStrengthPreference(
  byActor: Record<string, number>,
  actorId: string,
  strength: number,
): Record<string, number> {
  return { ...byActor, [actorId]: clamp(strength, 0, 1) }
}

function runPolishPreview(
  baseline: GeometryEdit,
  strength: number,
  stageAspect: number,
  rounding: {
    targetIndex: number | null
    allowRoundingAtPoint: boolean
    unavailableReason: string | null
    neighborhood: { lo: number; hi: number } | null
  },
): Omit<PolishSession, 'baseline' | 'strength'> {
  const relax =
    rounding.allowRoundingAtPoint && rounding.targetIndex !== null
      ? rounding.targetIndex
      : null
  const result = polishMotion(baseline.samples, {
    strength,
    stageAspect,
    anchorIndices: baseline.handleIndices,
    relaxCornerAtIndex: relax,
  })
  return {
    previewSamples: result.samples,
    changed: result.changed,
    reason: result.reason ?? null,
    timingAdjusted: result.timingAdjusted,
    maxDeviation: result.maxDeviation,
    roundingTargetIndex: rounding.targetIndex,
    allowRoundingAtPoint: rounding.allowRoundingAtPoint,
    roundingUnavailableReason: rounding.unavailableReason,
    roundingNeighborhood: rounding.neighborhood,
  }
}

function resolvePolishRounding(
  baseline: GeometryEdit,
  selectedHandleIndex: number | null,
  stageAspect: number,
): {
  targetIndex: number | null
  allowRoundingAtPoint: boolean
  unavailableReason: string | null
  neighborhood: { lo: number; hi: number } | null
} {
  const availability = polishRoundingAvailability(
    baseline.samples,
    baseline.handleIndices,
    selectedHandleIndex,
    stageAspect,
  )
  const targetIndex =
    selectedHandleIndex !== null &&
    baseline.handleIndices.includes(selectedHandleIndex)
      ? selectedHandleIndex
      : null
  return {
    targetIndex,
    allowRoundingAtPoint: false,
    unavailableReason: availability.enabled
      ? null
      : (availability.message ?? 'Rounding unavailable at this point.'),
    neighborhood: availability.neighborhood,
  }
}

function geometryMirror(edit: GeometryEdit | null | undefined): GeometryEdit | null {
  return edit ? copyGeometryEdit(edit) : null
}

function clearTransformEditState() {
  return {
    selectedTransformId: null as string | null,
    transformUndoStack: [] as TransformTrack[],
    transformRedoStack: [] as TransformTrack[],
  }
}

function clearClipEditState() {
  return {
    clipUndoStack: [] as ActorClip[],
    clipRedoStack: [] as ActorClip[],
  }
}

function clearPlacementEditState() {
  return {
    placementUndoStack: [] as Vec2[],
    placementRedoStack: [] as Vec2[],
  }
}

function clearActorEditOrder() {
  return {
    actorEditOrder: [] as ActorEditKind[],
    actorEditRedoOrder: [] as ActorEditKind[],
  }
}

/** Drop placement entries once a take starts or the actor becomes recorded. */
function clearPlacementHistory(state: {
  actorEditOrder: ActorEditKind[]
  actorEditRedoOrder: ActorEditKind[]
}) {
  return {
    ...clearPlacementEditState(),
    actorEditOrder: state.actorEditOrder.filter((k) => k !== 'placement'),
    actorEditRedoOrder: state.actorEditRedoOrder.filter(
      (k) => k !== 'placement',
    ),
  }
}

/** History is selection-scoped: changing actors drops undo/redo stacks. */
function clearHistoryForActorSwitch() {
  return {
    ...clearEditState(),
    ...clearTransformEditState(),
    ...clearClipEditState(),
    ...clearPlacementEditState(),
    ...clearActorEditOrder(),
    glideUndoStack: [] as number[],
    glideRedoStack: [] as number[],
  }
}

function popKindFromOrder(
  order: ActorEditKind[],
  kind: ActorEditKind,
): ActorEditKind[] {
  const next: ActorEditKind[] = [...order]
  const idx = next.lastIndexOf(kind)
  if (idx >= 0) next.splice(idx, 1)
  return next
}

function pushEditOrder(
  order: ActorEditKind[],
  kind: ActorEditKind,
): ActorEditKind[] {
  return [...order, kind].slice(-MAX_UNDO)
}

let clipGestureBaseline: { id: string; clip: ActorClip } | null = null

function getSelected(state: {
  project: Project
  selectedActorId: string
}): SceneActor {
  return (
    findActor(state.project.actors, state.selectedActorId) ??
    state.project.actors[0]
  )
}

function withSelectedActor(
  project: Project,
  selectedActorId: string,
  updater: (actor: SceneActor) => SceneActor,
): Project {
  return {
    ...project,
    actors: mapActor(project.actors, selectedActorId, updater),
  }
}

function pushTransformHistory(
  state: EditorStore,
  nextTrack: TransformTrack,
  selectedId: string | null,
): Partial<EditorStore> {
  const actor = getSelected(state)
  const prev = cloneTransformTrack(actor.transform)
  return {
    project: withSelectedActor(state.project, state.selectedActorId, (a) => ({
      ...a,
      transform: nextTrack,
    })),
    selectedTransformId: selectedId,
    transformUndoStack: [...state.transformUndoStack, prev].slice(-MAX_UNDO),
    transformRedoStack: [],
    // New transform action clears all actor-edit redo.
    clipRedoStack: [],
    placementRedoStack: [],
    actorEditOrder: pushEditOrder(state.actorEditOrder, 'transform'),
    actorEditRedoOrder: [],
  }
}

function initialProject(): Project {
  const project = createEmptyPersistableProject()
  return project
}

export const useEditorStore = create<EditorStore>((set, get) => {
  const project = initialProject()
  const firstId = project.actors[0].id

  return {
    project,
    selectedActorId: firstId,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0,
    playbackDirection: 1,
    playbackEpoch: 0,
    livePosition: { ...DEFAULT_REST_POSITION },
    liveTrail: [],
    showPathComparison: false,
    snapToGrid: false,
    snapIndicator: null,
    stageHint: 'default',
    actionAnnouncement: null,
    polishStrengthByActorId: {},
    glideUndoStack: [] as number[],
    glideRedoStack: [] as number[],
    ...clearEditState(),
    ...clearTransformEditState(),
    ...clearClipEditState(),
    ...clearPlacementEditState(),
    ...clearActorEditOrder(),

    armRecording: () => {
      const { mode } = get()
      if (mode === 'playing' || mode === 'editing') return
      set({
        mode: 'armed',
        liveTrail: [],
        stageHint: 'default',
        actionAnnouncement: 'Ready — drag the actor.',
      })
    },

    cancelArm: () => {
      if (get().mode === 'armed') {
        set({ mode: 'idle', pointerId: null, actionAnnouncement: null })
      }
    },

    beginRecording: (pointerId, position) => {
      const state = get()
      set({
        mode: 'recording',
        pointerId,
        livePosition: position,
        liveTrail: [position],
        playbackHead: 0,
        playbackDirection: 1,
        stageHint: 'default',
        actionAnnouncement: 'Recording',
        ...clearEditState(),
        ...clearTransformEditState(),
        ...clearPlacementHistory(state),
        // New take on the selected actor clears its transform + path edits.
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            transform: emptyTransformTrack(),
            geometryEdit: null,
          }),
        ),
      })
    },

    pushLiveSample: (position) => {
      set((state) => ({
        livePosition: position,
        liveTrail: [...state.liveTrail, position],
      }))
    },

    finishRecording: (recording) => {
      set((state) => {
        const nextProject = withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            recording,
            // Shared Duration is unchanged — take is mapped to normalized progress.
            transform: emptyTransformTrack(),
            geometryEdit: null,
            restPosition: recording
              ? restPositionFromRecording(recording, a.restPosition)
              : a.restPosition,
          }),
        )
        return {
          mode: 'idle' as const,
          pointerId: null,
          liveTrail: [],
          playbackHead: 0,
          ...clearEditState(),
          ...clearTransformEditState(),
          ...clearPlacementHistory(state),
          project: nextProject,
          livePosition: recording
            ? {
                x: recording.samples[0].x,
                y: recording.samples[0].y,
              }
            : state.livePosition,
        }
      })
    },

    setIdle: () => set({ mode: 'idle', pointerId: null }),

    setLivePosition: (position) => set({ livePosition: position }),

    setRestPosition: (position) =>
      set((state) => ({
        livePosition: {
          x: clamp(position.x, 0, 1),
          y: clamp(position.y, 0, 1),
        },
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            restPosition: {
              x: clamp(position.x, 0, 1),
              y: clamp(position.y, 0, 1),
            },
          }),
        ),
      })),

    commitActorPlacement: (position) => {
      const state = get()
      const actor = getSelected(state)
      if (actor.recording) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing' ||
        state.mode === 'playing'
      ) {
        return
      }
      const next = {
        x: clamp(position.x, 0, 1),
        y: clamp(position.y, 0, 1),
      }
      const prev = cloneRestPosition(actor.restPosition)
      if (restPositionsEqual(prev, next)) {
        // Keep live/rest aligned without a history entry.
        set({ livePosition: next })
        return
      }
      set({
        livePosition: next,
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, restPosition: next }),
        ),
        placementUndoStack: [...state.placementUndoStack, prev].slice(
          -MAX_UNDO,
        ),
        placementRedoStack: [],
        clipRedoStack: [],
        transformRedoStack: [],
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'placement'),
        actorEditRedoOrder: [],
      })
    },

    undoPlacement: () => {
      const state = get()
      if (state.placementUndoStack.length === 0) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing' ||
        state.mode === 'playing'
      ) {
        return
      }
      const actor = getSelected(state)
      if (actor.recording) return
      const previous =
        state.placementUndoStack[state.placementUndoStack.length - 1]!
      const current = cloneRestPosition(actor.restPosition)
      const restored = cloneRestPosition(previous)
      set({
        livePosition: restored,
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, restPosition: restored }),
        ),
        placementUndoStack: state.placementUndoStack.slice(0, -1),
        placementRedoStack: [...state.placementRedoStack, current].slice(
          -MAX_UNDO,
        ),
        actorEditOrder: popKindFromOrder(state.actorEditOrder, 'placement'),
        actorEditRedoOrder: pushEditOrder(
          state.actorEditRedoOrder,
          'placement',
        ),
      })
    },

    redoPlacement: () => {
      const state = get()
      if (state.placementRedoStack.length === 0) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing' ||
        state.mode === 'playing'
      ) {
        return
      }
      const actor = getSelected(state)
      if (actor.recording) return
      const next = state.placementRedoStack[state.placementRedoStack.length - 1]!
      const current = cloneRestPosition(actor.restPosition)
      const restored = cloneRestPosition(next)
      set({
        livePosition: restored,
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, restPosition: restored }),
        ),
        placementRedoStack: state.placementRedoStack.slice(0, -1),
        placementUndoStack: [...state.placementUndoStack, current].slice(
          -MAX_UNDO,
        ),
        actorEditRedoOrder: popKindFromOrder(
          state.actorEditRedoOrder,
          'placement',
        ),
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'placement'),
      })
    },

    clearLiveTrail: () => set({ liveTrail: [] }),

    play: () => {
      const state = get()
      if (!projectHasAnyRecording(state.project)) return
      // Polish owns a static compare preview; Glide intentionally plays motion.
      if (state.polishSession) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      const atEnd =
        !state.project.playback.loop && state.playbackHead >= 1
      const head = atEnd ? 0 : state.playbackHead
      set({
        mode: 'playing',
        playbackHead: head,
        playbackDirection: atEnd ? 1 : state.playbackDirection,
        playbackEpoch: state.playbackEpoch + 1,
      })
    },

    pause: () => {
      if (get().mode === 'playing') {
        set({ mode: 'idle' })
      }
    },

    restartPlayback: () => {
      const state = get()
      if (!projectHasAnyRecording(state.project)) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      set({
        mode: 'playing',
        playbackHead: 0,
        playbackDirection: 1,
        playbackEpoch: state.playbackEpoch + 1,
      })
    },

    scrubPlayback: (tNorm) => {
      const state = get()
      if (!projectHasAnyRecording(state.project)) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      set({
        mode: 'idle',
        playbackHead: clamp(tNorm, 0, 1),
        playbackDirection: 1,
      })
    },

    setPlaybackHead: (tNorm) => set({ playbackHead: clamp(tNorm, 0, 1) }),

    setPlaybackDirection: (direction) => set({ playbackDirection: direction }),

    setPlaybackSample: (tNorm, direction) =>
      set({
        playbackHead: clamp(tNorm, 0, 1),
        playbackDirection: direction,
      }),

    stopPlayback: () => set({ mode: 'idle' }),

    setDurationMs: (ms) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            durationMs: clamp(
              ms,
              MIN_PLAYBACK_DURATION_MS,
              MAX_PLAYBACK_DURATION_MS,
            ),
          },
        },
      })),

    setSmoothing: (value) => {
      const state = get()
      const actor = getSelected(state)
      if (actor.geometryEdit || state.geometryEdit) return
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, smoothing: clamp(value, 0, 1) }),
        ),
      })
    },

    setSteadySpeed: (value) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, steadySpeed: clamp(value, 0, 1) }),
        ),
      })),

    setLoop: (loop) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            loop,
          },
        },
        playbackEpoch:
          state.mode === 'playing'
            ? state.playbackEpoch + 1
            : state.playbackEpoch,
        playbackDirection: loop ? state.playbackDirection : 1,
      })),

    setLoopMode: (loopMode) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            loopMode,
          },
        },
        playbackEpoch:
          state.mode === 'playing'
            ? state.playbackEpoch + 1
            : state.playbackEpoch,
        playbackDirection: loopMode === 'repeat' ? 1 : state.playbackDirection,
      })),

    setPlaybackTrigger: (trigger) =>
      set((state) => ({
        project: {
          ...state.project,
          playback: {
            ...state.project.playback,
            trigger,
          },
        },
      })),

    setShowPathComparison: (show) => set({ showPathComparison: show }),

    setSnapToGrid: (on) =>
      set({
        snapToGrid: !!on,
        // Clearing the marker when disabling avoids a stale chrome hint.
        snapIndicator: on ? get().snapIndicator : null,
      }),

    setSnapIndicator: (point) => set({ snapIndicator: point }),

    setActorColor: (color) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              color: normalizeActorColor(color) ?? a.appearance.color,
            },
          }),
        ),
      })),

    setActorSize: (size) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const next = clampActorSize(size)
            return {
              ...a,
              appearance: {
                ...a.appearance,
                width: next,
                height:
                  a.appearance.kind === 'shape' || a.appearance.kind === 'text'
                    ? next
                    : a.appearance.height,
              },
            }
          },
        ),
      })),

    setActorBorderRadius: (radius) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              borderRadius: clampActorBorderRadius(radius),
            },
          }),
        ),
      })),

    setActorKind: (kind) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            if (kind === 'image' && !a.appearance.image) return a
            let appearance = { ...a.appearance, kind }
            if (kind === 'text') {
              appearance = ensureActorText(appearance)
              appearance = {
                ...appearance,
                kind: 'text',
                height: appearance.width,
                text: appearance.text ?? { ...DEFAULT_ACTOR_TEXT },
              }
            } else if (kind === 'shape') {
              appearance = {
                ...appearance,
                height: appearance.width,
              }
            }
            return { ...a, appearance }
          },
        ),
      })),

    setActorImage: (image) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              kind: 'image',
              image: { ...image },
            },
          }),
        ),
      })),

    clearActorImage: () =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            appearance: {
              ...a.appearance,
              kind: 'shape',
              height: a.appearance.width,
              image: null,
            },
          }),
        ),
      })),

    setActorImageLabel: (label) =>
      set((state) => {
        const actor = getSelected(state)
        if (!actor.appearance.image) return state
        const next = label.trim().slice(0, 64) || 'Image'
        return {
          project: withSelectedActor(
            state.project,
            state.selectedActorId,
            (a) => ({
              ...a,
              appearance: {
                ...a.appearance,
                image: a.appearance.image
                  ? { ...a.appearance.image, label: next }
                  : null,
              },
            }),
          ),
        }
      }),

    setActorTextContent: (content) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const base = ensureActorText(a.appearance)
            const text = base.text ?? { ...DEFAULT_ACTOR_TEXT }
            return {
              ...a,
              appearance: {
                ...base,
                text: {
                  ...text,
                  content: sanitizeActorTextContent(content),
                },
              },
            }
          },
        ),
      })),

    setActorTextFontSize: (fontSize) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const base = ensureActorText(a.appearance)
            const text = base.text ?? { ...DEFAULT_ACTOR_TEXT }
            return {
              ...a,
              appearance: {
                ...base,
                text: {
                  ...text,
                  fontSize: clampActorTextFontSize(fontSize),
                },
              },
            }
          },
        ),
      })),

    setActorTextWeight: (weight) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const base = ensureActorText(a.appearance)
            const text = base.text ?? { ...DEFAULT_ACTOR_TEXT }
            return {
              ...a,
              appearance: {
                ...base,
                text: { ...text, fontWeight: weight === 700 ? 700 : 400 },
              },
            }
          },
        ),
      })),

    setActorTextAlign: (align: ActorTextAlign) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const base = ensureActorText(a.appearance)
            const text = base.text ?? { ...DEFAULT_ACTOR_TEXT }
            return {
              ...a,
              appearance: {
                ...base,
                text: { ...text, align },
              },
            }
          },
        ),
      })),

    setActorTextFontFamily: (fontFamily: ActorTextFont) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => {
            const base = ensureActorText(a.appearance)
            const text = base.text ?? { ...DEFAULT_ACTOR_TEXT }
            return {
              ...a,
              appearance: {
                ...base,
                text: { ...text, fontFamily },
              },
            }
          },
        ),
      })),

    setFaceAlongPath: (on) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, faceAlongPath: !!on }),
        ),
      })),

    setDirectionOffsetDeg: (degrees) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({
            ...a,
            directionOffsetDeg: clampDirectionOffsetDeg(degrees),
          }),
        ),
      })),

    resetRecording: () =>
      set((state) => {
        const actor = getSelected(state)
        return {
          mode: 'idle' as const,
          pointerId: null,
          playbackHead: 0,
          playbackDirection: 1 as const,
          liveTrail: [],
          livePosition: { ...actor.restPosition },
          ...clearEditState(),
          ...clearTransformEditState(),
          ...clearPlacementHistory(state),
          project: withSelectedActor(
            state.project,
            state.selectedActorId,
            (a) => ({
              ...a,
              recording: null,
              transform: emptyTransformTrack(),
              geometryEdit: null,
            }),
          ),
        }
      }),

    createNamedProject: (name) => {
      if (!isValidProjectName(name)) return false
      cancelIdleDrag()
      const project = createEmptyPersistableProject(
        captureViewportStageAspect(),
        sanitizeProjectName(name),
      )
      set({
        mode: 'idle',
        pointerId: null,
        playbackHead: 0,
        playbackDirection: 1,
        playbackEpoch: get().playbackEpoch + 1,
        liveTrail: [],
        livePosition: { ...DEFAULT_REST_POSITION },
        showPathComparison: false,
        stageHint: 'new-project',
        actionAnnouncement:
          project.name === DEFAULT_PROJECT_NAME
            ? 'New project ready. Click Record to create an animation.'
            : `Created “${project.name}”. You can start drawing.`,
        selectedActorId: project.actors[0].id,
        ...clearHistoryForActorSwitch(),
        polishStrengthByActorId: {},
        project,
      })
      return true
    },

    newProject: () => {
      get().createNamedProject(DEFAULT_PROJECT_NAME)
    },

    renameProject: (name) => {
      const state = get()
      const next = commitProjectName(name, state.project.name)
      if (next === state.project.name) return
      set({
        project: {
          ...state.project,
          name: next,
        },
      })
    },

    applyPersistedSnapshot: (snapshot) => {
      cancelIdleDrag()
      const project: Project = {
        version: 1,
        name:
          sanitizeProjectName(snapshot.project.name) || DEFAULT_PROJECT_NAME,
        actors: snapshot.project.actors.map((a) => cloneSceneActor(a)),
        playback: { ...snapshot.project.playback },
        // Preserve the snapshot’s authored aspect (examples and imports).
        stageAspect: clampStageAspect(snapshot.project.stageAspect),
      }
      const first = project.actors[0] ?? createSceneActor({ name: 'Actor 1' })
      if (project.actors.length === 0) {
        project.actors = [first]
      }
      const selectedActorId = first.id
      set({
        mode: 'idle',
        pointerId: null,
        playbackHead: 0,
        playbackDirection: 1,
        playbackEpoch: get().playbackEpoch + 1,
        liveTrail: [],
        livePosition: { ...first.restPosition },
        showPathComparison: false,
        stageHint: 'default',
        selectedActorId,
        ...clearHistoryForActorSwitch(),
        polishStrengthByActorId: {},
        geometryEdit: geometryMirror(first?.geometryEdit),
        project,
      })
    },

    hasReplaceableAnimation: () => projectHasAnyRecording(get().project),

    announceAction: (message) => set({ actionAnnouncement: message }),

    selectActor: (id) => {
      const state = get()
      if (!findActor(state.project.actors, id)) return
      if (id === state.selectedActorId) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      cancelIdleDrag()
      const actor = findActor(state.project.actors, id)!
      const livePosition = selectActorPositionForActor(
        state.project,
        actor,
        state.playbackHead,
        actor.restPosition,
        state.mode,
        {
          geometryEdit: actor.geometryEdit,
          editSession: null,
          editPreview: null,
        },
        false,
      )
      // Keep per-actor strength prefs; drop only the active preview.
      const polishStrengthByActorId = state.polishSession
        ? withPolishStrengthPreference(
            state.polishStrengthByActorId,
            state.selectedActorId,
            state.polishSession.strength,
          )
        : state.polishStrengthByActorId
      set({
        selectedActorId: id,
        livePosition,
        mode: state.mode === 'playing' ? 'playing' : 'idle',
        polishStrengthByActorId,
        ...clearHistoryForActorSwitch(),
        geometryEdit: geometryMirror(actor.geometryEdit),
      })
    },

    addActor: () => {
      const state = get()
      if (state.project.actors.length >= MAX_ACTORS) {
        set({
          actionAnnouncement: `Actor limit reached (${MAX_ACTORS}).`,
        })
        return null
      }
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return null
      }
      const names = state.project.actors.map((a) => a.name)
      const actor = createSceneActor({
        name: uniqueActorName('Actor', names),
        restPosition: {
          x: clamp(0.35 + state.project.actors.length * 0.06, 0.15, 0.85),
          y: clamp(0.5 + (state.project.actors.length % 3) * 0.05, 0.2, 0.8),
        },
      })
      set({
        project: {
          ...state.project,
          actors: [...state.project.actors, actor],
        },
        selectedActorId: actor.id,
        livePosition: { ...actor.restPosition },
        ...clearHistoryForActorSwitch(),
        actionAnnouncement: `Added ${actor.name}.`,
      })
      return actor.id
    },

    duplicateSelectedActor: () => {
      const state = get()
      if (state.project.actors.length >= MAX_ACTORS) {
        set({
          actionAnnouncement: `Actor limit reached (${MAX_ACTORS}).`,
        })
        return null
      }
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return null
      }
      const source = getSelected(state)
      const names = state.project.actors.map((a) => a.name)
      const copy = duplicateSceneActor(
        source,
        uniqueActorName(`${source.name} copy`, names),
      )
      const index = state.project.actors.findIndex((a) => a.id === source.id)
      const actors = [...state.project.actors]
      actors.splice(index + 1, 0, copy)
      set({
        project: { ...state.project, actors },
        selectedActorId: copy.id,
        livePosition: { ...copy.restPosition },
        ...clearHistoryForActorSwitch(),
        geometryEdit: geometryMirror(copy.geometryEdit),
        actionAnnouncement: `Duplicated ${source.name}.`,
      })
      return copy.id
    },

    deleteSelectedActor: () => {
      const state = get()
      if (state.project.actors.length <= 1) {
        set({ actionAnnouncement: 'At least one actor is required.' })
        return false
      }
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return false
      }
      cancelIdleDrag()
      const id = state.selectedActorId
      const index = state.project.actors.findIndex((a) => a.id === id)
      const actors = state.project.actors.filter((a) => a.id !== id)
      const next = actors[Math.max(0, index - 1)] ?? actors[0]
      set({
        project: { ...state.project, actors },
        selectedActorId: next.id,
        livePosition: { ...next.restPosition },
        ...clearHistoryForActorSwitch(),
        geometryEdit: geometryMirror(next.geometryEdit),
        actionAnnouncement: 'Actor deleted.',
      })
      return true
    },

    renameSelectedActor: (name) =>
      set((state) => ({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, name: sanitizeActorName(name) }),
        ),
      })),

    renameActor: (id, name) =>
      set((state) => {
        if (!findActor(state.project.actors, id)) return state
        return {
          project: {
            ...state.project,
            actors: mapActor(state.project.actors, id, (a) => ({
              ...a,
              name: sanitizeActorName(name),
            })),
          },
        }
      }),

    commitActorClip: (id, clip) => {
      const state = get()
      const actor = findActor(state.project.actors, id)
      if (!actor) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const next = clampClip(clip)
      const prev = cloneClip(actor.clip)
      if (clipsEqual(prev, next)) return
      set({
        project: {
          ...state.project,
          actors: mapActor(state.project.actors, id, (a) => ({
            ...a,
            clip: next,
          })),
        },
        selectedActorId: id,
        clipUndoStack: [...state.clipUndoStack, prev].slice(-MAX_UNDO),
        clipRedoStack: [],
        transformRedoStack: [],
        placementRedoStack: [],
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'clip'),
        actorEditRedoOrder: [],
      })
    },

    previewActorClip: (id, clip) => {
      const state = get()
      if (!findActor(state.project.actors, id)) return
      set({
        project: {
          ...state.project,
          actors: mapActor(state.project.actors, id, (a) => ({
            ...a,
            clip: clampClip(clip),
          })),
        },
      })
    },

    beginClipGesture: (id) => {
      const actor = findActor(get().project.actors, id)
      if (!actor) return
      clipGestureBaseline = { id, clip: cloneClip(actor.clip) }
      if (get().selectedActorId !== id) {
        get().selectActor(id)
      }
    },

    finishClipGesture: (id, clip) => {
      const state = get()
      const actor = findActor(state.project.actors, id)
      if (!actor) {
        clipGestureBaseline = null
        return
      }
      const next = clampClip(clip)
      const baseline =
        clipGestureBaseline?.id === id
          ? clipGestureBaseline.clip
          : cloneClip(actor.clip)
      clipGestureBaseline = null
      if (clipsEqual(baseline, next)) {
        set({
          project: {
            ...state.project,
            actors: mapActor(state.project.actors, id, (a) => ({
              ...a,
              clip: next,
            })),
          },
        })
        return
      }
      set({
        project: {
          ...state.project,
          actors: mapActor(state.project.actors, id, (a) => ({
            ...a,
            clip: next,
          })),
        },
        selectedActorId: id,
        clipUndoStack: [...state.clipUndoStack, baseline].slice(-MAX_UNDO),
        clipRedoStack: [],
        transformRedoStack: [],
        placementRedoStack: [],
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'clip'),
        actorEditRedoOrder: [],
      })
    },

    undoClip: () => {
      const state = get()
      if (state.clipUndoStack.length === 0) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const previous = state.clipUndoStack[state.clipUndoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneClip(actor.clip)
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, clip: cloneClip(previous) }),
        ),
        clipUndoStack: state.clipUndoStack.slice(0, -1),
        clipRedoStack: [...state.clipRedoStack, current].slice(-MAX_UNDO),
        actorEditOrder: popKindFromOrder(state.actorEditOrder, 'clip'),
        actorEditRedoOrder: pushEditOrder(state.actorEditRedoOrder, 'clip'),
      })
    },

    redoClip: () => {
      const state = get()
      if (state.clipRedoStack.length === 0) return
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const next = state.clipRedoStack[state.clipRedoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneClip(actor.clip)
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, clip: cloneClip(next) }),
        ),
        clipRedoStack: state.clipRedoStack.slice(0, -1),
        clipUndoStack: [...state.clipUndoStack, current].slice(-MAX_UNDO),
        actorEditRedoOrder: popKindFromOrder(state.actorEditRedoOrder, 'clip'),
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'clip'),
      })
    },

    undoActorEdit: () => {
      const state = get()
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const kind = state.actorEditOrder[state.actorEditOrder.length - 1]
      if (kind === 'transform') {
        get().undoTransform()
        return
      }
      if (kind === 'clip') {
        get().undoClip()
        return
      }
      if (kind === 'placement') {
        get().undoPlacement()
        return
      }
      if (kind === 'glide') {
        get().undoGlide()
      }
    },

    redoActorEdit: () => {
      const state = get()
      if (
        state.mode === 'recording' ||
        state.mode === 'armed' ||
        state.mode === 'editing'
      ) {
        return
      }
      const kind = state.actorEditRedoOrder[state.actorEditRedoOrder.length - 1]
      if (kind === 'transform') {
        get().redoTransform()
        return
      }
      if (kind === 'clip') {
        get().redoClip()
        return
      }
      if (kind === 'placement') {
        get().redoPlacement()
        return
      }
      if (kind === 'glide') {
        get().redoGlide()
      }
    },

    moveSelectedActor: (direction) =>
      set((state) => {
        const index = state.project.actors.findIndex(
          (a) => a.id === state.selectedActorId,
        )
        const target = index + direction
        if (index < 0 || target < 0 || target >= state.project.actors.length) {
          return state
        }
        const actors = [...state.project.actors]
        const [item] = actors.splice(index, 1)
        actors.splice(target, 0, item)
        return { project: { ...state.project, actors } }
      }),

    enterEditMode: () => {
      const state = get()
      const actor = getSelected(state)
      if (!actor.recording) return
      if (state.mode === 'recording' || state.mode === 'armed') return

      const source = state.geometryEdit ?? actor.geometryEdit
      const samples = source
        ? copyPath(source.samples)
        : bakeEditablePathForActor(state.project, actor)
      if (samples.length < 2) return

      const editSession = makeGeometryEdit(
        samples,
        source?.bakedSmoothing ?? actor.smoothing,
        source?.handleIndices,
      )
      const selected = state.selectedHandleIndex ?? 0

      set({
        mode: 'editing',
        editSession,
        editPreview: null,
        selectedHandleIndex: selected,
        selectedTransformId: null,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        pathTool: 'edit-points',
        polishSession: null,
        glideSession: null,
        // Mode transition once; selected-point copy lives in handle-selection-status.
        actionAnnouncement: 'Edit points',
      })
    },

    exitEditMode: () => {
      if (get().mode !== 'editing') return
      set({
        mode: 'idle',
        editSession: null,
        editPreview: null,
        pointerId: null,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        pathTool: 'edit-points',
        polishSession: null,
        snapIndicator: null,
      })
    },

    restoreRecordedPath: () => {
      const state = get()
      const wasEditing = state.mode === 'editing'
      const nextProject = withSelectedActor(
        state.project,
        state.selectedActorId,
        (a) => ({ ...a, geometryEdit: null }),
      )
      set({
        project: nextProject,
        geometryEdit: null,
        undoStack: [],
        redoStack: [],
        editPreview: null,
        selectedHandleIndex: wasEditing ? 0 : null,
        editSession: null,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        pathTool: 'edit-points',
      })

      if (wasEditing) {
        const actor = getSelected(get())
        const baked = bakeEditablePathForActor(get().project, actor)
        if (baked.length >= 2) {
          set({
            mode: 'editing',
            editSession: makeGeometryEdit(baked, actor.smoothing),
            selectedHandleIndex: 0,
          })
        } else {
          set({ mode: 'idle' })
        }
      }
    },

    setSelectedHandleIndex: (index) => {
      const state = get()
      set({
        selectedHandleIndex: index,
        selectedTransformId: index !== null ? null : state.selectedTransformId,
        // Keep point selection out of actionAnnouncement (see handle-selection-status).
      })
    },

    setPathAddMode: (on) => {
      const state = get()
      if (state.mode !== 'editing') return
      const session = state.editSession
      if (
        on &&
        session &&
        session.handleIndices.length >= MAX_PATH_HANDLES
      ) {
        set({
          actionAnnouncement: `Handle limit reached (${MAX_PATH_HANDLES} of ${MAX_PATH_HANDLES}). Remove a handle before adding another.`,
        })
        return
      }
      const mid =
        session && session.samples.length >= 2
          ? Math.floor(session.samples.length / 2)
          : null
      set({
        pathTool: 'edit-points',
        pathAddMode: on,
        pathAddCandidateIndex: on ? (state.pathAddCandidateIndex ?? mid) : null,
        editPreview: on ? null : state.editPreview,
        actionAnnouncement: on ? 'Add point' : 'Edit points',
      })
    },

    setPathAddCandidateIndex: (index) => set({ pathAddCandidateIndex: index }),

    setPathTool: (tool) => {
      const state = get()
      if (state.mode !== 'editing') return
      if (tool === state.pathTool) return
      set({
        pathTool: tool,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        editPreview: null,
        pathGestureActive: false,
        actionAnnouncement: tool === 'move-path' ? 'Move path' : 'Edit points',
      })
    },

    setPathGestureActive: (active) => {
      if (get().pathGestureActive === active) return
      set({ pathGestureActive: active })
    },

    addPathHandleAt: (sampleIndex) => {
      const state = get()
      if (state.mode !== 'editing') return false
      const base = state.editSession ?? state.geometryEdit
      if (!base) return false
      const result = addHandleIndex(
        base.samples.length,
        base.handleIndices,
        sampleIndex,
      )
      if (!result.ok) {
        const message =
          result.reason === 'duplicate'
            ? 'A handle is already on that point.'
            : result.reason === 'max'
              ? `Handle limit reached (${MAX_PATH_HANDLES} of ${MAX_PATH_HANDLES}). Remove a handle before adding another.`
              : result.reason === 'endpoint'
                ? 'Start and end already have handles — pick a point between them.'
                : 'Could not add a handle there.'
        set({ actionAnnouncement: message })
        return false
      }
      const previous = copyGeometryEdit(base)
      const next = makeGeometryEdit(
        base.samples,
        base.bakedSmoothing,
        result.handleIndices,
      )
      const ordinal = next.handleIndices.indexOf(result.sampleIndex) + 1
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: next,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        selectedHandleIndex: result.sampleIndex,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        editPreview: null,
        actionAnnouncement: `Handle added — point ${ordinal} of ${next.handleIndices.length}. Drag it to reshape that bend.`,
      })
      return true
    },

    removeSelectedPathHandle: () => {
      const state = get()
      if (state.mode !== 'editing') return false
      const base = state.editSession ?? state.geometryEdit
      const selected = state.selectedHandleIndex
      if (!base || selected === null) return false
      const result = removeHandleIndex(
        base.samples.length,
        base.handleIndices,
        selected,
      )
      if (!result.ok) {
        set({
          actionAnnouncement:
            result.reason === 'endpoint'
              ? 'Start and end points can’t be removed — they keep the path anchored.'
              : 'Select an interior handle to remove.',
        })
        return false
      }
      const previous = copyGeometryEdit(base)
      const next = makeGeometryEdit(
        base.samples,
        base.bakedSmoothing,
        result.handleIndices,
      )
      // Prefer a nearby remaining handle for selection.
      const nextSelected =
        result.handleIndices.find((i) => i >= selected) ??
        result.handleIndices[result.handleIndices.length - 1] ??
        0
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: next,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        selectedHandleIndex: nextSelected,
        editPreview: null,
        actionAnnouncement: `Handle removed — ${formatHandleSelectionAnnouncement(
          next.handleIndices,
          nextSelected,
          next.samples.length,
        )} Path shape unchanged.`,
      })
      return true
    },

    smoothSelectedBend: () => {
      const state = get()
      if (state.mode !== 'editing') return false
      const base = state.editSession ?? state.geometryEdit
      const selected = state.selectedHandleIndex
      if (!base || selected === null) {
        set({
          actionAnnouncement: smoothBendAvailability(
            base?.samples ?? [],
            base?.handleIndices ?? [],
            selected,
            state.project.stageAspect,
          ).message,
        })
        return false
      }
      const availability = smoothBendAvailability(
        base.samples,
        base.handleIndices,
        selected,
        state.project.stageAspect,
      )
      if (!availability.enabled) {
        set({ actionAnnouncement: availability.message })
        return false
      }
      const result = smoothBendAtHandle(
        base.samples,
        base.handleIndices,
        selected,
        state.project.stageAspect,
      )
      if (!result.ok) {
        set({
          actionAnnouncement:
            result.reason === 'no-effect'
              ? 'Bend is already smooth here.'
              : (smoothBendAvailability(
                  base.samples,
                  base.handleIndices,
                  selected,
                  state.project.stageAspect,
                ).message ?? 'Could not smooth that bend.'),
        })
        return false
      }
      const previous = copyGeometryEdit(base)
      const next = makeGeometryEdit(
        result.samples,
        base.bakedSmoothing,
        base.handleIndices,
      )
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: next,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        editPreview: null,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        actionAnnouncement:
          'Smoothed the bend at the selected point. Nearby handles stayed put.',
      })
      return true
    },

    makeSelectedCorner: () => {
      const state = get()
      if (state.mode !== 'editing') return false
      const base = state.editSession ?? state.geometryEdit
      const selected = state.selectedHandleIndex
      if (!base || selected === null) {
        set({
          actionAnnouncement: makeCornerAvailability(
            base?.samples ?? [],
            base?.handleIndices ?? [],
            selected,
            state.project.stageAspect,
          ).message,
        })
        return false
      }
      const availability = makeCornerAvailability(
        base.samples,
        base.handleIndices,
        selected,
        state.project.stageAspect,
      )
      if (!availability.enabled) {
        set({ actionAnnouncement: availability.message })
        return false
      }
      const result = makeCornerAtHandle(
        base.samples,
        base.handleIndices,
        selected,
        state.project.stageAspect,
      )
      if (!result.ok) {
        set({
          actionAnnouncement:
            result.reason === 'straight'
              ? 'Path is already straight here — nothing to sharpen.'
              : result.reason === 'no-effect'
                ? 'No meaningful corner change here.'
                : (makeCornerAvailability(
                    base.samples,
                    base.handleIndices,
                    selected,
                    state.project.stageAspect,
                  ).message ?? 'Could not sharpen that corner.'),
        })
        return false
      }
      const previous = copyGeometryEdit(base)
      const next = makeGeometryEdit(
        result.samples,
        base.bakedSmoothing,
        base.handleIndices,
      )
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: next,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        editPreview: null,
        pathAddMode: false,
        pathAddCandidateIndex: null,
        actionAnnouncement:
          'Sharpened the corner at the selected point. Nearby handles stayed put.',
      })
      return true
    },

    beginHandleDrag: () => {
      const state = get()
      if (state.mode !== 'editing') return
      const base = state.editSession
      if (!base) return
      set({
        editPreview: copyPath(base.samples),
        pathAddMode: false,
        pathGestureActive: true,
      })
    },

    updateEditPreview: (samples) => {
      if (get().mode !== 'editing' || !get().editSession) return
      set({ editPreview: samples, pathGestureActive: true })
    },

    commitHandleEdit: (samples) => {
      const state = get()
      // Never commit path geometry outside an active edit session — Done /
      // restore / project load must not absorb a late keyup or pointerup.
      if (state.mode !== 'editing') {
        set({
          editPreview: null,
          pathGestureActive: false,
          snapIndicator: null,
        })
        return
      }
      const base = state.editSession
      if (!base) return

      // Zero-distance / cancelled-equivalent gestures must not create undo noise.
      if (samplesMatch(base.samples, samples)) {
        set({
          editPreview: null,
          pathGestureActive: false,
          snapIndicator: null,
        })
        return
      }

      const previous = copyGeometryEdit(base)
      const next = makeGeometryEdit(
        samples,
        base.bakedSmoothing,
        base.handleIndices,
      )

      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: next,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        editPreview: null,
        pathGestureActive: false,
        snapIndicator: null,
      })
    },

    cancelHandleDrag: () =>
      set({
        editPreview: null,
        pathGestureActive: false,
        snapIndicator: null,
      }),

    undoEdit: () => {
      const state = get()
      if (state.polishSession) return
      const current = state.editSession ?? state.geometryEdit
      if (!current || state.undoStack.length === 0) return

      const previous = state.undoStack[state.undoStack.length - 1]!
      const next = copyGeometryEdit(previous)

      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: state.mode === 'editing' ? next : null,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, copyGeometryEdit(current)].slice(
          -MAX_UNDO,
        ),
        editPreview: null,
        selectedHandleIndex: next.handleIndices.includes(
          state.selectedHandleIndex ?? -1,
        )
          ? state.selectedHandleIndex
          : (next.handleIndices[0] ?? 0),
      })
    },

    redoEdit: () => {
      const state = get()
      if (state.polishSession) return
      const current = state.editSession ?? state.geometryEdit
      if (!current || state.redoStack.length === 0) return

      const restored = state.redoStack[state.redoStack.length - 1]!
      const next = copyGeometryEdit(restored)

      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: state.mode === 'editing' ? next : null,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, copyGeometryEdit(current)].slice(
          -MAX_UNDO,
        ),
        editPreview: null,
        selectedHandleIndex: next.handleIndices.includes(
          state.selectedHandleIndex ?? -1,
        )
          ? state.selectedHandleIndex
          : (next.handleIndices[0] ?? 0),
      })
    },

    beginPolishSession: () => {
      const state = get()
      if (
        state.mode === 'armed' ||
        state.mode === 'recording' ||
        state.mode === 'playing'
      ) {
        return false
      }
      if (state.pathGestureActive || state.editPreview) return false
      if (state.glideSession) get().cancelGlide()
      const actor = getSelected(state)
      if (!actor.recording) return false

      const source =
        state.editSession ??
        state.geometryEdit ??
        actor.geometryEdit ??
        null
      let baseline: GeometryEdit
      if (source) {
        baseline = copyGeometryEdit(source)
      } else {
        const baked = bakeEditablePathForActor(state.project, actor)
        if (baked.length < 2) return false
        baseline = makeGeometryEdit(baked, actor.smoothing)
      }

      const strength = rememberedPolishStrength(
        state.polishStrengthByActorId,
        actor.id,
      )
      const rounding = resolvePolishRounding(
        baseline,
        state.selectedHandleIndex,
        state.project.stageAspect,
      )
      const preview = runPolishPreview(
        baseline,
        strength,
        state.project.stageAspect,
        rounding,
      )
      // Leave Edit path chrome so Polish owns the dock; keep handle selection
      // for the optional “Allow rounding at this point” control.
      set({
        mode: state.mode === 'editing' ? 'idle' : state.mode,
        editSession: null,
        polishSession: {
          baseline,
          strength,
          ...preview,
        },
        pathAddMode: false,
        pathAddCandidateIndex: null,
        pathTool: 'edit-points',
        editPreview: null,
        pointerId: null,
        actionAnnouncement: 'Polish motion preview',
      })
      return true
    },

    setPolishStrength: (strength) => {
      const state = get()
      const session = state.polishSession
      if (!session) return
      const nextStrength = clamp(strength, 0, 1)
      const preview = runPolishPreview(
        session.baseline,
        nextStrength,
        state.project.stageAspect,
        {
          targetIndex: session.roundingTargetIndex,
          allowRoundingAtPoint: session.allowRoundingAtPoint,
          unavailableReason: session.roundingUnavailableReason,
          neighborhood: session.roundingNeighborhood,
        },
      )
      set({
        polishSession: {
          baseline: session.baseline,
          strength: nextStrength,
          ...preview,
        },
        polishStrengthByActorId: withPolishStrengthPreference(
          state.polishStrengthByActorId,
          state.selectedActorId,
          nextStrength,
        ),
      })
    },

    setPolishAllowRounding: (allow) => {
      const state = get()
      const session = state.polishSession
      if (!session) return
      if (session.roundingUnavailableReason && allow) return
      if (session.roundingTargetIndex === null && allow) return
      const preview = runPolishPreview(
        session.baseline,
        session.strength,
        state.project.stageAspect,
        {
          targetIndex: session.roundingTargetIndex,
          allowRoundingAtPoint: allow,
          unavailableReason: session.roundingUnavailableReason,
          neighborhood: session.roundingNeighborhood,
        },
      )
      set({
        polishSession: {
          baseline: session.baseline,
          strength: session.strength,
          ...preview,
        },
      })
    },

    applyPolish: () => {
      const state = get()
      const session = state.polishSession
      if (!session) return false
      const strengthPref = withPolishStrengthPreference(
        state.polishStrengthByActorId,
        state.selectedActorId,
        session.strength,
      )
      if (!session.changed) {
        set({
          polishSession: null,
          polishStrengthByActorId: strengthPref,
          actionAnnouncement:
            session.reason ?? 'Nothing to polish — left unchanged.',
        })
        return false
      }

      const previous = copyGeometryEdit(session.baseline)
      const next = makeGeometryEdit(
        session.previewSamples,
        session.baseline.bakedSmoothing,
        session.baseline.handleIndices,
      )

      const editing = state.mode === 'editing'
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, geometryEdit: next }),
        ),
        geometryEdit: next,
        editSession: editing ? next : state.editSession,
        undoStack: [...state.undoStack, previous].slice(-MAX_UNDO),
        redoStack: [],
        polishSession: null,
        polishStrengthByActorId: strengthPref,
        editPreview: null,
        selectedHandleIndex: editing
          ? next.handleIndices.includes(state.selectedHandleIndex ?? -1)
            ? state.selectedHandleIndex
            : (next.handleIndices[0] ?? 0)
          : state.selectedHandleIndex,
        actionAnnouncement: session.timingAdjusted
          ? 'Polished motion applied. Speed within moving sections may be redistributed; transform keyframes keep the same times.'
          : 'Polished motion applied.',
      })
      return true
    },

    cancelPolish: () => {
      const state = get()
      const session = state.polishSession
      if (!session) return
      set({
        polishSession: null,
        polishStrengthByActorId: withPolishStrengthPreference(
          state.polishStrengthByActorId,
          state.selectedActorId,
          session.strength,
        ),
        actionAnnouncement: 'Polish cancelled.',
      })
    },

    beginGlideSession: () => {
      const state = get()
      if (
        state.mode === 'armed' ||
        state.mode === 'recording' ||
        state.mode === 'playing'
      ) {
        return false
      }
      if (state.pathGestureActive || state.editPreview) return false
      if (state.polishSession) get().cancelPolish()
      const actor = getSelected(state)
      if (!actor.recording) return false

      const strength =
        actor.glide > 0 ? actor.glide : DEFAULT_GLIDE_STRENGTH
      const baselinePath = selectProcessedPathForActor(
        state.project,
        { ...actor, glide: 0 },
        {
          geometryEdit: state.geometryEdit ?? actor.geometryEdit,
          editSession: state.editSession,
          editPreview: null,
          glideOverride: 0,
        },
      )
      const probe = applyGlide(
        baselinePath,
        strength,
        state.project.stageAspect,
      )

      set({
        mode: state.mode === 'editing' ? 'idle' : state.mode,
        editSession: null,
        polishSession: null,
        glideSession: {
          strength,
          compareMode: 'glide',
          changed: probe.changed,
          reason: probe.reason,
          segmentsAdjusted: probe.segmentsAdjusted,
        },
        pathAddMode: false,
        pathAddCandidateIndex: null,
        pathTool: 'edit-points',
        editPreview: null,
        pointerId: null,
        actionAnnouncement: 'Glide timing preview',
      })
      // Start playback so the actor motion difference is visible.
      get().play()
      return true
    },

    setGlideCompareMode: (mode) => {
      const state = get()
      if (!state.glideSession) return
      set({
        glideSession: { ...state.glideSession, compareMode: mode },
      })
      get().restartPlayback()
    },

    setGlideStrength: (strength) => {
      const state = get()
      if (!state.glideSession) return
      const next = clamp(strength, 0, 1)
      const actor = getSelected(state)
      const baselinePath = selectProcessedPathForActor(
        state.project,
        { ...actor, glide: 0 },
        {
          geometryEdit: state.geometryEdit ?? actor.geometryEdit,
          editSession: null,
          editPreview: null,
          glideOverride: 0,
        },
      )
      const probe = applyGlide(baselinePath, next, state.project.stageAspect)
      set({
        glideSession: {
          ...state.glideSession,
          strength: next,
          changed: probe.changed,
          reason: probe.reason,
          segmentsAdjusted: probe.segmentsAdjusted,
        },
      })
    },

    applyGlide: () => {
      const state = get()
      const session = state.glideSession
      if (!session) return false
      const actor = getSelected(state)
      const previous = actor.glide
      const nextStrength = session.strength
      // Strength 0 clears a prior Glide; probe "unchanged" is expected then.
      if (Math.abs(previous - nextStrength) < 1e-9) {
        set({
          glideSession: null,
          mode: 'idle',
          actionAnnouncement:
            nextStrength <= 0 && !session.changed
              ? (session.reason ?? 'Nothing to glide.')
              : 'Glide unchanged.',
        })
        get().pause()
        return false
      }
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, glide: nextStrength }),
        ),
        glideSession: null,
        mode: 'idle',
        glideUndoStack: [...state.glideUndoStack, previous].slice(-MAX_UNDO),
        glideRedoStack: [],
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'glide'),
        actorEditRedoOrder: [],
        actionAnnouncement:
          nextStrength <= 0
            ? 'Glide cleared.'
            : 'Glide applied. Softens starts and stops in moving sections; pauses and path shape stay put. Transform keys keep their times — speed along the path may shift where they appear.',
      })
      get().pause()
      return true
    },

    cancelGlide: () => {
      const state = get()
      if (!state.glideSession) return
      set({
        glideSession: null,
        mode: 'idle',
        actionAnnouncement: 'Glide cancelled.',
      })
      get().pause()
    },

    undoGlide: () => {
      const state = get()
      if (state.glideUndoStack.length === 0) return
      const previous = state.glideUndoStack[state.glideUndoStack.length - 1]!
      const actor = getSelected(state)
      const current = actor.glide
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, glide: previous }),
        ),
        glideUndoStack: state.glideUndoStack.slice(0, -1),
        glideRedoStack: [...state.glideRedoStack, current].slice(-MAX_UNDO),
        actorEditOrder: popKindFromOrder(state.actorEditOrder, 'glide'),
        actorEditRedoOrder: pushEditOrder(state.actorEditRedoOrder, 'glide'),
        actionAnnouncement: 'Undo Glide',
      })
    },

    redoGlide: () => {
      const state = get()
      if (state.glideRedoStack.length === 0) return
      const next = state.glideRedoStack[state.glideRedoStack.length - 1]!
      const actor = getSelected(state)
      const current = actor.glide
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, glide: next }),
        ),
        glideRedoStack: state.glideRedoStack.slice(0, -1),
        glideUndoStack: [...state.glideUndoStack, current].slice(-MAX_UNDO),
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'glide'),
        actorEditRedoOrder: popKindFromOrder(state.actorEditRedoOrder, 'glide'),
        actionAnnouncement: 'Redo Glide',
      })
    },

    selectTransformKeyframe: (id) => {
      const state = get()
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      if (id === null) {
        set({ selectedTransformId: null })
        return
      }
      const actor = getSelected(state)
      const kf = actor.transform.keyframes.find((k) => k.id === id)
      if (!kf) return
      // Keyframe times are actor-local; seek the shared playhead to project time.
      set({
        mode: 'idle',
        selectedTransformId: id,
        selectedHandleIndex: null,
        playbackHead: clamp(localToProject(kf.t, actor.clip), 0, 1),
        playbackDirection: 1,
      })
    },

    upsertTransformAtPlayhead: (rotationDeg, scale) => {
      const state = get()
      const actor = getSelected(state)
      if (!actor.recording) return
      if (
        state.mode === 'editing' ||
        state.mode === 'armed' ||
        state.mode === 'recording'
      ) {
        return
      }
      const t = projectToLocal(state.playbackHead, actor.clip)
      const { track, keyframeId } = upsertTransformKeyframe(actor.transform, {
        t,
        rotationDeg,
        scale,
        id: state.selectedTransformId ?? undefined,
      })
      set({
        mode: 'idle',
        ...pushTransformHistory(state, track, keyframeId),
      })
    },

    commitTransformKeyframe: (input) => {
      const state = get()
      const actor = getSelected(state)
      if (!actor.recording) return
      if (state.mode === 'editing') return
      if (!actor.transform.keyframes.some((k) => k.id === input.id)) return
      const { track, keyframeId } = upsertTransformKeyframe(
        actor.transform,
        input,
      )
      set({
        mode: 'idle',
        playbackHead: clamp(localToProject(input.t, actor.clip), 0, 1),
        ...pushTransformHistory(state, track, keyframeId),
      })
    },

    deleteSelectedTransform: () => {
      const state = get()
      const id = state.selectedTransformId
      if (!id) return
      const actor = getSelected(state)
      if (!actor.transform.keyframes.some((k) => k.id === id)) return
      const next = removeTransformKeyframe(actor.transform, id)
      set({
        ...pushTransformHistory(state, next, null),
      })
    },

    undoTransform: () => {
      const state = get()
      if (state.mode === 'editing') return
      if (state.transformUndoStack.length === 0) return
      const previous =
        state.transformUndoStack[state.transformUndoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneTransformTrack(actor.transform)
      const selectedStill =
        state.selectedTransformId &&
        previous.keyframes.some((k) => k.id === state.selectedTransformId)
          ? state.selectedTransformId
          : null
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, transform: cloneTransformTrack(previous) }),
        ),
        transformUndoStack: state.transformUndoStack.slice(0, -1),
        transformRedoStack: [...state.transformRedoStack, current].slice(
          -MAX_UNDO,
        ),
        selectedTransformId: selectedStill,
        actorEditOrder: popKindFromOrder(state.actorEditOrder, 'transform'),
        actorEditRedoOrder: pushEditOrder(
          state.actorEditRedoOrder,
          'transform',
        ),
      })
    },

    redoTransform: () => {
      const state = get()
      if (state.mode === 'editing') return
      if (state.transformRedoStack.length === 0) return
      const restored =
        state.transformRedoStack[state.transformRedoStack.length - 1]
      const actor = getSelected(state)
      const current = cloneTransformTrack(actor.transform)
      const selectedStill =
        state.selectedTransformId &&
        restored.keyframes.some((k) => k.id === state.selectedTransformId)
          ? state.selectedTransformId
          : null
      set({
        project: withSelectedActor(
          state.project,
          state.selectedActorId,
          (a) => ({ ...a, transform: cloneTransformTrack(restored) }),
        ),
        transformRedoStack: state.transformRedoStack.slice(0, -1),
        transformUndoStack: [...state.transformUndoStack, current].slice(
          -MAX_UNDO,
        ),
        selectedTransformId: selectedStill,
        actorEditRedoOrder: popKindFromOrder(
          state.actorEditRedoOrder,
          'transform',
        ),
        actorEditOrder: pushEditOrder(state.actorEditOrder, 'transform'),
      })
    },
  }
})
