import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildVisibilityKeyframesCss,
  exportCssFromProject,
} from '../../src/core/export/css'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  clampClip,
  cloneClip,
  isActorVisibleAt,
  parseActorClip,
} from '../../src/core/clip'
import {
  PERSIST_FORMAT_VERSION,
  PERSIST_FORMAT_VERSION_V7,
  parseSnapshotJson,
  buildSnapshot,
} from '../../src/core/persist/document'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

describe('actor visibility timing', () => {
  it('is visible at start; hidden at and after end when hide-after is on', () => {
    const clip = clampClip({
      start: 0.25,
      end: 0.75,
      hideBeforeStart: true,
      hideAfterEnd: true,
    })
    expect(isActorVisibleAt(0, clip)).toBe(false)
    expect(isActorVisibleAt(0.249999, clip)).toBe(false)
    expect(isActorVisibleAt(0.25, clip)).toBe(true)
    expect(isActorVisibleAt(0.5, clip)).toBe(true)
    expect(isActorVisibleAt(0.749999, clip)).toBe(true)
    expect(isActorVisibleAt(0.75, clip)).toBe(false)
    expect(isActorVisibleAt(0.750001, clip)).toBe(false)
    expect(isActorVisibleAt(1, clip)).toBe(false)
  })

  it('each flag works independently; both off keeps holds visible', () => {
    const beforeOnly = clampClip({
      start: 0.3,
      end: 0.8,
      hideBeforeStart: true,
      hideAfterEnd: false,
    })
    expect(isActorVisibleAt(0.1, beforeOnly)).toBe(false)
    expect(isActorVisibleAt(0.3, beforeOnly)).toBe(true)
    expect(isActorVisibleAt(0.8, beforeOnly)).toBe(true)
    expect(isActorVisibleAt(0.9, beforeOnly)).toBe(true)

    const afterOnly = clampClip({
      start: 0.3,
      end: 0.8,
      hideBeforeStart: false,
      hideAfterEnd: true,
    })
    expect(isActorVisibleAt(0.1, afterOnly)).toBe(true)
    expect(isActorVisibleAt(0.3, afterOnly)).toBe(true)
    expect(isActorVisibleAt(0.799999, afterOnly)).toBe(true)
    expect(isActorVisibleAt(0.8, afterOnly)).toBe(false)
    expect(isActorVisibleAt(0.9, afterOnly)).toBe(false)

    const holds = clampClip({
      start: 0.3,
      end: 0.8,
      hideBeforeStart: false,
      hideAfterEnd: false,
    })
    expect(isActorVisibleAt(0.1, holds)).toBe(true)
    expect(isActorVisibleAt(0.9, holds)).toBe(true)
  })

  it('handles clips starting at 0 or ending at 1', () => {
    const fromZero = clampClip({
      start: 0,
      end: 0.5,
      hideBeforeStart: true,
      hideAfterEnd: true,
    })
    expect(isActorVisibleAt(0, fromZero)).toBe(true)
    expect(isActorVisibleAt(0.499, fromZero)).toBe(true)
    expect(isActorVisibleAt(0.5, fromZero)).toBe(false)

    const toOne = clampClip({
      start: 0.5,
      end: 1,
      hideBeforeStart: true,
      hideAfterEnd: true,
    })
    expect(isActorVisibleAt(0.49, toOne)).toBe(false)
    expect(isActorVisibleAt(0.5, toOne)).toBe(true)
    expect(isActorVisibleAt(0.999, toOne)).toBe(true)
    expect(isActorVisibleAt(1, toOne)).toBe(false)

    const full = clampClip({
      start: 0,
      end: 1,
      hideBeforeStart: true,
      hideAfterEnd: true,
    })
    expect(isActorVisibleAt(0, full)).toBe(true)
    expect(isActorVisibleAt(0.5, full)).toBe(true)
    expect(isActorVisibleAt(1, full)).toBe(false)
  })

  it('rejects non-boolean visibility on import', () => {
    const bad = parseActorClip(
      { start: 0, end: 1, hideBeforeStart: 'yes' },
      0,
    )
    expect(bad.ok).toBe(false)
  })

  it('migrates older clips with both flags off', () => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording: makeRecording(6),
          clip: { start: 0.2, end: 0.7 },
        }),
      ],
    })
    const { hideBeforeStart: _a, hideAfterEnd: _b, ...legacyClip } =
      project.actors[0].clip
    void _a
    void _b
    const raw = JSON.stringify({
      formatVersion: PERSIST_FORMAT_VERSION_V7,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: {
        ...project,
        actors: [{ ...project.actors[0], clip: legacyClip }],
      },
    })
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(parsed.snapshot.project.actors[0].clip.hideBeforeStart).toBe(false)
    expect(parsed.snapshot.project.actors[0].clip.hideAfterEnd).toBe(false)
    expect(parsed.snapshot.project.actors[0].clip.start).toBeCloseTo(0.2, 5)
  })

  it('round-trips visibility through snapshot JSON', () => {
    const project = makeProject({
      actors: [
        makeActor({
          recording: makeRecording(8),
          clip: {
            start: 0.1,
            end: 0.9,
            hideBeforeStart: true,
            hideAfterEnd: true,
          },
        }),
      ],
    })
    const raw = JSON.stringify(buildSnapshot(project, null))
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0].clip.hideBeforeStart).toBe(true)
    expect(parsed.snapshot.project.actors[0].clip.hideAfterEnd).toBe(true)
  })

  it('exports discrete visibility with step-end only (no epsilon / step-start)', () => {
    const project = makeProject({
      actors: [
        makeActor({
          recording: makeRecording(10),
          clip: {
            start: 0.2,
            end: 0.6,
            hideBeforeStart: true,
            hideAfterEnd: true,
          },
        }),
      ],
    })
    const css = exportCssFromProject(project)
    expect(css).toMatch(/motionsketch-vis/)
    expect(css).toContain('visibility: hidden')
    expect(css).toContain('visibility: visible')
    expect(css).toContain('step-end')
    expect(css).not.toContain('step-start')
    expect(css).not.toMatch(/opacity\s*:/)
    const vis = buildVisibilityKeyframesCss(project.actors[0].clip)
    expect(vis).not.toBeNull()
    expect(vis!.initialHidden).toBe(true)
    expect(vis!.frames).toContain('visibility: hidden')
    // Hidden keyframe lands on clip end (not an epsilon past it).
    expect(vis!.frames).toMatch(/60(?:\.0+)?%\s*\{\s*visibility:\s*hidden/)

    const html = buildHtmlDemoFromProject(project)
    expect(html).toContain('motionsketch-vis')
    expect(html).toContain('visibility: hidden')
  })

  it('exports hide-after when the clip ends at 1', () => {
    const clip = clampClip({
      start: 0.25,
      end: 1,
      hideBeforeStart: true,
      hideAfterEnd: true,
    })
    const vis = buildVisibilityKeyframesCss(clip)
    expect(vis).not.toBeNull()
    expect(vis!.frames).toMatch(/100%\s*\{\s*visibility:\s*hidden/)
    expect(isActorVisibleAt(1, clip)).toBe(false)
    expect(isActorVisibleAt(0.25, clip)).toBe(true)
  })

  it('exports visibility for a stationary actor with clip flags', () => {
    const project = makeProject({
      actors: [
        makeActor({
          recording: makeRecording(8),
          name: 'Mover',
        }),
        makeActor({
          id: 'still',
          name: 'Still',
          recording: null,
          clip: {
            start: 0.25,
            end: 0.75,
            hideBeforeStart: true,
            hideAfterEnd: true,
          },
        }),
      ],
    })
    const css = exportCssFromProject(project)
    expect(css).toContain('motionsketch-vis-actor-2')
    expect(css).toMatch(/\.actor-2[\s\S]*animation:\s*motionsketch-vis-actor-2/)
  })
})

