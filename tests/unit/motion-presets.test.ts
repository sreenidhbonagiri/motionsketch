import { beforeEach, describe, expect, it } from 'vitest'
import { strFromU8 } from 'fflate'
import {
  isActorVisibleAt,
  projectToLocal,
} from '../../src/core/clip'
import { makeGeometryEdit } from '../../src/core/edit'
import { maxPlaybackExportError } from '../../src/core/export/consistency'
import { exportCssFromProject } from '../../src/core/export/css'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { buildKeyframes } from '../../src/core/export/format'
import {
  buildReactPackage,
  REACT_PACKAGE_CSS_NAME,
} from '../../src/core/export/reactPackage'
import {
  MOTION_PRESETS,
  buildMotionPresetState,
  captureMotionState,
  clipFromPresetTiming,
  motionStateFingerprint,
  type MotionPresetId,
} from '../../src/core/motionPresets'
import {
  PERSIST_FORMAT_VERSION,
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { evaluate } from '../../src/core/playback'
import { createSceneActor } from '../../src/core/sceneActor'
import { evaluateTransform } from '../../src/core/transform'
import type { Project, SceneActor } from '../../src/core/types'
import {
  selectActorPositionForActor,
  selectProcessedPathForActor,
} from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'

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
          samples: actor.geometryEdit.samples.map((s) => ({ ...s })),
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
    presetSession: null,
    presetUndoStack: [],
    presetRedoStack: [],
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

function emptyProject(rest = { x: 0.4, y: 0.55 }): Project {
  const actor = createSceneActor({
    id: 'preset-actor',
    name: 'Preset Actor',
    recording: null,
    restPosition: rest,
  })
  return {
    version: 1,
    name: 'Preset fixture',
    stageAspect: 1.6,
    playback: {
      durationMs: 1200,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [actor],
  }
}

/** Actor with a prior path, transform, geometry edit, and both clip hide flags. */
function actorWithPriorMotion(): SceneActor {
  const samples = [
    { t: 0, x: 0.2, y: 0.3 },
    { t: 100, x: 0.35, y: 0.45 },
    { t: 200, x: 0.5, y: 0.4 },
    { t: 300, x: 0.7, y: 0.55 },
  ]
  return createSceneActor({
    id: 'prior-actor',
    name: 'Prior Actor',
    restPosition: { x: 0.2, y: 0.3 },
    recording: { samples, recordedDurationMs: 300 },
    geometryEdit: makeGeometryEdit(samples, 0.2, [0, 1, 3]),
    smoothing: 0.4,
    steadySpeed: 0.25,
    glide: 0.3,
    faceAlongPath: true,
    directionOffsetDeg: 15,
    transform: {
      keyframes: [
        {
          id: 'prior-xf-0',
          t: 0,
          rotationDeg: 0,
          scale: 1,
        },
        {
          id: 'prior-xf-1',
          t: 0.5,
          rotationDeg: 40,
          scale: 1.25,
        },
        {
          id: 'prior-xf-2',
          t: 1,
          rotationDeg: 40,
          scale: 1,
        },
      ],
    },
    clip: {
      start: 0.15,
      end: 0.85,
      hideBeforeStart: false,
      hideAfterEnd: true,
    },
  })
}

function applyPreset(id: MotionPresetId) {
  expect(useEditorStore.getState().beginPresetPreview(id)).toBe(true)
  expect(useEditorStore.getState().applyPreset()).toBe(true)
}

function exportBundle(project: Project) {
  const css = exportCssFromProject(project)
  const html = buildHtmlDemoFromProject(project)
  return { css, html }
}

describe('motion presets', () => {
  beforeEach(() => {
    seedStore(emptyProject())
  })

  it('lists curated presets with honest labels (no fade wording)', () => {
    expect(MOTION_PRESETS.map((p) => p.id)).toEqual([
      'slide-in',
      'pop-in',
      'float',
      'attention-pulse',
    ])
    expect(MOTION_PRESETS.map((p) => p.label)).toEqual([
      'Slide In',
      'Pop In',
      'Float',
      'Attention Pulse',
    ])
    for (const preset of MOTION_PRESETS) {
      const blob = `${preset.label} ${preset.summary} ${preset.behavior}`.toLowerCase()
      expect(blob).not.toMatch(/\bfade\b/)
    }
  })

  it('preview does not mutate the project', () => {
    const before = JSON.stringify(useEditorStore.getState().project)
    expect(useEditorStore.getState().beginPresetPreview('slide-in')).toBe(true)
    expect(useEditorStore.getState().presetSession?.presetId).toBe('slide-in')
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
    expect(useEditorStore.getState().mode).toBe('playing')
  })

  it('cancel leaves the project unchanged and clears the session', () => {
    const before = JSON.stringify(useEditorStore.getState().project)
    useEditorStore.getState().beginPresetPreview('pop-in')
    useEditorStore.getState().setPresetTiming({ delayMs: 300, durationMs: 600 })
    useEditorStore.getState().cancelPreset()
    expect(useEditorStore.getState().presetSession).toBeNull()
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
    expect(useEditorStore.getState().presetUndoStack).toHaveLength(0)
  })

  describe('review regressions', () => {
    it('apply clears orphaned transform/clip/glide history kinds', () => {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: 'History orphan',
        stageAspect: 1.6,
        playback: {
          durationMs: 1600,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      // Simulate prior actor edits that would leave empty stacks if Apply only
      // cleared the stacks without resetting actorEditOrder.
      useEditorStore.setState({
        actorEditOrder: ['transform', 'clip', 'glide'],
        transformUndoStack: [prior.transform],
        clipUndoStack: [prior.clip],
        glideUndoStack: [0.3],
      })

      applyPreset('slide-in')
      expect(useEditorStore.getState().actorEditOrder).toEqual(['preset'])
      expect(useEditorStore.getState().transformUndoStack).toHaveLength(0)
      expect(useEditorStore.getState().clipUndoStack).toHaveLength(0)
      expect(useEditorStore.getState().glideUndoStack).toHaveLength(0)

      useEditorStore.getState().undoActorEdit()
      expect(useEditorStore.getState().actorEditOrder).toEqual([])
      expect(
        motionStateFingerprint(
          captureMotionState(useEditorStore.getState().project.actors[0]!),
        ),
      ).toBe(motionStateFingerprint(captureMotionState(prior)))
      // No second undo targeting a wiped transform stack.
      useEditorStore.getState().undoActorEdit()
      expect(
        motionStateFingerprint(
          captureMotionState(useEditorStore.getState().project.actors[0]!),
        ),
      ).toBe(motionStateFingerprint(captureMotionState(prior)))
    })

    it('adjusting Start at / Move for leaves Original compare and shows preset', () => {
      useEditorStore.getState().beginPresetPreview('float')
      useEditorStore.getState().setPresetCompareMode('original')
      expect(useEditorStore.getState().presetSession!.compareMode).toBe(
        'original',
      )
      useEditorStore.getState().setPresetTiming({ delayMs: 200 })
      expect(useEditorStore.getState().presetSession!.compareMode).toBe('preset')
      expect(useEditorStore.getState().presetSession!.delayMs).toBe(200)
    })

    it('changing project Duration reclamps open preset timing without writing actor', () => {
      const before = JSON.stringify(useEditorStore.getState().project.actors)
      useEditorStore.getState().beginPresetPreview('pop-in')
      useEditorStore.getState().setPresetTiming({
        delayMs: 600,
        durationMs: 600,
      })
      // Shrink project Duration so delay+duration must reclamp.
      useEditorStore.getState().setDurationMs(800)
      const session = useEditorStore.getState().presetSession!
      expect(session.delayMs + session.durationMs).toBeLessThanOrEqual(800)
      expect(session.proposed.clip.end).toBeLessThanOrEqual(1)
      expect(
        JSON.stringify(useEditorStore.getState().project.actors),
      ).toBe(before)
      expect(useEditorStore.getState().project.playback.durationMs).toBe(800)
    })

    it('Duration change leaves Original compare so stage matches Start at / Move for', () => {
      useEditorStore.getState().beginPresetPreview('slide-in')
      useEditorStore.getState().setPresetTiming({
        delayMs: 400,
        durationMs: 600,
      })
      useEditorStore.getState().setPresetCompareMode('original')
      expect(useEditorStore.getState().presetSession!.compareMode).toBe(
        'original',
      )
      useEditorStore.getState().setDurationMs(1000)
      const session = useEditorStore.getState().presetSession!
      expect(session.compareMode).toBe('preset')
      expect(session.delayMs + session.durationMs).toBeLessThanOrEqual(1000)
      expect(useEditorStore.getState().mode).toBe('playing')
    })
  })

  describe('preset switching and original comparison', () => {
    it('switches presets while keeping Delay and Duration; project untouched', () => {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: 'Switch fixture',
        stageAspect: 1.6,
        playback: {
          durationMs: 2000,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      const before = JSON.stringify(useEditorStore.getState().project)
      expect(useEditorStore.getState().beginPresetPreview('slide-in')).toBe(true)
      useEditorStore.getState().setPresetTiming({
        delayMs: 500,
        durationMs: 900,
      })
      expect(useEditorStore.getState().beginPresetPreview('float')).toBe(true)
      const session = useEditorStore.getState().presetSession!
      expect(session.presetId).toBe('float')
      expect(session.delayMs).toBe(500)
      expect(session.durationMs).toBe(900)
      expect(session.compareMode).toBe('preset')
      expect(session.proposed.transform.keyframes).toHaveLength(0)
      expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)

      expect(useEditorStore.getState().beginPresetPreview('attention-pulse')).toBe(
        true,
      )
      const next = useEditorStore.getState().presetSession!
      expect(next.presetId).toBe('attention-pulse')
      expect(next.delayMs).toBe(500)
      expect(next.durationMs).toBe(900)
      expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
    })

    it('original compare keeps proposed in session but leaves committed actor alone', () => {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: 'Compare fixture',
        stageAspect: 1.6,
        playback: {
          durationMs: 1600,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      const beforeFp = motionStateFingerprint(
        captureMotionState(useEditorStore.getState().project.actors[0]!),
      )
      const beforeProject = JSON.stringify(useEditorStore.getState().project)

      useEditorStore.getState().beginPresetPreview('pop-in')
      useEditorStore.getState().setPresetTiming({
        delayMs: 200,
        durationMs: 800,
      })
      const proposedFp = motionStateFingerprint(
        useEditorStore.getState().presetSession!.proposed,
      )
      expect(proposedFp).not.toBe(beforeFp)

      useEditorStore.getState().setPresetCompareMode('original')
      expect(useEditorStore.getState().presetSession!.compareMode).toBe(
        'original',
      )
      // Proposed recipe stays selected even while viewing original.
      expect(useEditorStore.getState().presetSession!.presetId).toBe('pop-in')
      expect(
        motionStateFingerprint(
          useEditorStore.getState().presetSession!.proposed,
        ),
      ).toBe(proposedFp)
      expect(
        motionStateFingerprint(
          captureMotionState(useEditorStore.getState().project.actors[0]!),
        ),
      ).toBe(beforeFp)
      expect(JSON.stringify(useEditorStore.getState().project)).toBe(beforeProject)

      useEditorStore.getState().setPresetCompareMode('preset')
      expect(useEditorStore.getState().presetSession!.compareMode).toBe('preset')
      expect(JSON.stringify(useEditorStore.getState().project)).toBe(beforeProject)
    })

    it('cancel after switch + original compare leaves actor unchanged', () => {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: 'Cancel compare',
        stageAspect: 1.6,
        playback: {
          durationMs: 1600,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      const before = JSON.stringify(useEditorStore.getState().project)
      useEditorStore.getState().beginPresetPreview('slide-in')
      useEditorStore.getState().setPresetTiming({
        delayMs: 100,
        durationMs: 700,
      })
      useEditorStore.getState().beginPresetPreview('float')
      useEditorStore.getState().setPresetCompareMode('original')
      useEditorStore.getState().cancelPreset()
      expect(useEditorStore.getState().presetSession).toBeNull()
      expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
    })

    it('apply commits only the currently selected preset; undo restores prior', () => {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: 'Apply selected',
        stageAspect: 1.6,
        playback: {
          durationMs: 1600,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      const beforeFp = motionStateFingerprint(
        captureMotionState(useEditorStore.getState().project.actors[0]!),
      )

      useEditorStore.getState().beginPresetPreview('slide-in')
      useEditorStore.getState().setPresetTiming({
        delayMs: 320,
        durationMs: 640,
      })
      useEditorStore.getState().beginPresetPreview('attention-pulse')
      useEditorStore.getState().setPresetCompareMode('original')
      // Apply uses the selected recipe even while Original is on screen.
      expect(useEditorStore.getState().applyPreset()).toBe(true)
      expect(useEditorStore.getState().presetSession).toBeNull()

      const applied = useEditorStore.getState().project.actors[0]!
      expect(applied.transform.keyframes.length).toBeGreaterThan(2)
      expect(evaluateTransform(applied.transform, 0.18).scale).toBeGreaterThan(
        1.05,
      )
      expect(applied.clip.start).toBeCloseTo(320 / 1600, 5)
      // Pulse is not an entrance — hide-before stays as prior false.
      expect(applied.clip.hideBeforeStart).toBe(false)

      useEditorStore.getState().undoActorEdit()
      expect(
        motionStateFingerprint(
          captureMotionState(useEditorStore.getState().project.actors[0]!),
        ),
      ).toBe(beforeFp)
    })

    it('editor and export stay consistent after apply from a switched preset', () => {
      seedStore(emptyProject())
      useEditorStore.getState().beginPresetPreview('pop-in')
      useEditorStore.getState().setPresetTiming({
        delayMs: 240,
        durationMs: 600,
      })
      useEditorStore.getState().beginPresetPreview('slide-in')
      useEditorStore.getState().setPresetCompareMode('original')
      useEditorStore.getState().setPresetCompareMode('preset')
      expect(useEditorStore.getState().applyPreset()).toBe(true)

      const project = useEditorStore.getState().project
      const actor = project.actors[0]!
      expect(actor.clip.start).toBeCloseTo(0.2, 5)
      const path = selectProcessedPathForActor(project, actor)
      const keyframes = buildKeyframes(
        actor.recording!.samples,
        actor.smoothing,
        actor.steadySpeed,
      )
      expect(maxPlaybackExportError(path, keyframes, 48)).toBeLessThan(0.02)

      const css = exportCssFromProject(project)
      const html = buildHtmlDemoFromProject(project)
      const react = buildReactPackage(project)
      expect(react.ok).toBe(true)
      if (!react.ok) return
      const reactCss = strFromU8(
        react.files.find((f) => f.path === REACT_PACKAGE_CSS_NAME)!.bytes,
      )
      expect(reactCss).toBe(css)
      expect(css).toMatch(/scale\(/)
      expect(html).toContain('prefers-reduced-motion')
      expect(reactCss).toContain('ms-motion-ok')
    })
  })

  describe('duration and delay controls', () => {
    it('preview timing updates proposed clip without mutating the project', () => {
      const before = JSON.stringify(useEditorStore.getState().project)
      expect(useEditorStore.getState().beginPresetPreview('slide-in')).toBe(true)
      useEditorStore.getState().setPresetTiming({
        delayMs: 240,
        durationMs: 480,
      })
      const session = useEditorStore.getState().presetSession!
      expect(session.delayMs).toBe(240)
      expect(session.durationMs).toBe(480)
      expect(session.proposed.clip.start).toBeCloseTo(240 / 1200, 5)
      expect(session.proposed.clip.end).toBeCloseTo((240 + 480) / 1200, 5)
      expect(session.proposed.clip.hideBeforeStart).toBe(true)
      expect(JSON.stringify(useEditorStore.getState().project)).toBe(before)
    })

    it('maps delay to Start and duration to Move for', () => {
      const clip = clipFromPresetTiming(
        { delayMs: 300, durationMs: 600 },
        1200,
        { hideBeforeStart: true, hideAfterEnd: false },
      )
      expect(clip.start).toBeCloseTo(0.25, 5)
      expect(clip.end).toBeCloseTo(0.75, 5)
      expect(isActorVisibleAt(0.24, clip)).toBe(false)
      expect(isActorVisibleAt(0.25, clip)).toBe(true)
    })

    it('apply writes timing into the actor clip; undo restores prior clip', () => {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: 'Timing undo',
        stageAspect: 1.6,
        playback: {
          durationMs: 2000,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      const beforeClip = {
        ...useEditorStore.getState().project.actors[0]!.clip,
      }
      const beforeFp = motionStateFingerprint(
        captureMotionState(useEditorStore.getState().project.actors[0]!),
      )

      expect(useEditorStore.getState().beginPresetPreview('float')).toBe(true)
      useEditorStore.getState().setPresetTiming({
        delayMs: 400,
        durationMs: 800,
      })
      expect(JSON.stringify(useEditorStore.getState().project.actors[0]!.clip)).toBe(
        JSON.stringify(beforeClip),
      )
      expect(useEditorStore.getState().applyPreset()).toBe(true)

      const applied = useEditorStore.getState().project.actors[0]!
      expect(applied.clip.start).toBeCloseTo(400 / 2000, 5)
      expect(applied.clip.end).toBeCloseTo(1200 / 2000, 5)
      // Float preserves prior hide flags; only Start / Move for change.
      expect(applied.clip.hideBeforeStart).toBe(false)
      expect(applied.clip.hideAfterEnd).toBe(true)

      useEditorStore.getState().undoActorEdit()
      expect(
        motionStateFingerprint(
          captureMotionState(useEditorStore.getState().project.actors[0]!),
        ),
      ).toBe(beforeFp)
      expect(useEditorStore.getState().project.actors[0]!.clip).toEqual(beforeClip)
    })

    it('CSS, HTML, and React exports match editor clip timing', () => {
      seedStore(emptyProject())
      expect(useEditorStore.getState().beginPresetPreview('slide-in')).toBe(true)
      useEditorStore.getState().setPresetTiming({
        delayMs: 300,
        durationMs: 600,
      })
      expect(useEditorStore.getState().applyPreset()).toBe(true)
      const project = useEditorStore.getState().project
      const actor = project.actors[0]!
      expect(actor.clip.start).toBeCloseTo(0.25, 5)
      expect(actor.clip.end).toBeCloseTo(0.75, 5)

      // Editor: hidden before delay; moving during the clip window.
      expect(isActorVisibleAt(0.2, actor.clip)).toBe(false)
      expect(isActorVisibleAt(0.25, actor.clip)).toBe(true)
      const path = selectProcessedPathForActor(project, actor)
      const localMid = projectToLocal(0.5, actor.clip)
      const editorPos = selectActorPositionForActor(
        project,
        actor,
        0.5,
        actor.restPosition,
        'idle',
        undefined,
        true,
      )
      expect(editorPos.y).toBeCloseTo(evaluate(path, localMid).y, 5)

      const css = exportCssFromProject(project)
      const html = buildHtmlDemoFromProject(project)
      const react = buildReactPackage(project)
      expect(react.ok).toBe(true)
      if (!react.ok) return
      const reactCss = strFromU8(
        react.files.find((f) => f.path === REACT_PACKAGE_CSS_NAME)!.bytes,
      )
      expect(reactCss).toBe(css)

      // Delay > 0 + hide-before → discrete visibility keyframes in all surfaces.
      for (const bundle of [css, html, reactCss]) {
        expect(bundle).toContain('visibility')
        expect(bundle).toMatch(/25(\.0+)?%/)
        expect(bundle).toMatch(/75(\.0+)?%/)
        expect(bundle).toContain('prefers-reduced-motion')
        expect(bundle).toContain('ms-motion-ok')
      }
      expect(html).toContain(
        css.slice(css.indexOf('@keyframes'), css.indexOf('@keyframes') + 40),
      )
    })
  })

  describe('visible motion shape', () => {
    it('Slide In moves upward and scales up; sets hide-before', () => {
      const actor = useEditorStore.getState().project.actors[0]!
      const proposed = buildMotionPresetState('slide-in', actor, 1200)
      const start = proposed.recording!.samples[0]!
      const end = proposed.recording!.samples.at(-1)!
      expect(start.y).toBeGreaterThan(end.y)
      expect(start.x).toBeCloseTo(end.x, 5)
      expect(end.x).toBeCloseTo(actor.restPosition.x, 5)
      expect(end.y).toBeCloseTo(actor.restPosition.y, 5)
      expect(evaluateTransform(proposed.transform, 0).scale).toBeLessThan(0.9)
      expect(evaluateTransform(proposed.transform, 1).scale).toBeCloseTo(1, 5)
      expect(proposed.clip.hideBeforeStart).toBe(true)
    })

    it('Pop In stays at rest and overshoots scale', () => {
      const actor = useEditorStore.getState().project.actors[0]!
      const proposed = buildMotionPresetState('pop-in', actor, 1200)
      for (const s of proposed.recording!.samples) {
        expect(s.x).toBeCloseTo(actor.restPosition.x, 5)
        expect(s.y).toBeCloseTo(actor.restPosition.y, 5)
      }
      expect(evaluateTransform(proposed.transform, 0).scale).toBeLessThan(0.3)
      expect(evaluateTransform(proposed.transform, 0.32).scale).toBeGreaterThan(
        1.05,
      )
      expect(evaluateTransform(proposed.transform, 1).scale).toBeCloseTo(1, 5)
      expect(proposed.clip.hideBeforeStart).toBe(true)
    })

    it('Float oscillates in Y and ends on the rest pose for seamless Loop', () => {
      const actor = useEditorStore.getState().project.actors[0]!
      const proposed = buildMotionPresetState('float', actor, 1200)
      const ys = proposed.recording!.samples.map((s) => s.y)
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.05)
      const first = proposed.recording!.samples[0]!
      const last = proposed.recording!.samples.at(-1)!
      expect(first.x).toBeCloseTo(last.x, 5)
      expect(first.y).toBeCloseTo(last.y, 5)
      expect(proposed.transform.keyframes).toHaveLength(0)
      expect(proposed.clip.hideBeforeStart).toBe(actor.clip.hideBeforeStart)
    })

    it('Attention Pulse stays put and pulses scale above 1', () => {
      const actor = useEditorStore.getState().project.actors[0]!
      const proposed = buildMotionPresetState('attention-pulse', actor, 1200)
      for (const s of proposed.recording!.samples) {
        expect(s.x).toBeCloseTo(actor.restPosition.x, 5)
        expect(s.y).toBeCloseTo(actor.restPosition.y, 5)
      }
      expect(evaluateTransform(proposed.transform, 0).scale).toBeCloseTo(1, 5)
      expect(evaluateTransform(proposed.transform, 0.18).scale).toBeGreaterThan(
        1.1,
      )
      expect(evaluateTransform(proposed.transform, 1).scale).toBeCloseTo(1, 5)
    })
  })

  it('apply + undo restores exact prior path, transform, and clip flags', () => {
    const prior = actorWithPriorMotion()
    seedStore({
      version: 1,
      name: 'Undo fixture',
      stageAspect: 1.6,
      playback: {
        durationMs: 1600,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
      actors: [prior],
    })
    const before = motionStateFingerprint(
      captureMotionState(useEditorStore.getState().project.actors[0]!),
    )
    expect(useEditorStore.getState().project.actors[0]!.clip.hideBeforeStart).toBe(
      false,
    )
    expect(useEditorStore.getState().project.actors[0]!.clip.hideAfterEnd).toBe(
      true,
    )

    applyPreset('slide-in')
    const applied = useEditorStore.getState().project.actors[0]!
    expect(applied.clip.hideBeforeStart).toBe(true)
    expect(applied.clip.hideAfterEnd).toBe(true)
    expect(applied.clip.start).toBeCloseTo(0.15, 5)
    expect(applied.geometryEdit).toBeNull()
    expect(motionStateFingerprint(captureMotionState(applied))).not.toBe(before)

    useEditorStore.getState().undoActorEdit()
    const restored = useEditorStore.getState().project.actors[0]!
    expect(motionStateFingerprint(captureMotionState(restored))).toBe(before)
    expect(restored.recording?.samples).toEqual(prior.recording?.samples)
    expect(restored.transform).toEqual(prior.transform)
    expect(restored.clip).toEqual(prior.clip)
    expect(restored.geometryEdit).toEqual(prior.geometryEdit)
    expect(restored.smoothing).toBe(0.4)
    expect(restored.steadySpeed).toBe(0.25)
    expect(restored.glide).toBe(0.3)
    expect(restored.faceAlongPath).toBe(true)
    expect(restored.directionOffsetDeg).toBe(15)
  })

  it('undo after each preset restores exact prior motion state', () => {
    for (const preset of MOTION_PRESETS) {
      const prior = actorWithPriorMotion()
      seedStore({
        version: 1,
        name: `Undo ${preset.id}`,
        stageAspect: 1.6,
        playback: {
          durationMs: 1400,
          loop: false,
          loopMode: 'repeat',
          trigger: 'page-load',
        },
        actors: [prior],
      })
      const before = motionStateFingerprint(
        captureMotionState(useEditorStore.getState().project.actors[0]!),
      )
      applyPreset(preset.id)
      useEditorStore.getState().undoActorEdit()
      expect(
        motionStateFingerprint(
          captureMotionState(useEditorStore.getState().project.actors[0]!),
        ),
      ).toBe(before)
    }
  })

  it('persists an applied preset through snapshot round-trip', () => {
    applyPreset('float')
    const project = useEditorStore.getState().project
    const raw = serializeSnapshot(
      buildSnapshot(project, null, '2026-10-18T00:00:00.000Z'),
    )
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    const actor = parsed.snapshot.project.actors[0]!
    expect(actor.recording?.samples.length).toBeGreaterThan(2)
    const yValues = actor.recording!.samples.map((s) => s.y)
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeGreaterThan(0.02)
  })

  describe('export with Loop off and reduced motion', () => {
    const cases: MotionPresetId[] = [
      'slide-in',
      'pop-in',
      'float',
      'attention-pulse',
    ]

    it.each(cases)(
      '%s: Loop-off CSS plays once (forwards), reduced-motion gated, HTML embeds it',
      (id) => {
        seedStore(emptyProject())
        // Explicit Loop off (default) — presets must not depend on Loop being on.
        expect(useEditorStore.getState().project.playback.loop).toBe(false)
        applyPreset(id)
        const project = useEditorStore.getState().project
        expect(project.playback.loop).toBe(false)

        const actor = project.actors[0]!
        const path = selectProcessedPathForActor(project, actor)
        const keyframes = buildKeyframes(
          actor.recording!.samples,
          actor.smoothing,
          actor.steadySpeed,
        )
        expect(maxPlaybackExportError(path, keyframes, 48)).toBeLessThan(0.02)

        // Editor sample mid-timeline matches processed path evaluation.
        const mid = evaluate(path, 0.5)
        expect(Number.isFinite(mid.x)).toBe(true)

        const { css, html } = exportBundle(project)
        expect(css).toMatch(/\d+ms linear forwards/)
        expect(css).not.toMatch(/infinite/)
        expect(css).toContain('prefers-reduced-motion')
        expect(css).toContain('ms-motion-ok')
        expect(css).toMatch(
          /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none\s*!important/,
        )

        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('prefers-reduced-motion')
        expect(html).toContain('ms-motion-ok')
        expect(html).toMatch(/\d+ms linear forwards/)
        expect(html).not.toMatch(/infinite/)

        if (id === 'slide-in' || id === 'pop-in' || id === 'attention-pulse') {
          expect(css).toMatch(/scale\(/)
        }
        if (id === 'slide-in' || id === 'pop-in') {
          // Visibility clip animation present when hide-before is on.
          expect(actor.clip.hideBeforeStart).toBe(true)
        }
      },
    )
  })

  it('entrance presets hide strictly before a delayed Start', () => {
    const actor = useEditorStore.getState().project.actors[0]!
    const proposed = buildMotionPresetState('pop-in', actor, 1000)
    const delayed = {
      ...proposed.clip,
      start: 0.2,
      end: 0.8,
      hideBeforeStart: true,
    }
    expect(isActorVisibleAt(0.19, delayed)).toBe(false)
    expect(isActorVisibleAt(0.2, delayed)).toBe(true)
  })

  it('preserves appearance when applying over an empty actor', () => {
    const appearanceBefore = JSON.stringify(
      useEditorStore.getState().project.actors[0]!.appearance,
    )
    const restBefore = {
      ...useEditorStore.getState().project.actors[0]!.restPosition,
    }
    applyPreset('slide-in')
    const actor = useEditorStore.getState().project.actors[0]!
    expect(JSON.stringify(actor.appearance)).toBe(appearanceBefore)
    expect(actor.restPosition).toEqual(restBefore)
  })
})
