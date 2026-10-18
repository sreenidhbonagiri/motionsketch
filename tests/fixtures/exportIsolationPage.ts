import {
  buildExportSceneMarkup,
  exportCssFromProject,
  type ExportCssOptions,
} from '../../src/core/export/css'
import type { Project } from '../../src/core/types'

/**
 * Host page with ordinary `.stage` / `.actor` rules and conflicting
 * `@keyframes motionsketch*` names, plus two MotionSketch scene mounts.
 */
export function buildExportIsolationPage(options: {
  projectA: Project
  projectB: Project
  /** Second copy of projectA with a distinct instance prefix. */
  projectACopy?: Project
  optionsA?: ExportCssOptions
  optionsB?: ExportCssOptions
  optionsACopy?: ExportCssOptions
}): string {
  const cssA = exportCssFromProject(options.projectA, options.optionsA)
  const cssB = exportCssFromProject(options.projectB, options.optionsB)
  const markupA = buildExportSceneMarkup(options.projectA, options.optionsA)
  const markupB = buildExportSceneMarkup(options.projectB, options.optionsB)

  let cssACopy = ''
  let markupACopyHtml = ''
  if (options.projectACopy) {
    const copyOpts = options.optionsACopy ?? { instancePrefix: 'copy-' }
    cssACopy = exportCssFromProject(options.projectACopy, copyOpts)
    markupACopyHtml = buildExportSceneMarkup(
      options.projectACopy,
      copyOpts,
    ).html
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Export isolation fixture</title>
<style>
/* Host page styles that must not steal MotionSketch geometry. */
body { margin: 0; font-family: Georgia, serif; background: #fff7ed; color: #431407; }
.stage {
  width: 200px;
  height: 120px;
  background: #fdba74;
  position: relative;
  margin: 1rem;
}
.actor {
  position: absolute;
  left: 20px;
  top: 20px;
  width: 40px;
  height: 40px;
  background: #9a3412;
  border-radius: 4px;
}
@keyframes motionsketch {
  from { transform: translate(0, 0); }
  to { transform: translate(100px, 40px); }
}
@keyframes motionsketch-actor-1 {
  from { opacity: 1; }
  to { opacity: 0.2; }
}
.actor { animation: motionsketch 800ms linear infinite; }
</style>
<style data-ms="scene-a">
${cssA}
</style>
<style data-ms="scene-b">
${cssB}
</style>
${
  cssACopy
    ? `<style data-ms="scene-a-copy">
${cssACopy}
</style>`
    : ''
}
</head>
<body>
  <header data-testid="host-header">
    <h1>Host page</h1>
    <div class="stage" data-testid="host-stage">
      <div class="actor" data-testid="host-actor"></div>
    </div>
  </header>

  <section data-testid="mount-a" style="width: min(100%, 480px); margin: 1rem;">
    ${markupA.html}
  </section>

  <section data-testid="mount-b" style="width: min(100%, 320px); margin: 1rem;">
    ${markupB.html}
  </section>

  ${
    markupACopyHtml
      ? `<section data-testid="mount-a-copy" style="width: min(100%, 480px); margin: 1rem;">
    ${markupACopyHtml}
  </section>`
      : ''
  }

  <script>
  window.__msIsolation = {
    rootA: ${JSON.stringify(markupA.scope.rootClass)},
    rootB: ${JSON.stringify(markupB.scope.rootClass)},
    sceneIdA: ${JSON.stringify(markupA.scope.sceneId)},
    sceneIdB: ${JSON.stringify(markupB.scope.sceneId)},
  };
  </script>
</body>
</html>
`
}
