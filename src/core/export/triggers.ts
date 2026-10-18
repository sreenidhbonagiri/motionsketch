/**
 * Export playback triggers — when a shared CSS scene timeline starts.
 *
 * Triggers only gate activation. Loop / alternate on PlaybackSettings still
 * decide what happens after the scene is running.
 */

import type { PlaybackTrigger } from '../types'

export type { PlaybackTrigger }

export const PLAYBACK_TRIGGERS = [
  'page-load',
  'click',
  'hover',
  'viewport',
] as const satisfies readonly PlaybackTrigger[]

export const DEFAULT_PLAYBACK_TRIGGER: PlaybackTrigger = 'page-load'

/**
 * Fraction of the scene root that must be visible before a viewport trigger
 * starts (IntersectionObserver threshold). 0.35 ≈ a meaningful portion of the
 * stage, not a one-pixel peek.
 */
export const VIEWPORT_TRIGGER_THRESHOLD = 0.35

/** Class on the scene root while waiting for a non–page-load trigger. */
export const MS_WAITING_CLASS = 'ms-waiting'

/** Autoplay pause affordance threshold (ms). */
export const AUTOPLAY_PAUSE_DURATION_MS = 5000

export function isPlaybackTrigger(value: unknown): value is PlaybackTrigger {
  return (
    typeof value === 'string' &&
    (PLAYBACK_TRIGGERS as readonly string[]).includes(value)
  )
}

/** Older projects / missing field → page-load (unchanged autoplay). */
export function coercePlaybackTrigger(value: unknown): PlaybackTrigger {
  return isPlaybackTrigger(value) ? value : DEFAULT_PLAYBACK_TRIGGER
}

/** Click / hover / viewport need the shared trigger controller. */
export function triggerNeedsJavaScript(trigger: PlaybackTrigger): boolean {
  return trigger !== 'page-load'
}

/** Triggers that can start without an explicit Play / click / hover gesture. */
export function isAutomaticPlaybackTrigger(trigger: PlaybackTrigger): boolean {
  return trigger === 'page-load' || trigger === 'viewport'
}

/**
 * Generated previews expose pause when the scene can run for a long time
 * without further user input: any loop, or an automatic trigger (page-load /
 * viewport) whose duration is longer than 5s.
 */
export function shouldOfferPreviewPauseControl(
  trigger: PlaybackTrigger,
  loop: boolean,
  durationMs: number,
): boolean {
  if (loop) return true
  if (
    isAutomaticPlaybackTrigger(trigger) &&
    durationMs > AUTOPLAY_PAUSE_DURATION_MS
  ) {
    return true
  }
  return false
}

export function triggerHelpText(trigger: PlaybackTrigger): string {
  switch (trigger) {
    case 'page-load':
      return 'Starts when the page loads (current default).'
    case 'click':
      return 'Starts or restarts from the beginning on click, tap, or keyboard activation (Enter / Space).'
    case 'hover':
      return 'Starts once on pointer enter or keyboard focus. Leaving does not stop it; it can start again only after both hover and focus have left. On touch, use the Tap to play control.'
    case 'viewport':
      return `Plays once when about ${Math.round(VIEWPORT_TRIGGER_THRESHOLD * 100)}% of the scene is visible. Does not restart on scroll. If IntersectionObserver is unavailable, waits for an explicit Play.`
    default:
      return ''
  }
}

export type TriggerControllerOptions = {
  mode: PlaybackTrigger
  loop: boolean
  durationMs: number
  motionOkClass: string
  waitingClass: string
  viewportThreshold: number
  /** CSS selector for animated actor elements inside the root. */
  actorSelector: string
  offerPause: boolean
}
