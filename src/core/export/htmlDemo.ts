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
import { exportCssFromProject, resolveExportScope } from './css'
import { fullClip } from '../clip'
import {
  MS_MOTION_OK_CLASS,
  scopedActorClass,
  type ExportCssOptions,
  type ExportScope,
} from './sceneScope'

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

.demo-replay {
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

.demo-replay:hover {
  background: #f8fafc;
}

.demo-replay:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
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

function demoReplayScript(
  scope: ExportScope,
  actorClassList: string[],
): string {
  return `(function () {
  var root = document.querySelector('[data-ms-scene="${scope.sceneId}"]');
  var button = document.getElementById('replay');
  var actorClasses = ${JSON.stringify(actorClassList)};
  var motionOk = ${JSON.stringify(MS_MOTION_OK_CLASS)};
  if (!root || !button) return;

  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');

  function actors() {
    return actorClasses.map(function (cls) {
      return root.querySelector('.' + cls);
    }).filter(Boolean);
  }

  function restartAnimations() {
    actors().forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.removeProperty('animation');
    });
  }

  function syncLabel() {
    if (mq.matches && !root.classList.contains(motionOk)) {
      button.textContent = 'Play animation';
      button.setAttribute('data-demo-mode', 'play');
    } else {
      button.textContent = 'Replay';
      button.setAttribute('data-demo-mode', 'replay');
    }
  }

  function onPreferenceChange() {
    if (!mq.matches) {
      // Preference cleared: resume default autoplay semantics (no opt-in class).
      root.classList.remove(motionOk);
      restartAnimations();
    } else if (!root.classList.contains(motionOk)) {
      // Reduced motion engaged while idle: ensure static presentation.
      restartAnimations();
    }
    syncLabel();
  }

  button.addEventListener('click', function () {
    if (mq.matches) {
      root.classList.add(motionOk);
    }
    restartAnimations();
    syncLabel();
  });

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onPreferenceChange);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(onPreferenceChange);
  }
  syncLabel();
})();`
}

/**
 * Offline preview HTML with scene-scoped Play/Replay controls.
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

  const stylesheetHref = options.stylesheetHref?.replace(/"/g, '').trim()
  const cssBlock = stylesheetHref
    ? `<link rel="stylesheet" href="${stylesheetHref}">`
    : `<style>
${css}
</style>`

  const chromeCss = demoChromeCss(stageAspect, scope)
  const actorMarkup = buildActorMarkup(project, options.resolveImageSrc)
  const actorClassList = project.actors.map((_, i) =>
    scopedActorClass(i, project.actors.length),
  )

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
  <div class="demo-shell">
    <div class="demo-frame">
      <div class="${scope.rootClass}" data-ms-scene="${scope.sceneId}" data-testid="demo-scene">
        <div class="${scope.stageClass}" data-testid="demo-stage">
          ${actorMarkup}
        </div>
      </div>
    </div>
    <button type="button" class="demo-replay" data-testid="demo-replay" id="replay">Replay</button>
  </div>
  <script>
${demoReplayScript(scope, actorClassList)}
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
          ? {
              bakedSmoothing: options.smoothing,
              samples: options.processedPath,
            }
          : null,
        clip: fullClip(),
      },
    ],
    playback: {
      durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
    },
    stageAspect,
  }

  return buildHtmlDemoFromProject(project)
}
