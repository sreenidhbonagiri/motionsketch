/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildTriggerControllerSource,
  TRIGGER_CONTROLLER_GLOBAL,
} from '../../src/core/export/triggerController'
import { MS_WAITING_CLASS } from '../../src/core/export/triggers'
import { MS_MOTION_OK_CLASS } from '../../src/core/export/sceneScope'

type TriggerApi = {
  init: (
    root: Element,
    options?: Record<string, unknown>,
  ) => {
    play: () => void
    pause: () => void
    resume: () => void
    restart: () => void
    destroy: () => void
    started: boolean
    paused: boolean
    mode: string
  }
  get: (root: Element) => { started: boolean; paused: boolean } | null
  destroy: (root: Element) => void
}

function installApi(): TriggerApi {
  const g = window as unknown as Record<string, unknown>
  delete g[TRIGGER_CONTROLLER_GLOBAL]
  delete g[`${TRIGGER_CONTROLLER_GLOBAL}$$map`]
  // eslint-disable-next-line no-eval
  ;(0, eval)(buildTriggerControllerSource())
  return g[TRIGGER_CONTROLLER_GLOBAL] as TriggerApi
}

function stubReducedMotion(enabled: boolean) {
  window.matchMedia = ((query: string) => {
    const matches =
      enabled && query.includes('prefers-reduced-motion: reduce')
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }
  }) as unknown as typeof window.matchMedia
}

function mountScene(attrs: { waiting?: boolean; loop?: boolean } = {}) {
  document.body.innerHTML = `
    <div data-ms-demo-shell>
      <div class="ms-scene${attrs.waiting ? ` ${MS_WAITING_CLASS}` : ''}" data-ms-scene="t1" data-testid="root">
        <div class="ms-actor" data-testid="actor"></div>
        <button type="button" data-testid="child-a">A</button>
        <button type="button" data-testid="child-b">B</button>
      </div>
      <button type="button" data-ms-play>Play</button>
      <button type="button" data-ms-pause hidden>Pause</button>
      <button type="button" data-ms-hover-tap hidden>Tap</button>
    </div>
  `
  const actor = document.querySelector('[data-testid="actor"]') as HTMLElement
  actor.style.animation = attrs.loop
    ? 'ms-test 1s linear infinite'
    : 'ms-test 1s linear forwards'
  return {
    root: document.querySelector('[data-testid="root"]') as HTMLElement,
    actor,
    play: document.querySelector('[data-ms-play]') as HTMLButtonElement,
    childA: document.querySelector('[data-testid="child-a"]') as HTMLButtonElement,
    childB: document.querySelector('[data-testid="child-b"]') as HTMLButtonElement,
  }
}

