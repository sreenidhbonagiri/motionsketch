import { zipSync, strToU8 } from 'fflate'
import { coerceActor } from '../actor'
import { actorTextHtmlInner } from '../actorText'
import {
  buildSnapshot,
  serializeSnapshot,
} from '../persist/document'
import { escapeHtmlText } from '../projectName'
import { projectHasAnyRecording } from '../sceneActor'
import { formatCssAspectRatio } from '../stageAspect'
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
  type TriggerControllerOptions,
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

/** Placement-labeled copy blocks for embedding (paths match the ZIP layout). */
export type WebPackageHostSections = {
  /** Stylesheet link + host sizing — paste inside `<head>`. */
  head: string
  /** Scene markup + Play/Replay control — paste inside `<body>`. */
  body: string
  /** Controller script + init — paste before `</body>`. */
  scripts: string
}

/** In-app / README host integration (no ZIP) — filenames match the package. */
export type WebPackageIntegrationGuide = {
  ok: true
  scope: ExportScope
  aspectCss: string
  assetHrefs: string[]
  requiredFiles: string[]
  markup: string
  /** head + body + scripts joined — same as the three labeled sections. */
  completeExample: string
  sections: WebPackageHostSections
  folderLayout: string
  playButtonHelp: string
  initOptions: TriggerControllerOptions
  initOptionsLiteral: string
}

export type WebPackageIntegrationResult =
  | WebPackageIntegrationGuide
  | WebPackageErr

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
      if (appearance.kind === 'text' && appearance.text) {
        return `    <div class="${cls}">${actorTextHtmlInner(appearance.text.content)}</div>`
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
  const initOptionsLiteral = formatInitOptionsLiteral(ctlOpts)
  const pauseNote = ctlOpts.offerPause
    ? 'Pause is offered in the preview (looping, or automatic trigger longer than 5s). Host sites can call pause()/resume() on the controller.'
    : 'Pause is omitted in the preview for this short non-looping scene; host sites can still call pause()/resume() if needed.'
  const aspectCss = formatCssAspectRatio(project.stageAspect)
  const sections = buildHostExampleSections({
    scope,
    markup,
    initOptionsLiteral,
    aspectCss,
  })
  const folderLayout = buildFolderLayoutText(assetHrefs)
  const playButtonHelp = buildPlayButtonHelp()

  const triggerSection = needsJs
    ? `Playback trigger: ${trigger}
-------------------
This scene waits with class "${MS_WAITING_CLASS}" until activated.
Include ${WEB_PACKAGE_TRIGGER_JS_NAME} and call MotionSketchTrigger.init (see
Embed sections below). Changing the trigger in MotionSketch updates the
generated markup and init options — copy or download again after you change it.

API: play(), pause(), resume(), restart(), destroy(), get(root).
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
CSS animations start on their own when prefers-reduced-motion is off.
Still include ${WEB_PACKAGE_TRIGGER_JS_NAME} and call MotionSketchTrigger.init
when you embed — required for Replay, reduced-motion Play (adds
"${MS_MOTION_OK_CLASS}"), and pause()/resume() on host pages.
Changing the trigger in MotionSketch updates the generated code — copy or
download again afterward.
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

What the export includes
------------------------
Actors, motion, and (when present) image files under assets/. It does not
include the editor path overlay, stage grid, selection chrome, or playback
dock — those stay in MotionSketch only.

Folder layout (keep relative paths)
-----------------------------------
${folderLayout}

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
4. ${playButtonHelp}
   When prefers-reduced-motion is on, animation stays off until you press Play
   (adds "${MS_MOTION_OK_CLASS}"). Automatic triggers never override that
   preference.

Embed in an existing website
----------------------------
Copy ${WEB_PACKAGE_CSS_NAME}, ${WEB_PACKAGE_TRIGGER_JS_NAME}, and assets/ (if
listed) next to your page — same layout as above. Paste the three sections
into your HTML (paths assume that arrangement).

Give .${scope.stageClass} an explicit size. Exported rules use container query
units (cqw / cqh / cqmin); without a width (and height or aspect-ratio) the
stage can collapse.

Automatic Play / Replay binding looks for [data-ms-play] under the scene
root's parent, or anywhere inside the nearest ancestor with
data-ms-demo-shell (same pattern as ${WEB_PACKAGE_HTML_NAME}). Put your Play
control inside that shell, or call the controller API yourself (below).

Stage aspect-ratio matches this project (${aspectCss}).

In <head>
---------
${sections.head}

Where you want the animation, inside <body>
-------------------------------------------
${sections.body}

Before </body>
--------------
${sections.scripts}

Reduced motion: under prefers-reduced-motion: reduce, animations stay off
until the scene root also has class "${MS_MOTION_OK_CLASS}" (set by the
bound Play control or by controller.play() / restart()).

Play button outside data-ms-demo-shell
-------------------------------------
Do not rely on [data-ms-play] outside the shell — it will not auto-bind.
Keep the controller returned by init (or call get later) and wire your own
control:

<script>
(function () {
  var api = window.MotionSketchTrigger;
  var root = document.querySelector('[data-ms-scene="${scope.sceneId}"]');
  var ctl = api.init(root, ${initOptionsLiteral});
  document.querySelector('#my-play').addEventListener('click', function () {
    ctl.play(); // reduced-motion opt-in + play / replay from the start
  });
  // Later, from another script: api.get(root).restart();
})();
</script>

Multiple scenes on one page
---------------------------
Each export uses a content fingerprint in class and keyframe names, so two
different packages can usually sit on the same page without colliding.

Call MotionSketchTrigger.init once per scene root. Keep data-ms-scene unique
per live instance.

Edit again in MotionSketch
--------------------------
Open ${WEB_PACKAGE_PROJECT_NAME} with MotionSketch (Project → Open project).
${WEB_PACKAGE_README_NAME} is instructions only; ${WEB_PACKAGE_PROJECT_NAME} is
for reopening — neither is required to run the embedded animation.

Generated by MotionSketch. Do not hand-edit selectors unless you also update
${WEB_PACKAGE_CSS_NAME} to match.
`
}

