import { describe, expect, it } from 'vitest'
import { makeGeometryEdit } from '../../src/core/edit'
import {
  exportCssFromProject,
  fingerprintProjectScene,
  resolveExportScope,
} from '../../src/core/export/css'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  makeActor,
  makeProject,
  makeRecording,
  makeSamples,
} from './helpers/project'

describe('scoped CSS export isolation', () => {
  it('scopes stage/actors and uses content fingerprint keyframes', () => {
    const project = makeProject({
      name: 'Shared Title',
      actors: [
        makeActor({
          id: 'a',
          recording: makeRecording(12),
          appearance: { color: '#0f766e' },
        }),
        makeActor({
          id: 'b',
          recording: makeRecording(12),
          appearance: { color: '#c2410c' },
        }),
      ],
      playback: { durationMs: 1800, loop: true, loopMode: 'alternate' },
    })
    const scope = resolveExportScope(project)
    const css = exportCssFromProject(project)

    expect(scope.sceneId).toMatch(/^[a-f0-9]{8}$/)
    expect(css).toContain(`.${scope.rootClass} .ms-stage`)
    expect(css).toContain(`.${scope.rootClass} .ms-actor-1`)
    expect(css).toContain(`.${scope.rootClass} .ms-actor-2`)
    expect(css).toContain(`@keyframes ms-${scope.sceneId}-a1`)
    expect(css).toContain(`@keyframes ms-${scope.sceneId}-a2`)
    expect(css).not.toMatch(/(^|\n)\.stage\s*\{/)
    expect(css).not.toMatch(/(^|\n)\.actor-1\s*\{/)
    expect(css).not.toContain('@keyframes motionsketch-actor-1')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('ms-motion-ok')
    expect(css).toContain('1800ms linear infinite alternate')
  })

  it('does not use project name alone for uniqueness', () => {
    const sharedName = 'Twin'
    const a = makeProject({
      name: sharedName,
      actors: [
        makeActor({
          id: 'x',
          recording: makeRecording(10),
          appearance: { color: '#111111' },
          clip: {
            start: 0.1,
            end: 0.9,
            hideBeforeStart: true,
            hideAfterEnd: true,
          },
        }),
      ],
      playback: { durationMs: 1000, loop: false, loopMode: 'repeat' },
    })
    const b = makeProject({
      name: sharedName,
      actors: [
        makeActor({
          id: 'y',
          recording: makeRecording(10),
          appearance: { color: '#eeeeee' },
          clip: {
            start: 0.2,
            end: 0.8,
            hideBeforeStart: false,
            hideAfterEnd: false,
          },
        }),
      ],
      playback: { durationMs: 2500, loop: false, loopMode: 'repeat' },
    })
    expect(fingerprintProjectScene(a)).not.toBe(fingerprintProjectScene(b))
    const cssA = exportCssFromProject(a)
    const cssB = exportCssFromProject(b)
    expect(cssA).not.toBe(cssB)
    expect(resolveExportScope(a).rootClass).not.toBe(
      resolveExportScope(b).rootClass,
    )
  })

  it('fingerprints every geometryEdit sample (mid-path edit changes scene id)', () => {
    const samplesA = makeSamples(120)
    const samplesB = samplesA.map((s) => ({ ...s }))
    samplesB[2] = { ...samplesB[2]!, x: samplesB[2]!.x + 0.017 }

    const projectA = makeProject({
      name: 'Twin path',
      actors: [
        makeActor({
          id: 'path',
          recording: makeRecording(120),
          geometryEdit: makeGeometryEdit(samplesA, 0.2, [0, 30, 60, 119]),
        }),
      ],
      playback: {
        durationMs: 2000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })
    const projectB = makeProject({
      name: 'Twin path',
      actors: [
        makeActor({
          id: 'path',
          recording: makeRecording(120),
          geometryEdit: makeGeometryEdit(samplesB, 0.2, [0, 30, 60, 119]),
        }),
      ],
      playback: {
        durationMs: 2000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })

    const idA = fingerprintProjectScene(projectA)
    const idB = fingerprintProjectScene(projectB)
    expect(idA).not.toBe(idB)

    const cssA = exportCssFromProject(projectA)
    const cssB = exportCssFromProject(projectB)
    expect(cssA).toContain(`@keyframes ms-${idA}`)
    expect(cssB).toContain(`@keyframes ms-${idB}`)
    expect(cssA).not.toContain(`@keyframes ms-${idB}`)
    expect(cssB).not.toContain(`@keyframes ms-${idA}`)
  })

  it('instancePrefix yields independently named copies', () => {
    const project = makeProject({
      actors: [makeActor({ recording: makeRecording(8) })],
    })
    const base = resolveExportScope(project)
    const copy = resolveExportScope(project, { instancePrefix: 'hero-' })
    expect(copy.rootClass).toBe(`hero-ms-scene-${base.sceneId}`)
    expect(copy.sceneId).toBe(base.sceneId)

    const cssBase = exportCssFromProject(project)
    const cssCopy = exportCssFromProject(project, { instancePrefix: 'hero-' })
    expect(cssBase).toContain(`@keyframes ms-${base.sceneId}`)
    expect(cssCopy).toContain(`@keyframes hero-ms-${base.sceneId}`)
    expect(cssCopy).toContain(`.hero-ms-scene-${base.sceneId} .ms-stage`)
  })

  it('HTML demo embeds scoped CSS and scene-local replay wiring', () => {
    const project = makeProject({
      actors: [makeActor({ recording: makeRecording(6) })],
    })
    const css = exportCssFromProject(project)
    const html = buildHtmlDemoFromProject(project)
    expect(html).toContain(css)
    expect(html).toContain('data-testid="demo-scene"')
    expect(html).toContain('data-ms-scene=')
    expect(html).toContain('Play animation')
    expect(html).toContain('ms-motion-ok')
    expect(html).toContain('prefers-reduced-motion')
  })
})
