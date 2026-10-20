import { beforeEach, describe, expect, it } from 'vitest'
import { isActorVisibleAt, projectToLocal } from '../../src/core/clip'
import {
  continuePathAvailability,
  displayedPathSamples,
  planContinuePathCommit,
} from '../../src/core/continuePath'
import { makeGeometryEdit } from '../../src/core/edit'
import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { evaluateActorRotationDeg } from '../../src/core/faceAlongPath'
import { evaluate } from '../../src/core/playback'
import { evaluateTransform } from '../../src/core/transform'
import { evaluateKeyframes } from '../../src/core/export/consistency'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  MAX_PLAYBACK_DURATION_MS,
  type Project,
  type SceneActor,
} from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording, makeSamples } from './helpers/project'

type Pose = {
  x: number
  y: number
  scale: number
  rotationDeg: number
  visible: boolean
}

/** Editor-equivalent pose at an absolute timeline time (ms). */
function poseAt(
  project: Project,
  actor: SceneActor,
  absMs: number,
): Pose {
  const tNorm = absMs / Math.max(1, project.playback.durationMs)
  const path = selectProcessedPathForActor(project, actor)
  const local = projectToLocal(tNorm, actor.clip)
  const pos = path.length ? evaluate(path, local) : { ...actor.restPosition }
  const xf = evaluateTransform(actor.transform, local)
  return {
    x: pos.x,
    y: pos.y,
    scale: xf.scale,
    rotationDeg: evaluateActorRotationDeg(
      actor,
      path,
      local,
      project.stageAspect,
    ),
    visible: isActorVisibleAt(tNorm, actor.clip),
  }
}

function assertPosesEqual(
  before: Pose[],
  after: Pose[],
  label: string,
  eps = 1e-9,
) {
  expect(after.length, label).toBe(before.length)
  for (let i = 0; i < before.length; i++) {
    const b = before[i]!
    const a = after[i]!
    expect(a.visible, `${label}[${i}] visible`).toBe(b.visible)
    expect(Math.abs(a.x - b.x), `${label}[${i}] x`).toBeLessThanOrEqual(eps)
    expect(Math.abs(a.y - b.y), `${label}[${i}] y`).toBeLessThanOrEqual(eps)
    expect(Math.abs(a.scale - b.scale), `${label}[${i}] scale`).toBeLessThanOrEqual(
      eps,
    )
    expect(
      Math.abs(a.rotationDeg - b.rotationDeg),
      `${label}[${i}] rotation`,
    ).toBeLessThanOrEqual(eps)
  }
}

function unevenRecording() {
  const samples = makeSamples(30).map((s, i) => ({
    ...s,
    x: 0.15 + i * 0.02,
    y: 0.4 + Math.sin(i / 4) * 0.12,
  }))
  let t = 0
  for (let i = 0; i < samples.length; i++) {
    if (i === 0) samples[i]!.t = 0
    else {
      t += 20 + (i % 5) * 15
      samples[i]!.t = t
    }
  }
  return {
    samples,
    recordedDurationMs: samples[samples.length - 1]!.t,
  }
}

function applyPlan(
  project: Project,
  actorId: string,
  addition: {
    samples: { t: number; x: number; y: number }[]
    recordedDurationMs: number
  },
): Project {
  const plan = planContinuePathCommit({ project, actorId, addition })
  if ('error' in plan) throw new Error(plan.error)
  return {
    ...project,
    playback: { ...project.playback, durationMs: plan.durationMs },
    actors: project.actors.map((a) => {
      const p = plan.actors.find((x) => x.id === a.id)!
      if (a.id === actorId) {
        return {
          ...a,
          recording: a.recording,
          geometryEdit: p.geometryEdit ?? plan.geometryEdit,
          steadySpeed: p.steadySpeed ?? 0,
          glide: p.glide ?? 0,
          clip: p.clip,
          transform: p.transform,
        }
      }
      return { ...a, clip: p.clip, transform: p.transform }
    }),
  }
}

