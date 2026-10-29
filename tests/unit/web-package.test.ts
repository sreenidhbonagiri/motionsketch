import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportCssFromProject } from '../../src/core/export/css'
import {
  collectPackageAssets,
  decodeDataUrlBytes,
  packageAssetFileName,
} from '../../src/core/export/packageAssets'
import {
  buildWebPackage,
  describeWebPackageIntegration,
  WEB_PACKAGE_CSS_NAME,
  WEB_PACKAGE_HTML_NAME,
  WEB_PACKAGE_PROJECT_NAME,
  WEB_PACKAGE_README_NAME,
  WEB_PACKAGE_TRIGGER_JS_NAME,
} from '../../src/core/export/webPackage'
import { formatCssAspectRatio } from '../../src/core/stageAspect'
import { parseSnapshotJson } from '../../src/core/persist/document'
import { createSceneActor } from '../../src/core/sceneActor'
import type { ActorImage } from '../../src/core/types'
import { makeActor, makeProject, makeRecording } from './helpers/project'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;base64,${btoa(markup)}`
}

const SAFE_SVG = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f766e"/></svg>`,
)

function imageActor(id: string, name: string, image: ActorImage) {
  return makeActor({
    id,
    name,
    recording: makeRecording(12),
    appearance: {
      kind: 'image',
      width: 0.16,
      height: 0.16,
      borderRadius: 0,
      color: '#64748b',
      image,
    },
  })
}

describe('package asset helpers', () => {
  it('decodes base64 data URLs and rejects junk', () => {
    const ok = decodeDataUrlBytes(TINY_PNG)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.mimeType).toBe('image/png')
      expect(ok.bytes.byteLength).toBeGreaterThan(0)
    }
    expect(decodeDataUrlBytes('https://evil.example/a.png').ok).toBe(false)
    expect(decodeDataUrlBytes('data:image/png,not-base64').ok).toBe(false)
    expect(packageAssetFileName(1, 'image/png')).toBe('asset-01.png')
    expect(packageAssetFileName(2, 'image/svg+xml')).toBe('asset-02.svg')
  })

  it('dedupes identical data URLs and ignores unsafe labels', () => {
    const shared: ActorImage = {
      mimeType: 'image/png',
      dataUrl: TINY_PNG,
      naturalWidth: 1,
      naturalHeight: 1,
      label: '../../evil name.png',
    }
    const project = makeProject({
      actors: [
        imageActor('a', 'One', shared),
        imageActor('b', 'Two', { ...shared, label: 'other.png' }),
        makeActor({
          id: 'shape',
          name: 'Shape',
          recording: makeRecording(8),
        }),
      ],
    })
    const collected = collectPackageAssets(project)
    expect(collected.ok).toBe(true)
    if (!collected.ok) return
    expect(collected.assets).toHaveLength(1)
    expect(collected.assets[0].path).toBe('assets/asset-01.png')
    expect(collected.assets[0].path).not.toContain('..')
    expect(collected.assets[0].path).not.toContain('evil')
  })
})

