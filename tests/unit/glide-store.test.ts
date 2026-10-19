import { beforeEach, describe, expect, it } from 'vitest'
import { copyPath } from '../../src/core/edit'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import { DEFAULT_GLIDE_STRENGTH } from '../../src/core/glide'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'

function buildUnevenPath(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 50; i++) {
    const u = i / 50
    const t = i === 0 ? 0 : samples[i - 1]!.t + (10 + ((i * 13) % 35))
    samples.push({
      t,
      x: 0.2 + u * 0.6,
      y: 0.4 + Math.sin(u * Math.PI) * 0.15,
    })
  }
  return samples
}

function seedStore(project: Project) {
  const actor = project.actors[0]!
  useEditorStore.setState({
    project,
    selectedActorId: actor.id,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0,
    playbackDirection: 1,
    livePosition: { ...actor.restPosition },
    liveTrail: [],
    showPathComparison: false,
    geometryEdit: actor.geometryEdit
      ? {
          bakedSmoothing: actor.geometryEdit.bakedSmoothing,
          samples: copyPath(actor.geometryEdit.samples),
          handleIndices: [...actor.geometryEdit.handleIndices],
        }
      : null,
    selectedTransformId: null,
    transformUndoStack: [],
    transformRedoStack: [],
    editSession: null,
    undoStack: [],
    redoStack: [],
    selectedHandleIndex: null,
    editPreview: null,
    pathAddMode: false,
    pathAddCandidateIndex: null,
    pathTool: 'edit-points',
    pathGestureActive: false,
    polishSession: null,
    polishStrengthByActorId: {},
    glideSession: null,
    glideUndoStack: [],
    glideRedoStack: [],
    stageHint: 'default',
    actionAnnouncement: null,
    clipUndoStack: [],
    clipRedoStack: [],
    actorEditOrder: [],
    actorEditRedoOrder: [],
    placementUndoStack: [],
    placementRedoStack: [],
  })
}

