import {
  MS_WAITING_CLASS,
  VIEWPORT_TRIGGER_THRESHOLD,
  type PlaybackTrigger,
  type TriggerControllerOptions,
  shouldOfferPreviewPauseControl,
  triggerNeedsJavaScript,
} from './triggers'
import { MS_MOTION_OK_CLASS } from './sceneScope'

export const TRIGGER_CONTROLLER_GLOBAL = 'MotionSketchTrigger'
export const WEB_PACKAGE_TRIGGER_JS_NAME = 'ms-trigger.js'

/**
 * Build controller options from project playback + scene classes.
 */
export function buildTriggerControllerOptions(args: {
  trigger: PlaybackTrigger
  loop: boolean
  durationMs: number
  motionOkClass?: string
  waitingClass?: string
}): TriggerControllerOptions {
  const trigger = args.trigger
  return {
    mode: trigger,
    loop: args.loop,
    durationMs: args.durationMs,
    motionOkClass: args.motionOkClass ?? MS_MOTION_OK_CLASS,
    waitingClass: args.waitingClass ?? MS_WAITING_CLASS,
    viewportThreshold: VIEWPORT_TRIGGER_THRESHOLD,
    actorSelector: '[class^="ms-actor"]',
    offerPause: shouldOfferPreviewPauseControl(
      trigger,
      args.loop,
      args.durationMs,
    ),
  }
}

/**
 * Shared trigger controller source (browser JS, no build step).
 * Frame evaluation stays in CSS; this only arms / pauses / restarts animations.
 *
 * Public API on `window.MotionSketchTrigger`:
 *   init(root, options) → controller
 *   get(root) → controller | null
 *   destroy(root)
 *
 * Controller methods: play(), pause(), resume(), restart(), destroy()
 *
 * Lifecycle:
 * - destroy() cancels CSS animations on owned actor elements, clears listeners /
 *   observers / pending arm timers, and restores controller-owned root attrs/classes.
 * - init() after destroy establishes the correct armed/running state for `mode`.
 * - Host animations on non-actor elements are left alone.
 */
