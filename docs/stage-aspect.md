# Stage aspect and window resize

MotionSketch stores each project’s **logical stage aspect** (`stageAspect` = width ÷ height).

## What is stored

- Sample coordinates are normalized to `[0, 1] × [0, 1]` in that logical space.
- New projects capture `stageAspect` from the available viewport once (on first empty load or New project).
- Older format v1 projects migrate to **16:10** (`1.6`) so their geometry stays consistent with the historical stage card.
- Window resize **never** rewrites `stageAspect` or sample coordinates.

## How the editor presents the stage

The interactive stage fills the viewport edge to edge. Normalized coordinates map to the full painted area. If the window’s ratio differs from the project’s stored `stageAspect`, presentation **stretches** (or compresses) relative to the logical stage — the same way CSS `cqw`/`cqh` map onto a stage box of a different ratio.

## Tradeoff (intentional)

| Behavior | Choice |
| --- | --- |
| Crop or letterbox the stage inside the window | **No** — the board stays full-bleed |
| Rewrite samples when the window changes | **No** — geometry is stable |
| Stretch presentation when ratios differ | **Yes** — discoverable drawing surface over pixel-perfect letterboxing |

CSS and HTML demo exports use the project’s stored `stageAspect` (not the live window) so a download matches the project’s reference geometry. Compare the editor and the HTML demo at the **same** aspect ratio for a 1:1 visual check; at a different window ratio the editor may look stretched while the demo still letterboxes to the stored aspect.
