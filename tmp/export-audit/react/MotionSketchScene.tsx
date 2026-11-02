/**
 * MotionSketch scene component — generated for a Vite + React app.
 * Offline: local CSS, optional images, and ms-trigger.js.
 * Do not hand-edit class names unless you also update animation.css.
 */
import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactElement,
} from 'react'
import './animation.css'
import './ms-trigger.js'

const ROOT_CLASS = "ms-scene-6d617ccb"
const STAGE_CLASS = "ms-stage"
const SCENE_ID_BASE = "6d617ccb"
const WAITING_CLASS = "ms-waiting"
const MOTION_OK_CLASS = "ms-motion-ok"
const NEEDS_WAITING = false
const OFFER_PAUSE = false
const SHOW_HOVER_TAP = false
const STAGE_ASPECT = 1.778

const TRIGGER_OPTIONS = {
  "mode": "page-load",
  "loop": false,
  "durationMs": 1200,
  "motionOkClass": "ms-motion-ok",
  "waitingClass": "ms-waiting",
  "viewportThreshold": 0.35,
  "actorSelector": "[class^=\"ms-actor\"]",
  "offerPause": false
} as const

type TriggerController = {
  play: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  destroy: () => void
}

type TriggerApi = {
  init: (root: HTMLElement, options: typeof TRIGGER_OPTIONS) => TriggerController
  get: (root: HTMLElement) => TriggerController | null
  destroy: (root: HTMLElement) => void
}

function getTriggerApi(): TriggerApi | null {
  const api = (window as unknown as Record<string, unknown>)[
    "MotionSketchTrigger"
  ]
  if (
    api &&
    typeof api === 'object' &&
    typeof (api as TriggerApi).init === 'function'
  ) {
    return api as TriggerApi
  }
  return null
}

export type MotionSketchSceneProps = {
  className?: string
  style?: CSSProperties
  /** When false, omit Play / Pause / Tap chrome (host can call the controller). */
  showControls?: boolean
}

/**
 * Renders the exported scene. Mount once per instance; Strict Mode safe
 * (init + destroy). Multiple instances share CSS; each gets a unique data-ms-scene.
 */
export function MotionSketchScene({
  className,
  style,
  showControls = true,
}: MotionSketchSceneProps): ReactElement {
  const reactId = useId().replace(/:/g, '')
  const instanceSceneId = `${SCENE_ID_BASE}-${reactId}`
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const api = getTriggerApi()
    if (!api) return
    const controller = api.init(root, { ...TRIGGER_OPTIONS })
    return () => {
      controller.destroy()
    }
  }, [instanceSceneId])

  const rootClassName = [
    ROOT_CLASS,
    NEEDS_WAITING ? WAITING_CLASS : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className="ms-react-shell"
      data-ms-demo-shell
      data-testid="ms-react-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '0.75rem',
        width: '100%',
        maxWidth: '100%',
        ...style,
      }}
    >
      <div
        ref={rootRef}
        className={rootClassName}
        data-ms-scene={instanceSceneId}
        data-ms-trigger={TRIGGER_OPTIONS.mode}
        data-testid="ms-react-scene"
        style={{ width: '100%' }}
      >
        <div
          className={STAGE_CLASS}
          data-testid="ms-react-stage"
          style={{ width: '100%', aspectRatio: String(STAGE_ASPECT) }}
        >
        <div className={"ms-actor"}
          data-testid="ms-react-actor" />
        </div>
      </div>
      {showControls ? (
        <div
          data-ms-chrome
          data-testid="ms-react-controls"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
          }}
        >
          <button type="button" data-ms-play data-ms-chrome data-testid="ms-react-play">
            Play animation
          </button>
          {OFFER_PAUSE ? (
            <button
              type="button"
              data-ms-pause
              data-ms-chrome
              data-testid="ms-react-pause"
              hidden
            >
              Pause
            </button>
          ) : null}
          {SHOW_HOVER_TAP ? (
            <button
              type="button"
              data-ms-hover-tap
              data-ms-chrome
              data-testid="ms-react-hover-tap"
            >
              Tap to play
            </button>
          ) : null}
        </div>
      ) : null}
      {/* Keep motion-ok / waiting class names discoverable for hosts. */}
      <span hidden data-ms-motion-ok-class={MOTION_OK_CLASS} />
    </div>
  )
}

export default MotionSketchScene
