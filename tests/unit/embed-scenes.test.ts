import { describe, expect, it } from 'vitest'
import {
  buildExportSceneMarkup,
  exportCssFromProject,
} from '../../src/core/export/css'
import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
} from '../../src/core/persist/document'
import {
  buildEmbedCompanionProject,
  buildEmbedMarkProject,
  EMBED_SCENE_A_OPTIONS,
  EMBED_SCENE_B_OPTIONS,
} from '../fixtures/embedScenes'

describe('export embed scene fixtures', () => {
  it('mark + companion export with distinct scoped CSS and stable ids', () => {
    const mark = buildEmbedMarkProject()
    const companion = buildEmbedCompanionProject()
    const cssA = exportCssFromProject(mark, { ...EMBED_SCENE_A_OPTIONS })
    const cssB = exportCssFromProject(companion, { ...EMBED_SCENE_B_OPTIONS })
    const markupA = buildExportSceneMarkup(mark, { ...EMBED_SCENE_A_OPTIONS })
    const markupB = buildExportSceneMarkup(companion, {
      ...EMBED_SCENE_B_OPTIONS,
    })

    expect(markupA.scope.rootClass).toBe('embed-a-ms-scene-mark-in')
    expect(markupB.scope.rootClass).toBe('embed-b-ms-scene-pulse')
    expect(cssA).toContain(`.${markupA.scope.rootClass}`)
    expect(cssB).toContain(`.${markupB.scope.rootClass}`)
    expect(cssA).not.toContain(markupB.scope.rootClass)
    expect(cssB).not.toContain(markupA.scope.rootClass)
    expect(cssA).toContain('prefers-reduced-motion: reduce')
    expect(cssA).toContain('ms-motion-ok')
    expect(markupA.html).toContain('data-ms-scene="mark-in"')
    expect(markupB.html).toContain('data-ms-scene="pulse"')
  })

  it('mark project validates through the normal snapshot path', () => {
    const project = buildEmbedMarkProject()
    const built = buildSnapshot(project, null, '1970-01-01T00:00:00.000Z')
    const parsed = parseSnapshotJson(serializeSnapshot(built))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.name).toBe('Mark entrance')
    expect(parsed.snapshot.project.actors).toHaveLength(3)
    expect(
      parsed.snapshot.project.actors.some(
        (a) => a.appearance.kind === 'image' && !!a.appearance.image,
      ),
    ).toBe(true)
  })
})