describe('visibility undo and duplication', () => {
  beforeEach(() => {
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a',
          recording: makeRecording(6),
          clip: { start: 0.2, end: 0.8 },
        }),
      ],
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a',
      mode: 'idle',
      clipUndoStack: [],
      clipRedoStack: [],
      actorEditOrder: [],
      actorEditRedoOrder: [],
      transformUndoStack: [],
      transformRedoStack: [],
    })
  })

  it('commits visibility into clip undo history', () => {
    const store = useEditorStore.getState()
    store.commitActorClip('a', {
      ...store.project.actors[0].clip,
      hideBeforeStart: true,
    })
    expect(useEditorStore.getState().project.actors[0].clip.hideBeforeStart).toBe(
      true,
    )
    expect(useEditorStore.getState().actorEditOrder).toEqual(['clip'])
    useEditorStore.getState().undoActorEdit()
    expect(useEditorStore.getState().project.actors[0].clip.hideBeforeStart).toBe(
      false,
    )
    useEditorStore.getState().redoActorEdit()
    expect(useEditorStore.getState().project.actors[0].clip.hideBeforeStart).toBe(
      true,
    )
  })

  it('duplication copies visibility settings', () => {
    useEditorStore.getState().commitActorClip('a', {
      start: 0.2,
      end: 0.8,
      hideBeforeStart: true,
      hideAfterEnd: true,
    })
    const id = useEditorStore.getState().duplicateSelectedActor()
    expect(id).toBeTruthy()
    const copy = useEditorStore
      .getState()
      .project.actors.find((a) => a.id === id)
    expect(copy?.clip.hideBeforeStart).toBe(true)
    expect(copy?.clip.hideAfterEnd).toBe(true)
    expect(copy?.clip).not.toBe(
      useEditorStore.getState().project.actors[0].clip,
    )
    expect(cloneClip(copy!.clip).hideBeforeStart).toBe(true)
  })
})
