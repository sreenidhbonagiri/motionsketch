MotionSketch web package
=======================

Project: Prod PR4
Scene root class: ms-scene-94e65ec9
Scene id: 94e65ec9
Stage class: ms-stage
Reduced-motion opt-in class: ms-motion-ok
Waiting class (armed triggers): ms-waiting

This folder is self-contained. It does not need MotionSketch, a build step,
or network access.

What the export includes
------------------------
Actors, motion, and (when present) image files under assets/. It does not
include the editor path overlay, stage grid, selection chrome, or playback
dock — those stay in MotionSketch only.

Folder layout (keep relative paths)
-----------------------------------
  index.html       optional local preview (or use your own page)
  animation.css
  ms-trigger.js
  README.txt       instructions only — not required to run
  project.json    reopen in MotionSketch — not required to run

Package contents
----------------
  - index.html
  - animation.css
  - ms-trigger.js
  - README.txt
  - project.json

Image assets (deduplicated)
---------------------------
  (none — this scene uses shapes only)

Playback trigger: page-load
-----------------------
CSS animations start on their own when prefers-reduced-motion is off.
Still include ms-trigger.js and call MotionSketchTrigger.init
when you embed — required for Replay, reduced-motion Play (adds
"ms-motion-ok"), and pause()/resume() on host pages.
Changing the trigger in MotionSketch updates the generated code — copy or
download again afterward.
Pause is omitted in the preview for this short non-looping scene; host sites can still call pause()/resume() if needed.

Preview locally
---------------
1. Keep this folder together (do not move files out of place).
2. Open index.html in a browser (double-click or File → Open).
3. The preview links animation.css, ms-trigger.js,
   and any files under assets/ with relative paths.
4. The included [data-ms-play] button starts as “Play animation”. After the scene has played it becomes “Replay” (restarts from the beginning). With prefers-reduced-motion it stays “Play animation” until pressed (that opt-in adds "ms-motion-ok" and starts motion). It does not pause; Pause / Resume appear only when the package offers them (looping scenes, or long automatic page-load / viewport scenes).
   When prefers-reduced-motion is on, animation stays off until you press Play
   (adds "ms-motion-ok"). Automatic triggers never override that
   preference.

Embed in an existing website
----------------------------
Copy animation.css, ms-trigger.js, and assets/ (if
listed) next to your page — same layout as above. Paste the three sections
into your HTML (paths assume that arrangement).

Give .ms-stage an explicit size. Exported rules use container query
units (cqw / cqh / cqmin); without a width (and height or aspect-ratio) the
stage can collapse.

Automatic Play / Replay binding looks for [data-ms-play] under the scene
root's parent, or anywhere inside the nearest ancestor with
data-ms-demo-shell (same pattern as index.html). Put your Play
control inside that shell, or call the controller API yourself (below).

Stage aspect-ratio matches this project (16 / 9).

In <head>
---------
<link rel="stylesheet" href="animation.css">
<style>
  /* Host sizing — required. Aspect matches the MotionSketch project. */
  .ms-embed-frame {
    width: min(100%, 40rem);
  }
  .ms-embed-frame .ms-stage {
    width: 100%;
    aspect-ratio: 16 / 9;
  }
</style>

Where you want the animation, inside <body>
-------------------------------------------
<div data-ms-demo-shell class="ms-embed">
  <div class="ms-embed-frame">
    <div class="ms-scene-94e65ec9" data-ms-scene="94e65ec9">
      <div class="ms-stage">
        <div class="ms-actor"></div>
      </div>
    </div>
  </div>
  <button type="button" data-ms-play>Play animation</button>
</div>

Before </body>
--------------
<script src="ms-trigger.js"></script>
<script>
(function () {
  var api = window.MotionSketchTrigger;
  if (!api || typeof api.init !== 'function') return;
  var root = document.querySelector('[data-ms-scene="94e65ec9"]');
  if (!root) return;
  api.init(root, {
    mode: "page-load",
    loop: false,
    durationMs: 1200,
    motionOkClass: "ms-motion-ok",
    waitingClass: "ms-waiting",
    viewportThreshold: 0.35,
    actorSelector: "[class^=\"ms-actor\"]",
    offerPause: false
  });
})();
</script>

Reduced motion: under prefers-reduced-motion: reduce, animations stay off
until the scene root also has class "ms-motion-ok" (set by the
bound Play control or by controller.play() / restart()).

Play button outside data-ms-demo-shell
-------------------------------------
Do not rely on [data-ms-play] outside the shell — it will not auto-bind.
Keep the controller returned by init (or call get later) and wire your own
control:

<script>
(function () {
  var api = window.MotionSketchTrigger;
  var root = document.querySelector('[data-ms-scene="94e65ec9"]');
  var ctl = api.init(root, {
    mode: "page-load",
    loop: false,
    durationMs: 1200,
    motionOkClass: "ms-motion-ok",
    waitingClass: "ms-waiting",
    viewportThreshold: 0.35,
    actorSelector: "[class^=\"ms-actor\"]",
    offerPause: false
  });
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
Open project.json with MotionSketch (Project → Open project).
README.txt is instructions only; project.json is
for reopening — neither is required to run the embedded animation.

Generated by MotionSketch. Do not hand-edit selectors unless you also update
animation.css to match.
