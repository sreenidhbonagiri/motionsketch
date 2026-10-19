import { describe, expect, it } from 'vitest'
import { actorDisplaySizePx, coerceActor } from '../../src/core/actor'
import {
  actorTextHtmlInner,
  DEFAULT_ACTOR_TEXT,
  MAX_ACTOR_TEXT_LENGTH,
  sanitizeActorTextContent,
} from '../../src/core/actorText'
import {
  buildProjectCssExport,
  buildExportSceneMarkup,
} from '../../src/core/export/css'
import {
  buildHtmlDemoFromProject,
  isSafeCssForEmbed,
} from '../../src/core/export/htmlDemo'
import {
  buildWebPackage,
  WEB_PACKAGE_CSS_NAME,
  WEB_PACKAGE_HTML_NAME,
} from '../../src/core/export/webPackage'
import { strFromU8 } from 'fflate'
import {
  buildSnapshot,
  parseSnapshotJson,
  PERSIST_FORMAT_VERSION,
  serializeSnapshot,
} from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

describe('text actors', () => {
  it('coerces and validates text settings; older actors stay non-text', () => {
    const legacy = coerceActor({
      kind: 'shape',
      width: 0.12,
      height: 0.12,
      borderRadius: 0.2,
      color: '#112233',
      image: null,
    })
    expect(legacy.kind).toBe('shape')
    expect(legacy.text).toBeNull()

    const text = coerceActor({
      kind: 'text',
      width: 0.2,
      color: '#0f766e',
      text: {
        content: 'Hello\nWorld<script>',
        fontSize: 0.08,
        fontWeight: 700,
        align: 'left',
        fontFamily: 'mono',
      },
    })
    expect(text.kind).toBe('text')
    expect(text.text?.content).toContain('<script>')
    expect(text.text?.align).toBe('left')
    expect(text.text?.fontFamily).toBe('mono')

    const overlong = 'x'.repeat(MAX_ACTOR_TEXT_LENGTH + 40)
    expect(sanitizeActorTextContent(overlong).length).toBe(MAX_ACTOR_TEXT_LENGTH)

    const fallback = coerceActor({ kind: 'text', width: 0.1 })
    expect(fallback.kind).toBe('text')
    expect(fallback.text?.content).toBe(DEFAULT_ACTOR_TEXT.content)

    const empty = coerceActor({
      kind: 'text',
      width: 0.1,
      text: { ...DEFAULT_ACTOR_TEXT, content: '' },
    })
    expect(empty.text?.content).toBe('')
  })

  it('sizes text wrap width; live height is auto (nominal helper is one line)', () => {
    const actor = coerceActor({
      kind: 'text',
      width: 0.2,
      color: '#111111',
      text: {
        content: 'One\nTwo\nThree',
        fontSize: 0.05,
        fontWeight: 400,
        align: 'center',
        fontFamily: 'system',
      },
    })
    const box = actorDisplaySizePx(800, 500, actor)
    expect(box.width).toBeCloseTo(0.2 * 500, 5)
    expect(box.height).toBeCloseTo(0.05 * 500 * 1.25, 5)
  })

  it('escapes text in HTML export and documents CSS-only markup', () => {
    const actor = createSceneActor({
      appearance: {
        kind: 'text',
        width: 0.22,
        height: 0.22,
        borderRadius: 0.2,
        color: '#0f766e',
        image: null,
        text: {
          content: 'Hi <b>there</b>\nLine 2',
          fontSize: 0.06,
          fontWeight: 700,
          align: 'center',
          fontFamily: 'system',
        },
      },
      recording: makeRecording(12),
    })
    const project = makeProject({
      name: 'Text export',
      actors: [actor],
    })
    const { css } = buildProjectCssExport(project)
    expect(css).toMatch(/font-family:/)
    expect(css).toMatch(/white-space:\s*pre-wrap/)
    expect(css).toMatch(/height:\s*auto/)
    expect(css).toMatch(/CSS alone does NOT include the copy/i)
    expect(css).toMatch(/system-ui/)
    expect(css).toContain('Your text here')
    expect(css).not.toContain('Hi <b>there</b>')
    expect(css).not.toContain('Line 2')

    const { html } = buildExportSceneMarkup(project)
    expect(html).toContain(actorTextHtmlInner('Hi <b>there</b>\nLine 2'))
    expect(html).not.toContain('<b>there</b>')
    expect(html).toContain('&lt;b&gt;')

    const demo = buildHtmlDemoFromProject(project)
    expect(demo).toContain('&lt;b&gt;there&lt;/b&gt;')
    expect(demo).toMatch(/data-testid="demo-actor"/)
  })

  it('keeps authored text out of CSS header; unsafe-looking copy still demos safely', () => {
    const risky =
      '@import "x.css"; <script>alert(1)</script> url(https://example.com)'
    const actor = createSceneActor({
      appearance: {
        kind: 'text',
        width: 0.2,
        height: 0.2,
        borderRadius: 0.2,
        color: '#111111',
        image: null,
        text: {
          content: risky,
          fontSize: 0.05,
          fontWeight: 700,
          align: 'left',
          fontFamily: 'system',
        },
      },
      recording: makeRecording(8),
    })
    const project = makeProject({
      name: 'Embed safety',
      actors: [actor],
    })
    const { css } = buildProjectCssExport(project)
    expect(isSafeCssForEmbed(css)).toBe(true)
    // Header uses placeholders — authored copy must not appear in the stylesheet.
    expect(css).toContain('Your text here')
    expect(css).not.toContain('@import')
    expect(css).not.toContain('<script')
    expect(css).not.toContain('url(https://example.com)')
    expect(css).not.toContain(risky)
    expect(css).toMatch(/\.ms-stage\s*\{/)
    expect(css).toMatch(/white-space:\s*pre-wrap/)

    const demo = buildHtmlDemoFromProject(project)
    expect(demo).toContain(actorTextHtmlInner(risky))
    expect(demo).toContain('&lt;script&gt;')
    expect(demo).not.toContain('<script>alert(1)</script>')
    const styleBlocks = [...demo.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map(
      (m) => m[1] ?? '',
    )
    const sceneCss = styleBlocks[styleBlocks.length - 1]!
    expect(isSafeCssForEmbed(sceneCss)).toBe(true)
    expect(sceneCss).not.toContain('@import')
    expect(sceneCss).not.toContain('url(https://example.com)')

    const packed = buildWebPackage(project)
    expect(packed.ok).toBe(true)
    if (!packed.ok) return
    const indexHtml = strFromU8(
      packed.files.find((f) => f.path === WEB_PACKAGE_HTML_NAME)!.bytes,
    )
    expect(indexHtml).toContain(actorTextHtmlInner(risky))
    const pkgCss = strFromU8(
      packed.files.find((f) => f.path === WEB_PACKAGE_CSS_NAME)!.bytes,
    )
    expect(isSafeCssForEmbed(pkgCss)).toBe(true)
    expect(pkgCss).not.toContain(risky)
    expect(pkgCss).toContain('Your text here')
  })

  it('round-trips empty text content through save/load', () => {
    const actor = createSceneActor({
      appearance: {
        kind: 'text',
        width: 0.16,
        height: 0.16,
        borderRadius: 0.1,
        color: '#334155',
        image: null,
        text: {
          content: '',
          fontSize: 0.06,
          fontWeight: 400,
          align: 'center',
          fontFamily: 'system',
        },
      },
      recording: makeRecording(6),
    })
    const project = makeProject({ actors: [actor] })
    const raw = serializeSnapshot(buildSnapshot(project, null))
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.actors[0]!.appearance.text?.content).toBe('')
  })

  it('round-trips text through project format v13; v12 migrates text to null', () => {
    const actor = createSceneActor({
      appearance: {
        kind: 'text',
        width: 0.18,
        height: 0.18,
        borderRadius: 0.1,
        color: '#c2410c',
        image: null,
        text: {
          content: 'Saved\nlines',
          fontSize: 0.07,
          fontWeight: 400,
          align: 'right',
          fontFamily: 'serif',
        },
      },
      recording: makeRecording(8),
    })
    const project = makeProject({ actors: [actor] })
    const raw = serializeSnapshot(buildSnapshot(project, null))
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    const loaded = parsed.snapshot.project.actors[0]!.appearance
    expect(loaded.kind).toBe('text')
    expect(loaded.text?.content).toBe('Saved\nlines')
    expect(loaded.text?.align).toBe('right')
    expect(loaded.text?.fontFamily).toBe('serif')

    const legacy = JSON.parse(raw) as {
      formatVersion: number
      project: { actors: Array<{ appearance: Record<string, unknown> }> }
    }
    legacy.formatVersion = 12
    delete legacy.project.actors[0]!.appearance.text
    legacy.project.actors[0]!.appearance.kind = 'shape'
    const migrated = parseSnapshotJson(JSON.stringify(legacy))
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.snapshot.project.actors[0]!.appearance.kind).toBe('shape')
    expect(migrated.snapshot.project.actors[0]!.appearance.text).toBeNull()
  })

  it('preserves shape color when switching to text and back', () => {
    const project = makeProject({
      actors: [
        makeActor({
          appearance: {
            kind: 'shape',
            width: 0.12,
            height: 0.12,
            borderRadius: 0.4,
            color: '#abcdef',
            image: null,
            text: null,
          },
          recording: makeRecording(6),
        }),
      ],
    })
    useEditorStore.setState({
      project,
      selectedActorId: project.actors[0]!.id,
      mode: 'idle',
    })
    useEditorStore.getState().setActorKind('text')
    expect(useEditorStore.getState().project.actors[0]!.appearance.kind).toBe(
      'text',
    )
    expect(useEditorStore.getState().project.actors[0]!.appearance.color).toBe(
      '#abcdef',
    )
    useEditorStore.getState().setActorTextContent('Edited')
    useEditorStore.getState().setActorKind('shape')
    const app = useEditorStore.getState().project.actors[0]!.appearance
    expect(app.kind).toBe('shape')
    expect(app.color).toBe('#abcdef')
    expect(app.borderRadius).toBeCloseTo(0.4, 5)
    expect(app.text?.content).toBe('Edited')
  })
})