describe('web package export', () => {
  it('packages shapes, PNG, and SVG with relative refs and one copy of duplicates', () => {
    const png: ActorImage = {
      mimeType: 'image/png',
      dataUrl: TINY_PNG,
      naturalWidth: 1,
      naturalHeight: 1,
      label: 'mark.png',
    }
    const svg: ActorImage = {
      mimeType: 'image/svg+xml',
      dataUrl: SAFE_SVG,
      naturalWidth: 10,
      naturalHeight: 10,
      label: 'tile.svg',
    }
    const project = makeProject({
      name: 'Package demo',
      actors: [
        makeActor({
          id: 'shape',
          name: 'Shape',
          recording: makeRecording(10),
          appearance: {
            kind: 'shape',
            width: 0.12,
            height: 0.12,
            borderRadius: 0.3,
            color: '#c2410c',
            image: null,
          },
        }),
        imageActor('png1', 'PNG A', png),
        imageActor('png2', 'PNG B', { ...png }),
        imageActor('svg1', 'SVG', svg),
      ],
      playback: { durationMs: 900, loop: true, loopMode: 'alternate' },
    })

    const result = buildWebPackage(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.assetCount).toBe(2)
    const paths = result.files.map((f) => f.path).sort()
    expect(paths).toEqual(
      [
        WEB_PACKAGE_CSS_NAME,
        'assets/asset-01.png',
        'assets/asset-02.svg',
        WEB_PACKAGE_HTML_NAME,
        WEB_PACKAGE_PROJECT_NAME,
        WEB_PACKAGE_README_NAME,
        WEB_PACKAGE_TRIGGER_JS_NAME,
      ].sort(),
    )

    const unzipped = unzipSync(result.zip)
    const html = strFromU8(unzipped[WEB_PACKAGE_HTML_NAME])
    const css = strFromU8(unzipped[WEB_PACKAGE_CSS_NAME])
    const readme = strFromU8(unzipped[WEB_PACKAGE_README_NAME])
    const projectJson = strFromU8(unzipped[WEB_PACKAGE_PROJECT_NAME])

    expect(css).toBe(exportCssFromProject(project))
    expect(html).toContain(`href="${WEB_PACKAGE_CSS_NAME}"`)
    expect(html).not.toContain('<style>\n/* MotionSketch')
    expect(html).toContain('src="assets/asset-01.png"')
    expect(html).toContain('src="assets/asset-02.svg"')
    expect(html).not.toContain('data:image/')
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).toContain('data-testid="demo-replay"')
    expect(html).toContain(result.scope.rootClass)
    expect(css).toContain('linear infinite alternate')

    expect(readme).toContain(result.scope.rootClass)
    expect(readme).toContain('assets/asset-01.png')
    expect(readme).toContain('assets/asset-02.svg')
    expect(readme).toContain('MotionSketchTrigger.init')
    expect(readme).toContain(WEB_PACKAGE_TRIGGER_JS_NAME)
    expect(readme).toContain(WEB_PACKAGE_PROJECT_NAME)
    expect(readme).toContain('data-ms-demo-shell')
    expect(readme).toContain('data-ms-play')
    expect(readme).toContain('ms-embed-frame')
    expect(readme).toContain('aspect-ratio')
    expect(readme).toContain('api.get(root)')
    expect(readme).toMatch(/does not\s+include the editor path overlay/i)
    expect(readme).toContain('Play button outside data-ms-demo-shell')

    const parsed = parseSnapshotJson(projectJson)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.project.name).toBe('Package demo')
    expect(parsed.snapshot.project.actors).toHaveLength(4)
    expect(parsed.snapshot.project.playback.loopMode).toBe('alternate')
    const imageActors = parsed.snapshot.project.actors.filter(
      (a) => a.appearance.kind === 'image',
    )
    expect(imageActors).toHaveLength(3)
  })

  it('rejects projects with no recording and bad image payloads', () => {
    const empty = makeProject({
      actors: [
        createSceneActor({
          id: 'idle',
          name: 'Idle',
          recording: null,
        }),
      ],
    })
    expect(buildWebPackage(empty).ok).toBe(false)

    const bad = makeProject({
      actors: [
        imageActor('x', 'Bad', {
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,@@@',
          naturalWidth: 1,
          naturalHeight: 1,
          label: 'bad',
        }),
      ],
    })
    const failed = buildWebPackage(bad)
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.error.toLowerCase()).toMatch(/decode|image|asset/)
    }
  })

  it('keeps distinct scene roots for isolation when prefixes differ', () => {
    const project = makeProject({ name: 'Iso' })
    const a = buildWebPackage(project)
    const b = buildWebPackage(project, { instancePrefix: 'hero-' })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.scope.rootClass).not.toBe(b.scope.rootClass)
    expect(b.scope.rootClass.startsWith('hero-')).toBe(true)
    const htmlB = strFromU8(unzipSync(b.zip)[WEB_PACKAGE_HTML_NAME])
    expect(htmlB).toContain(b.scope.rootClass)
    expect(htmlB).not.toContain(`class="${a.scope.rootClass}"`)
  })

  it('page-load README still documents trigger JS, shell binding, and stage sizing', () => {
    const project = makeProject({
      name: 'Page load pack',
      actors: [makeActor({ recording: makeRecording(10) })],
      playback: {
        durationMs: 2400,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const packed = buildWebPackage(project)
    expect(packed.ok).toBe(true)
    if (!packed.ok) return
    const readme = strFromU8(
      packed.files.find((f) => f.path === WEB_PACKAGE_README_NAME)!.bytes,
    )
    expect(readme).toContain('Playback trigger: page-load')
    expect(readme).toContain(WEB_PACKAGE_TRIGGER_JS_NAME)
    expect(readme).toContain('MotionSketchTrigger.init')
    expect(readme).toContain('data-ms-demo-shell')
    expect(readme).toContain('data-ms-play')
    expect(readme).toContain(`mode: "page-load"`)
    expect(readme).toContain('Play button outside data-ms-demo-shell')
    expect(readme).toContain('ctl.play()')
    expect(readme).toContain(
      `aspect-ratio: ${formatCssAspectRatio(project.stageAspect)}`,
    )
    expect(readme).toMatch(/does not\s+include the editor path overlay/i)
  })

  it('README embed aspect-ratio matches a non-default project stageAspect', () => {
    const stageAspect = 16 / 9
    const project = makeProject({
      name: 'Wide stage',
      stageAspect,
      actors: [makeActor({ recording: makeRecording(10) })],
    })
    const packed = buildWebPackage(project)
    expect(packed.ok).toBe(true)
    if (!packed.ok) return
    const readme = strFromU8(
      packed.files.find((f) => f.path === WEB_PACKAGE_README_NAME)!.bytes,
    )
    const expected = formatCssAspectRatio(stageAspect)
    expect(expected).toBe('16 / 9')
    expect(readme).toContain(`aspect-ratio: ${expected}`)
    expect(readme).not.toContain('aspect-ratio: 16 / 10')

    const guide = describeWebPackageIntegration(project)
    expect(guide.ok).toBe(true)
    if (!guide.ok) return
    expect(guide.aspectCss).toBe(expected)
    expect(guide.completeExample).toContain(`aspect-ratio: ${expected}`)
    expect(guide.sections.head).toContain(`aspect-ratio: ${expected}`)
    expect(guide.sections.head).toContain(`href="${WEB_PACKAGE_CSS_NAME}"`)
    expect(guide.sections.body).toContain('data-ms-demo-shell')
    expect(guide.sections.body).toContain('data-ms-play')
    expect(guide.sections.scripts).toContain(
      `src="${WEB_PACKAGE_TRIGGER_JS_NAME}"`,
    )
    expect(guide.sections.scripts).toContain('window.MotionSketchTrigger')
    expect(guide.sections.scripts).toContain('api.init')
    expect(guide.completeExample).toBe(
      `${guide.sections.head}\n\n${guide.sections.body}\n\n${guide.sections.scripts}`,
    )
    expect(guide.folderLayout).toContain(WEB_PACKAGE_HTML_NAME)
    expect(guide.folderLayout).toContain(WEB_PACKAGE_CSS_NAME)
    expect(guide.folderLayout).toContain(WEB_PACKAGE_TRIGGER_JS_NAME)
    expect(guide.folderLayout).toMatch(/README\.txt.*instructions only/i)
    expect(guide.folderLayout).toMatch(/project\.json.*reopen/i)
    expect(guide.playButtonHelp).toMatch(/Replay/)
    expect(guide.requiredFiles).toContain(WEB_PACKAGE_CSS_NAME)
    expect(guide.requiredFiles).toContain(WEB_PACKAGE_TRIGGER_JS_NAME)

    expect(readme).toContain('In <head>')
    expect(readme).toContain('Where you want the animation, inside <body>')
    expect(readme).toContain('Before </body>')
    expect(readme).toContain(guide.sections.head)
    expect(readme).toContain(guide.sections.body)
    expect(readme).toContain(guide.sections.scripts)
    expect(readme).toMatch(/neither is required to run the embedded animation/i)
  })
})
