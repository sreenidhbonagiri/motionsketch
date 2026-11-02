import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import { createServer } from 'vite'

const host = '/Users/sreenidhbonagiri/Desktop/ms-embed-readme-verify'
rmSync(host, { recursive: true, force: true })
mkdirSync(host, { recursive: true })

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
})
const { buildWebPackage } = await server.ssrLoadModule('/src/core/export/webPackage.ts')
const { buildPaperPlaneProject } = await server.ssrLoadModule('/src/examples/buildScenes.ts')

const packed = buildWebPackage(buildPaperPlaneProject())
if (!packed.ok) throw new Error(packed.error)
const files = unzipSync(packed.zip)
for (const [path, bytes] of Object.entries(files)) {
  const dest = join(host, path)
  mkdirSync(join(dest, '..'), { recursive: true })
  writeFileSync(dest, bytes)
}
const readme = strFromU8(files['README.txt'])
const scopeRoot = packed.scope.rootClass
const sceneId = packed.scope.sceneId
const stage = packed.scope.stageClass

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Embed README verify</title>
<link rel="stylesheet" href="animation.css">
<style>
  body { margin: 0; font-family: system-ui, sans-serif; padding: 1.5rem; background: #eef2f6; }
  .ms-embed-frame { width: min(100%, 40rem); }
  .ms-embed-frame .${stage} { width: 100%; aspect-ratio: 16 / 10; background: #fff; border-radius: 1rem; }
  .outside { margin-top: 1rem; }
</style>
</head>
<body>
<div data-ms-demo-shell class="ms-embed">
  <div class="ms-embed-frame">
    <div class="${scopeRoot}" data-ms-scene="${sceneId}">
      <div class="${stage}">
        <img class="ms-actor-1" src="assets/asset-01.png" alt="Paper plane" />
        <div class="ms-actor-2">Ship the motion.</div>
      </div>
    </div>
  </div>
  <button type="button" data-ms-play>Play animation</button>
</div>
<div class="outside">
  <button type="button" id="my-play">Outside play (API)</button>
</div>
<script src="ms-trigger.js"></script>
<script>
(function () {
  var api = window.MotionSketchTrigger;
  if (!api || typeof api.init !== 'function') return;
  var root = document.querySelector('[data-ms-scene="${sceneId}"]');
  if (!root) return;
  var ctl = api.init(root, {
    mode: "page-load",
    loop: false,
    durationMs: 2400,
    motionOkClass: "ms-motion-ok",
    waitingClass: "ms-waiting",
    viewportThreshold: 0.35,
    actorSelector: '[class^="ms-actor"]',
    offerPause: false
  });
  document.querySelector('#my-play').addEventListener('click', function () {
    ctl.play();
  });
})();
</script>
</body>
</html>`
writeFileSync(join(host, 'index.html'), html)
console.log(JSON.stringify({
  host,
  sceneId,
  hasShell: readme.includes('data-ms-demo-shell'),
  hasOutside: readme.includes('Play button outside data-ms-demo-shell'),
  assets: Object.keys(files).filter((k) => k.startsWith('assets/')),
}, null, 2))
await server.close()
