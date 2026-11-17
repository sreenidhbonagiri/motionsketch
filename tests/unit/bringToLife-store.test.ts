import { beforeEach, describe, expect, it } from 'vitest'
import {
  BRING_TO_LIFE_EASING,
  BRING_TO_LIFE_GLIDE,
  BRING_TO_LIFE_STEADY,
} from '../../src/core/bringToLife'
import { makeGeometryEdit } from '../../src/core/edit'
import { createSceneActor } from '../../src/core/sceneActor'
import { useEditorStore } from '../../src/state/store'
import {
  BTL_CURVE_ID,
  BTL_LOGO_ID,
  buildBringToLifeFixtureProject,
  roughLogoEntrance,
} from '../fixtures/bringToLifeProject'

function seedFixture(selectedId = BTL_LOGO_ID) {
  const project = buildBringToLifeFixtureProject()
  const actor = project.actors.find((a) => a.id === selectedId)!
  useEditorStore.setState({
    project,
    selectedActorId: selectedId,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0.35,
    playbackDirection: 1,
    livePosition: { ...actor.restPosition },
    liveTrail: [],
    showPathComparison: false,
    geometryEdit: null,
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
    presetSession: null,
    presetUndoStack: [],
    presetRedoStack: [],
    bringToLifeSession: null,
    bringToLifeUndoStack: [],
    bringToLifeRedoStack: [],
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

describe('bringToLife session store', () => {
  beforeEach(() => {
    seedFixture()
  })

  it('preview does not mutate project or recording', () => {
    const before = JSON.stringify(useEditorStore.getState().project)
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    expect(useEditorStore.getState().bringToLifeSession).not.toBeNull()
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
  })

  it('cancel restores playhead and leaves no history', () => {
    useEditorStore.setState({ playbackHead: 0.42 })
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().setBringToLifeCompareMode('original')
    useEditorStore.getState().cancelBringToLife()
    expect(useEditorStore.getState().bringToLifeSession).toBeNull()
    expect(useEditorStore.getState().playbackHead).toBe(0.42)
    expect(useEditorStore.getState().bringToLifeUndoStack).toHaveLength(0)
    expect(useEditorStore.getState().actorEditOrder).toHaveLength(0)
  })

  it('apply writes one undoable change and keeps recording intact', () => {
    const recordingBefore = JSON.stringify(
      useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID)!
        .recording,
    )
    const transformBefore = JSON.stringify(
      useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID)!
        .transform,
    )
    const durationBefore = useEditorStore.getState().project.playback.durationMs
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    const session = useEditorStore.getState().bringToLifeSession!
    expect(session.changed).toBe(true)
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)
    expect(useEditorStore.getState().bringToLifeSession).toBeNull()
    const actor = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(JSON.stringify(actor.recording)).toBe(recordingBefore)
    expect(JSON.stringify(actor.transform)).toBe(transformBefore)
    expect(useEditorStore.getState().project.playback.durationMs).toBe(
      durationBefore,
    )
    expect(actor.geometryEdit).not.toBeNull()
    expect(actor.geometryEdit?.bringToLife).toBe(true)
    expect(actor.glide).toBe(BRING_TO_LIFE_GLIDE)
    expect(actor.steadySpeed).toBe(BRING_TO_LIFE_STEADY)
    expect(actor.easing).toBe(BRING_TO_LIFE_EASING)
    expect(useEditorStore.getState().actorEditOrder).toEqual(['bringToLife'])
    expect(useEditorStore.getState().bringToLifeUndoStack).toHaveLength(1)

    useEditorStore.getState().undoActorEdit()
    const undone = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(undone.geometryEdit).toBeNull()
    expect(undone.glide).toBe(0)
    useEditorStore.getState().redoActorEdit()
    const redone = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(redone.geometryEdit).not.toBeNull()
    expect(redone.glide).toBe(BRING_TO_LIFE_GLIDE)
  })

  it('mutual exclusion with polish / glide / preset', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    expect(useEditorStore.getState().bringToLifeSession).toBeNull()
    expect(useEditorStore.getState().polishSession).not.toBeNull()

    useEditorStore.getState().cancelPolish()
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().beginGlideSession()).toBe(true)
    expect(useEditorStore.getState().bringToLifeSession).toBeNull()
  })

  it('blocks timing-baked geometry with announcement', () => {
    const samples = roughLogoEntrance()
    const actor = createSceneActor({
      id: 'baked',
      name: 'Baked',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      geometryEdit: makeGeometryEdit(samples, 0, null, { timingBaked: true }),
    })
    useEditorStore.setState({
      project: {
        ...useEditorStore.getState().project,
        actors: [actor],
      },
      selectedActorId: 'baked',
      geometryEdit: makeGeometryEdit(samples, 0, null, { timingBaked: true }),
    })
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(false)
    expect(useEditorStore.getState().bringToLifeSession).toBeNull()
    expect(useEditorStore.getState().actionAnnouncement).toMatch(
      /Steady|Glide|Easing|Continue/i,
    )
  })

  it('compare mode switches without mutating the project', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    const before = JSON.stringify(useEditorStore.getState().project)
    useEditorStore.getState().setBringToLifeCompareMode('original')
    expect(useEditorStore.getState().bringToLifeSession!.compareMode).toBe(
      'original',
    )
    useEditorStore.getState().setBringToLifeCompareMode('enhanced')
    expect(useEditorStore.getState().bringToLifeSession!.compareMode).toBe(
      'enhanced',
    )
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
  })

  it('selecting another actor does not inherit the applied prefs incorrectly', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)
    useEditorStore.setState({ selectedActorId: BTL_CURVE_ID })
    const curve = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_CURVE_ID)!
    expect(curve.geometryEdit).toBeNull()
    expect(curve.glide).toBe(0)
  })
})
