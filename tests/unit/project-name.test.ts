import { describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  PERSIST_FORMAT_VERSION,
  PERSIST_FORMAT_VERSION_V6,
  parseSnapshotJson,
  validateSnapshot,
} from '../../src/core/persist/document'
import {
  commitProjectName,
  escapeHtmlText,
  filenameStemFromProjectName,
  isValidProjectName,
  sanitizeProjectName,
} from '../../src/core/projectName'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { makeActor, makeProject, makeRecording } from './helpers/project'
import { useEditorStore } from '../../src/state/store'
import { createEmptyPersistableProject } from '../../src/core/persist/document'

describe('project name helpers', () => {
  it('validates, sanitizes, and restores empty commits', () => {
    expect(isValidProjectName('  ')).toBe(false)
    expect(sanitizeProjectName('  Hello   World  ')).toBe('Hello World')
    expect(commitProjectName('', 'Prior')).toBe('Prior')
    expect(filenameStemFromProjectName('My Cool Project!')).toBe(
      'my-cool-project',
    )
    expect(filenameStemFromProjectName('!!!')).toBe('motionsketch')
    expect(escapeHtmlText('A <b>& "x"')).toBe(
      'A &lt;b&gt;&amp; &quot;x&quot;',
    )
  })

  it('migrates v6 projects to Untitled project without changing actors', () => {
    const base = makeProject({
      actors: [makeActor({ id: 'a', recording: makeRecording(4) })],
    })
    const { name: _drop, ...withoutName } = base
    void _drop
    const result = validateSnapshot({
      formatVersion: PERSIST_FORMAT_VERSION_V6,
      savedAt: '2026-01-01T00:00:00.000Z',
      project: withoutName,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(result.snapshot.project.name).toBe('Untitled project')
    expect(result.snapshot.project.actors[0].id).toBe('a')
    expect(result.snapshot.project.actors[0].recording?.samples).toHaveLength(4)
  })

  it('round-trips name through snapshot JSON', () => {
    const project = makeProject({ name: 'Harbor Loop' })
    const raw = JSON.stringify(buildSnapshot(project, null))
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.name).toBe('Harbor Loop')
  })

  it('uses escaped project name as HTML demo title', () => {
    const project = makeProject({
      name: 'Demo <script>',
      actors: [makeActor({ recording: makeRecording(6) })],
    })
    const html = buildHtmlDemoFromProject(project)
    expect(html).toContain('<title>Demo &lt;script&gt;</title>')
    expect(html).not.toContain('<title>Demo <script>')
  })

  it('renameProject changes only the name', () => {
    const project = createEmptyPersistableProject(1.6, 'Alpha')
    useEditorStore.setState({
      workspace: 'editing',
      project,
      selectedActorId: project.actors[0].id,
      actorEditOrder: ['clip'],
      transformUndoStack: [
        { keyframes: [{ id: 'k', t: 0, rotationDeg: 1, scale: 1 }] },
      ],
    })
    const actorId = project.actors[0].id
    useEditorStore.getState().renameProject('Beta')
    const state = useEditorStore.getState()
    expect(state.project.name).toBe('Beta')
    expect(state.project.actors[0].id).toBe(actorId)
    expect(state.actorEditOrder).toEqual(['clip'])
    expect(state.transformUndoStack).toHaveLength(1)
  })
})