describe('MotionSketchTrigger runtime', () => {
  beforeEach(() => {
    stubReducedMotion(false)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('hover/focus do not opt into reduced-motion; Play / click / Enter do', () => {
    stubReducedMotion(true)
    const api = installApi()
    const { root, play, childA } = mountScene({ waiting: true })
    const ctl = api.init(root, {
      mode: 'hover',
      waitingClass: MS_WAITING_CLASS,
      motionOkClass: MS_MOTION_OK_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })

    root.dispatchEvent(new Event('mouseenter', { bubbles: true }))
    expect(root.classList.contains(MS_MOTION_OK_CLASS)).toBe(false)
    expect(ctl.started).toBe(false)
    expect(root.classList.contains(MS_WAITING_CLASS)).toBe(true)

    childA.focus()
    root.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, relatedTarget: null }),
    )
    expect(root.classList.contains(MS_MOTION_OK_CLASS)).toBe(false)
    expect(ctl.started).toBe(false)

    play.click()
    expect(root.classList.contains(MS_MOTION_OK_CLASS)).toBe(true)
    expect(ctl.started).toBe(true)
  })

  it('Play pointerup opts in without a click (WebKit focus+gesture path)', () => {
    stubReducedMotion(true)
    const api = installApi()
    const { root, play } = mountScene({ waiting: true })
    const ctl = api.init(root, {
      mode: 'hover',
      waitingClass: MS_WAITING_CLASS,
      motionOkClass: MS_MOTION_OK_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })

    play.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    )
    expect(root.classList.contains(MS_MOTION_OK_CLASS)).toBe(true)
    expect(ctl.started).toBe(true)

    // Same-turn click must not double-toggle waiting back on.
    play.click()
    expect(root.classList.contains(MS_MOTION_OK_CLASS)).toBe(true)
    expect(ctl.started).toBe(true)
  })

  it('click mode opts in on activation; automatic page-load stays blocked', () => {
    stubReducedMotion(true)
    const api = installApi()
    const pageLoad = mountScene()
    const auto = api.init(pageLoad.root, {
      mode: 'page-load',
      motionOkClass: MS_MOTION_OK_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })
    expect(auto.started).toBe(false)
    expect(pageLoad.root.classList.contains(MS_MOTION_OK_CLASS)).toBe(false)

    document.body.innerHTML = ''
    stubReducedMotion(true)
    const clickMount = mountScene({ waiting: true })
    const clickCtl = api.init(clickMount.root, {
      mode: 'click',
      waitingClass: MS_WAITING_CLASS,
      motionOkClass: MS_MOTION_OK_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })
    clickMount.root.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    expect(clickMount.root.classList.contains(MS_MOTION_OK_CLASS)).toBe(true)
    expect(clickCtl.started).toBe(true)
  })

  it('destroy stops owned animations and reinit restores mode state', () => {
    const api = installApi()
    const { root, actor } = mountScene({ loop: true })
    const first = api.init(root, {
      mode: 'page-load',
      offerPause: true,
      actorSelector: '[class^="ms-actor"]',
    })
    expect(first.started).toBe(true)
    first.pause()
    expect(first.paused).toBe(true)
    expect(actor.style.animationPlayState).toBe('paused')

    const second = api.init(root, {
      mode: 'page-load',
      offerPause: true,
      actorSelector: '[class^="ms-actor"]',
    })
    expect(second).not.toBe(first)
    expect(second.started).toBe(true)
    expect(second.paused).toBe(false)
    expect(actor.style.animationPlayState).toBe('')

    second.pause()
    expect(actor.style.animationPlayState).toBe('paused')
    api.destroy(root)
    expect(api.get(root)).toBeNull()
    expect(actor.style.animationPlayState).toBe('')

    // Click reinit arms waiting and is not started.
    root.classList.add(MS_WAITING_CLASS)
    const click = api.init(root, {
      mode: 'click',
      waitingClass: MS_WAITING_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })
    expect(click.started).toBe(false)
    expect(click.paused).toBe(false)
    expect(root.classList.contains(MS_WAITING_CLASS)).toBe(true)
  })

  it('re-hovers after blur+leave in one turn still restart', () => {
    const api = installApi()
    const { root, childA } = mountScene({ waiting: true })
    const ctl = api.init(root, {
      mode: 'hover',
      waitingClass: MS_WAITING_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })

    root.dispatchEvent(new Event('mouseenter', { bubbles: true }))
    expect(ctl.started).toBe(true)
    expect(root.classList.contains(MS_WAITING_CLASS)).toBe(false)

    childA.focus()
    root.dispatchEvent(new Event('mouseleave', { bubbles: true }))
    childA.blur()
    // Same turn as blur — deferred focusout timer has not run yet.
    root.classList.add(MS_WAITING_CLASS)
    root.dispatchEvent(new Event('mouseenter', { bubbles: true }))
    expect(root.classList.contains(MS_WAITING_CLASS)).toBe(false)
    expect(ctl.started).toBe(true)
  })

  it('child-to-child focusout with relatedTarget does not re-arm hover', () => {
    const api = installApi()
    const { root, childA, childB, actor } = mountScene({ waiting: true })
    let starts = 0
    actor.addEventListener('animationstart', () => {
      starts += 1
    })
    // Force animationstart on restart by using a named animation.
    actor.style.animation = 'ms-test 1s linear forwards'

    api.init(root, {
      mode: 'hover',
      waitingClass: MS_WAITING_CLASS,
      actorSelector: '[class^="ms-actor"]',
    })

    root.dispatchEvent(new Event('mouseenter', { bubbles: true }))
    const afterHover = starts

    childA.focus()
    childA.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: childB }),
    )
    childB.focus()
    childB.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, relatedTarget: childA }),
    )

    // Allow any scheduled arm refresh to run.
    return Promise.resolve().then(() => {
      expect(starts).toBe(afterHover)
    })
  })

  it('two roots stay independent across init/destroy', () => {
    const api = installApi()
    document.body.innerHTML = `
      <div class="ms-scene" data-ms-scene="a"><div class="ms-actor" id="a"></div></div>
      <div class="ms-scene" data-ms-scene="b"><div class="ms-actor" id="b"></div></div>
    `
    const rootA = document.querySelector('[data-ms-scene="a"]') as HTMLElement
    const rootB = document.querySelector('[data-ms-scene="b"]') as HTMLElement
    const actorA = document.getElementById('a') as HTMLElement
    const actorB = document.getElementById('b') as HTMLElement
    actorA.style.animation = 'ms-a 2s linear infinite'
    actorB.style.animation = 'ms-b 2s linear infinite'

    const a = api.init(rootA, { mode: 'page-load', actorSelector: '[class^="ms-actor"]' })
    const b = api.init(rootB, { mode: 'page-load', actorSelector: '[class^="ms-actor"]' })
    a.pause()
    expect(actorA.style.animationPlayState).toBe('paused')
    expect(actorB.style.animationPlayState).toBe('')
    expect(b.paused).toBe(false)

    api.destroy(rootA)
    expect(actorA.style.animationPlayState).toBe('')
    expect(api.get(rootB)?.started).toBe(true)
  })
})