function formatInitOptionsLiteral(ctlOpts: TriggerControllerOptions): string {
  return `{
    mode: ${JSON.stringify(ctlOpts.mode)},
    loop: ${ctlOpts.loop ? 'true' : 'false'},
    durationMs: ${ctlOpts.durationMs},
    motionOkClass: ${JSON.stringify(ctlOpts.motionOkClass)},
    waitingClass: ${JSON.stringify(ctlOpts.waitingClass)},
    viewportThreshold: ${ctlOpts.viewportThreshold},
    actorSelector: ${JSON.stringify(ctlOpts.actorSelector)},
    offerPause: ${ctlOpts.offerPause ? 'true' : 'false'}
  }`
}

function buildFolderLayoutText(assetHrefs: string[]): string {
  const hasAssets = assetHrefs.length > 0
  return `  ${WEB_PACKAGE_HTML_NAME}       optional local preview (or use your own page)
  ${WEB_PACKAGE_CSS_NAME}
  ${WEB_PACKAGE_TRIGGER_JS_NAME}
${hasAssets ? '  assets/           image files used by the scene\n' : ''}  ${WEB_PACKAGE_README_NAME}       instructions only — not required to run
  ${WEB_PACKAGE_PROJECT_NAME}    reopen in MotionSketch — not required to run`
}

function buildPlayButtonHelp(): string {
  return (
    'The included [data-ms-play] button starts as “Play animation”. After the ' +
    'scene has played it becomes “Replay” (restarts from the beginning). With ' +
    'prefers-reduced-motion it stays “Play animation” until pressed (that ' +
    `opt-in adds "${MS_MOTION_OK_CLASS}" and starts motion). It does not pause; ` +
    'Pause / Resume appear only when the package offers them (looping scenes, ' +
    'or long automatic page-load / viewport scenes).'
  )
}

function buildHostExampleSections(args: {
  scope: ExportScope
  markup: string
  initOptionsLiteral: string
  aspectCss: string
}): WebPackageHostSections {
  const { scope, markup, initOptionsLiteral, aspectCss } = args
  const indentedMarkup = markup
    .split('\n')
    .map((line) => (line.length ? `    ${line}` : line))
    .join('\n')
  const head = `<link rel="stylesheet" href="${WEB_PACKAGE_CSS_NAME}">
<style>
  /* Host sizing — required. Aspect matches the MotionSketch project. */
  .ms-embed-frame {
    width: min(100%, 40rem);
  }
  .ms-embed-frame .${scope.stageClass} {
    width: 100%;
    aspect-ratio: ${aspectCss};
  }
</style>`
  const body = `<div data-ms-demo-shell class="ms-embed">
  <div class="ms-embed-frame">
${indentedMarkup}
  </div>
  <button type="button" data-ms-play>Play animation</button>
</div>`
  const scripts = `<script src="${WEB_PACKAGE_TRIGGER_JS_NAME}"></script>
<script>
(function () {
  var api = window.MotionSketchTrigger;
  if (!api || typeof api.init !== 'function') return;
  var root = document.querySelector('[data-ms-scene="${scope.sceneId}"]');
  if (!root) return;
  api.init(root, ${initOptionsLiteral});
})();
</script>`
  return { head, body, scripts }
}

function joinHostExampleSections(sections: WebPackageHostSections): string {
  return `${sections.head}

${sections.body}

${sections.scripts}`
}

/**
 * Integration guide for the Export panel and docs — same filenames / selectors
 * / aspect as the downloaded ZIP (no compression).
 */
export function describeWebPackageIntegration(
  project: Project,
  options: ExportCssOptions = {},
): WebPackageIntegrationResult {
  if (!projectHasAnyRecording(project)) {
    return {
      ok: false,
      error: 'Record motion before exporting for your website.',
    }
  }
  const collected = collectPackageAssets(project)
  if (!collected.ok) return collected
  const scope = resolveExportScope(project, options)
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const ctlOpts = buildTriggerControllerOptions({
    trigger,
    loop: project.playback.loop,
    durationMs: project.playback.durationMs,
  })
  const initOptionsLiteral = formatInitOptionsLiteral(ctlOpts)
  const markup = embedMarkupExample(project, scope, collected.hrefByDataUrl)
  const aspectCss = formatCssAspectRatio(project.stageAspect)
  const assetHrefs = collected.assets.map((a) => a.href)
  const requiredFiles = [
    WEB_PACKAGE_CSS_NAME,
    WEB_PACKAGE_TRIGGER_JS_NAME,
    ...assetHrefs,
  ]
  const sections = buildHostExampleSections({
    scope,
    markup,
    initOptionsLiteral,
    aspectCss,
  })
  return {
    ok: true,
    scope,
    aspectCss,
    assetHrefs,
    requiredFiles,
    markup,
    completeExample: joinHostExampleSections(sections),
    sections,
    folderLayout: buildFolderLayoutText(assetHrefs),
    playButtonHelp: buildPlayButtonHelp(),
    initOptions: ctlOpts,
    initOptionsLiteral,
  }
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
