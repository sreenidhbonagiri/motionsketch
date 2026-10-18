import { describe, expect, it } from 'vitest'
import {
  MIN_CLIP_SPAN,
  clampClip,
  localToProject,
  moveClip,
  projectToLocal,
  resizeClipEnd,
  resizeClipStart,
  validateClipSecondsDraft,
  validateClipStartMoveForDraft,
} from '../../src/core/clip'
import {
  exportCssFromProject,
  projectTimelineSamples,
} from '../../src/core/export/css'
import {
  PERSIST_FORMAT_VERSION,
  parseSnapshotJson,
  validateSnapshot,
} from '../../src/core/persist/document'
import { evaluateTransform } from '../../src/core/transform'
import { selectActorPositionForActor } from '../../src/state/selectors'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

describe('clip mapping', () => {
  it('holds initial pose before start and final pose after end', () => {
    const clip = { start: 0.25, end: 0.75 }
    expect(projectToLocal(0, clip)).toBe(0)
    expect(projectToLocal(0.25, clip)).toBe(0)
    expect(projectToLocal(0.5, clip)).toBeCloseTo(0.5, 5)
    expect(projectToLocal(0.75, clip)).toBe(1)
    expect(projectToLocal(1, clip)).toBe(1)
    expect(localToProject(0, clip)).toBeCloseTo(0.25, 5)
    expect(localToProject(1, clip)).toBeCloseTo(0.75, 5)
  })

  it('enforces a minimum span when clamping and resizing', () => {
    const tiny = clampClip({ start: 0.5, end: 0.51 })
    expect(tiny.end - tiny.start).toBeGreaterThanOrEqual(MIN_CLIP_SPAN - 1e-9)
    const resized = resizeClipEnd({ start: 0.2, end: 0.8 }, 0.21)
    expect(resized.end - resized.start).toBeGreaterThanOrEqual(MIN_CLIP_SPAN - 1e-9)
    const moved = moveClip({ start: 0.7, end: 0.95 }, 0.5)
    expect(moved.end).toBeLessThanOrEqual(1)
    expect(moved.start).toBeGreaterThanOrEqual(0)
    expect(resizeClipStart({ start: 0.2, end: 0.8 }, 0.79).end - resizeClipStart({ start: 0.2, end: 0.8 }, 0.79).start).toBeGreaterThanOrEqual(
      MIN_CLIP_SPAN - 1e-9,
    )
  })

  it('validateClipSecondsDraft rejects bad drafts without inventing values', () => {
    expect(validateClipSecondsDraft('', '1', 2000).ok).toBe(false)
    expect(validateClipSecondsDraft('abc', '1', 2000).ok).toBe(false)
    expect(validateClipSecondsDraft('0.5', '0.5', 2000).ok).toBe(false)
    expect(validateClipSecondsDraft('1.5', '1.52', 2000).ok).toBe(false)
    expect(validateClipSecondsDraft('-0.1', '1', 2000).ok).toBe(false)
    expect(validateClipSecondsDraft('0', '3', 2000).ok).toBe(false)
    const ok = validateClipSecondsDraft('0.4', '1.6', 2000)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.startSec).toBe(0.4)
      expect(ok.endSec).toBe(1.6)
    }
  })

  it('validateClipStartMoveForDraft uses Start at / Move for wording', () => {
    const short = validateClipStartMoveForDraft('1.50', '0.02', 2000)
    expect(short.ok).toBe(false)
    if (!short.ok) {
      expect(short.error).toMatch(/Move for must be at least/i)
    }
    const overflow = validateClipStartMoveForDraft('1.50', '1.00', 2000)
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) {
      expect(overflow.error).toMatch(/Ends at would be/i)
    }
    const ok = validateClipStartMoveForDraft('0.40', '1.20', 2000)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.startSec).toBe(0.4)
      expect(ok.endSec).toBe(1.6)
    }
  })
})

