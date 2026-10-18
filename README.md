# MotionSketch

MotionSketch is a local browser editor for demonstrating motion. Drag an asset on the stage to record a path, refine timing and appearance, compose a multi-actor scene, then export scoped CSS or a self-contained HTML demo you can open offline.

There is no hosted product URL in this repository. Run the app locally with the commands below.

## Requirements

| Tool | Notes |
| --- | --- |
| **Node.js** | See `engines.node` in `package.json` (`^22.22.2` / `^24.15.0` / `>=26.0.0` — intersection of Vite 8, Vitest 5, and locked jsdom). CI uses **Node 22.22.2**. |
| **npm** | Comes with Node; used for install and scripts. Prefer `npm ci` with the lockfile for CI-parity installs. |
| **Browser** | A current desktop browser (Chromium, Firefox, or Safari/WebKit). Playwright e2e covers Chromium, Firefox, and Playwright WebKit — useful engine coverage, not every Safari/iOS version. |

Check your versions with `node -v` and `npm -v`.

## Setup

```bash
npm install
npx playwright install chromium firefox webkit   # needed for npm run test:e2e
npm run dev
```

Open the URL Vite prints (default `http://127.0.0.1:5173/`). The editor loads at `/` with an untitled canvas — no account or welcome modal.

Production build locally:

```bash
npm run build
npm run preview
```

## What you can do

- **Record** pointer motion for the selected actor (shape tile or image).
- **Refine** per-actor smoothing and Steady Speed; edit the path with handles (add/remove controls on the baked path, drag/nudge to reshape); set shared Duration, Loop, and loop mode (repeat or alternate).
- **Clip** each actor onto a start–end interval of the shared timeline, with optional hide-before / hide-after.
- **Transform** with rotation/scale keyframes on the same clip-local progress.
- **Compose** up to **8** actors (paint order = stacking); rename actors and the project.
- **Appearances** — colored shapes or PNG / JPEG / WebP / SVG images (see limits below).
- **Examples** — load bundled starters: Logo entrance, Follow the leader, Orbit.
- **Projects** — New / Open / Download JSON; one active project autosaves in this browser.
- **Export** — scoped CSS (copy or download) and an offline HTML demo. Exports respect `prefers-reduced-motion` until an explicit Play opt-in.

Confirmations (reset actor, replace recording, delete actor, new/open project, load example) use in-app dialogs, not the browser’s native `confirm`.

## Recording and playback

1. Select an actor, click **Record**, then drag on the stage (or on the actor).
2. Short takes are rejected (need at least two samples and ~50 ms). Replacing an existing take asks for confirmation.
3. **Play** advances a **shared** playhead for every actor. Duration, loop, and loop mode are project-wide; smoothing and Steady Speed are per actor.
4. Original sample timestamps stay on the recording. Smoothing / Steady Speed / path edit / clip remap only affect the derived path used for preview and export.

## Examples

Open **Examples** in the editor to preview and load a starter scene. Loading replaces the current project after confirmation. Assets for examples are original and embedded as data URLs — see [`src/examples/ASSETS.md`](src/examples/ASSETS.md).

## Project files and local autosave

| Concern | Behavior |
| --- | --- |
| **Where** | `localStorage` key `motionsketch.project.v1` (see `src/core/persist/document.ts`). |
| **What** | One active project in this browser origin. No accounts, sync, or cloud backup. |
| **When** | Discrete edits save immediately; continuous slider / appearance tweaks debounce (~350 ms). Untouched blank untitled canvases are not written. |
| **Download / Open** | JSON envelope `formatVersion` **8** (older files migrate on open). Soft size cap ~4.5M characters. Image payloads may be deduped into an `assets` map. |
| **Recovery** | If stored JSON is invalid, the app can quarantine it and offer a download rather than silently overwriting. |

Clearing site data for this origin removes the autosaved project. Keep downloads if you need a backup.

## Export choices

| Export | Use when |
| --- | --- |
| **HTML demo** | Offline preview in any browser; embeds scene CSS + Play control for reduced motion. |
| **Web package** | ZIP with `index.html`, `animation.css`, deduplicated `assets/`, `README.txt`, and `project.json` for offline preview and embedding. |
| **CSS** (copy / download / view) | Integrate into your own markup. Image actors are **not** inlined into the CSS — host the assets yourself and match the documented structure. |

CSS uses a scene root class (content fingerprint, optional `instancePrefix`), stage class `ms-stage`, and per-actor classes under that root. Keyframe names include the same fingerprint so multiple scenes can share a page. Details and markup example live in the CSS header comments and in [`docs/architecture.md`](docs/architecture.md).

