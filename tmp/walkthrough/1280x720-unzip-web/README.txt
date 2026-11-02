MotionSketch web package
=======================

Project: Untitled project
Scene root class: ms-scene-c6a8b02f
Scene id: c6a8b02f
Stage class: ms-stage
Reduced-motion opt-in class: ms-motion-ok
Waiting class (armed triggers): ms-waiting

This folder is self-contained. It does not need MotionSketch, a build step,
or network access.

What the export includes
------------------------
Elements, motion, and (when present) image files under assets/. It does not
include the editor path overlay, stage grid, selection chrome, or playback
dock. Those stay in MotionSketch only.

Folder layout (keep relative paths)
-----------------------------------
index.html — optional preview (or use your own page)
animation.css — required for the animation
ms-trigger.js — required for Play, Replay, and reduced motion
README.txt — instructions only, not required to run
project.json — editable project data to reopen in MotionSketch, not required to run

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

When should it play: page-load
---------------------------
For page-load, CSS alone can start the motion when prefers-reduced-motion is
off. The documented website integration still includes
ms-trigger.js and MotionSketchTrigger.init so Play/Replay,
reduced-motion Play (adds "ms-motion-ok"), and pause()/resume() work
on host pages. Download CSS alone skips that controller.
Changing the setting in MotionSketch updates the generated code. Copy or
download again afterward.
Pause is omitted in the preview for this short non-looping scene; host sites can still call pause()/resume() if needed.

Preview locally
---------------
1. Keep this folder together (do not move files out of place).
2. Open index.html in a browser (double-click or File → Open).
   That file is a self-contained preview page (layout and controls). The three
   embed sections below are the equivalent pieces to paste into an existing page.
3. The preview links animation.css, ms-trigger.js,
   and any files under assets/ with relative paths.
4. The included [data-ms-play] button starts as “Play animation”. After the scene has played it becomes “Replay” (restarts from the beginning). With prefers-reduced-motion it stays “Play animation” until pressed (that opt-in adds "ms-motion-ok" and starts motion). It does not pause; Pause / Resume appear only when the package offers them (looping scenes, or long automatic page-load / viewport scenes).
   When prefers-reduced-motion is on, animation stays off until you press Play
   (adds "ms-motion-ok"). Automatic triggers never override that
   preference.

Embed in an existing website
----------------------------
Copy animation.css, ms-trigger.js, and assets/ (if
listed) next to your page — same layout as above (paths assume that
arrangement). Paste each section where its label indicates, in the order shown.
Initialization goes after the scene markup, before </body>.

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
    <div class="ms-scene-c6a8b02f" data-ms-scene="c6a8b02f">
      <div class="ms-stage">
        <div class="ms-actor"></div>
      </div>
    </div>
  </div>
  <button type="button" data-ms-play>Play animation</button>
</div>

Before </body> (after the scene markup)
---------------------------------------
<script src="ms-trigger.js"></script>
<script>
(function () {
  var api = window.MotionSketchTrigger;
  if (!api || typeof api.init !== 'function') return;
  var root = document.querySelector('[data-ms-scene="c6a8b02f"]');
  if (!root) return;
  api.init(root, {
    mode: "page-load",
    loop: false,
    durationMs: 2396,
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
  var root = document.querySelector('[data-ms-scene="c6a8b02f"]');
  var ctl = api.init(root, {
    mode: "page-load",
    loop: false,
    durationMs: 2396,
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
