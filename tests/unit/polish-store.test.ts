import { beforeEach, describe, expect, it } from 'vitest'
import { copyGeometryEdit, copyPath } from '../../src/core/edit'
import {
  DEFAULT_POLISH_STRENGTH,
  useEditorStore,
} from '../../src/state/store'
import {
  buildPolishMotionFixtureProject,
  POLISH_EDITED_ACTOR_ID,
  POLISH_RAW_ACTOR_ID,
} from '../fixtures/polishMotionProject'

describe('polish session store', () => {
  beforeEach(() => {
    const project = buildPolishMotionFixtureProject()
    useEditorStore.setState({
      project,
      selectedActorId: POLISH_EDITED_ACTOR_ID,
      mode: 'idle',
      pointerId: null,
      playbackHead: 0,
      playbackDirection: 1,
      livePosition: { x: 0.5, y: 0.5 },
      liveTrail: [],
      showPathComparison: false,
      geometryEdit: project.actors[0]!.geometryEdit
        ? {
            bakedSmoothing: project.actors[0]!.geometryEdit.bakedSmoothing,
            samples: copyPath(project.actors[0]!.geometryEdit.samples),
            handleIndices: [...project.actors[0]!.geometryEdit.handleIndices],
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
      stageHint: 'default',
      actionAnnouncement: null,
      clipUndoStack: [],
      clipRedoStack: [],
      actorEditOrder: [],
      actorEditRedoOrder: [],
    })
  })

  it('preview does not mutate project geometry or recording', () => {
    const before = useEditorStore.getState()
    const geBefore = JSON.stringify(before.geometryEdit)
    const recBefore = JSON.stringify(
      before.project.actors.find((a) => a.id === POLISH_EDITED_ACTOR_ID)!
        .recording,
    )
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    const session = useEditorStore.getState().polishSession
    expect(session).not.toBeNull()
    expect(JSON.stringify(useEditorStore.getState().geometryEdit)).toBe(
      geBefore,
    )
    expect(
      JSON.stringify(
        useEditorStore
          .getState()
          .project.actors.find((a) => a.id === POLISH_EDITED_ACTOR_ID)!
          .recording,
      ),
    ).toBe(recBefore)
  })

  it('cancel leaves the project unchanged', () => {
    const geBefore = JSON.stringify(useEditorStore.getState().geometryEdit)
    useEditorStore.getState().beginPolishSession()
    useEditorStore.getState().setPolishStrength(0.8)
    useEditorStore.getState().cancelPolish()
    expect(useEditorStore.getState().polishSession).toBeNull()
    expect(JSON.stringify(useEditorStore.getState().geometryEdit)).toBe(
      geBefore,
    )
    expect(useEditorStore.getState().undoStack).toHaveLength(0)
  })

  it('apply writes one undo entry and keeps recording intact', () => {
    const actor = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === POLISH_EDITED_ACTOR_ID)!
    const recordingBefore = JSON.stringify(actor.recording)
    const otherBefore = JSON.stringify(
      useEditorStore
        .getState()
        .project.actors.find((a) => a.id === POLISH_RAW_ACTOR_ID),
    )
    useEditorStore.getState().beginPolishSession()
    const session = useEditorStore.getState().polishSession!
    if (!session.changed) {
      // Still exercise apply no-op path
      expect(useEditorStore.getState().applyPolish()).toBe(false)
      expect(useEditorStore.getState().polishSession).toBeNull()
      return
    }
    const preview = session.previewSamples.map((s) => ({ ...s }))
    expect(useEditorStore.getState().applyPolish()).toBe(true)
    expect(useEditorStore.getState().polishSession).toBeNull()
    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    const ge = useEditorStore.getState().geometryEdit!
    expect(ge.samples).toEqual(preview)
    expect(
      JSON.stringify(
        useEditorStore
          .getState()
          .project.actors.find((a) => a.id === POLISH_EDITED_ACTOR_ID)!
          .recording,
      ),
    ).toBe(recordingBefore)
    expect(
      JSON.stringify(
        useEditorStore
          .getState()
          .project.actors.find((a) => a.id === POLISH_RAW_ACTOR_ID),
      ),
    ).toBe(otherBefore)

    useEditorStore.getState().undoEdit()
    expect(useEditorStore.getState().geometryEdit!.samples).toEqual(
      session.baseline.samples,
    )
    useEditorStore.getState().redoEdit()
    expect(useEditorStore.getState().geometryEdit!.samples).toEqual(preview)
  })

  it('works on an unedited recording by baking then polishing', () => {
    useEditorStore.getState().selectActor(POLISH_RAW_ACTOR_ID)
    useEditorStore.setState({ geometryEdit: null })
    expect(
      useEditorStore
        .getState()
        .project.actors.find((a) => a.id === POLISH_RAW_ACTOR_ID)!
        .geometryEdit,
    ).toBeNull()
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    const session = useEditorStore.getState().polishSession!
    expect(session.baseline.samples.length).toBeGreaterThan(2)
    if (session.changed) {
      expect(useEditorStore.getState().applyPolish()).toBe(true)
      expect(useEditorStore.getState().geometryEdit).not.toBeNull()
      expect(
        useEditorStore
          .getState()
          .project.actors.find((a) => a.id === POLISH_RAW_ACTOR_ID)!
          .recording,
      ).not.toBeNull()
    } else {
      useEditorStore.getState().cancelPolish()
    }
  })

  it('defaults strength to 55% then remembers after cancel/reopen', () => {
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    expect(useEditorStore.getState().polishSession!.strength).toBe(
      DEFAULT_POLISH_STRENGTH,
    )
    useEditorStore.getState().setPolishStrength(0.8)
    expect(useEditorStore.getState().polishSession!.strength).toBe(0.8)
    useEditorStore.getState().cancelPolish()
    expect(useEditorStore.getState().polishSession).toBeNull()
    expect(
      useEditorStore.getState().polishStrengthByActorId[POLISH_EDITED_ACTOR_ID],
    ).toBe(0.8)

    // Geometry unchanged after cancel; reopen restores strength from committed path.
    const ge = useEditorStore.getState().geometryEdit!
    const geSnap = JSON.stringify(ge)
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    const again = useEditorStore.getState().polishSession!
    expect(again.strength).toBe(0.8)
    expect(again.baseline.samples).toEqual(ge.samples)
    expect(JSON.stringify(useEditorStore.getState().geometryEdit)).toBe(geSnap)
  })

  it('remembers strength after Apply/reopen from committed path', () => {
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    useEditorStore.getState().setPolishStrength(0.7)
    const session = useEditorStore.getState().polishSession!
    if (!session.changed) {
      useEditorStore.getState().cancelPolish()
      expect(useEditorStore.getState().beginPolishSession()).toBe(true)
      expect(useEditorStore.getState().polishSession!.strength).toBe(0.7)
      return
    }
    const applied = session.previewSamples.map((s) => ({ ...s }))
    expect(useEditorStore.getState().applyPolish()).toBe(true)
    expect(useEditorStore.getState().geometryEdit!.samples).toEqual(applied)

    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    const reopen = useEditorStore.getState().polishSession!
    expect(reopen.strength).toBe(0.7)
    expect(reopen.baseline.samples).toEqual(applied)
  })

  it('keeps strength prefs isolated per actor and drops only the preview', () => {
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    useEditorStore.getState().setPolishStrength(0.9)
    const editedBaseline = copyGeometryEdit(
      useEditorStore.getState().polishSession!.baseline,
    )
    useEditorStore.getState().cancelPolish()

    useEditorStore.getState().selectActor(POLISH_RAW_ACTOR_ID)
    useEditorStore.setState({
      geometryEdit: null,
      polishStrengthByActorId: {
        ...useEditorStore.getState().polishStrengthByActorId,
      },
    })
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    expect(useEditorStore.getState().polishSession!.strength).toBe(
      DEFAULT_POLISH_STRENGTH,
    )
    useEditorStore.getState().setPolishStrength(0.35)
    useEditorStore.getState().cancelPolish()

    useEditorStore.getState().selectActor(POLISH_EDITED_ACTOR_ID)
    useEditorStore.setState({
      geometryEdit: copyGeometryEdit(editedBaseline),
    })
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    expect(useEditorStore.getState().polishSession!.strength).toBe(0.9)
    expect(useEditorStore.getState().polishSession!.baseline.samples).toEqual(
      editedBaseline.samples,
    )

    expect(
      useEditorStore.getState().polishStrengthByActorId[POLISH_RAW_ACTOR_ID],
    ).toBe(0.35)
  })

  it('switching actors while preview is open does not leak preference', () => {
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    useEditorStore.getState().setPolishStrength(0.65)
    useEditorStore.getState().selectActor(POLISH_RAW_ACTOR_ID)
    expect(useEditorStore.getState().polishSession).toBeNull()
    expect(
      useEditorStore.getState().polishStrengthByActorId[POLISH_EDITED_ACTOR_ID],
    ).toBe(0.65)
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    expect(useEditorStore.getState().polishSession!.strength).toBe(
      DEFAULT_POLISH_STRENGTH,
    )
  })

  it('opening polish from Edit path keeps the selected handle for rounding', () => {
    const corner = 114
    const ge = useEditorStore.getState().geometryEdit!
    useEditorStore.setState({
      mode: 'editing',
      editSession: copyGeometryEdit(ge),
      selectedHandleIndex: corner,
    })
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    const state = useEditorStore.getState()
    expect(state.mode).toBe('idle')
    expect(state.editSession).toBeNull()
    expect(state.selectedHandleIndex).toBe(corner)
    expect(state.polishSession!.roundingTargetIndex).toBe(corner)
    expect(state.polishSession!.roundingUnavailableReason).toBeNull()
  })

  it('allow rounding updates preview only; cancel leaves geometry unchanged', () => {
    const corner = 114
    useEditorStore.setState({ selectedHandleIndex: corner })
    const geBefore = JSON.stringify(useEditorStore.getState().geometryEdit)
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    const session = useEditorStore.getState().polishSession!
    expect(session.roundingTargetIndex).toBe(corner)
    expect(session.roundingUnavailableReason).toBeNull()
    expect(session.allowRoundingAtPoint).toBe(false)
    const defaultPreview = session.previewSamples.map((s) => ({ ...s }))

    useEditorStore.getState().setPolishAllowRounding(true)
    const rounded = useEditorStore.getState().polishSession!
    expect(rounded.allowRoundingAtPoint).toBe(true)
    expect(rounded.previewSamples[corner]).not.toEqual(defaultPreview[corner])
    expect(JSON.stringify(useEditorStore.getState().geometryEdit)).toBe(
      geBefore,
    )

    useEditorStore.getState().cancelPolish()
    expect(JSON.stringify(useEditorStore.getState().geometryEdit)).toBe(
      geBefore,
    )
  })

  it('apply with rounding commits one undo entry and keeps handle indices', () => {
    const corner = 114
    useEditorStore.setState({ selectedHandleIndex: corner })
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    useEditorStore.getState().setPolishAllowRounding(true)
    const session = useEditorStore.getState().polishSession!
    if (!session.changed) {
      useEditorStore.getState().cancelPolish()
      return
    }
    const handles = [...session.baseline.handleIndices]
    const preview = session.previewSamples.map((s) => ({ ...s }))
    expect(useEditorStore.getState().applyPolish()).toBe(true)
    expect(useEditorStore.getState().geometryEdit!.handleIndices).toEqual(
      handles,
    )
    expect(useEditorStore.getState().geometryEdit!.samples).toEqual(preview)
    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    useEditorStore.getState().undoEdit()
    expect(useEditorStore.getState().geometryEdit!.samples[corner]).toEqual(
      session.baseline.samples[corner],
    )
  })
})
