# Example scene assets

All starter-scene assets ship as inline data URLs (no network requests).

| Asset | Used by | License / source |
| --- | --- | --- |
| `MOTIONSKETCH_MARK_SVG` | Logo entrance; export-embed test fixture (`Mark entrance`) | Original MotionSketch mark (geometric “M” tile). Created for this project; free to use with MotionSketch. |
| `paper-plane.png` + `PAPER_PLANE_PNG_DATA_URL` (`paperPlanePngData.ts`) | Paper plane (`createPaperPlaneImage`) | AI-generated startup-style notebook paper airplane (ruled sheet, red margin, transparent background; nose points diagonally upper-right). Cropped for a tight silhouette. Binary kept as source; shipped as an inline PNG data URL (same cross-environment pattern as the SVG mark — Vite, Vitest, Playwright Node, exports). Free to use with MotionSketch. |

Shape actors in “Follow the leader” and “Orbit” use solid fills only — no external images.
Text in “Paper plane” uses the built-in system stack (no webfonts).
