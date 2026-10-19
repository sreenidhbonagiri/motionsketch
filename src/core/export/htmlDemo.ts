import { coerceActor } from '../actor'
import { escapeHtmlText } from '../projectName'
import {
  clampStageAspect,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import type {
  Actor,
  ActorImage,
  LoopMode,
  MotionSample,
  Project,
  TransformTrack,
} from '../types'
import { makeGeometryEdit } from '../edit'
import { exportCssFromProject, resolveExportScope } from './css'
import { fullClip } from '../clip'
import {
  scopedActorClass,
  type ExportCssOptions,
  type ExportScope,
} from './sceneScope'
import {
  buildTriggerBootScript,
  buildTriggerControllerOptions,
  buildTriggerControllerSource,
} from './triggerController'
import {
  coercePlaybackTrigger,
  MS_WAITING_CLASS,
  triggerNeedsJavaScript,
  type PlaybackTrigger,
} from './triggers'

export interface HtmlDemoOptions {
  samples: MotionSample[]
  smoothing: number
  steadySpeed?: number
  durationMs: number
  actor: Actor
  loop?: boolean
  loopMode?: LoopMode
  stageAspect?: number
  processedPath?: MotionSample[] | null
  transform?: TransformTrack | null
}

export type HtmlDemoBuildOptions = ExportCssOptions & {
  /**
   * When set, link this stylesheet instead of inlining CSS
   * (web package uses `animation.css`).
   */
  stylesheetHref?: string
  /** Override image `src` (default: embedded data URL). */
  resolveImageSrc?: (image: ActorImage) => string
  /**
   * When set, link the trigger controller instead of inlining
   * (web package uses `ms-trigger.js`).
   */
  triggerScriptHref?: string
}

/**
 * Reject CSS that could break out of a <style> block or pull remote assets.
 */
export function isSafeCssForEmbed(css: string): boolean {
  if (css.length === 0) return false
  if (/<\/style/i.test(css)) return false
  if (/<script/i.test(css)) return false
  if (/url\s*\(\s*['"]?\s*https?:/i.test(css)) return false
  if (/@import/i.test(css)) return false
  return true
}

function demoChromeCss(stageAspect: number, scope: ExportScope): string {
  return `*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: #f4f6fb;
  color: #0f172a;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
}

body {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
}

.demo-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 100%;
}

.demo-frame {
  width: min(100%, calc((100dvh - 5.5rem) * ${stageAspect}));
  max-height: calc(100dvh - 5.5rem);
}

.demo-frame .${scope.stageClass} {
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.1);
}

.demo-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.demo-replay,
.demo-pause,
.demo-hover-tap {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  border-radius: 0.65rem;
  padding: 0.45rem 0.9rem;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.demo-replay:hover,
.demo-pause:hover,
.demo-hover-tap:hover {
  background: #f8fafc;
}

.demo-replay:focus-visible,
.demo-pause:focus-visible,
.demo-hover-tap:focus-visible,
.${scope.rootClass}:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

.demo-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
  max-width: 28rem;
}`
}

function buildActorMarkup(
  project: Project,
  resolveImageSrc?: (image: ActorImage) => string,
): string {
  const actorCount = project.actors.length
  return project.actors
    .map((actor, i) => {
      const cls = scopedActorClass(i, actorCount)
      const appearance = coerceActor(actor.appearance)
      const testId = i === 0 ? ' data-testid="demo-actor"' : ''
      if (appearance.kind === 'image' && appearance.image) {
        const src = resolveImageSrc
          ? resolveImageSrc(appearance.image)
          : appearance.image.dataUrl
        const safeSrc = src.replace(/"/g, '')
        const alt = escapeHtmlText(appearance.image.label || 'Actor image')
        return `<img class="${cls}"${testId} src="${safeSrc}" alt="${alt}" />`
      }
      return `<div class="${cls}"${testId}></div>`
    })
    .join('\n          ')
}

function triggerHint(trigger: PlaybackTrigger): string {
  switch (trigger) {
    case 'click':
      return 'Click or tap the scene (or press Enter / Space when focused) to play. Looping continues until you pause.'
    case 'hover':
      return 'Hover or focus the scene to play once. On touch, use Tap to play. Leaving does not stop a running loop.'
    case 'viewport':
      return 'Plays once when enough of the scene is on screen. Use Play if it never appears.'
    default:
      return 'Plays on page load. Prefer reduced motion? Use Play animation.'
  }
}

/**
 * Offline preview HTML with scene-scoped trigger controls.
 * Shared by the single-file HTML demo and the web package `index.html`.
 */
export function buildHtmlDemoFromProject(
  project: Project,
  options: HtmlDemoBuildOptions = {},
): string {
  const stageAspect = clampStageAspect(project.stageAspect)
  const scope = resolveExportScope(project, options)
  const css = exportCssFromProject(project, options)
  if (!isSafeCssForEmbed(css)) {
    throw new Error('Refusing to embed CSS that failed safety checks.')
  }

  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const ctlOptions = buildTriggerControllerOptions({
    trigger,
    loop: project.playback.loop,
    durationMs: project.playback.durationMs,
  })
  const waitingClass = triggerNeedsJavaScript(trigger)
    ? ` ${MS_WAITING_CLASS}`
    : ''

  const stylesheetHref = options.stylesheetHref?.replace(/"/g, '').trim()
  const cssBlock = stylesheetHref
    ? `<link rel="stylesheet" href="${stylesheetHref}">`
    : `<style>
${css}
</style>`

  const triggerHref = options.triggerScriptHref?.replace(/"/g, '').trim()
  const controllerBlock = triggerHref
    ? `<script src="${triggerHref}"></script>`
    : `<script>
${buildTriggerControllerSource()}
</script>`

  const chromeCss = demoChromeCss(stageAspect, scope)
  const actorMarkup = buildActorMarkup(project, options.resolveImageSrc)
  const offerPause = ctlOptions.offerPause
  const showHoverTap = trigger === 'hover'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtmlText(project.name || 'MotionSketch demo')}</title>
<style>
${chromeCss}
</style>
${cssBlock}
</head>
<body>
  <div class="demo-shell" data-ms-demo-shell data-testid="demo-shell">
    <div class="demo-frame">
      <div class="${scope.rootClass}${waitingClass}" data-ms-scene="${scope.sceneId}" data-testid="demo-scene" data-ms-trigger="${trigger}">
        <div class="${scope.stageClass}" data-testid="demo-stage">
          ${actorMarkup}
        </div>
      </div>
    </div>
    <div class="demo-controls" data-ms-chrome data-testid="demo-controls">
      <button type="button" class="demo-replay" data-testid="demo-replay" data-ms-play data-ms-chrome>Play animation</button>
      ${
        offerPause
          ? `<button type="button" class="demo-pause" data-testid="demo-pause" data-ms-pause data-ms-chrome hidden>Pause</button>`
          : ''
      }
      ${
        showHoverTap
          ? `<button type="button" class="demo-hover-tap" data-testid="demo-hover-tap" data-ms-hover-tap data-ms-chrome>Tap to play</button>`
          : ''
      }
    </div>
    <p class="demo-hint" data-testid="demo-trigger-hint">${escapeHtmlText(triggerHint(trigger))}</p>
  </div>
${controllerBlock}
  <script>
${buildTriggerBootScript(scope.sceneId, ctlOptions)}
  </script>
</body>
</html>
`
}

/**
 * Build a standalone HTML demo that embeds the same CSS as View/Copy/Download CSS.
 */
export function buildHtmlDemo(options: HtmlDemoOptions): string {
  const actor = coerceActor(options.actor)
  const durationMs =
    typeof options.durationMs === 'number' && Number.isFinite(options.durationMs)
      ? Math.max(0, Math.round(options.durationMs))
      : 0

  const stageAspect = clampStageAspect(
    options.stageAspect ?? LEGACY_STAGE_ASPECT,
  )

  // Bridge legacy single-actor options through the project exporter.
  const project: Project = {
    version: 1,
    name: 'MotionSketch demo',
    actors: [
      {
        id: 'a1',
        name: 'Actor 1',
        appearance: actor,
        recording:
          options.samples.length >= 2
            ? {
                recordedDurationMs: durationMs,
                samples: options.samples,
              }
            : null,
        restPosition: options.samples[0]
          ? { x: options.samples[0].x, y: options.samples[0].y }
          : { x: 0.5, y: 0.5 },
        smoothing: options.smoothing,
        steadySpeed: options.steadySpeed ?? 0,
        transform: options.transform ?? { keyframes: [] },
        geometryEdit: options.processedPath?.length
          ? makeGeometryEdit(options.processedPath, options.smoothing)
          : null,
        clip: fullClip(),
        faceAlongPath: false,
        directionOffsetDeg: 0,
      },
    ],
    playback: {
      durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
      trigger: 'page-load',
    },
    stageAspect,
  }

  return buildHtmlDemoFromProject(project)
}
