import { coerceActor } from '../actor'
import {
  clampStageAspect,
  LEGACY_STAGE_ASPECT,
} from '../stageAspect'
import { cssActorClass } from '../sceneActor'
import type { Actor, LoopMode, MotionSample, Project, TransformTrack } from '../types'
import { exportCssFromProject, exportCssFromRecording } from './css'

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

export function buildHtmlDemoFromProject(project: Project): string {
  const stageAspect = clampStageAspect(project.stageAspect)
  const css = exportCssFromProject(project)
  if (!isSafeCssForEmbed(css)) {
    throw new Error('Refusing to embed CSS that failed safety checks.')
  }

  const chromeCss = `*,
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

.demo-frame .stage {
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

  const actorCount = project.actors.length
  const actorMarkup = project.actors
    .map((actor, i) => {
      const cls = cssActorClass(i, actorCount)
      const appearance = coerceActor(actor.appearance)
      const testId = i === 0 ? ' data-testid="demo-actor"' : ''
      if (appearance.kind === 'image' && appearance.image) {
        return `<img class="${cls}"${testId} src="${appearance.image.dataUrl.replace(/"/g, '')}" alt="${appearance.image.label.replace(/"/g, '&quot;')}" />`
      }
      return `<div class="${cls}"${testId}></div>`
    })
    .join('\n        ')

  const classList = project.actors.map((_, i) =>
    cssActorClass(i, actorCount),
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MotionSketch demo</title>
<style>
${chromeCss}
</style>
<style>
${css}
</style>
</head>
<body>
  <div class="demo-shell">
    <div class="demo-frame">
      <div class="stage" data-testid="demo-stage">
        ${actorMarkup}
      </div>
    </div>
    <button type="button" class="demo-replay" data-testid="demo-replay" id="replay">Replay</button>
  </div>
  <script>
(function () {
  var selectors = ${JSON.stringify(classList.map((c) => '.' + c))};
  var button = document.getElementById('replay');
  if (!button) return;
  button.addEventListener('click', function () {
    selectors.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.removeProperty('animation');
    });
  });
})();
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
  const css = exportCssFromRecording({
    ...options,
    actor,
    durationMs,
    stageAspect,
  })

  if (!isSafeCssForEmbed(css)) {
    throw new Error('Refusing to embed CSS that failed safety checks.')
  }

  void css

  const projectLike: Project = {
    version: 1,
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
        clip: { start: 0, end: 1 },
      },
    ],
    playback: {
      durationMs,
      loop: options.loop ?? false,
      loopMode: options.loopMode ?? 'repeat',
    },
    stageAspect,
  }

  return buildHtmlDemoFromProject(projectLike)
}
