import { zipSync, strToU8 } from 'fflate'
import { coerceActor } from '../actor'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../persist/document'
import { escapeHtmlText } from '../projectName'
import { projectHasAnyRecording } from '../sceneActor'
import type { Project } from '../types'
import { exportCssFromProject, resolveExportScope } from './css'
import { buildHtmlDemoFromProject, isSafeCssForEmbed } from './htmlDemo'
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
  WEB_PACKAGE_TRIGGER_JS_NAME,
} from './triggerController'
import {
  coercePlaybackTrigger,
  MS_WAITING_CLASS,
  triggerNeedsJavaScript,
  VIEWPORT_TRIGGER_THRESHOLD,
} from './triggers'

export const WEB_PACKAGE_CSS_NAME = 'animation.css'
export const WEB_PACKAGE_HTML_NAME = 'index.html'
export const WEB_PACKAGE_README_NAME = 'README.txt'
export const WEB_PACKAGE_PROJECT_NAME = 'project.json'
export { WEB_PACKAGE_TRIGGER_JS_NAME }

export type WebPackageFile = {
  path: string
  bytes: Uint8Array
}

export type WebPackageOk = {
  ok: true
  files: WebPackageFile[]
  zip: Uint8Array
  scope: ExportScope
  assetCount: number
}

export type WebPackageErr = { ok: false; error: string }
export type WebPackageResult = WebPackageOk | WebPackageErr

function embedMarkupExample(
  project: Project,
  scope: ExportScope,
  hrefByDataUrl: Map<string, string>,
): string {
  const actorCount = project.actors.length
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const waiting = triggerNeedsJavaScript(trigger) ? ` ${MS_WAITING_CLASS}` : ''
  const actors = project.actors
    .map((actor, index) => {
      const cls = scopedActorClass(index, actorCount)
      const appearance = coerceActor(actor.appearance)
      if (appearance.kind === 'image' && appearance.image) {
        const href =
          hrefByDataUrl.get(appearance.image.dataUrl) ?? 'assets/asset-01.png'
        const alt = escapeHtmlText(appearance.image.label || 'Actor image')
        return `    <img class="${cls}" src="${href}" alt="${alt}" />`
      }
      return `    <div class="${cls}"></div>`
    })
    .join('\n')
  return `<div class="${scope.rootClass}${waiting}" data-ms-scene="${scope.sceneId}">
  <div class="${scope.stageClass}">
${actors}
  </div>
</div>`
}

function buildPackageReadme(args: {
  project: Project
  scope: ExportScope
  files: string[]
  assetHrefs: string[]
  markup: string
}): string {
  const { project, scope, files, assetHrefs, markup } = args
  const title = project.name.trim() || 'Untitled project'
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const needsJs = triggerNeedsJavaScript(trigger)
  const fileList = files.map((f) => `  - ${f}`).join('\n')
  const assetLines =
    assetHrefs.length === 0
      ? '  (none — this scene uses shapes only)'
      : assetHrefs.map((h) => `  - ${h}`).join('\n')

  const ctlOpts = buildTriggerControllerOptions({
    trigger,
    loop: project.playback.loop,
    durationMs: project.playback.durationMs,
  })
  const pauseNote = ctlOpts.offerPause
    ? 'Pause is offered in the preview (looping, or automatic trigger longer than 5s). Host sites can call pause()/resume() on the controller.'
    : 'Pause is omitted in the preview for this short non-looping scene; host sites can still call pause()/resume() if needed.'

  const triggerSection = needsJs
    ? `Playback trigger: ${trigger}
-------------------
This scene waits with class "${MS_WAITING_CLASS}" until activated.
Include ${WEB_PACKAGE_TRIGGER_JS_NAME} and call:

  MotionSketchTrigger.init(root, {
    mode: "${trigger}",
    loop: ${ctlOpts.loop ? 'true' : 'false'},
    durationMs: ${ctlOpts.durationMs},
    motionOkClass: "${ctlOpts.motionOkClass}",
    waitingClass: "${ctlOpts.waitingClass}",
    viewportThreshold: ${ctlOpts.viewportThreshold},
    actorSelector: ${JSON.stringify(ctlOpts.actorSelector)},
    offerPause: ${ctlOpts.offerPause ? 'true' : 'false'}
  });

API: play(), pause(), resume(), restart(), destroy().
init() twice on the same root replaces the previous instance (no duplicate
listeners). destroy() removes listeners, observers, and the registry entry.
Loop/alternate settings still apply after the scene starts; a looping scene
keeps running until pause() or restart().
${pauseNote}
Viewport mode plays once when ~${Math.round(VIEWPORT_TRIGGER_THRESHOLD * 100)}% of the
root is visible; without IntersectionObserver it waits for Play.
`
    : `Playback trigger: page-load
-----------------------
CSS animations start on their own. ${WEB_PACKAGE_TRIGGER_JS_NAME} is still
included for Replay / reduced-motion Play / pause controls in the preview.
${pauseNote}
`

  return `MotionSketch web package
=======================

Project: ${title}
Scene root class: ${scope.rootClass}
Scene id: ${scope.sceneId}
Stage class: ${scope.stageClass}
Reduced-motion opt-in class: ${MS_MOTION_OK_CLASS}
Waiting class (armed triggers): ${MS_WAITING_CLASS}

This folder is self-contained. It does not need MotionSketch, a build step,
or network access.

Package contents
----------------
${fileList}

Image assets (deduplicated)
---------------------------
${assetLines}

${triggerSection}
Preview locally
---------------
1. Keep this folder together (do not move files out of place).
2. Open ${WEB_PACKAGE_HTML_NAME} in a browser (double-click or File → Open).
3. The preview links ${WEB_PACKAGE_CSS_NAME}, ${WEB_PACKAGE_TRIGGER_JS_NAME},
   and any files under assets/ with relative paths.
4. Use Play / Replay (and Pause / Resume when shown — looping scenes, or
   automatic page-load / viewport scenes longer than 5s). When
   prefers-reduced-motion is on, animation stays off until you press Play
   (adds "${MS_MOTION_OK_CLASS}"). Automatic triggers never override that
   preference.

Embed in an existing website
----------------------------
1. Copy ${WEB_PACKAGE_CSS_NAME}${needsJs ? `, ${WEB_PACKAGE_TRIGGER_JS_NAME},` : ''} and the assets/
   folder (if present) next to your page, or adjust href paths.
2. Add the stylesheet:

   <link rel="stylesheet" href="${WEB_PACKAGE_CSS_NAME}">
${
  needsJs
    ? `
3. Add the controller:

   <script src="${WEB_PACKAGE_TRIGGER_JS_NAME}"></script>
`
    : ''
}
${needsJs ? '4' : '3'}. Paste this markup (selectors match ${WEB_PACKAGE_CSS_NAME}):

${markup}

${needsJs ? '5' : '4'}. Size the stage with CSS as needed. The exported rules use container query
   units (cqw / cqh / cqmin) on .${scope.stageClass}.

${needsJs ? '6' : '5'}. Image <img> tags already point at the packaged files listed above.

${needsJs ? '7' : '6'}. Reduced motion: under prefers-reduced-motion: reduce, animations stay off
   until the scene root also has class "${MS_MOTION_OK_CLASS}".

Multiple scenes on one page
---------------------------
Each export uses a content fingerprint in class and keyframe names, so two
different packages can usually sit on the same page without colliding.

Call MotionSketchTrigger.init once per scene root. Keep data-ms-scene unique
per live instance.

Edit again in MotionSketch
--------------------------
Open ${WEB_PACKAGE_PROJECT_NAME} with MotionSketch (Project → Open project).

Generated by MotionSketch. Do not hand-edit selectors unless you also update
${WEB_PACKAGE_CSS_NAME} to match.
`
}