export function buildTriggerControllerSource(): string {
  return `/* MotionSketch scene trigger controller
 * CSS owns keyframes; this script only activates / pauses / restarts them.
 * Offline-friendly — no network. Scope one controller per scene root.
 */
(function (global) {
  'use strict';
  var API_NAME = ${JSON.stringify(TRIGGER_CONTROLLER_GLOBAL)};
  var STORE = API_NAME + '$$map';

  function map() {
    if (!global[STORE]) global[STORE] = new WeakMap();
    return global[STORE];
  }

  function actors(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  function reducedMotion() {
    return (
      typeof global.matchMedia === 'function' &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function isCssAnimation(anim) {
    if (!anim) return false;
    if (typeof CSSAnimation !== 'undefined' && anim instanceof CSSAnimation) {
      return true;
    }
    // jsdom / older engines: treat named CSS animations as owned.
    return typeof anim.animationName === 'string' && anim.animationName !== '' && anim.animationName !== 'none';
  }

  function restartAnimations(root, selector) {
    actors(root, selector).forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.removeProperty('animation');
    });
  }

  function stopOwnedActorAnimations(root, selector) {
    actors(root, selector).forEach(function (el) {
      if (typeof el.getAnimations === 'function') {
        el.getAnimations().forEach(function (anim) {
          if (!isCssAnimation(anim)) return;
          try {
            anim.cancel();
          } catch (e) {}
        });
      }
      el.style.removeProperty('animation-play-state');
      el.style.removeProperty('animation');
    });
  }

  function createController(root, options) {
    var mode = options.mode || 'page-load';
    var motionOk = options.motionOkClass || 'ms-motion-ok';
    var waiting = options.waitingClass || 'ms-waiting';
    var actorSel = options.actorSelector || '[class^="ms-actor"]';
    var threshold =
      typeof options.viewportThreshold === 'number'
        ? options.viewportThreshold
        : 0.35;
    var destroyed = false;
    var started = false;
    var paused = false;
    var hoverArmed = true;
    /** True while the pointer is inside the scene root (hover mode). */
    var pointerInside = false;
    var io = null;
    var mq = null;
    var armTimer = null;
    var tapBtn = null;
    var pauseBtn = null;
    var playBtn = null;
    var onPlayClick = null;
    var onPauseClick = null;
    var onTapClick = null;
    // Track mutations the controller owns so destroy() can restore the host.
    var owned = {
      waitingAdded: false,
      waitingRemoved: false,
      motionOkAdded: false,
      tabindexAdded: false,
      roleAdded: false,
      ariaLabelAdded: false,
    };

    function setWaiting(on) {
      if (on) {
        if (!root.classList.contains(waiting)) {
          root.classList.add(waiting);
          owned.waitingAdded = true;
        }
      } else if (root.classList.contains(waiting)) {
        root.classList.remove(waiting);
        owned.waitingRemoved = true;
      }
    }

    function canAutoAnimate() {
      return !reducedMotion() || root.classList.contains(motionOk);
    }

    function clearArmTimer() {
      if (armTimer != null) {
        clearTimeout(armTimer);
        armTimer = null;
      }
    }

    function scheduleArmRefresh() {
      clearArmTimer();
      armTimer = setTimeout(function () {
        armTimer = null;
        refreshHoverArm();
      }, 0);
    }

    function syncChrome() {
      if (playBtn) {
        var needOptIn = reducedMotion() && !root.classList.contains(motionOk);
        playBtn.hidden = false;
        playBtn.textContent = needOptIn
          ? 'Play animation'
          : started
            ? 'Replay'
            : 'Play animation';
      }
      if (pauseBtn) {
        var showPause = !!options.offerPause && started && canAutoAnimate();
        pauseBtn.hidden = !showPause;
        pauseBtn.textContent = paused ? 'Resume' : 'Pause';
        pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      }
      if (tapBtn) {
        tapBtn.hidden = mode !== 'hover';
      }
    }

    /**
     * @param opts.optInReducedMotion  Explicit Play / click / Enter / Space / tap.
     *   Hover and focus never set this — they must not override reduced-motion.
     */
    function beginPlayback(opts) {
      if (destroyed) return false;
      var force = opts && opts.force;
      var optIn = opts && opts.optInReducedMotion;
      if (reducedMotion() && !root.classList.contains(motionOk)) {
        if (!optIn) {
          syncChrome();
          return false;
        }
        root.classList.add(motionOk);
        owned.motionOkAdded = true;
      }
      if (!canAutoAnimate() && !force) {
        syncChrome();
        return false;
      }
      setWaiting(false);
      restartAnimations(root, actorSel);
      started = true;
      paused = false;
      actors(root, actorSel).forEach(function (el) {
        el.style.removeProperty('animation-play-state');
      });
      syncChrome();
      return true;
    }

    function pausePlayback() {
      if (destroyed || !started) return;
      paused = true;
      actors(root, actorSel).forEach(function (el) {
        el.style.animationPlayState = 'paused';
      });
      syncChrome();
    }

    function resumePlayback() {
      if (destroyed || !started) return;
      if (reducedMotion() && !root.classList.contains(motionOk)) {
        syncChrome();
        return;
      }
      paused = false;
      actors(root, actorSel).forEach(function (el) {
        el.style.removeProperty('animation-play-state');
      });
      syncChrome();
    }

    function restartPlayback() {
      beginPlayback({ force: true, optInReducedMotion: true });
    }

    function rootHasPointer() {
      try {
        return root.matches(':hover');
      } catch (e) {
        return false;
      }
    }

    function rootHasFocus() {
      var ae = document.activeElement;
      return !!(ae && root.contains(ae));
    }

    function refreshHoverArm() {
      if (!rootHasPointer() && !rootHasFocus()) {
        hoverArmed = true;
        syncChrome();
      }
    }

    function onClickActivate(event) {
      if (destroyed) return;
      if (event.target && event.target.closest && event.target.closest('[data-ms-chrome]')) {
        return;
      }
      beginPlayback({ optInReducedMotion: true });
    }

    function onKeyActivate(event) {
      if (destroyed) return;
      if (event.target !== root) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      beginPlayback({ optInReducedMotion: true });
    }

    function tryHoverFocusStart() {
      if (reducedMotion() && !root.classList.contains(motionOk)) {
        // Do not consume the arm — wait for explicit Play / tap.
        syncChrome();
        return;
      }
      if (!hoverArmed) return;
      hoverArmed = false;
      beginPlayback({ optInReducedMotion: false });
    }

    function onPointerEnter() {
      if (destroyed || mode !== 'hover') return;
      // If focus already left before this enter (blur + re-hover in one turn),
      // re-arm synchronously — do not wait for a deferred focusout timer.
      if (!pointerInside && !rootHasFocus()) {
        hoverArmed = true;
      }
      pointerInside = true;
      tryHoverFocusStart();
    }

    function onFocusIn() {
      if (destroyed || mode !== 'hover') return;
      // Focus that arrives while the pointer is already inside is the same
      // pointer session (e.g. click-to-focus), not a fresh hover/focus arm.
      if (pointerInside) return;
      tryHoverFocusStart();
    }

    function onPointerLeave() {
      if (mode !== 'hover') return;
      pointerInside = false;
      scheduleArmRefresh();
    }

    function onFocusOut(event) {
      if (mode !== 'hover') return;
      // Child→child focus stays inside the scene — never re-arm mid-transfer.
      var next = event && event.relatedTarget;
      if (next && root.contains(next)) return;
      scheduleArmRefresh();
    }

    function ensureAttr(name, value, flag) {
      if (!root.hasAttribute(name)) {
        root.setAttribute(name, value);
        owned[flag] = true;
      }
    }

    function bindChrome() {
      playBtn = root.parentElement
        ? root.parentElement.querySelector('[data-ms-play]')
        : null;
      if (!playBtn && root.ownerDocument) {
        var shell = root.closest('[data-ms-demo-shell]');
        if (shell) playBtn = shell.querySelector('[data-ms-play]');
      }
      pauseBtn = null;
      tapBtn = null;
      var shellEl = root.closest('[data-ms-demo-shell]') || root.parentElement;
      if (shellEl) {
        pauseBtn = shellEl.querySelector('[data-ms-pause]');
        tapBtn = shellEl.querySelector('[data-ms-hover-tap]');
      }

      if (playBtn) {
        onPlayClick = function () {
          beginPlayback({ optInReducedMotion: true });
        };
        playBtn.addEventListener('click', onPlayClick);
      }
      if (pauseBtn) {
        onPauseClick = function () {
          if (paused) resumePlayback();
          else pausePlayback();
        };
        pauseBtn.addEventListener('click', onPauseClick);
      }
      if (tapBtn) {
        onTapClick = function () {
          hoverArmed = false;
          beginPlayback({ optInReducedMotion: true });
        };
        tapBtn.addEventListener('click', onTapClick);
      }
    }

    function bindMode() {
      // Clear leftover inline play-state from a prior instance before arming.
      actors(root, actorSel).forEach(function (el) {
        el.style.removeProperty('animation-play-state');
        el.style.removeProperty('animation');
      });

      if (mode === 'page-load') {
        if (canAutoAnimate()) {
          setWaiting(false);
          restartAnimations(root, actorSel);
          started = true;
          paused = false;
        } else {
          setWaiting(false);
          started = false;
          paused = false;
        }
        return;
      }

      setWaiting(true);
      started = false;
      paused = false;
      hoverArmed = true;
      pointerInside = false;

      if (mode === 'click') {
        ensureAttr('tabindex', '0', 'tabindexAdded');
        ensureAttr('role', 'button', 'roleAdded');
        ensureAttr('aria-label', 'Play animation', 'ariaLabelAdded');
        root.addEventListener('click', onClickActivate);
        root.addEventListener('keydown', onKeyActivate);
      }

      if (mode === 'hover') {
        // mouseenter/mouseleave do not fire when moving among descendants.
        root.addEventListener('mouseenter', onPointerEnter);
        root.addEventListener('mouseleave', onPointerLeave);
        root.addEventListener('focusin', onFocusIn);
        root.addEventListener('focusout', onFocusOut);
        ensureAttr('tabindex', '0', 'tabindexAdded');
      }

      if (mode === 'viewport') {
        if (typeof IntersectionObserver === 'function') {
          io = new IntersectionObserver(
            function (entries) {
              for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting && !started) {
                  if (canAutoAnimate()) {
                    beginPlayback({ optInReducedMotion: false });
                  }
                  if (io) {
                    io.disconnect();
                    io = null;
                  }
                  break;
                }
              }
            },
            { threshold: threshold },
          );
          io.observe(root);
        }
        // Fallback: stay waiting until explicit Play (no silent autoplay).
      }
    }

    function onMqChange() {
      if (destroyed) return;
      if (!reducedMotion()) {
        if (owned.motionOkAdded) {
          root.classList.remove(motionOk);
          owned.motionOkAdded = false;
        } else {
          root.classList.remove(motionOk);
        }
        if (mode === 'page-load') {
          restartAnimations(root, actorSel);
          started = true;
          paused = false;
        }
      } else if (!root.classList.contains(motionOk)) {
        // Preference engaged: freeze to static presentation.
        stopOwnedActorAnimations(root, actorSel);
        if (mode !== 'page-load') {
          setWaiting(true);
          started = false;
          hoverArmed = true;
        } else {
          started = false;
        }
        paused = false;
      }
      syncChrome();
    }

    function restoreOwnedRootState() {
      if (owned.motionOkAdded) root.classList.remove(motionOk);
      if (owned.waitingAdded) root.classList.remove(waiting);
      if (owned.waitingRemoved) root.classList.add(waiting);
      if (owned.tabindexAdded) root.removeAttribute('tabindex');
      if (owned.roleAdded) root.removeAttribute('role');
      if (owned.ariaLabelAdded) root.removeAttribute('aria-label');
    }

    bindChrome();
    bindMode();

    if (typeof global.matchMedia === 'function') {
      mq = global.matchMedia('(prefers-reduced-motion: reduce)');
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onMqChange);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(onMqChange);
      }
    }
    syncChrome();

    return {
      play: function () {
        beginPlayback({ optInReducedMotion: true });
      },
      pause: pausePlayback,
      resume: resumePlayback,
      restart: restartPlayback,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        clearArmTimer();
        root.removeEventListener('click', onClickActivate);
        root.removeEventListener('keydown', onKeyActivate);
        root.removeEventListener('mouseenter', onPointerEnter);
        root.removeEventListener('mouseleave', onPointerLeave);
        root.removeEventListener('focusin', onFocusIn);
        root.removeEventListener('focusout', onFocusOut);
        if (io) {
          io.disconnect();
          io = null;
        }
        if (mq) {
          if (typeof mq.removeEventListener === 'function') {
            mq.removeEventListener('change', onMqChange);
          } else if (typeof mq.removeListener === 'function') {
            mq.removeListener(onMqChange);
          }
        }
        if (playBtn && onPlayClick) {
          playBtn.removeEventListener('click', onPlayClick);
        }
        if (pauseBtn && onPauseClick) {
          pauseBtn.removeEventListener('click', onPauseClick);
        }
        if (tapBtn && onTapClick) {
          tapBtn.removeEventListener('click', onTapClick);
        }
        stopOwnedActorAnimations(root, actorSel);
        restoreOwnedRootState();
        map().delete(root);
      },
      get started() {
        return started;
      },
      get paused() {
        return paused;
      },
      get mode() {
        return mode;
      },
    };
  }

  var api = {
    init: function (root, options) {
      if (!root) throw new Error('MotionSketchTrigger.init requires a root element');
      var existing = map().get(root);
      if (existing) {
        existing.destroy();
      }
      var ctl = createController(root, options || {});
      map().set(root, ctl);
      return ctl;
    },
    get: function (root) {
      return map().get(root) || null;
    },
    destroy: function (root) {
      var ctl = map().get(root);
      if (ctl) ctl.destroy();
    },
    needsJavaScript: function (t) {
      return t !== 'page-load';
    },
  };

  global[API_NAME] = api;
})(typeof window !== 'undefined' ? window : globalThis);
`
}

/**
 * Inline boot snippet that inits the controller for a single scene root.
 */
export function buildTriggerBootScript(
  sceneId: string,
  options: TriggerControllerOptions,
): string {
  return `(function () {
  var api = window.${TRIGGER_CONTROLLER_GLOBAL};
  if (!api || typeof api.init !== 'function') return;
  var root = document.querySelector('[data-ms-scene=${JSON.stringify(sceneId)}]');
  if (!root) return;
  api.init(root, ${JSON.stringify(options)});
})();`
}

export function triggerUsesWaitingClass(trigger: PlaybackTrigger): boolean {
  return triggerNeedsJavaScript(trigger)
}
