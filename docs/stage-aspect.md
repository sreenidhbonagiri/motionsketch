# Stage aspect and window resize

MotionSketch stores each project’s **logical stage aspect** (`stageAspect` = width ÷ height).

## What is stored

- Sample coordinates are normalized to `[0, 1] × [0, 1]` in that logical space.
- New projects capture `stageAspect` from the available viewport once (on first empty load or New project).
- Older format v1 projects migrate to **16:10** (`1.6`) so their geometry stays consistent with the historical stage card.
- Window resize **never** rewrites `stageAspect` or sample coordinates.

## How the editor presents the stage

The workspace fills the viewport with the same light canvas wash as before. Inside it, a **stage frame** uses the project’s stored `stageAspect` (the exported scene), marked by a subtle hairline when the bounds are visible. Normalized coordinates map to that frame. A view-only camera (empty-canvas pan / zoom / Fit stage; Space pans over actors) moves the view; it never rewrites samples, `stageAspect`, undo history, or export output. Panning does not enlarge the exported animation area.

Off-frame workspace is for navigation only. Sample centers stay clamped to the stage (`[0, 1]²`); this version does not enable off-stage drawing or change export clipping.

## Tradeoff (intentional)

| Behavior | Choice |
| --- | --- |
| Show a framed stage matching export aspect | **Yes** — distinct from the surrounding workspace |
| Rewrite samples when the window changes | **No** — geometry is stable |
| Persist camera / infinite canvas / export camera | **No** — Fit resets the view; export ignores the editor camera |

CSS and HTML demo exports use the project’s stored `stageAspect` (not the live window or camera) so a download matches the project’s reference geometry.
