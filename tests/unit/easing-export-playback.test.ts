import { describe, expect, it } from 'vitest'
import type { MotionEasing } from '../../src/core/easing'
import { buildProjectCssExport } from '../../src/core/export/css'
import {
  evaluateKeyframes,
  maxPlaybackExportError,
} from '../../src/core/export/consistency'
import { buildKeyframesFromProcessed } from '../../src/core/export/format'
import { buildHtmlDemoFromProject } from '../../src/core/export/htmlDemo'
import { buildOwnElementExport } from '../../src/core/export/ownElement'
import { evaluate } from '../../src/core/playback'
import { createSceneActor } from '../../src/core/sceneActor'
import type { MotionSample, Project } from '../../src/core/types'
import { selectProcessedPathForActor } from '../../src/state/selectors'

function pausePath(): MotionSample[] {
  const samples: MotionSample[] = []
  for (let i = 0; i <= 15; i++) {
    samples.push({ t: i * 30, x: 0.25 + i * 0.01, y: 0.4 })
  }
  for (let i = 1; i <= 8; i++) {
    samples.push({ t: 450 + i * 40, x: 0.4, y: 0.4 })
  }
  for (let i = 1; i <= 30; i++) {
    samples.push({
      t: 770 + i * 30,
      x: 0.4 + i * 0.015,
      y: 0.4,
    })
  }
  return samples
}

function projectWithEasing(kind: MotionEasing): Project {
  const samples = pausePath()
  const actor = createSceneActor({
    id: `export-${kind}`,
    name: 'Export Actor',
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    geometryEdit: {
      samples: samples.map((s) => ({ ...s })),
      bakedSmoothing: 0,
      handleIndices: [0, samples.length - 1],
    },
    smoothing: 0,
    steadySpeed: 0,
    glide: 0,
    easing: kind,
  })
  return {
    version: 1,
    name: `Easing ${kind} export`,
    stageAspect: 1.6,
    stageWidth: 1600,
    stageHeight: 1000,
    playback: {
      durationMs: samples[samples.length - 1]!.t,
      loop: false,
      loopMode: 'repeat',
      trigger: 'page-load',
    },
    actors: [actor],
  }
}

describe('easing HTML/React/CSS export playback', () => {
  for (const kind of ['easeOut', 'spring', 'bounce'] as const) {
    it(`${kind}: editor path matches CSS keyframes; HTML/React include motion`, () => {
      const project = projectWithEasing(kind)
      const actor = project.actors[0]!
      const path = selectProcessedPathForActor(project, actor)
      const kf = buildKeyframesFromProcessed(path)
      expect(maxPlaybackExportError(path, kf, 64)).toBeLessThan(0.025)

      const duration = path[path.length - 1]!.t
      const holdT = 750 / duration
      const play = evaluate(path, holdT)
      const exported = evaluateKeyframes(kf, holdT)
      expect(play.x).toBeCloseTo(0.4, 3)
      expect(exported.x).toBeCloseTo(play.x, 3)

      const { css } = buildProjectCssExport(project)
      expect(css).toContain('@keyframes')
      expect((css.match(/\{\s*transform:/g) ?? []).length).toBeGreaterThan(8)

      const html = buildHtmlDemoFromProject(project)
      expect(html).toContain('@keyframes')
      expect(html).toContain('animation:')

      const own = buildOwnElementExport(project, actor.id)
      expect(own.ok).toBe(true)
      if (!own.ok) return
      expect(own.reactExample).toMatch(/keyframes|animation|@keyframes/i)
      expect(own.htmlExample).toMatch(/keyframes|animation|@keyframes/i)
    })
  }
})