describe('glide session store', () => {
  beforeEach(() => {
    const samples = buildUnevenPath()
    const actor = createSceneActor({
      id: 'glide-actor',
      name: 'Glide Actor',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      glide: 0,
      steadySpeed: 0,
      smoothing: 0,
    })
    seedStore({
      version: 1,
      name: 'Glide store fixture',
      stageAspect: 1.6,
      playback: {
        durationMs: samples[samples.length - 1]!.t,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
      actors: [actor],
    })
  })

  it('preview does not mutate project or recording', () => {
    const before = JSON.stringify(useEditorStore.getState().project)
    expect(useEditorStore.getState().beginGlideSession()).toBe(true)
    expect(useEditorStore.getState().glideSession).not.toBeNull()
    expect(useEditorStore.getState().glideSession!.strength).toBe(
      DEFAULT_GLIDE_STRENGTH,
    )
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
  })

  it('cancel leaves the project unchanged', () => {
    const before = JSON.stringify(useEditorStore.getState().project)
    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0.9)
    useEditorStore.getState().cancelGlide()
    expect(useEditorStore.getState().glideSession).toBeNull()
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
    expect(useEditorStore.getState().glideUndoStack).toHaveLength(0)
  })

  it('apply writes actor.glide with one undo entry; recording stays intact', () => {
    const recordingBefore = JSON.stringify(
      useEditorStore.getState().project.actors[0]!.recording,
    )
    expect(useEditorStore.getState().beginGlideSession()).toBe(true)
    expect(useEditorStore.getState().applyGlide()).toBe(true)
    expect(useEditorStore.getState().glideSession).toBeNull()
    expect(useEditorStore.getState().project.actors[0]!.glide).toBe(
      DEFAULT_GLIDE_STRENGTH,
    )
    expect(
      JSON.stringify(useEditorStore.getState().project.actors[0]!.recording),
    ).toBe(recordingBefore)
    expect(useEditorStore.getState().actorEditOrder).toEqual(['glide'])
    expect(useEditorStore.getState().glideUndoStack).toEqual([0])

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.glide).toBe(0)
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.glide).toBe(
      DEFAULT_GLIDE_STRENGTH,
    )
  })

  it('mutual exclusion: polish cancels glide preview', () => {
    expect(useEditorStore.getState().beginGlideSession()).toBe(true)
    // Pause so polish can start (play blocks polish entry).
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    expect(useEditorStore.getState().glideSession).toBeNull()
    expect(useEditorStore.getState().polishSession).not.toBeNull()
  })

  it('strength 0 clears a previously applied Glide', () => {
    useEditorStore.getState().beginGlideSession()
    expect(useEditorStore.getState().applyGlide()).toBe(true)
    expect(useEditorStore.getState().project.actors[0]!.glide).toBeGreaterThan(
      0,
    )
    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0)
    expect(useEditorStore.getState().applyGlide()).toBe(true)
    expect(useEditorStore.getState().project.actors[0]!.glide).toBe(0)
  })

  it('reopen starts from saved strength; cancel keeps committed', () => {
    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0.55)
    expect(useEditorStore.getState().applyGlide()).toBe(true)
    expect(useEditorStore.getState().project.actors[0]!.glide).toBeCloseTo(
      0.55,
      5,
    )

    useEditorStore.getState().beginGlideSession()
    expect(useEditorStore.getState().glideSession!.strength).toBeCloseTo(
      0.55,
      5,
    )
    useEditorStore.getState().setGlideStrength(0.95)
    useEditorStore.getState().cancelGlide()
    expect(useEditorStore.getState().project.actors[0]!.glide).toBeCloseTo(
      0.55,
      5,
    )
  })

  it('Original compare keeps committed glide; proposed strength is session-only', () => {
    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0.6)
    expect(useEditorStore.getState().applyGlide()).toBe(true)

    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0.95)
    useEditorStore.getState().setGlideCompareMode('original')
    expect(useEditorStore.getState().glideSession!.compareMode).toBe(
      'original',
    )
    expect(useEditorStore.getState().project.actors[0]!.glide).toBeCloseTo(
      0.6,
      5,
    )
    expect(useEditorStore.getState().glideSession!.strength).toBeCloseTo(
      0.95,
      5,
    )
  })

  it('undo/redo restores glide setting and resulting motion path', () => {
    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0.8)
    expect(useEditorStore.getState().applyGlide()).toBe(true)
    const after = selectProcessedPathForActor(
      useEditorStore.getState().project,
      useEditorStore.getState().project.actors[0]!,
    )
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.glide).toBe(0)
    const undone = selectProcessedPathForActor(
      useEditorStore.getState().project,
      useEditorStore.getState().project.actors[0]!,
    )
    expect(
      undone.some((s, i) => Math.abs(s.t - after[i]!.t) > 1e-6),
    ).toBe(true)
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.glide).toBeCloseTo(
      0.8,
      5,
    )
    const redone = selectProcessedPathForActor(
      useEditorStore.getState().project,
      useEditorStore.getState().project.actors[0]!,
    )
    for (let i = 0; i < after.length; i++) {
      expect(redone[i]!.t).toBeCloseTo(after[i]!.t, 5)
    }
  })

  it('duplication copies glide; actor switch isolates undo stacks', () => {
    useEditorStore.getState().beginGlideSession()
    useEditorStore.getState().setGlideStrength(0.7)
    expect(useEditorStore.getState().applyGlide()).toBe(true)
    const idA = useEditorStore.getState().selectedActorId
    const idB = useEditorStore.getState().duplicateSelectedActor()
    expect(idB).toBeTruthy()
    const copy = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === idB)!
    expect(copy.glide).toBeCloseTo(0.7, 5)
    expect(useEditorStore.getState().glideUndoStack).toHaveLength(0)
    useEditorStore.getState().selectActor(idA)
    expect(
      useEditorStore.getState().project.actors.find((a) => a.id === idA)!
        .glide,
    ).toBeCloseTo(0.7, 5)
  })

})
