import { describe, expect, it } from 'vitest'
import { createSceneActor } from '../../src/core/sceneActor'
import { buildOwnElementExport } from '../../src/core/export/ownElement'
import { exportCssFromProject } from '../../src/core/export/css'
import { makeActor, makeProject, makeRecording } from './helpers/project'

describe('own-element motion wrapper export', () => {
  it('emits path/timing without appearance styles', () => {
    const actor = makeActor({
      name: 'Hero',
      recording: makeRecording(12),
      appearance: {
        kind: 'shape',
        width: 0.22,
        height: 0.22,
        borderRadius: 0.35,
        color: '#e11d48',
        image: null,
        text: null,
      },
    })
    const project = makeProject({
      name: 'Own wrap',
      actors: [actor],
      playback: {
        durationMs: 1400,
        loop: true,
        loopMode: 'repeat',
        trigger: 'page-load',
      },
    })

    const result = buildOwnElementExport(project, actor.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.css).toMatch(/animate your own element/i)
    expect(result.css).toContain('translate3d(')
    expect(result.css).toContain('cqw')
    expect(result.css).toContain('width: max-content')
    expect(result.css).not.toContain('#e11d48')
    expect(result.css).not.toContain('border-radius')
    expect(result.css).not.toContain('22.00cqmin')
    expect(result.css).not.toMatch(/background:\s*#/)
    expect(result.requiresTriggerJs).toBe(false)
    expect(result.triggerJs).toBeNull()
    expect(result.htmlExample).toContain('class="ms-actor"')
    expect(result.htmlExample).toContain('Your button')
    expect(result.htmlExample).toContain('data-ms-play')
    expect(result.htmlExample).toContain('aria-label="Play animation"')
    expect(result.htmlExample).toContain('ms-motion-ok')
    expect(result.htmlExample).toContain(
      "root.closest('[data-ms-demo-shell]')",
    )
    expect(result.htmlExample).not.toContain(
      "document.querySelector('[data-ms-demo-shell] [data-ms-play]')",
    )
    expect(result.reactExample).toContain('className="ms-actor"')
    expect(result.reactExample).toContain('data-ms-play')
    expect(result.reactExample).toContain('aria-label="Play animation"')
    expect(result.reactExample).not.toContain('MotionSketchTrigger')
    expect(result.triggerRequirement).toMatch(/Play button/i)
  })

  it('requires trigger script for click and includes init in examples', () => {
    const actor = makeActor({ recording: makeRecording(10) })
    const project = makeProject({
      actors: [actor],
      playback: {
        durationMs: 1000,
        loop: false,
        loopMode: 'repeat',
        trigger: 'click',
      },
    })

    const result = buildOwnElementExport(project, actor.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.requiresTriggerJs).toBe(true)
    expect(result.triggerJs).toContain('MotionSketchTrigger')
    expect(result.triggerRequirement).toMatch(/save the file as ms-trigger\.js/i)
    expect(result.htmlExample).toContain('ms-trigger.js')
    expect(result.htmlExample).toMatch(
      /save the file as\s+ms-trigger\.js in the same folder/i,
    )
    expect(result.htmlExample).toContain('MotionSketchTrigger.init')
    expect(result.htmlExample).toContain('ms-waiting')
    expect(result.htmlExample).toContain('data-ms-play')
    expect(result.htmlExample).toContain('aria-label="Play animation"')
    expect(result.reactExample).toContain("import './ms-trigger.js'")
    expect(result.reactExample).toMatch(
      /save it as\s*\n\s*\* ms-trigger\.js next to this component/i,
    )
    expect(result.reactExample).toContain('api.init')
    expect(result.reactExample).toContain('data-ms-play')
    expect(result.css).toMatch(/REQUIRES MotionSketchTrigger/i)
  })

  it('exports only the selected actor when the project has several', () => {
    const a = makeActor({
      id: 'a',
      name: 'A',
      recording: makeRecording(8),
      appearance: {
        kind: 'shape',
        width: 0.1,
        height: 0.1,
        borderRadius: 0,
        color: '#111111',
        image: null,
        text: null,
      },
    })
    const b = createSceneActor({
      id: 'b',
      name: 'B',
      recording: makeRecording(8),
      appearance: {
        kind: 'text',
        width: 0.3,
        height: 0.2,
        borderRadius: 0,
        color: '#0f766e',
        image: null,
        text: {
          content: 'Secret copy',
          fontSize: 0.05,
          fontWeight: 600,
          align: 'center',
          fontFamily: 'system',
        },
      },
    })
    const project = makeProject({ actors: [a, b] })

    const result = buildOwnElementExport(project, b.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.actorName).toBe('B')
    expect(result.css).not.toContain('Secret copy')
    expect(result.css).not.toContain('#0f766e')
    expect(result.css).not.toContain('font-size:')
    expect(result.css).not.toContain('ms-actor-2')
    expect(result.css).toContain('.ms-actor')
    // Full scene export still includes text appearance for actor B.
    const full = exportCssFromProject(project)
    expect(full).toContain('#0f766e')
    expect(full).toContain('font-size:')
  })

  it('fails clearly when the selected actor has no path', () => {
    const empty = createSceneActor({ name: 'Empty', recording: null })
    const project = makeProject({ actors: [empty] })
    const result = buildOwnElementExport(project, empty.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/record motion/i)
  })
})
