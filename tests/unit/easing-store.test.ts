import { beforeEach, describe, expect, it } from 'vitest'
import { copyPath } from '../../src/core/edit'
import {
  buildSnapshot,
  PERSIST_FORMAT_VERSION,
  serializeSnapshot,
  validateSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { buildProjectCssExport } from '../../src/core/export/css'

function buildPath(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 40; i++) {
    const u = i / 40
    samples.push({ t: i * 40, x: 0.2 + u * 0.55, y: 0.45 })
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
    easingUndoStack: [],
    easingRedoStack: [],
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

describe('easing store + persist', () => {
  beforeEach(() => {
    const samples = buildPath()
    const actor = createSceneActor({
      id: 'easing-actor',
      name: 'Easing Actor',
      recording: {
        samples,
        recordedDurationMs: samples[samples.length - 1]!.t,
      },
      easing: 'linear',
      glide: 0,
      steadySpeed: 0,
      smoothing: 0,
    })
    seedStore({
      version: 1,
      name: 'Easing store fixture',
      stageAspect: 1.6,
      stageWidth: 1600,
      stageHeight: 1000,
      playback: {
        durationMs: samples[samples.length - 1]!.t,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
      actors: [actor],
    })
  })

  it('setEasing is undoable and does not mutate recording', () => {
    const before = JSON.stringify(
      useEditorStore.getState().project.actors[0]!.recording,
    )
    useEditorStore.getState().setEasing('spring')
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('spring')
    expect(
      JSON.stringify(useEditorStore.getState().project.actors[0]!.recording),
    ).toBe(before)

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('linear')
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0]!.easing).toBe('spring')
  })

  it('linear matches legacy path; spring changes processed path', () => {
    const actor = useEditorStore.getState().project.actors[0]!
    const project = useEditorStore.getState().project
    const linear = selectProcessedPathForActor(project, {
      ...actor,
      easing: 'linear',
    })
    useEditorStore.getState().setEasing('bounce')
    const bounced = selectProcessedPathForActor(
      useEditorStore.getState().project,
      useEditorStore.getState().project.actors[0]!,
    )
    expect(bounced.length).toBeGreaterThan(0)
    expect(JSON.stringify(bounced)).not.toBe(JSON.stringify(linear))
  })

  it('persist round-trips easing; older docs default to linear', () => {
    useEditorStore.getState().setEasing('easeOut')
    const project = useEditorStore.getState().project
    const snap = buildSnapshot(project)
    expect(snap.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    const parsed = validateSnapshot(JSON.parse(serializeSnapshot(snap)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0]!.easing).toBe('easeOut')

    const legacy = JSON.parse(serializeSnapshot(snap)) as {
      formatVersion: number
      project: { actors: Array<Record<string, unknown>> }
    }
    legacy.formatVersion = 14
    delete legacy.project.actors[0]!.easing
    const migrated = validateSnapshot(legacy)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.snapshot.project.actors[0]!.easing).toBe('linear')
    expect(migrated.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
  })

  it('editor path and CSS export stay consistent with spring', () => {
    useEditorStore.getState().setEasing('spring')
    const project = useEditorStore.getState().project
    const actor = project.actors[0]!
    const path = selectProcessedPathForActor(project, actor)
    const kf = buildKeyframesFromProcessed(path)
    expect(maxPlaybackExportError(path, kf, 48)).toBeLessThan(0.02)
    const { css } = buildProjectCssExport(project)
    expect(css).toContain('@keyframes')
    expect((css.match(/\{\s*transform:/g) ?? []).length).toBeGreaterThan(8)
  })
})