function sampleAbsTimes(durationMs: number): number[] {
  // Through the original section, including near the old endpoint.
  return [0, 0.15, 0.35, 0.55, 0.75, 0.9, 0.97, 0.999].map((u) => u * durationMs)
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
    recordingIntent: 'replace',
    continuePathUndoStack: [],
    continuePathRedoStack: [],
    actorEditOrder: [],
    actorEditRedoOrder: [],
    geometryEdit: actor.geometryEdit
      ? makeGeometryEdit(
          actor.geometryEdit.samples,
          actor.geometryEdit.bakedSmoothing,
          actor.geometryEdit.handleIndices,
        )
      : null,
    editSession: null,
    undoStack: [],
    redoStack: [],
    polishSession: null,
    glideSession: null,
    presetSession: null,
    pathGestureActive: false,
    clipUndoStack: [],
    clipRedoStack: [],
    transformUndoStack: [],
    transformRedoStack: [],
  })
}

describe('continue path evaluated-pose preservation', () => {
  const cases: Array<{
    label: string
    patch: Partial<SceneActor>
  }> = [
    { label: 'plain', patch: { smoothing: 0, steadySpeed: 0, glide: 0 } },
    { label: 'steady', patch: { smoothing: 0, steadySpeed: 0.85, glide: 0 } },
    { label: 'glide', patch: { smoothing: 0, steadySpeed: 0, glide: 0.8 } },
    {
      label: 'steady+glide',
      patch: { smoothing: 0, steadySpeed: 0.85, glide: 0.8 },
    },
    {
      label: 'geometry-edited',
      patch: {
        smoothing: 0.35,
        steadySpeed: 0.4,
        glide: 0.55,
      },
    },
  ]

  for (const c of cases) {
    it(`${c.label}: prefix poses match at the same absolute times`, () => {
      const recording = unevenRecording()
      let geometryEdit = null as ReturnType<typeof makeGeometryEdit> | null
      if (c.label === 'geometry-edited') {
        geometryEdit = makeGeometryEdit(
          recording.samples.map((s, i) => ({
            ...s,
            y: s.y + (i > 8 ? 0.05 : 0),
          })),
          0.35,
        )
      }
      const actor = makeActor({
        id: 'a1',
        recording,
        geometryEdit,
        clip: {
          start: 0,
          end: 1,
          hideBeforeStart: false,
          hideAfterEnd: false,
        },
        faceAlongPath: false,
        transform: {
          keyframes: [
            { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
            { id: 'k1', t: 0.4, rotationDeg: 40, scale: 1.2 },
            { id: 'k2', t: 0.85, rotationDeg: -10, scale: 0.9 },
          ],
        },
        ...c.patch,
        ...(geometryEdit ? { geometryEdit } : {}),
      })
      const before = makeProject({
        actors: [actor],
        playback: {
          durationMs: 1200,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
      })
      const times = sampleAbsTimes(1200)
      const beforePoses = times.map((ms) =>
        poseAt(before, before.actors[0]!, ms),
      )

      const end = (
        geometryEdit?.samples ?? recording.samples
      )[(geometryEdit?.samples ?? recording.samples).length - 1]!
      // Continue from displayed endpoint (matches armContinuePath).
      const displayedEnd = poseAt(before, before.actors[0]!, 1199)
      const addition = {
        samples: [
          { t: 0, x: displayedEnd.x, y: displayedEnd.y },
          {
            t: 200,
            x: Math.min(0.99, displayedEnd.x + 0.15),
            y: displayedEnd.y + 0.04,
          },
        ],
        recordedDurationMs: 200,
      }
      void end
      const after = applyPlan(before, 'a1', addition)
      const afterPoses = times.map((ms) => poseAt(after, after.actors[0]!, ms))
      assertPosesEqual(beforePoses, afterPoses, c.label)

      // Original recording preserved for Restore.
      expect(after.actors[0]!.recording).toEqual(recording)
      expect(after.actors[0]!.geometryEdit).not.toBeNull()
      expect(after.actors[0]!.steadySpeed).toBe(0)
      expect(after.actors[0]!.glide).toBe(0)
    })
  }

  it('shortened / delayed Sequence: prefix absolute poses preserved', () => {
    const recording = unevenRecording()
    const actor = makeActor({
      id: 'a1',
      recording,
      smoothing: 0,
      steadySpeed: 0.7,
      glide: 0.6,
      clip: {
        start: 0.2,
        end: 0.7,
        hideBeforeStart: true,
        hideAfterEnd: true,
      },
      transform: {
        keyframes: [{ id: 'k', t: 0.35, rotationDeg: 25, scale: 1.1 }],
      },
    })
    const before = makeProject({
      actors: [actor],
      playback: {
        durationMs: 2000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    // Absolute times inside the original clip window.
    const times = [400, 700, 1000, 1300, 1390]
    const beforePoses = times.map((ms) => poseAt(before, before.actors[0]!, ms))
    const atEnd = poseAt(before, before.actors[0]!, 1399)
    const after = applyPlan(before, 'a1', {
      samples: [
        { t: 0, x: atEnd.x, y: atEnd.y },
        { t: 180, x: Math.min(0.99, atEnd.x + 0.1), y: atEnd.y },
      ],
      recordedDurationMs: 180,
    })
    const afterPoses = times.map((ms) => poseAt(after, after.actors[0]!, ms))
    assertPosesEqual(beforePoses, afterPoses, 'delayed-clip')
    // Outside the original clip, hide flags still apply at the same abs times.
    expect(poseAt(after, after.actors[0]!, 100).visible).toBe(false)
  })

  it('Face along path is unsupported for Continue (heading looks ahead)', () => {
    const actor = makeActor({
      id: 'a1',
      recording: unevenRecording(),
      faceAlongPath: true,
    })
    const project = makeProject({ actors: [actor] })
    expect(
      continuePathAvailability({
        actor,
        mode: 'idle',
        polishSession: null,
        glideSession: null,
        presetSession: null,
      }).enabled,
    ).toBe(false)
    const end = displayedPathSamples(actor, project.stageAspect).at(-1)!
    const plan = planContinuePathCommit({
      project,
      actorId: 'a1',
      addition: {
        samples: [
          { t: 0, x: end.x, y: end.y },
          { t: 120, x: Math.min(0.99, end.x + 0.1), y: end.y },
        ],
        recordedDurationMs: 120,
      },
    })
    expect('error' in plan).toBe(true)
    if ('error' in plan) {
      expect(plan.error).toMatch(/unavailable while Face along path is on/i)
      expect(plan.error).not.toMatch(/turn it back on/i)
    }
  })

  it('export HTML uses the same preserved prefix poses as the editor', () => {
    const recording = unevenRecording()
    const actor = makeActor({
      id: 'a1',
      recording,
      smoothing: 0,
      steadySpeed: 0.75,
      glide: 0.55,
      faceAlongPath: false,
      transform: {
        keyframes: [
          { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
          { id: 'k1', t: 0.5, rotationDeg: 20, scale: 1.15 },
        ],
      },
      clip: {
        start: 0,
        end: 1,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
    })
    const before = makeProject({
      actors: [actor],
      playback: {
        durationMs: 1200,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const times = sampleAbsTimes(1200)
    const beforeEditor = times.map((ms) =>
      poseAt(before, before.actors[0]!, ms),
    )

    const end = poseAt(before, before.actors[0]!, 1199)
    const after = applyPlan(before, 'a1', {
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 200, x: Math.min(0.99, end.x + 0.12), y: end.y },
      ],
      recordedDurationMs: 200,
    })
    const afterEditor = times.map((ms) => poseAt(after, after.actors[0]!, ms))
    assertPosesEqual(beforeEditor, afterEditor, 'export-prefix-editor')

    // Export keyframes are built from the same processed path the editor uses.
    const afterPath = selectProcessedPathForActor(after, after.actors[0]!)
    for (let i = 0; i < times.length; i++) {
      const tNorm = times[i]! / after.playback.durationMs
      const local = projectToLocal(tNorm, after.actors[0]!.clip)
      const exp = evaluate(afterPath, local)
      expect(Math.abs(exp.x - afterEditor[i]!.x)).toBeLessThanOrEqual(1e-9)
      expect(Math.abs(exp.y - afterEditor[i]!.y)).toBeLessThanOrEqual(1e-9)
    }
    const kf = buildKeyframesFromProcessed(afterPath)
    // RDP-simplified export frames stay within the project’s usual fidelity band.
    for (const u of [0, 0.25, 0.5, 0.75, 0.97]) {
      const local = projectToLocal(
        (u * 1200) / after.playback.durationMs,
        after.actors[0]!.clip,
      )
      const editor = evaluate(afterPath, local)
      const exported = evaluateKeyframes(kf, local)
      expect(Math.hypot(editor.x - exported.x, editor.y - exported.y)).toBeLessThan(
        0.01,
      )
    }

    const html = buildHtmlDemoFromProject(after)
    expect(html).toContain('@keyframes')
    expect(html).toContain('animation')
  })

  it('save/reopen keeps timingBaked, restore hints, and successive-continue poses', () => {
    const recording = unevenRecording()
    const actor = makeActor({
      id: 'a1',
      recording,
      smoothing: 0.2,
      steadySpeed: 0.8,
      glide: 0.65,
      clip: {
        start: 0,
        end: 1,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
    })
    let project = makeProject({
      actors: [actor],
      playback: {
        durationMs: 1200,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const end1 = poseAt(project, project.actors[0]!, 1199)
    project = applyPlan(project, 'a1', {
      samples: [
        { t: 0, x: end1.x, y: end1.y },
        { t: 160, x: Math.min(0.99, end1.x + 0.1), y: end1.y },
      ],
      recordedDurationMs: 160,
    })
    const end2 = poseAt(
      project,
      project.actors[0]!,
      project.actors[0]!.clip.end * project.playback.durationMs - 1,
    )
    project = applyPlan(project, 'a1', {
      samples: [
        { t: 0, x: end2.x, y: end2.y },
        { t: 140, x: Math.min(0.99, end2.x + 0.08), y: end2.y + 0.03 },
      ],
      recordedDurationMs: 140,
    })

    const times = sampleAbsTimes(1200)
    const beforeSave = times.map((ms) => poseAt(project, project.actors[0]!, ms))
    const ge = project.actors[0]!.geometryEdit!
    expect(ge.timingBaked).toBe(true)
    expect(ge.restoreSteadySpeed).toBe(0.8)
    expect(ge.restoreGlide).toBe(0.65)

    const parsed = parseSnapshotJson(
      serializeSnapshot(buildSnapshot(project, null)),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const reopened = parsed.snapshot.project
    const ge2 = reopened.actors[0]!.geometryEdit!
    expect(ge2.timingBaked).toBe(true)
    expect(ge2.restoreSteadySpeed).toBe(0.8)
    expect(ge2.restoreGlide).toBe(0.65)
    expect(ge2.samples.length).toBe(ge.samples.length)
    // Samples must round-trip bit-identically through JSON (no reprocessing).
    expect(ge2.samples).toEqual(ge.samples)
    expect(reopened.playback.durationMs).toBe(project.playback.durationMs)
    expect(reopened.actors[0]!.clip).toEqual(project.actors[0]!.clip)
    expect(reopened.actors[0]!.steadySpeed).toBe(0)
    expect(reopened.actors[0]!.glide).toBe(0)
    assertPosesEqual(
      beforeSave,
      times.map((ms) => poseAt(reopened, reopened.actors[0]!, ms)),
      'save-reopen',
    )
  })

  it('other actor absolute motion survives Duration growth', () => {
    const a1 = makeActor({
      id: 'a1',
      recording: unevenRecording(),
      steadySpeed: 0.5,
      clip: {
        start: 0,
        end: 1,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
    })
    const a2 = makeActor({
      id: 'a2',
      name: 'Other',
      recording: makeRecording(16),
      steadySpeed: 0.6,
      glide: 0.4,
      clip: {
        start: 0.1,
        end: 0.55,
        hideBeforeStart: false,
        hideAfterEnd: false,
      },
      transform: {
        keyframes: [{ id: 'o', t: 0.3, rotationDeg: 90, scale: 1.3 }],
      },
    })
    const before = makeProject({
      actors: [a1, a2],
      playback: {
        durationMs: 1600,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const times = [200, 480, 800, 880]
    const beforeOther = times.map((ms) => poseAt(before, before.actors[1]!, ms))
    const end = poseAt(before, before.actors[0]!, 1599)
    const after = applyPlan(before, 'a1', {
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 250, x: Math.min(0.99, end.x + 0.12), y: end.y },
      ],
      recordedDurationMs: 250,
    })
    expect(after.playback.durationMs).toBeGreaterThan(1600)
    const afterOther = times.map((ms) => poseAt(after, after.actors[1]!, ms))
    assertPosesEqual(beforeOther, afterOther, 'other-actor')
  })
})

describe('continue path restore / undo / limits', () => {
  beforeEach(() => {
    seedStore(
      makeProject({
        actors: [
          makeActor({
            id: 'a1',
            recording: unevenRecording(),
            steadySpeed: 0.5,
            glide: 0.4,
          }),
          makeActor({
            id: 'a2',
            name: 'Other',
            recording: makeRecording(10),
            clip: {
              start: 0,
              end: 0.5,
              hideBeforeStart: false,
              hideAfterEnd: false,
            },
          }),
        ],
      }),
    )
  })

  it('Restore recorded path returns the original take and Steady/Glide', () => {
    const original = useEditorStore.getState().project.actors[0]!.recording!
    const beforeSteady =
      useEditorStore.getState().project.actors[0]!.steadySpeed
    const beforeGlide = useEditorStore.getState().project.actors[0]!.glide ?? 0
    const end = poseAt(
      useEditorStore.getState().project,
      useEditorStore.getState().project.actors[0]!,
      useEditorStore.getState().project.playback.durationMs - 1,
    )
    useEditorStore.getState().armContinuePath()
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 160, x: Math.min(0.99, end.x + 0.1), y: end.y },
      ],
      recordedDurationMs: 160,
    })
    const continued = useEditorStore.getState().project.actors[0]!
    expect(continued.geometryEdit).not.toBeNull()
    expect(continued.recording).toEqual(original)
    expect(continued.steadySpeed).toBe(0)
    expect(continued.glide).toBe(0)

    useEditorStore.getState().restoreRecordedPath()
    const restored = useEditorStore.getState().project.actors[0]!
    expect(restored.geometryEdit).toBeNull()
    expect(restored.recording).toEqual(original)
    expect(restored.steadySpeed).toBe(beforeSteady)
    expect(restored.glide).toBe(beforeGlide)
  })

  it('undoing continue does not overwrite a later edit on another actor', () => {
    const end = poseAt(
      useEditorStore.getState().project,
      useEditorStore.getState().project.actors[0]!,
      useEditorStore.getState().project.playback.durationMs - 1,
    )
    useEditorStore.getState().armContinuePath()
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 140, x: Math.min(0.99, end.x + 0.08), y: end.y },
      ],
      recordedDurationMs: 140,
    })
    const afterContinueDur =
      useEditorStore.getState().project.playback.durationMs

    // Interleaved edit on the other actor; continue undo stack survives the switch.
    useEditorStore.getState().selectActor('a2')
    useEditorStore.getState().commitActorClip('a2', {
      start: 0.05,
      end: 0.4,
      hideBeforeStart: false,
      hideAfterEnd: false,
    })
    const editedAbs = {
      start:
        useEditorStore.getState().project.actors[1]!.clip.start *
        afterContinueDur,
      end:
        useEditorStore.getState().project.actors[1]!.clip.end *
        afterContinueDur,
    }

    // Back to a1: clip history for a2 is selection-scoped and dropped, but the
    // committed a2 clip remains. Undo continue must remap abs times, not reload
    // a2's pre-continue snapshot.
    useEditorStore.getState().selectActor('a1')
    expect(useEditorStore.getState().continuePathUndoStack).toHaveLength(1)
    expect(useEditorStore.getState().actorEditOrder.at(-1)).toBe('continuePath')
    useEditorStore.getState().undoActorEdit()
    const dur = useEditorStore.getState().project.playback.durationMs
    expect(dur).toBeLessThan(afterContinueDur)
    const a2 = useEditorStore.getState().project.actors[1]!
    expect(a2.clip.start * dur).toBeCloseTo(editedAbs.start, 5)
    expect(a2.clip.end * dur).toBeCloseTo(editedAbs.end, 5)
  })

  it('rejects over-max Duration without mutating project or history', () => {
    const longSamples = Array.from({ length: 40 }, (_, i) => ({
      t: i * 200,
      x: 0.1 + i * 0.01,
      y: 0.5,
    }))
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a1',
          recording: {
            samples: longSamples,
            recordedDurationMs: longSamples[longSamples.length - 1]!.t,
          },
          clip: {
            start: 0,
            end: 1,
            hideBeforeStart: false,
            hideAfterEnd: false,
          },
        }),
      ],
      playback: {
        durationMs: MAX_PLAYBACK_DURATION_MS,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    seedStore(project)
    const before = structuredClone(useEditorStore.getState().project)
    const beforeHistory = [
      ...useEditorStore.getState().continuePathUndoStack,
    ]
    const end = longSamples[longSamples.length - 1]!
    useEditorStore.getState().armContinuePath()
    useEditorStore.getState().beginRecording(1, end)
    useEditorStore.getState().finishRecording({
      samples: [
        { t: 0, x: end.x, y: end.y },
        { t: 500, x: Math.min(0.99, end.x + 0.1), y: end.y },
      ],
      recordedDurationMs: 500,
    })
    const after = useEditorStore.getState()
    expect(after.mode).toBe('idle')
    expect(after.recordingIntent).toBe('replace')
    expect(after.continuePathUndoStack).toEqual(beforeHistory)
    expect(after.project.playback.durationMs).toBe(before.playback.durationMs)
    expect(after.project.actors[0]!.recording).toEqual(before.actors[0]!.recording)
    expect(after.project.actors[0]!.geometryEdit).toEqual(
      before.actors[0]!.geometryEdit,
    )
    expect(after.actionAnnouncement).toMatch(/more than 8s/i)
    // Next action usable
    expect(after.armContinuePath()).toBe(true)
    after.cancelContinueRecording()
  })

  it('two successive continuations undo/redo restore both steps', () => {
    const d0 = useEditorStore.getState().project.playback.durationMs
    const times = sampleAbsTimes(d0)
    const p0 = times.map((ms) =>
      poseAt(
        useEditorStore.getState().project,
        useEditorStore.getState().project.actors[0]!,
        ms,
      ),
    )

    const stroke = (dx: number) => {
      const st = useEditorStore.getState()
      const end = poseAt(
        st.project,
        st.project.actors[0]!,
        st.project.actors[0]!.clip.end * st.project.playback.durationMs - 1,
      )
      st.armContinuePath()
      useEditorStore.getState().beginRecording(1, end)
      useEditorStore.getState().finishRecording({
        samples: [
          { t: 0, x: end.x, y: end.y },
          { t: 120, x: Math.min(0.99, end.x + dx), y: end.y },
        ],
        recordedDurationMs: 120,
      })
    }

    stroke(0.08)
    const midDur = useEditorStore.getState().project.playback.durationMs
    const p1 = sampleAbsTimes(d0).map((ms) =>
      poseAt(
        useEditorStore.getState().project,
        useEditorStore.getState().project.actors[0]!,
        ms,
      ),
    )
    stroke(0.07)
    expect(useEditorStore.getState().continuePathUndoStack).toHaveLength(2)

    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.playback.durationMs).toBe(midDur)
    assertPosesEqual(
      p1,
      sampleAbsTimes(d0).map((ms) =>
        poseAt(
          useEditorStore.getState().project,
          useEditorStore.getState().project.actors[0]!,
          ms,
        ),
      ),
      'after-first-undo',
    )

    useEditorStore.getState().undoActorEdit()
    assertPosesEqual(
      p0,
      sampleAbsTimes(d0).map((ms) =>
        poseAt(
          useEditorStore.getState().project,
          useEditorStore.getState().project.actors[0]!,
          ms,
        ),
      ),
      'after-second-undo',
    )

    useEditorStore.getState().redoActorEdit()
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().continuePathUndoStack).toHaveLength(2)
    expect(
      useEditorStore.getState().project.actors[0]!.geometryEdit!.samples.length,
    ).toBeGreaterThan(unevenRecording().samples.length)
  })
})
