import { zipSync, strToU8 } from 'fflate'
import { coerceActor } from '../actor'
import { clampStageAspect } from '../stageAspect'
import { projectHasAnyRecording } from '../sceneActor'
import type { Project } from '../types'
import { exportCssFromProject, resolveExportScope } from './css'
import { isSafeCssForEmbed } from './htmlDemo'
import { collectPackageAssets } from './packageAssets'
import {
  MS_MOTION_OK_CLASS,
  scopedActorClass,
  type ExportCssOptions,
  type ExportScope,
} from './sceneScope'
import {
  buildTriggerControllerOptions,
  buildTriggerControllerSource,
  TRIGGER_CONTROLLER_GLOBAL,
  WEB_PACKAGE_TRIGGER_JS_NAME,
} from './triggerController'
import {
  coercePlaybackTrigger,
  MS_WAITING_CLASS,
  triggerNeedsJavaScript,
} from './triggers'
import {
  WEB_PACKAGE_CSS_NAME,
  type WebPackageFile,
} from './webPackage'

export const REACT_PACKAGE_COMPONENT_NAME = 'MotionSketchScene.tsx'
export const REACT_PACKAGE_CSS_NAME = WEB_PACKAGE_CSS_NAME
export const REACT_PACKAGE_TRIGGER_JS_NAME = WEB_PACKAGE_TRIGGER_JS_NAME
export const REACT_PACKAGE_README_NAME = 'README.md'
export const REACT_PACKAGE_VITE_ENV_NAME = 'vite-env.d.ts'

export type ReactPackageFile = WebPackageFile

export type ReactPackageOk = {
  ok: true
  files: ReactPackageFile[]
  zip: Uint8Array
  scope: ExportScope
  assetCount: number
}

export type ReactPackageErr = { ok: false; error: string }
export type ReactPackageResult = ReactPackageOk | ReactPackageErr

function assetImportName(index: number): string {
  return `asset${String(index).padStart(2, '0')}`
}

function buildActorElementsJsx(
  project: Project,
  hrefByDataUrl: Map<string, string>,
  importNameByHref: Map<string, string>,
): string {
  const actorCount = project.actors.length
  return project.actors
    .map((actor, index) => {
      const cls = scopedActorClass(index, actorCount)
      const appearance = coerceActor(actor.appearance)
      const testId =
        index === 0 ? '\n          data-testid="ms-react-actor"' : ''
      if (appearance.kind === 'image' && appearance.image) {
        const href =
          hrefByDataUrl.get(appearance.image.dataUrl) ?? 'assets/asset-01.png'
        const varName = importNameByHref.get(href) ?? 'asset01'
        const alt = appearance.image.label || 'Actor image'
        return `        <img
          className=${JSON.stringify(cls)}
          src={${varName}}
          alt={${JSON.stringify(alt)}}
          draggable={false}${testId}
        />`
      }
      if (appearance.kind === 'text' && appearance.text) {
        // React text child — JSON string becomes a JS expression, never HTML.
        return `        <div
          className={${JSON.stringify(cls)}}${testId}
        >
          {${JSON.stringify(appearance.text.content)}}
        </div>`
      }
      return `        <div className={${JSON.stringify(cls)}}${testId} />`
    })
    .join('\n')
}

