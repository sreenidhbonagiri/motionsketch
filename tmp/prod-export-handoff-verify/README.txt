MotionSketch web package
=======================

Project: Prod handoff 169
Scene root class: ms-scene-73ad463a
Scene id: 73ad463a
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
Pause is omitted in the preview for this short non-looping scene; host sites can still call pause()/resume() if needed.

Preview locally
---------------
1. Keep this folder together (do not move files out of place).
2. Open index.html in a browser (double-click or File → Open).
3. The preview links animation.css, ms-trigger.js,
   and any files under assets/ with relative paths.
4. Use Play / Replay (and Pause / Resume when shown — looping scenes, or
   automatic page-load / viewport scenes longer than 5s). When
   prefers-reduced-motion is on, animation stays off until you press Play
   (adds "ms-motion-ok"). Automatic triggers never override that
   preference.

Embed in an existing website
----------------------------
Copy these next to your page (keep relative paths, or update href/src):

  - animation.css
  - ms-trigger.js
  - assets/   (if listed above)

Give .ms-stage an explicit size. Exported rules use container query
units (cqw / cqh / cqmin); without a width (and height or aspect-ratio) the
stage can collapse.

Automatic Play / Replay binding looks for [data-ms-play] under the scene
root's parent, or anywhere inside the nearest ancestor with
data-ms-demo-shell (same pattern as index.html). Put your Play
control inside that shell, or call the controller API yourself (below).

Complete example (responsive wrapper + init — works for page-load too).
Stage aspect-ratio matches this project (16 / 9):

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

<div data-ms-demo-shell class="ms-embed">
  <div class="ms-embed-frame">
    <div class="ms-scene-73ad463a" data-ms-scene="73ad463a">
      <div class="ms-stage">
        <div class="ms-actor"></div>
      </div>
    </div>
  </div>
  <button type="button" data-ms-play>Play animation</button>
</div>

<script src="ms-trigger.js"></script>
<script>
(function () {
  var api = window.MotionSketchTrigger;
  if (!api || typeof api.init !== 'function') return;
  var root = document.querySelector('[data-ms-scene="73ad463a"]');
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
  var root = document.querySelector('[data-ms-scene="73ad463a"]');
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

Generated by MotionSketch. Do not hand-edit selectors unless you also update
animation.css to match.
