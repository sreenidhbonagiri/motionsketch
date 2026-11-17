import { beforeEach, describe, expect, it } from 'vitest'
import {
  BRING_TO_LIFE_ALREADY_APPLIED,
  BRING_TO_LIFE_EASING,
  BRING_TO_LIFE_GLIDE,
  BRING_TO_LIFE_STEADY,
  buildBringToLife,
} from '../../src/core/bringToLife'
import { makeGeometryEdit } from '../../src/core/edit'
import { exportCssFromProject } from '../../src/core/export/css'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  buildSnapshot,
  serializeSnapshot,
  parseSnapshotJson,
} from '../../src/core/persist/document'
import { useEditorStore } from '../../src/state/store'
import {
  BTL_CURVE_ID,
  BTL_LOGO_ID,
  buildBringToLifeFixtureProject,
} from '../fixtures/bringToLifeProject'

function seedWithCustomPrefs() {
  const project = buildBringToLifeFixtureProject()
  const actors = project.actors.map((a) =>
    a.id === BTL_LOGO_ID
      ? {
          ...a,
          easing: 'easeInOut' as const,
          glide: 0.9,
          steadySpeed: 0.7,
        }
      : a,
  )
  const next = { ...project, actors }
  const actor = actors.find((a) => a.id === BTL_LOGO_ID)!
  useEditorStore.setState({
    project: next,
    selectedActorId: BTL_LOGO_ID,
    mode: 'idle',
    pointerId: null,
    playbackHead: 0.2,
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

describe('bringToLife prefs replace / restore / idempotent reapply', () => {
  beforeEach(() => {
    seedWithCustomPrefs()
  })

  it('Cancel leaves existing easing/Glide/steady untouched', () => {
    const before = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(before.easing).toBe('easeInOut')
    expect(before.glide).toBe(0.9)
    expect(before.steadySpeed).toBe(0.7)

    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    useEditorStore.getState().cancelBringToLife()

    const after = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(after.easing).toBe('easeInOut')
    expect(after.glide).toBe(0.9)
    expect(after.steadySpeed).toBe(0.7)
    expect(after.geometryEdit).toBeNull()
    expect(useEditorStore.getState().playbackHead).toBe(0.2)
    expect(useEditorStore.getState().bringToLifeUndoStack).toHaveLength(0)
  })

  it('Apply replaces easing/Glide/steady; Undo restores exact prior; Redo restores stamp', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().bringToLifeSession!.changed).toBe(true)
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)

    const applied = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(applied.easing).toBe(BRING_TO_LIFE_EASING)
    expect(applied.glide).toBe(BRING_TO_LIFE_GLIDE)
    expect(applied.steadySpeed).toBe(BRING_TO_LIFE_STEADY)
    expect(applied.geometryEdit?.bringToLife).toBe(true)
    const enhancedFingerprint = JSON.stringify(applied)

    useEditorStore.getState().undoActorEdit()
    const undone = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(undone.easing).toBe('easeInOut')
    expect(undone.glide).toBe(0.9)
    expect(undone.steadySpeed).toBe(0.7)
    expect(undone.geometryEdit).toBeNull()

    useEditorStore.getState().redoActorEdit()
    const redone = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    expect(redone.geometryEdit?.bringToLife).toBe(true)
    expect(redone.easing).toBe(BRING_TO_LIFE_EASING)
    expect(redone.glide).toBe(BRING_TO_LIFE_GLIDE)
    expect(redone.steadySpeed).toBe(BRING_TO_LIFE_STEADY)
    expect(JSON.stringify(redone)).toBe(enhancedFingerprint)
  })

  it('reopening after Apply is a no-op with no history write', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)
    const afterFirst = JSON.stringify(
      useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID),
    )
    expect(useEditorStore.getState().bringToLifeUndoStack).toHaveLength(1)
    expect(useEditorStore.getState().actorEditOrder).toEqual(['bringToLife'])

    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    const session = useEditorStore.getState().bringToLifeSession!
    expect(session.changed).toBe(false)
    expect(session.reason).toBe(BRING_TO_LIFE_ALREADY_APPLIED)
    expect(useEditorStore.getState().applyBringToLife()).toBe(false)
    expect(
      JSON.stringify(
        useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID),
      ),
    ).toBe(afterFirst)
    expect(useEditorStore.getState().bringToLifeUndoStack).toHaveLength(1)
    expect(useEditorStore.getState().actorEditOrder).toEqual(['bringToLife'])
  })

  it('stamp survives save/reload; reopen stays a no-op', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)
    const project = useEditorStore.getState().project
    const raw = serializeSnapshot(buildSnapshot(project, null))
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const actor = parsed.snapshot.project.actors.find(
      (a) => a.id === BTL_LOGO_ID,
    )!
    expect(actor.geometryEdit?.bringToLife).toBe(true)

    useEditorStore.setState({
      project: parsed.snapshot.project,
      selectedActorId: BTL_LOGO_ID,
      geometryEdit: actor.geometryEdit
        ? {
            bakedSmoothing: actor.geometryEdit.bakedSmoothing,
            samples: actor.geometryEdit.samples.map((s) => ({ ...s })),
            handleIndices: [...actor.geometryEdit.handleIndices],
            bringToLife: true,
          }
        : null,
      bringToLifeSession: null,
      bringToLifeUndoStack: [],
      actorEditOrder: [],
    })
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    expect(useEditorStore.getState().bringToLifeSession!.changed).toBe(false)
  })

  it('path edit without stamp re-enables enhancement', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)
    const applied = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const nudged = makeGeometryEdit(
      applied.geometryEdit!.samples.map((s, i) =>
        i === 5 ? { ...s, x: Math.min(1, s.x + 0.03) } : { ...s },
      ),
      applied.geometryEdit!.bakedSmoothing,
      applied.geometryEdit!.handleIndices,
    )
    expect(nudged.bringToLife).toBeUndefined()

    useEditorStore.setState({
      project: {
        ...useEditorStore.getState().project,
        actors: useEditorStore.getState().project.actors.map((a) =>
          a.id === BTL_LOGO_ID ? { ...a, geometryEdit: nudged } : a,
        ),
      },
      geometryEdit: nudged,
      bringToLifeSession: null,
    })
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().bringToLifeSession!.changed).toBe(true)
  })

  it('core build stays idempotent when stamped (no silent compound)', () => {
    const actor = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const first = buildBringToLife(actor, 1.6)
    expect(first.ok && first.changed).toBe(true)
    if (!first.ok) return
    const stamped = {
      ...actor,
      ...first.proposed,
      geometryEdit: first.proposed.geometryEdit,
    }
    const second = buildBringToLife(stamped, 1.6)
    expect(second.ok && !second.changed).toBe(true)
  })

  it('enhancing one actor does not change another actor’s eligibility', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)

    const logo = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const curve = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === BTL_CURVE_ID)!
    expect(logo.geometryEdit?.bringToLife).toBe(true)
    expect(curve.geometryEdit).toBeNull()

    useEditorStore.setState({
      selectedActorId: BTL_CURVE_ID,
      geometryEdit: null,
      bringToLifeSession: null,
    })
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().bringToLifeSession!.changed).toBe(true)

    // Logo remains stamped / no-op while Curve is enhanced.
    useEditorStore.getState().cancelBringToLife()
    useEditorStore.setState({
      selectedActorId: BTL_LOGO_ID,
      geometryEdit: logo.geometryEdit
        ? {
            bakedSmoothing: logo.geometryEdit.bakedSmoothing,
            samples: logo.geometryEdit.samples.map((s) => ({ ...s })),
            handleIndices: [...logo.geometryEdit.handleIndices],
            bringToLife: true,
          }
        : null,
      bringToLifeSession: null,
    })
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    expect(useEditorStore.getState().bringToLifeSession!.changed).toBe(false)
  })

  it('canceled Edit path / Polish / panel leave the stamp intact', () => {
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().applyBringToLife()).toBe(true)
    const stampedBefore = JSON.stringify(
      useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID),
    )

    // Enter Edit path then leave without committing — stamp stays.
    useEditorStore.getState().enterEditMode()
    expect(useEditorStore.getState().mode).toBe('editing')
    expect(useEditorStore.getState().editSession?.bringToLife).toBeUndefined()
    useEditorStore.getState().exitEditMode()
    expect(
      useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID)!
        .geometryEdit?.bringToLife,
    ).toBe(true)

    // Polish preview cancel — stamp stays.
    expect(useEditorStore.getState().beginPolishSession()).toBe(true)
    useEditorStore.getState().pause()
    useEditorStore.getState().cancelPolish()
    expect(
      useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID)!
        .geometryEdit?.bringToLife,
    ).toBe(true)

    // Bring to life panel reopen + Cancel — stamp stays, no history write.
    expect(useEditorStore.getState().beginBringToLifeSession()).toBe(true)
    useEditorStore.getState().pause()
    expect(useEditorStore.getState().bringToLifeSession!.changed).toBe(false)
    useEditorStore.getState().cancelBringToLife()
    expect(
      JSON.stringify(
        useEditorStore.getState().project.actors.find((a) => a.id === BTL_LOGO_ID),
      ),
    ).toBe(stampedBefore)
  })
})