function buildMotionSketchSceneSource(args: {
  project: Project
  scope: ExportScope
  hrefByDataUrl: Map<string, string>
  assetHrefs: string[]
}): string {
  const { project, scope, hrefByDataUrl, assetHrefs } = args
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const needsJs = triggerNeedsJavaScript(trigger)
  const ctlOpts = buildTriggerControllerOptions({
    trigger,
    loop: project.playback.loop,
    durationMs: project.playback.durationMs,
  })
  const stageAspect = clampStageAspect(project.stageAspect)
  const offerPause = ctlOpts.offerPause
  const showHoverTap = trigger === 'hover'

  const importNameByHref = new Map<string, string>()
  const assetImports = assetHrefs
    .map((href, i) => {
      const name = assetImportName(i + 1)
      importNameByHref.set(href, name)
      return `import ${name} from ${JSON.stringify('./' + href)}`
    })
    .join('\n')

  const actorsJsx = buildActorElementsJsx(
    project,
    hrefByDataUrl,
    importNameByHref,
  )

  return `/**
 * MotionSketch scene component — generated for a Vite + React app.
 * Offline: local CSS, optional images, and ${REACT_PACKAGE_TRIGGER_JS_NAME}.
 * Do not hand-edit class names unless you also update ${REACT_PACKAGE_CSS_NAME}.
 */
import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactElement,
} from 'react'
import './${REACT_PACKAGE_CSS_NAME}'
import './${REACT_PACKAGE_TRIGGER_JS_NAME}'
${assetImports ? assetImports + '\n' : ''}
const ROOT_CLASS = ${JSON.stringify(scope.rootClass)}
const STAGE_CLASS = ${JSON.stringify(scope.stageClass)}
const SCENE_ID_BASE = ${JSON.stringify(scope.sceneId)}
const WAITING_CLASS = ${JSON.stringify(MS_WAITING_CLASS)}
const MOTION_OK_CLASS = ${JSON.stringify(MS_MOTION_OK_CLASS)}
const NEEDS_WAITING = ${needsJs ? 'true' : 'false'}
const OFFER_PAUSE = ${offerPause ? 'true' : 'false'}
const SHOW_HOVER_TAP = ${showHoverTap ? 'true' : 'false'}
const STAGE_ASPECT = ${stageAspect}

const TRIGGER_OPTIONS = ${JSON.stringify(ctlOpts, null, 2)} as const

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
    ${JSON.stringify(TRIGGER_CONTROLLER_GLOBAL)}
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
  const instanceSceneId = \`\${SCENE_ID_BASE}-\${reactId}\`
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
${actorsJsx}
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
`
}

function buildReactPackageReadme(args: {
  project: Project
  scope: ExportScope
  files: string[]
  assetHrefs: string[]
}): string {
  const { project, scope, files, assetHrefs } = args
  const title = project.name.trim() || 'Untitled project'
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const needsJs = triggerNeedsJavaScript(trigger)
  const fileList = files.map((f) => `- \`${f}\``).join('\n')
  const assetLines =
    assetHrefs.length === 0
      ? '- (none — shapes / text only)'
      : assetHrefs.map((h) => `- \`${h}\``).join('\n')

  return `# MotionSketch React package

Project: **${title}**  
Scene root class: \`${scope.rootClass}\`  
Scene id base: \`${scope.sceneId}\`  
Stage class: \`${scope.stageClass}\`  
Playback trigger: \`${trigger}\`

Self-contained folder for a **Vite + React** app. Same scoped CSS and trigger
controller as the HTML / web package exports — animation timing and poses match.

## Contents

${fileList}

### Image assets

${assetLines}

## Install in a Vite React app

1. Copy this entire folder into your project (e.g. \`src/motionsketch/\`).
2. Ensure \`react\` and \`react-dom\` are installed (Vite React template is enough).
3. Import and render:

\`\`\`tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionSketchScene } from './motionsketch/MotionSketchScene'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionSketchScene />
  </StrictMode>,
)
\`\`\`

Or mount more than once (each instance gets a unique \`data-ms-scene\`):

\`\`\`tsx
<>
  <MotionSketchScene />
  <MotionSketchScene />
</>
\`\`\`

## How it works

- \`animation.css\` — identical scoped stylesheet to Download CSS / web package.
- \`${REACT_PACKAGE_COMPONENT_NAME}\` — React tree with actor classes; **text is a
  React text child** (not \`dangerouslySetInnerHTML\`).
- Images use Vite \`import\` URLs under \`assets/\` (offline, no CDN).
- \`${REACT_PACKAGE_TRIGGER_JS_NAME}\` — same controller as the web package
  (\`${TRIGGER_CONTROLLER_GLOBAL}\`). The component calls \`init\` on mount and
  \`destroy\` on unmount (Strict Mode safe).
${
  needsJs
    ? `- This scene starts with \`.${MS_WAITING_CLASS}\` until click / hover / viewport / Play.`
    : `- Page-load scenes start without \`.${MS_WAITING_CLASS}\`; Play still opts into motion under \`prefers-reduced-motion\`.`
}

