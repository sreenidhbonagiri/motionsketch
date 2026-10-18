import { describe, expect, it } from 'vitest'
import { exportCssFromProject } from '../../src/core/export/css'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import {
  buildTriggerBootScript,
  buildTriggerControllerOptions,
  buildTriggerControllerSource,
} from '../../src/core/export/triggerController'
import {
  coercePlaybackTrigger,
  isPlaybackTrigger,
  MS_WAITING_CLASS,
  shouldOfferPreviewPauseControl,
  triggerNeedsJavaScript,
  VIEWPORT_TRIGGER_THRESHOLD,
} from '../../src/core/export/triggers'
import { buildWebPackage, WEB_PACKAGE_TRIGGER_JS_NAME } from '../../src/core/export/webPackage'
import {
  PERSIST_FORMAT_VERSION,
  parseSnapshotJson,
  serializeSnapshot,
  buildSnapshot,
} from '../../src/core/persist/document'
import { makeActor, makeProject, makeRecording } from './helpers/project'

describe('playback triggers', () => {
  it('coerces missing/invalid modes and detects JS need', () => {
    expect(coercePlaybackTrigger(undefined)).toBe('page-load')
    expect(coercePlaybackTrigger('click')).toBe('click')
    expect(isPlaybackTrigger('viewport')).toBe(true)
    expect(isPlaybackTrigger('spin')).toBe(false)
    expect(triggerNeedsJavaScript('page-load')).toBe(false)
    expect(triggerNeedsJavaScript('hover')).toBe(true)
    expect(VIEWPORT_TRIGGER_THRESHOLD).toBeCloseTo(0.35)
  })

  it('offers pause for looping or long automatic (page-load / viewport) scenes', () => {
    expect(shouldOfferPreviewPauseControl('page-load', true, 1000)).toBe(true)
    expect(shouldOfferPreviewPauseControl('page-load', false, 6000)).toBe(true)
    expect(shouldOfferPreviewPauseControl('page-load', false, 2000)).toBe(false)
    expect(shouldOfferPreviewPauseControl('viewport', false, 6000)).toBe(true)
    expect(shouldOfferPreviewPauseControl('viewport', false, 2000)).toBe(false)
    expect(shouldOfferPreviewPauseControl('viewport', true, 500)).toBe(true)
    expect(shouldOfferPreviewPauseControl('click', true, 500)).toBe(true)
    expect(shouldOfferPreviewPauseControl('click', false, 6000)).toBe(false)
    expect(shouldOfferPreviewPauseControl('hover', false, 6000)).toBe(false)
    expect(shouldOfferPreviewPauseControl('hover', true, 500)).toBe(true)
  })

  it('HTML demo includes pause for long viewport autoplay and looping click', () => {
    const longViewport = makeProject({
      actors: [makeActor({ recording: makeRecording(16) })],
      playback: {
        durationMs: 6000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'viewport',
      },
    })
    const viewportHtml = buildHtmlDemoFromProject(longViewport)
    expect(viewportHtml).toContain('data-testid="demo-pause"')
    expect(viewportHtml).toContain('"offerPause":true')

    const shortClick = makeProject({
      actors: [makeActor({ recording: makeRecording(16) })],
      playback: {
        durationMs: 2000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'click',
      },
    })
    const shortHtml = buildHtmlDemoFromProject(shortClick)
    expect(shortHtml).not.toContain('data-testid="demo-pause"')
    expect(shortHtml).toContain('"offerPause":false')

    const loopClick = makeProject({
      actors: [makeActor({ recording: makeRecording(16) })],
      playback: {
        durationMs: 500,
        loop: true,
        loopMode: 'repeat',
        trigger: 'click',
      },
    })
    expect(buildHtmlDemoFromProject(loopClick)).toContain(
      'data-testid="demo-pause"',
    )
  })

  it('CSS waiting rule appears only for JS triggers', () => {
    const base = makeProject({
      actors: [makeActor({ recording: makeRecording(20) })],
    })
    const pageLoad = exportCssFromProject({
      ...base,
      playback: { ...base.playback, trigger: 'page-load' },
    })
    expect(pageLoad).toContain('Playback trigger: page-load')
    expect(pageLoad).not.toContain(`.${MS_WAITING_CLASS}`)

    const clickCss = exportCssFromProject({
      ...base,
      playback: { ...base.playback, trigger: 'click' },
    })
    expect(clickCss).toContain('JavaScript required')
    expect(clickCss).toContain(MS_WAITING_CLASS)
    expect(clickCss).toContain('animation-play-state: paused')
  })

  it('HTML demo boots MotionSketchTrigger and marks waiting for click', () => {
    const project = makeProject({
      actors: [makeActor({ recording: makeRecording(16) })],
      playback: {
        durationMs: 1200,
        loop: false,
        loopMode: 'repeat',
        trigger: 'click',
      },
    })
    const html = buildHtmlDemoFromProject(project)
    expect(html).toContain('data-ms-trigger="click"')
    expect(html).toContain(MS_WAITING_CLASS)
    expect(html).toContain('MotionSketchTrigger')
    expect(html).toContain('api.init')
  })

  it('controller source supports init/get/destroy and hover arming', () => {
    const src = buildTriggerControllerSource()
    expect(src).toContain('MotionSketchTrigger')
    expect(src).toContain('WeakMap')
    expect(src).toContain('mouseenter')
    expect(src).toContain('IntersectionObserver')
    expect(src).toContain('prefers-reduced-motion')
    // Pointer/focus state — not a timed ignore window — coordinates hover.
    expect(src).toContain('pointerInside')
    expect(src).toContain('relatedTarget')
    expect(src).toContain('optInReducedMotion')
    expect(src).toContain('stopOwnedActorAnimations')
    expect(src).not.toContain('ignoreClickUntil')
    expect(src).not.toMatch(/Date\.now\(\)\s*\+\s*\d+/)
    // Hover/focus must not pass reduced-motion opt-in.
    expect(src).toMatch(
      /tryHoverFocusStart[\s\S]*beginPlayback\(\{\s*optInReducedMotion:\s*false/,
    )
    // Re-init destroys the prior instance; chrome listeners are removed.
    expect(src).toContain('existing.destroy()')
    expect(src).toContain('removeEventListener')
    expect(src).toContain('io.disconnect')
    const boot = buildTriggerBootScript('abc123', buildTriggerControllerOptions({
      trigger: 'viewport',
      loop: true,
      durationMs: 2000,
    }))
    expect(boot).toContain('abc123')
    expect(boot).toContain('"mode":"viewport"')
    expect(boot).toContain('"offerPause":true')
  })

  it('web package always includes local ms-trigger.js', () => {
    const project = makeProject({
      actors: [makeActor({ recording: makeRecording(12) })],
      playback: {
        durationMs: 900,
        loop: true,
        loopMode: 'alternate',
        trigger: 'hover',
      },
    })
    const result = buildWebPackage(project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain(WEB_PACKAGE_TRIGGER_JS_NAME)
    expect(paths).toContain('index.html')
    const html = new TextDecoder().decode(
      result.files.find((f) => f.path === 'index.html')!.bytes,
    )
    expect(html).toContain(`src="${WEB_PACKAGE_TRIGGER_JS_NAME}"`)
    expect(html).not.toContain('https://')
  })

  it('web package README offerPause matches controller options', () => {
    const longViewport = makeProject({
      actors: [makeActor({ recording: makeRecording(12) })],
      playback: {
        durationMs: 6000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'viewport',
      },
    })
    const packed = buildWebPackage(longViewport)
    expect(packed.ok).toBe(true)
    if (!packed.ok) return
    const readme = new TextDecoder().decode(
      packed.files.find((f) => f.path === 'README.txt')!.bytes,
    )
    expect(readme).toContain('offerPause: true')
    expect(readme).toContain('automatic trigger longer than 5s')

    const shortClick = makeProject({
      actors: [makeActor({ recording: makeRecording(12) })],
      playback: {
        durationMs: 2000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'click',
      },
    })
    const shortPacked = buildWebPackage(shortClick)
    expect(shortPacked.ok).toBe(true)
    if (!shortPacked.ok) return
    const shortReadme = new TextDecoder().decode(
      shortPacked.files.find((f) => f.path === 'README.txt')!.bytes,
    )
    expect(shortReadme).toContain('offerPause: false')
  })

  it('persists trigger and migrates older projects to page-load', () => {
    const project = makeProject({
      actors: [makeActor({ recording: makeRecording(10) })],
      playback: {
        durationMs: 1000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'viewport',
      },
    })
    const raw = serializeSnapshot(buildSnapshot(project))
    const parsed = parseSnapshotJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.formatVersion).toBe(PERSIST_FORMAT_VERSION)
    expect(parsed.snapshot.project.playback.trigger).toBe('viewport')

    const legacy = parseSnapshotJson(
      JSON.stringify({
        formatVersion: 9,
        savedAt: '2026-01-01T00:00:00.000Z',
        project: {
          version: 1,
          name: 'Old',
          actors: project.actors,
          playback: {
            durationMs: 1000,
            loop: false,
            loopMode: 'repeat',
          },
          stageAspect: 1.6,
        },
      }),
    )
    expect(legacy.ok).toBe(true)
    if (!legacy.ok) return
    expect(legacy.snapshot.project.playback.trigger).toBe('page-load')

    const bad = parseSnapshotJson(
      JSON.stringify({
        formatVersion: 10,
        savedAt: '2026-01-01T00:00:00.000Z',
        project: {
          version: 1,
          name: 'Bad',
          actors: project.actors,
          playback: {
            durationMs: 1000,
            loop: false,
            loopMode: 'repeat',
            trigger: 'explode',
          },
          stageAspect: 1.6,
        },
      }),
    )
    expect(bad.ok).toBe(false)
  })
})
