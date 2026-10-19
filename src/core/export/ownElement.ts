/**
 * “Animate your own element” — motion wrapper export for one selected actor.
 * Path/timing only; developer supplies the child markup/component.
 */

import { findActor } from '../sceneActor'
import type { Project } from '../types'
import {
  buildMotionWrapperCssExport,
  type FacingExportFidelityNotice,
} from './css'
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
  type PlaybackTrigger,
} from './triggers'
import {
  MS_MOTION_OK_CLASS,
  resolveExportScope,
  scopedActorClass,
  type ExportCssOptions,
  type ExportScope,
} from './sceneScope'

export type OwnElementExportResult =
  | {
      ok: true
      actorId: string
      actorName: string
      scope: ExportScope
      wrapperClass: string
      css: string
      htmlExample: string
      reactExample: string
      requiresTriggerJs: boolean
      /** Full ms-trigger.js source when {@link requiresTriggerJs} is true. */
      triggerJs: string | null
      /** Short note shown in the Export panel. */
      triggerRequirement: string
      limitations: string[]
      facingFidelityWarnings: FacingExportFidelityNotice[]
    }
  | { ok: false; error: string }

function sliceProjectForActor(project: Project, actorId: string): Project | null {
  const actor = findActor(project.actors, actorId)
  if (!actor) return null
  return {
    ...project,
    actors: [actor],
  }
}

function buildLimitations(args: {
  requiresTriggerJs: boolean
  hasFaceAlong: boolean
  hasClip: boolean
}): string[] {
  const lines = [
    'Only the selected actor’s path and timing are included (not other actors).',
    'The stage keeps this project’s aspect ratio; give .ms-stage a width in your layout.',
    'Motion (translate / rotate / scale / visibility) is on the outer .ms-actor wrapper — nest your element inside so its CSS and transforms stay local.',
    'Editor fill, corner radius, image, text, font, and actor size are omitted on purpose.',
    'Path coordinates stay stage-normalized (cqw/cqh); resize the stage to scale motion.',
    'Examples include an accessible Play control so reduced-motion users can explicitly start motion.',
  ]
  if (args.requiresTriggerJs) {
    lines.push(
      `Playback trigger needs ${WEB_PACKAGE_TRIGGER_JS_NAME} + ${TRIGGER_CONTROLLER_GLOBAL}.init — CSS alone will stay paused at 0%.`,
    )
  } else {
    lines.push(
      `Page-load still autoplays when reduced motion is off; Play opts in under prefers-reduced-motion (adds .${MS_MOTION_OK_CLASS}).`,
    )
  }
  if (args.hasFaceAlong) {
    lines.push(
      'Face along path rotates the wrapper (and therefore your child).',
    )
  }
  if (args.hasClip) {
    lines.push(
      'Clip hide-before / hide-after toggles visibility on the wrapper (not opacity fades).',
    )
  }
  return lines
}

/** Accessible Play control — sibling of the scene root (controller finds [data-ms-play]). */
function playButtonHtml(): string {
  return `<button type="button" data-ms-play aria-label="Play animation">Play animation</button>`
}

function sceneShellHtml(args: {
  scope: ExportScope
  wrapperClass: string
  rootClass: string
  triggerAttr: string
}): string {
  const { scope, wrapperClass, rootClass, triggerAttr } = args
  return `<div class="ms-own-shell" data-ms-demo-shell>
  <div class="${rootClass}" data-ms-scene="${scope.sceneId}"${triggerAttr}>
    <div class="${scope.stageClass}">
      <div class="${wrapperClass}">
        <!-- Your element — keep styles/transforms on this child, not on .${wrapperClass}. -->
        <button type="button" class="my-button">Your button</button>
      </div>
    </div>
  </div>
  <p class="ms-own-controls">
    ${playButtonHtml()}
  </p>
</div>`
}

function pageLoadPlayScript(sceneId: string): string {
  return `<script>
(function () {
  var root = document.querySelector('[data-ms-scene="${sceneId}"]');
  if (!root) return;
  var shell = root.closest('[data-ms-demo-shell]');
  var play = shell ? shell.querySelector('[data-ms-play]') : null;
  if (!play) return;
  function startMotion() {
    root.classList.add('${MS_MOTION_OK_CLASS}');
    root.querySelectorAll('[class^="ms-actor"]').forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.removeProperty('animation');
    });
    play.textContent = 'Replay';
  }
  play.addEventListener('click', startMotion);
})();
</script>`
}