Reduced motion: under \`prefers-reduced-motion: reduce\`, CSS keeps animations off
until the scene root also has \`.${MS_MOTION_OK_CLASS}\` (Play / explicit activate).

## Props

| Prop | Default | Description |
|------|---------|-------------|
| \`showControls\` | \`true\` | Play / Replay (+ Pause / Tap when applicable) |
| \`className\` | — | Extra class on the scene root |
| \`style\` | — | Style on the outer shell |

## Differences from the web package

- No standalone \`index.html\` preview or \`project.json\`.
- Host app supplies React; this folder is a component, not a double-click demo.
- Text appears as a JS string expression in TSX (React escapes at runtime), not
  pre-escaped HTML entities in a static file.

Generated by MotionSketch.
`
}

/**
 * Build a ZIP for Vite React: component, scoped CSS, assets, trigger JS, README.
 */
export function buildReactPackage(
  project: Project,
  options: ExportCssOptions = {},
): ReactPackageResult {
  if (!projectHasAnyRecording(project)) {
    return {
      ok: false,
      error: 'Record motion before downloading a React package.',
    }
  }

  const collected = collectPackageAssets(project)
  if (!collected.ok) return collected

  let css: string
  try {
    css = exportCssFromProject(project, options)
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not generate animation CSS for the package.',
    }
  }
  if (!isSafeCssForEmbed(css)) {
    return {
      ok: false,
      error: 'Exported CSS failed safety checks and was not packaged.',
    }
  }

  const scope = resolveExportScope(project, options)
  const assetHrefs = collected.assets.map((a) => a.href)
  const triggerJs = buildTriggerControllerSource()
  const component = buildMotionSketchSceneSource({
    project,
    scope,
    hrefByDataUrl: collected.hrefByDataUrl,
    assetHrefs,
  })

  const viteEnv = `/// <reference types="vite/client" />
`

  const filePaths = [
    REACT_PACKAGE_COMPONENT_NAME,
    REACT_PACKAGE_CSS_NAME,
    REACT_PACKAGE_TRIGGER_JS_NAME,
    REACT_PACKAGE_VITE_ENV_NAME,
    ...assetHrefs,
    REACT_PACKAGE_README_NAME,
  ]

  const readme = buildReactPackageReadme({
    project,
    scope,
    files: filePaths,
    assetHrefs,
  })

  const files: ReactPackageFile[] = [
    { path: REACT_PACKAGE_COMPONENT_NAME, bytes: strToU8(component) },
    { path: REACT_PACKAGE_CSS_NAME, bytes: strToU8(css) },
    { path: REACT_PACKAGE_TRIGGER_JS_NAME, bytes: strToU8(triggerJs) },
    { path: REACT_PACKAGE_VITE_ENV_NAME, bytes: strToU8(viteEnv) },
    { path: REACT_PACKAGE_README_NAME, bytes: strToU8(readme) },
    ...collected.assets.map((a) => ({ path: a.path, bytes: a.bytes })),
  ]

  const zipInput: Record<string, Uint8Array> = {}
  for (const file of files) {
    if (
      file.path.includes('..') ||
      file.path.startsWith('/') ||
      file.path.includes('\\')
    ) {
      return { ok: false, error: 'Internal error: unsafe package path.' }
    }
    zipInput[file.path] = file.bytes
  }

  try {
    const zip = zipSync(zipInput, { level: 6 })
    return {
      ok: true,
      files,
      zip,
      scope,
      assetCount: collected.assets.length,
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not compress the React package.',
    }
  }
}
