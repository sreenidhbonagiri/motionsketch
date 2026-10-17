import { coerceActor } from '../actor'
import type { Actor, LoopMode, MotionSample } from '../types'
import { exportCssFromRecording } from './css'

export interface HtmlDemoOptions {
  samples: MotionSample[]
  smoothing: number
  steadySpeed?: number
  durationMs: number
  actor: Actor
  loop?: boolean
  loopMode?: LoopMode
  processedPath?: MotionSample[] | null
}

/**
 * Reject CSS that could break out of a <style> block or pull remote assets.
 * Exporter comments may mention HTML tags; only real breakout vectors are blocked.
 */
export function isSafeCssForEmbed(css: string): boolean {
  if (css.length === 0) return false
  if (/<\/style/i.test(css)) return false
  if (/<script/i.test(css)) return false
  if (/url\s*\(\s*['"]?\s*https?:/i.test(css)) return false
  if (/@import/i.test(css)) return false
  return true
}

/**
 * Build a standalone HTML demo that embeds the same CSS as View/Copy/Download CSS.
 * No external assets or network requests.
 */
export function buildHtmlDemo(options: HtmlDemoOptions): string {
  const actor = coerceActor(options.actor)
  const durationMs =
    typeof options.durationMs === 'number' && Number.isFinite(options.durationMs)
      ? Math.max(0, Math.round(options.durationMs))
      : 0

  const css = exportCssFromRecording({
    ...options,
    actor,
    durationMs,
  })

  if (!isSafeCssForEmbed(css)) {
    throw new Error('Refusing to embed CSS that failed safety checks.')
  }

  // Page chrome only — motion comes entirely from the embedded exporter CSS.
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

/* Fit 16/10 stage inside the viewport without cropping. */
.demo-frame {
  width: min(100%, calc((100dvh - 5.5rem) * 16 / 10));
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
        <div class="actor" data-testid="demo-actor"></div>
      </div>
    </div>
    <button type="button" class="demo-replay" data-testid="demo-replay" id="replay">Replay</button>
  </div>
  <script>
(function () {
  var actor = document.querySelector('.actor');
  var button = document.getElementById('replay');
  if (!actor || !button) return;
  button.addEventListener('click', function () {
    actor.style.animation = 'none';
    void actor.offsetWidth;
    actor.style.removeProperty('animation');
  });
})();
  </script>
</body>
</html>
`
}