function buildHtmlExample(args: {
  scope: ExportScope
  wrapperClass: string
  requiresTriggerJs: boolean
  trigger: PlaybackTrigger
  triggerOptionsJson: string
}): string {
  const { scope, wrapperClass, requiresTriggerJs, trigger, triggerOptionsJson } =
    args
  const rootClass = requiresTriggerJs
    ? `${scope.rootClass} ${MS_WAITING_CLASS}`
    : scope.rootClass
  const triggerAttr = requiresTriggerJs
    ? ` data-ms-trigger="${trigger}"`
    : ''
  const shell = sceneShellHtml({
    scope,
    wrapperClass,
    rootClass,
    triggerAttr,
  })

  if (!requiresTriggerJs) {
    return `<!-- Page-load: CSS autoplays when reduced motion is off.
     Play animation explicitly starts motion under prefers-reduced-motion. -->
${shell}
${pageLoadPlayScript(scope.sceneId)}
`
  }

  return `<!-- REQUIRED: Copy “Copy trigger script” from Export and save the file as
     ${WEB_PACKAGE_TRIGGER_JS_NAME} in the same folder as this HTML
     (next to motion-wrapper.css). The <script src> below loads that file. -->
<script src="${WEB_PACKAGE_TRIGGER_JS_NAME}"></script>
${shell}
<script>
  ${TRIGGER_CONTROLLER_GLOBAL}.init(
    document.querySelector('[data-ms-scene="${scope.sceneId}"]'),
    ${triggerOptionsJson}
  );
</script>
`
}

function buildReactExample(args: {
  scope: ExportScope
  wrapperClass: string
  requiresTriggerJs: boolean
  trigger: PlaybackTrigger
  triggerOptionsJson: string
}): string {
  const { scope, wrapperClass, requiresTriggerJs, trigger, triggerOptionsJson } =
    args

  if (!requiresTriggerJs) {
    return `import { useRef, useState } from 'react'
import './motion-wrapper.css' // paste the copied wrapper CSS into this file

const MOTION_OK = '${MS_MOTION_OK_CLASS}'

export function AnimatedOwnElement() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [playLabel, setPlayLabel] = useState('Play animation')

  function playMotion() {
    const root = rootRef.current
    if (!root) return
    root.classList.add(MOTION_OK)
    root.querySelectorAll('[class^="ms-actor"]').forEach((el) => {
      const node = el as HTMLElement
      node.style.animation = 'none'
      void node.offsetWidth
      node.style.removeProperty('animation')
    })
    setPlayLabel('Replay')
  }

  return (
    <div className="ms-own-shell" data-ms-demo-shell>
      {/* Page-load autoplays when reduced motion is off; Play opts in when it is on. */}
      <div
        ref={rootRef}
        className="${scope.rootClass}"
        data-ms-scene="${scope.sceneId}"
      >
        <div className="${scope.stageClass}">
          <div className="${wrapperClass}">
            {/* Your component — styles/transforms stay on the child. */}
            <button type="button" className="my-button">
              Your button
            </button>
          </div>
        </div>
      </div>
      <p className="ms-own-controls">
        <button
          type="button"
          data-ms-play
          aria-label="Play animation"
          onClick={playMotion}
        >
          {playLabel}
        </button>
      </p>
    </div>
  )
}
`
  }

  return `import { useEffect, useRef } from 'react'
import './motion-wrapper.css' // paste the copied wrapper CSS into this file
/*
 * REQUIRED: Copy “Copy trigger script” from Export and save it as
 * ${WEB_PACKAGE_TRIGGER_JS_NAME} next to this component file (same folder as
 * motion-wrapper.css), then keep the import below.
 */
import './${WEB_PACKAGE_TRIGGER_JS_NAME}'

const TRIGGER_OPTIONS = ${triggerOptionsJson} as const

export function AnimatedOwnElement() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const api = (window as unknown as Record<string, unknown>)[
      '${TRIGGER_CONTROLLER_GLOBAL}'
    ] as
      | {
          init: (
            el: HTMLElement,
            opts: typeof TRIGGER_OPTIONS,
          ) => { destroy: () => void }
        }
      | undefined
    if (!root || !api?.init) {
      console.error(
        'MotionSketchTrigger missing — save Copy trigger script as ./${WEB_PACKAGE_TRIGGER_JS_NAME} beside this file.',
      )
      return
    }
    const controller = api.init(root, { ...TRIGGER_OPTIONS })
    return () => controller.destroy()
  }, [])

  return (
    <div className="ms-own-shell" data-ms-demo-shell>
      {/* Trigger: ${trigger}. Play opts into reduced motion; scene click/hover/viewport still apply. */}
      <div
        ref={rootRef}
        className="${scope.rootClass} ${MS_WAITING_CLASS}"
        data-ms-scene="${scope.sceneId}"
        data-ms-trigger="${trigger}"
      >
        <div className="${scope.stageClass}">
          <div className="${wrapperClass}">
            {/* Your component — styles/transforms stay on the child. */}
            <button type="button" className="my-button">
              Your button
            </button>
          </div>
        </div>
      </div>
      <p className="ms-own-controls">
        <button type="button" data-ms-play aria-label="Play animation">
          Play animation
        </button>
      </p>
    </div>
  )
}
`
}

