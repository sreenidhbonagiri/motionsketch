# Stage aspect and window resize

MotionSketch stores each project’s **logical stage aspect** (`stageAspect` = width ÷ height).

## What is stored

- Sample coordinates are normalized to `[0, 1] × [0, 1]` in that logical space.
- New projects capture `stageAspect` from the available viewport once (on first empty load or New project).
- Older format v1 projects migrate to **16:10** (`1.6`) so their geometry stays consistent with the historical stage card.
- Window resize **never** rewrites `stageAspect` or sample coordinates.
- **Explicit Stage size** (Project panel) persists `stageWidth` / `stageHeight` composition units (format v14+) and keeps `stageAspect` = width ÷ height. Remap uses those dimensions so same-aspect expansion (e.g. 1600×1000 → 3200×2000) is real extra working area, not a label over a fixed height of 1000. Older files migrate missing sizes from aspect × height 1000 (appearance unchanged). v14 rejects missing, non-finite, non-positive, or aspect-mismatched dimensions. Export CSS still uses aspect for responsive layout — Width/Height are not CSS pixels.
- **Content-fit (shrink):** after remap, every rest/recording/geometry sample center plus an artwork circumcircle (cqmin box or conservative wrapped/multiline text × max transform scale) must lie in the new frame. Shrink is rejected when bounds cannot be established — never claimed from a one-line text underestimate.

## How the editor presents the stage

The workspace fills the viewport with the same light canvas wash as before. Inside it, a **stage frame** uses the project’s stored `stageAspect` (the exported scene), marked by a subtle hairline when the bounds are visible. Normalized coordinates map to that frame. A view-only camera (empty-canvas pan / zoom / Fit stage; Space pans over actors) moves the view; it never rewrites samples, `stageAspect`, undo history, or export output. Panning does not enlarge the exported animation area.

Off-frame workspace is for navigation only. Sample centers stay clamped to the stage (`[0, 1]²`). To add usable drawing space, use **Stage size → Resize** (expand with a 3×3 anchor). Shrinking past existing content is rejected. There is no automatic growth while drawing and no infinite-canvas export.

## Tradeoff (intentional)

| Behavior | Choice |
| --- | --- |
| Show a framed stage matching export aspect | **Yes** — distinct from the surrounding workspace |
| Rewrite samples when the window changes | **No** — geometry is stable |
| Explicit expand without stretching content | **Yes** — remap in composition units; Fit after resize |
| Persist camera / infinite canvas / export camera | **No** — Fit resets the view; export ignores the editor camera |

CSS and HTML demo exports use the project’s stored `stageAspect` (not the live window or camera) so a download matches the project’s reference geometry.
