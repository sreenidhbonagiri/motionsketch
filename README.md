# MotionSketch

Browser-based animation editor: demonstrate how an element should move, then replay and export CSS keyframes.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL. The editor opens directly on the canvas. Click **Record**, drag a tile, then **Play** or copy the CSS export.

## What you can do

- Record pointer motion for one or more actors on a stage
- Adjust smoothing, duration, clip timing, and per-actor visibility
- Add rotation/scale keyframes and image or shape appearances
- Load bundled starter examples (Logo entrance, Follow the leader, Orbit)
- Save and open projects locally; download project JSON
- Export scoped CSS and a self-contained HTML demo that respects `prefers-reduced-motion`

Exports use scene-scoped selectors and unique keyframe names so multiple scenes can sit on one host page without colliding with ordinary `.stage` / `.actor` styles.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server (editor at `/`) |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build locally |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end flows |
| `npm run lint` | Oxlint |

## Architecture

- `src/core` — pure algorithms (coords, recording, smoothing, playback, CSS export)
- `src/state` — Zustand editor store + derived selectors
- `src/components` — canvas stage, actor, toolbar, inspector
- `src/hooks` — pointer recording + playback clock
- `src/examples` — bundled starter scenes and assets
- `tests/fixtures` — HTML host pages and authored scenes for export isolation tests

Motion is stored as normalized canvas coordinates with original sample timestamps preserved. Smoothing and duration only affect a derived path used for playback and export.