/**
 * Build motion-wrapper CSS + copyable HTML/React usage for one actor.
 */
export function buildOwnElementExport(
  project: Project,
  actorId: string,
  options: ExportCssOptions = {},
): OwnElementExportResult {
  const actor = findActor(project.actors, actorId)
  if (!actor) {
    return { ok: false, error: 'Select an actor to animate your own element.' }
  }

  const sliced = sliceProjectForActor(project, actorId)
  if (!sliced) {
    return { ok: false, error: 'Select an actor to animate your own element.' }
  }

  const { css, facingFidelityWarnings } = buildMotionWrapperCssExport(
    sliced,
    options,
  )
  if (
    css.startsWith('/* No motion path') ||
    css.startsWith('/* Motion wrapper export expects')
  ) {
    return {
      ok: false,
      error: 'Record motion for the selected actor before exporting a wrapper.',
    }
  }

  const scope = resolveExportScope(sliced, options)
  const wrapperClass = scopedActorClass(0, 1)
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const requiresTriggerJs = triggerNeedsJavaScript(trigger)
  const ctlOpts = buildTriggerControllerOptions({
    trigger,
    loop: project.playback.loop,
    durationMs: project.playback.durationMs,
  })
  const triggerOptionsJson = JSON.stringify(ctlOpts, null, 2)

  const clip = actor.clip
  const hasClip = Boolean(
    clip &&
      (clip.start > 1e-9 ||
        clip.end < 1 - 1e-9 ||
        clip.hideBeforeStart ||
        clip.hideAfterEnd),
  )

  const triggerRequirement = requiresTriggerJs
    ? `This project’s trigger (${trigger}) requires ${WEB_PACKAGE_TRIGGER_JS_NAME}. Use Copy trigger script, save the file as ${WEB_PACKAGE_TRIGGER_JS_NAME} in the same folder as the HTML/React example (beside motion-wrapper.css), then keep the example’s script src / import. The copied examples include Play for reduced motion; click/hover/viewport still follow this trigger.`
    : `Page-load: CSS autoplays when reduced motion is off. The copied examples include an accessible Play button that explicitly starts motion under prefers-reduced-motion (no ${WEB_PACKAGE_TRIGGER_JS_NAME} required).`

  return {
    ok: true,
    actorId: actor.id,
    actorName: actor.name,
    scope,
    wrapperClass,
    css,
    htmlExample: buildHtmlExample({
      scope,
      wrapperClass,
      requiresTriggerJs,
      trigger,
      triggerOptionsJson,
    }),
    reactExample: buildReactExample({
      scope,
      wrapperClass,
      requiresTriggerJs,
      trigger,
      triggerOptionsJson,
    }),
    requiresTriggerJs,
    triggerJs: requiresTriggerJs ? buildTriggerControllerSource() : null,
    triggerRequirement,
    limitations: buildLimitations({
      requiresTriggerJs,
      hasFaceAlong: actor.faceAlongPath === true,
      hasClip,
    }),
    facingFidelityWarnings,
  }
}
