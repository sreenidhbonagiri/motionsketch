# MotionSketch

Browser-based animation editor: demonstrate how an element should move, then replay and export CSS keyframes.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL, click **Record**, drag the tile, then **Play** or copy the CSS export.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck and production build |
| `npm test` | Vitest unit tests (`src/core`) |
| `npm run test:e2e` | Playwright end-to-end flows |

## Architecture

- `src/core` — pure algorithms (coords, recording, smoothing, playback, CSS export)
- `src/state` — Zustand editor store + derived selectors
- `src/components` — canvas stage, actor, toolbar, inspector
- `src/hooks` — pointer recording + playback clock

Motion is stored as normalized canvas coordinates with original sample timestamps preserved. Smoothing and duration only affect a derived path used for playback and export.