describe('clip evaluation parity', () => {
  it('uses actor-local progress for position and transform', () => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'late',
          clip: { start: 0.5, end: 1 },
          recording: makeRecording(10),
          transform: {
            keyframes: [
              { id: 'k0', t: 0, rotationDeg: 0, scale: 1 },
              { id: 'k1', t: 1, rotationDeg: 90, scale: 2 },
            ],
          },
        }),
      ],
    })
    const actor = project.actors[0]
    const before = selectActorPositionForActor(
      project,
      actor,
      0.25,
      { x: 0, y: 0 },
      'idle',
    )
    const atStart = selectActorPositionForActor(
      project,
      actor,
      0.5,
      { x: 0, y: 0 },
      'idle',
    )
    expect(before.x).toBeCloseTo(atStart.x, 5)
    expect(before.y).toBeCloseTo(atStart.y, 5)

    const xfHold = evaluateTransform(actor.transform, projectToLocal(0.25, actor.clip))
    expect(xfHold.rotationDeg).toBe(0)
    const xfMid = evaluateTransform(actor.transform, projectToLocal(0.75, actor.clip))
    expect(xfMid.rotationDeg).toBeCloseTo(45, 5)
  })

  it('exports holds and remapped keyframes without collapsing distinct boundaries', () => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          clip: { start: 0.2, end: 0.6 },
          recording: makeRecording(12),
        }),
      ],
      playback: { durationMs: 2000, loop: true, loopMode: 'alternate' },
    })
    const css = exportCssFromProject(project)
    expect(css).toContain('0%')
    expect(css).toContain('20%')
    expect(css).toContain('60%')
    expect(css).toContain('100%')
    expect(css).toContain('infinite alternate')
    // Distinct hold boundaries stay distinct after formatting.
    const samples = projectTimelineSamples([0, 0.5, 1], { start: 0.2, end: 0.6 })
    const pcts = samples.map((s) => Math.round(s.projectT * 10000) / 100)
    expect(new Set(pcts).size).toBe(pcts.length)
  })
})

describe('clip persistence', () => {
  it('migrates v5 actors without clip to a full-length interval', () => {
    const base = makeProject()
    const actor = base.actors[0]
    const { clip: _drop, ...actorWithoutClip } = actor
    void _drop
    const result = validateSnapshot({
      formatVersion: 5,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        version: 1,
        actors: [actorWithoutClip],
        playback: base.playback,
        stageAspect: base.stageAspect,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(result.snapshot.project.name).toBe('Untitled project')
    expect(result.snapshot.project.actors[0].clip).toEqual({
      start: 0,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    })
  })

  it('round-trips clip bounds in the current format', () => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          clip: { start: 0.1, end: 0.4 },
          recording: makeRecording(),
        }),
      ],
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a',
      mode: 'idle',
    })
    useEditorStore.getState().commitActorClip('a', { start: 0.15, end: 0.55 })
    const raw = JSON.stringify({
      formatVersion: PERSIST_FORMAT_VERSION,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: useEditorStore.getState().project,
    })
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0].clip.start).toBeCloseTo(0.15, 5)
    expect(parsed.snapshot.project.actors[0].clip.end).toBeCloseTo(0.55, 5)
  })
})

describe('clip store history', () => {
  it('records one undo step per committed clip gesture', () => {
    const project = makeProject({
      actors: [makeActor({ id: 'a', clip: { start: 0, end: 1 } })],
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a',
      mode: 'idle',
      clipUndoStack: [],
      clipRedoStack: [],
      actorEditOrder: [],
      actorEditRedoOrder: [],
    })
    useEditorStore.getState().beginClipGesture('a')
    useEditorStore.getState().previewActorClip('a', { start: 0.2, end: 1 })
    useEditorStore.getState().finishClipGesture('a', { start: 0.2, end: 1 })
    expect(useEditorStore.getState().project.actors[0].clip.start).toBeCloseTo(
      0.2,
      5,
    )
    expect(useEditorStore.getState().clipUndoStack).toHaveLength(1)
    expect(useEditorStore.getState().actorEditOrder).toEqual(['clip'])
    useEditorStore.getState().undoClip()
    expect(useEditorStore.getState().project.actors[0].clip).toEqual({
      start: 0,
      end: 1,
      hideBeforeStart: false,
      hideAfterEnd: false,
    })
    useEditorStore.getState().redoClip()
    expect(useEditorStore.getState().project.actors[0].clip.start).toBeCloseTo(
      0.2,
      5,
    )
  })
})