/**
 * Build a portable ZIP: preview HTML, scoped CSS, assets, README, project.json.
 */
export function buildWebPackage(
  project: Project,
  options: ExportCssOptions = {},
): WebPackageResult {
  if (!projectHasAnyRecording(project)) {
    return {
      ok: false,
      error: 'Record motion before downloading a web package.',
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

  let html: string
  try {
    html = buildHtmlDemoFromProject(project, {
      ...options,
      stylesheetHref: WEB_PACKAGE_CSS_NAME,
      triggerScriptHref: WEB_PACKAGE_TRIGGER_JS_NAME,
      resolveImageSrc: (image) => {
        const href = collected.hrefByDataUrl.get(image.dataUrl)
        if (!href) {
          throw new Error('Missing packaged asset for an image actor.')
        }
        return href
      },
    })
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not build the package preview HTML.',
    }
  }

  let projectJson: string
  try {
    const snapshot = buildSnapshot(project)
    projectJson = serializeSnapshot(snapshot)
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not serialize project.json for the package.',
    }
  }

  const triggerJs = buildTriggerControllerSource()
  const markup = embedMarkupExample(project, scope, collected.hrefByDataUrl)
  const assetHrefs = collected.assets.map((a) => a.href)
  const filePaths = [
    WEB_PACKAGE_HTML_NAME,
    WEB_PACKAGE_CSS_NAME,
    WEB_PACKAGE_TRIGGER_JS_NAME,
    ...assetHrefs,
    WEB_PACKAGE_README_NAME,
    WEB_PACKAGE_PROJECT_NAME,
  ]
  const readme = buildPackageReadme({
    project,
    scope,
    files: filePaths,
    assetHrefs,
    markup,
  })

  const files: WebPackageFile[] = [
    { path: WEB_PACKAGE_HTML_NAME, bytes: strToU8(html) },
    { path: WEB_PACKAGE_CSS_NAME, bytes: strToU8(css) },
    { path: WEB_PACKAGE_TRIGGER_JS_NAME, bytes: strToU8(triggerJs) },
    { path: WEB_PACKAGE_README_NAME, bytes: strToU8(readme) },
    { path: WEB_PACKAGE_PROJECT_NAME, bytes: strToU8(projectJson) },
    ...collected.assets.map((a) => ({ path: a.path, bytes: a.bytes })),
  ]

  // fflate zip tree: nested folders via path keys.
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
          : 'Could not compress the web package.',
    }
  }
}
