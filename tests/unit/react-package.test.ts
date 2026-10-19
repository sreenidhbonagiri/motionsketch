import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportCssFromProject } from '../../src/core/export/css'
import { isSafeCssForEmbed } from '../../src/core/export/htmlDemo'
import {
  buildReactPackage,
  REACT_PACKAGE_COMPONENT_NAME,
  REACT_PACKAGE_CSS_NAME,
  REACT_PACKAGE_README_NAME,
  REACT_PACKAGE_TRIGGER_JS_NAME,
} from '../../src/core/export/reactPackage'
import { buildWebPackage, WEB_PACKAGE_CSS_NAME } from '../../src/core/export/webPackage'
import { createSceneActor } from '../../src/core/sceneActor'
import type { ActorImage } from '../../src/core/types'
import { makeActor, makeProject, makeRecording } from './helpers/project'

const CONSUMER_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/react-package-consumer',
)

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('react package export', () => {
  it('packages component, matching CSS, trigger, and Vite asset imports', () => {
    const image: ActorImage = {
      mimeType: 'image/png',
      dataUrl: TINY_PNG,
      naturalWidth: 1,
      naturalHeight: 1,
      label: 'Mark',
    }
    const project = makeProject({
      name: 'React pack',
      actors: [
        createSceneActor({
          appearance: {
            kind: 'text',
            width: 0.2,
            height: 0.2,
            borderRadius: 0.1,
            color: '#0f766e',
            image: null,
            text: {
              content: 'Hi <b>there</b>\nLine 2',
              fontSize: 0.05,
              fontWeight: 700,
              align: 'center',
              fontFamily: 'system',
            },
          },
          recording: makeRecording(10),
        }),
        makeActor({
          id: 'img1',
          name: 'Image',
          recording: makeRecording(10),
          appearance: {
            kind: 'image',
            width: 0.16,
            height: 0.16,
            borderRadius: 0,
            color: '#64748b',
            image,
            text: null,
          },
        }),
      ],
      playback: {
        durationMs: 900,
        loop: true,
        loopMode: 'alternate',
        trigger: 'click',
      },
    })

    const result = buildReactPackage(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const paths = result.files.map((f) => f.path).sort()
    expect(paths).toContain(REACT_PACKAGE_COMPONENT_NAME)
    expect(paths).toContain(REACT_PACKAGE_CSS_NAME)
    expect(paths).toContain(REACT_PACKAGE_TRIGGER_JS_NAME)
    expect(paths).toContain(REACT_PACKAGE_README_NAME)
    expect(paths).toContain('assets/asset-01.png')
    expect(paths).not.toContain('index.html')
    expect(paths).not.toContain('project.json')

    const tsx = strFromU8(
      result.files.find((f) => f.path === REACT_PACKAGE_COMPONENT_NAME)!.bytes,
    )
    expect(tsx).toContain('export function MotionSketchScene')
    expect(tsx).toContain("import './animation.css'")
    expect(tsx).toContain("import './ms-trigger.js'")
    expect(tsx).toContain('import asset01 from')
    expect(tsx).toContain('{')
    // Text is a JS string expression — not raw HTML tags as markup.
    expect(tsx).toContain(JSON.stringify('Hi <b>there</b>\nLine 2'))
    expect(tsx).not.toContain('dangerouslySetInnerHTML')
    // Angle brackets only appear inside the JS string literal, not as HTML nodes.
    expect(tsx).not.toMatch(/\{[^}]*\}\s*<b>/)
    expect(tsx).toContain('ms-waiting')
    expect(tsx).toContain('"mode": "click"')
    expect(tsx).toContain('data-ms-play')

    const css = strFromU8(
      result.files.find((f) => f.path === REACT_PACKAGE_CSS_NAME)!.bytes,
    )
    expect(isSafeCssForEmbed(css)).toBe(true)
    expect(css).toBe(exportCssFromProject(project))

    const web = buildWebPackage(project)
    expect(web.ok).toBe(true)
    if (!web.ok) return
    const webCss = strFromU8(
      web.files.find((f) => f.path === WEB_PACKAGE_CSS_NAME)!.bytes,
    )
    expect(css).toBe(webCss)

    const readme = strFromU8(
      result.files.find((f) => f.path === REACT_PACKAGE_README_NAME)!.bytes,
    )
    expect(readme).toMatch(/Vite \+ React/i)
    expect(readme).toContain('MotionSketchScene')
    expect(readme).toMatch(/archive is flat/i)
    expect(readme).toMatch(/unzip/i)

    const unzipped = unzipSync(result.zip)
    expect(Object.keys(unzipped)).toContain(REACT_PACKAGE_COMPONENT_NAME)
  })

  it('omits waiting class for page-load and still ships the trigger controller', () => {
    const project = makeProject({
      actors: [
        makeActor({
          recording: makeRecording(8),
        }),
      ],
      playback: {
        durationMs: 600,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const result = buildReactPackage(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const tsx = strFromU8(
      result.files.find((f) => f.path === REACT_PACKAGE_COMPONENT_NAME)!.bytes,
    )
    expect(tsx).toContain('const NEEDS_WAITING = false')
    expect(tsx).toContain('"mode": "page-load"')
    expect(
      result.files.some((f) => f.path === REACT_PACKAGE_TRIGGER_JS_NAME),
    ).toBe(true)
  })

  it('generated MotionSketchScene.tsx passes strict tsc in the consumer fixture', () => {
    const project = makeProject({
      name: 'React tsc',
      actors: [
        createSceneActor({
          appearance: {
            kind: 'text',
            width: 0.2,
            height: 0.2,
            borderRadius: 0.1,
            color: '#0f766e',
            image: null,
            text: {
              content: 'Typecheck\nme',
              fontSize: 0.05,
              fontWeight: 700,
              align: 'center',
              fontFamily: 'system',
            },
          },
          recording: makeRecording(8),
        }),
        makeActor({
          id: 'img1',
          name: 'Image',
          recording: makeRecording(8),
          appearance: {
            kind: 'image',
            width: 0.14,
            height: 0.14,
            borderRadius: 0,
            color: '#64748b',
            image: {
              mimeType: 'image/png',
              dataUrl: TINY_PNG,
              naturalWidth: 1,
              naturalHeight: 1,
              label: 'Dot',
            },
            text: null,
          },
        }),
      ],
      playback: {
        durationMs: 900,
        loop: true,
        loopMode: 'alternate',
        trigger: 'click',
      },
    })
    const result = buildReactPackage(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sceneDir = join(CONSUMER_ROOT, 'scene')
    rmSync(sceneDir, { recursive: true, force: true })
    mkdirSync(join(sceneDir, 'assets'), { recursive: true })
    for (const file of result.files) {
      const target = join(sceneDir, file.path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.bytes)
    }

    try {
      execFileSync(
        'npx',
        ['tsc', '-p', 'tsconfig.scene.json', '--pretty', 'false'],
        { cwd: CONSUMER_ROOT, encoding: 'utf8' },
      )
    } catch (err) {
      const failure = err as { stdout?: string; stderr?: string; message?: string }
      throw new Error(
        `Consumer fixture strict tsc failed:\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}\n${failure.message ?? ''}`,
      )
    }
  })

  it('keeps hover / viewport options and refuses empty recordings', () => {
    const hover = makeProject({
      actors: [makeActor({ recording: makeRecording(6) })],
      playback: {
        durationMs: 800,
        loop: false,
        loopMode: 'repeat',
        trigger: 'hover',
      },
    })
    const hoverPkg = buildReactPackage(hover)
    expect(hoverPkg.ok).toBe(true)
    if (hoverPkg.ok) {
      const tsx = strFromU8(
        hoverPkg.files.find((f) => f.path === REACT_PACKAGE_COMPONENT_NAME)!
          .bytes,
      )
      expect(tsx).toContain('"mode": "hover"')
      expect(tsx).toContain('SHOW_HOVER_TAP = true')
      expect(tsx).toContain('data-ms-hover-tap')
    }

    const viewport = makeProject({
      actors: [makeActor({ recording: makeRecording(6) })],
      playback: {
        durationMs: 800,
        loop: false,
        loopMode: 'repeat',
        trigger: 'viewport',
      },
    })
    const vpPkg = buildReactPackage(viewport)
    expect(vpPkg.ok).toBe(true)
    if (vpPkg.ok) {
      const tsx = strFromU8(
        vpPkg.files.find((f) => f.path === REACT_PACKAGE_COMPONENT_NAME)!
          .bytes,
      )
      expect(tsx).toContain('"mode": "viewport"')
    }

    const empty = makeProject({
      actors: [makeActor({ recording: null })],
    })
    expect(buildReactPackage(empty).ok).toBe(false)
  })
})