**Integration requirements (CSS):**

- Wrap the stage in the exported root class; put actors inside `.ms-stage` (`position: relative; container-type: size`).
- Prefer container query units (`cqw` / `cqh` / `cqmin`); a px fallback formula is in the export header.
- Under `prefers-reduced-motion: reduce`, animations stay off until the root also has `ms-motion-ok` (the HTML demo’s Play button sets this).
- For a second independently controlled copy of the same scene, re-export with an `instancePrefix` (e.g. `hero-`) or rename the root class and keyframe prefix together.

## Limits and platform behavior

| Topic | Value / behavior |
| --- | --- |
| **Actors** | Max **8**; names up to 40 characters. |
| **Images** | Max **1.5 MB**; max decoded edge **2048 px**; MIME: PNG, JPEG, WebP, SVG. SVGs render only via `<img src="data:…">` (no markup injection); scripts / external refs / SMIL-style animation tags are rejected. |
| **Actor size** | Longer box edge is **6%–40%** of the stage’s shorter side (`cqmin`). |
| **Duration** | Shared playback **200–8000 ms**. |
| **Project title** | Up to 60 characters. |
| **Stage aspect** | Stored per project; resize does not rewrite samples. Editor may stretch vs. logical aspect; exports use stored aspect. See [`docs/stage-aspect.md`](docs/stage-aspect.md). |
| **Reduced motion** | Gallery previews do not autoplay when `prefers-reduced-motion: reduce`. Exports pause CSS animation until `ms-motion-ok`. |
| **Visibility boundaries** | Editor: visible on `[start, end)`. Exported CSS uses `step-end`. At the exact keyframe time, Firefox holds the previous value (jumps just after); Chromium/WebKit match the editor. Nearby times agree. Observable if you pause CSS/WAAPI on the exact boundary in Firefox — not during ordinary playback. |
| **Playwright WebKit** | Engine coverage for automation, not a claim about every Safari/iOS build. Desktop Safari pointer behavior in trigger previews was not verified in a real Safari UI. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server (editor at `/`) |
| `npm run build` | Typecheck (`tsc -b`) and production build |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright e2e (`tests/e2e`; Chromium, Firefox, Playwright WebKit) |
| `npm run lint` | Oxlint (warnings are reported; they do not fail the script today) |

## Continuous integration

GitHub Actions runs on pushes to `main` and on pull requests (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)): `npm ci`, lint, unit tests, and production build, then a matrix of e2e jobs (Chromium, Firefox, Playwright WebKit) each with `--retries=0`. Each matrix job installs only its browser (+ OS deps), runs Playwright with one worker, and uploads a separate failure artifact. Playwright starts its own Vite server (`CI` is set, so `reuseExistingServer` is false). Playwright WebKit is engine coverage — not a claim that every Safari or iOS version was tested.

### Same checks locally

```bash
npm ci
npm run lint
npm test
npm run build
npx playwright install chromium firefox webkit   # once per machine
# Optional OS deps (closer to CI on Linux):
# npx playwright install --with-deps
CI=1 npm run test:e2e -- --retries=0
# Or one engine:
# CI=1 npm run test:e2e -- --project=firefox --retries=0
```

`CI=1` makes Playwright launch a fresh web server instead of reusing whatever is already on port 5173, and enables `forbidOnly`.

### Finding CI failures

On GitHub: open the repository **Actions** tab → select the failed workflow run → inspect the failing step log. For e2e failures, download the per-engine artifact (`playwright-chromium`, `playwright-firefox`, or `playwright-webkit`) containing `playwright-report/` and `test-results/` (traces retained on failure). Artifacts are kept for 7 days.

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Data flow, clock, undo, persistence migrations, path cache, export scope, tradeoffs |
| [`docs/stage-aspect.md`](docs/stage-aspect.md) | Logical stage aspect vs. window resize |
| [`src/examples/ASSETS.md`](src/examples/ASSETS.md) | Bundled example asset provenance |

## Layout (source)

- `src/core` — coords, recording, process/smoothing, clip, transform, persist, export
- `src/state` — Zustand editor store and path/playback selectors
- `src/components` — stage, dock, inspector, export, examples, confirms
- `src/hooks` — pointer recording, playback clock, path editor, persistence wiring
- `src/examples` — starter scene builders and assets
- `tests/unit`, `tests/e2e`, `tests/fixtures` — unit, Playwright, and export-isolation fixtures