describe('bringToLife stamp persist + export', () => {
  it('legacy projects without bringToLife load normally', () => {
    const project = buildBringToLifeFixtureProject()
    const rawObj = JSON.parse(
      serializeSnapshot(buildSnapshot(project, null, '2026-01-01T00:00:00.000Z')),
    )
    // Simulate a prior Apply persisted, then strip the additive flag as older clients would.
    const samples = project.actors[0]!.recording!.samples
    rawObj.project.actors[0].geometryEdit = {
      samples,
      bakedSmoothing: 0,
      handleIndices: [0, samples.length - 1],
    }
    delete rawObj.project.actors[0].geometryEdit.bringToLife
    const parsed = parseSnapshotJson(JSON.stringify(rawObj))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0]!.geometryEdit?.bringToLife).toBeUndefined()
    expect(parsed.snapshot.project.actors[0]!.geometryEdit?.samples).toHaveLength(
      samples.length,
    )
  })

  it('CSS/HTML exports omit editor-only bringToLife metadata', () => {
    const project = buildBringToLifeFixtureProject()
    const actor = project.actors.find((a) => a.id === BTL_LOGO_ID)!
    const built = buildBringToLife(actor, project.stageAspect)
    expect(built.ok && built.changed).toBe(true)
    if (!built.ok) return
    const enhanced = {
      ...project,
      actors: project.actors.map((a) =>
        a.id === BTL_LOGO_ID
          ? {
              ...a,
              geometryEdit: built.proposed.geometryEdit,
              glide: built.proposed.glide,
              steadySpeed: built.proposed.steadySpeed,
              easing: built.proposed.easing,
            }
          : a,
      ),
    }
    expect(enhanced.actors[0]!.geometryEdit?.bringToLife).toBe(true)

    const css = exportCssFromProject(enhanced)
    expect(css).toContain('@keyframes')
    expect(css).not.toMatch(/bringToLife/)

    const html = buildHtmlDemoFromProject(enhanced)
    expect(html).toContain('@keyframes')
    expect(html).not.toMatch(/bringToLife/)
  })
})
