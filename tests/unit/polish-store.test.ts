import { beforeEach, describe, expect, it } from 'vitest'
import { copyPath } from '../../src/core/edit'
import { useEditorStore } from '../../src/state/store'
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
})
