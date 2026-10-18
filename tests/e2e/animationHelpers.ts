/**
 * Portable Web Animations helpers for e2e across Chromium / Firefox / WebKit.
 * Avoid `instanceof CSSAnimation` — prefer `animationName` capability checks.
 */

/** True when a WAAPI animation looks like a CSS keyframe animation. */
export function isCssKeyframeAnimation(anim: Animation): boolean {
  const name = (anim as Animation & { animationName?: unknown }).animationName
  return typeof name === 'string' && name !== '' && name !== 'none'
}

export function listCssAnimations(el: Element): Animation[] {
  if (typeof el.getAnimations !== 'function') return []
  return el.getAnimations().filter(isCssKeyframeAnimation)
}

export function findMotionAnimation(el: Element): Animation | undefined {
  return listCssAnimations(el).find((anim) => {
    const name = (anim as Animation & { animationName: string }).animationName
    return !name.includes('-vis')
  })
}

/** Motion track currentTime in ms, or -1 if unavailable. */
export function readMotionCurrentTime(el: Element): number {
  const anim = findMotionAnimation(el)
  return anim && typeof anim.currentTime === 'number' ? anim.currentTime : -1
}

/**
 * Editor / product visibility at a normalized project time (see isActorVisibleAt):
 * visible on [start, end), hidden for t < start (hide-before) and t >= end (hide-after).
 */
export function editorVisibilityAt(
  tNorm: number,
  start: number,
  end: number,
): 'visible' | 'hidden' {
  if (tNorm < start) return 'hidden'
  if (tNorm >= end) return 'hidden'
  return 'visible'
}

/**
 * Firefox `step-end` holds the previous keyframe value at the exact keyframe
 * time and jumps immediately afterward. Chromium and WebKit apply the new
 * value at the keyframe time. Do not nudge exact-boundary assertions — sample
 * nearby times separately when checking portable agreement.
 */
export const FIREFOX_STEP_END_EXACT_BOUNDARY = {
  /** At exact start keyframe, Firefox still shows pre-start (hidden). */
  atStart: 'hidden' as const,
  /** At exact end keyframe, Firefox still shows in-clip (visible). */
  atEnd: 'visible' as const,
}

/** Seek all CSS animations on an element to a normalized [0,1] progress. */
export function seekCssAnimations(el: Element, tNorm: number): void {
  const t = Math.min(1, Math.max(0, tNorm))
  for (const anim of listCssAnimations(el)) {
    const dur = Number(anim.effect?.getTiming().duration ?? 0)
    if (!(dur > 0)) continue
    anim.pause()
    anim.currentTime = t * dur
  }
}

/** Browser-side snippet string for page.evaluate (no imports inside the page). */
export const SEEK_CSS_ANIMATIONS_SOURCE = `function seekCssAnimations(el, tNorm) {
  if (!el || typeof el.getAnimations !== 'function') return 0;
  var t = Math.min(1, Math.max(0, tNorm));
  var anims = el.getAnimations().filter(function (a) {
    return typeof a.animationName === 'string' && a.animationName !== '' && a.animationName !== 'none';
  });
  var n = 0;
  for (var i = 0; i < anims.length; i++) {
    var dur = Number(anims[i].effect && anims[i].effect.getTiming().duration);
    if (!(dur > 0)) continue;
    anims[i].pause();
    anims[i].currentTime = t * dur;
    n++;
  }
  return n;
}`
