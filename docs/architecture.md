# MotionSketch architecture

This document describes how MotionSketch turns pointer input into preview motion and exports. Terminology matches the TypeScript sources. For product setup and limits, see the [README](../README.md). Stage aspect tradeoffs are in [stage-aspect.md](./stage-aspect.md).

## Pipeline overview

```
pointer events
  → recording samples (normalized x/y, original t)
  → processMotion / geometry edit + Steady Speed   [pathCache]
  → clip-local progress on shared project timeline
  → evaluate position + transform + visibility
  → CanvasStage / Actor render
  → CSS keyframes + optional HTML demo
```

| Stage | Primary sources |
| --- | --- |
| Capture | `src/hooks/usePointerRecorder.ts`, `src/lib/recordingController.ts`, `src/core/recording.ts` |
| Smooth / retime | `src/core/process.ts` (`gaussianSmooth`, `applySteadySpeed`, `processMotion`, `processForCss`) |
| Path selection | `src/state/selectors.ts` (`selectProcessedPathForActor`) |
| Cache | `src/core/pathCache.ts` |
| Clip / visibility | `src/core/clip.ts` |
| Playback sample | `src/core/playback.ts`, `src/hooks/usePlaybackClock.ts` |
| Transform | `src/core/transform.ts` |
| Render | `src/components/CanvasStage.tsx`, `src/components/Actor.tsx` |
| Export | `src/core/export/css.ts`, `src/core/export/htmlDemo.ts`, `src/core/export/sceneScope.ts` |
| Persist | `src/core/persist/document.ts`, `src/core/persist/storage.ts`, `src/lib/persistenceController.ts` |
| Editor state | `src/state/store.ts` |

## Pointer samples → processed path

1. **Recording** (`Recording` / `MotionSample` in `src/core/types.ts`) stores `t` in milliseconds from take start (`t === 0` on the first sample) and `x`/`y` in `[0, 1]` relative to the project’s logical stage (`stageAspect`).
2. **Finish** requires at least `MIN_RECORDING_SAMPLES` (2) and `MIN_RECORDING_DURATION_MS` (50). See `src/core/recording.ts`.
3. **Live process** (`processMotion` in `src/core/process.ts`):
   - Gaussian spatial smoothing (`smoothing` 0…1), with stationary-run preservation so intentional pauses are not pulled toward neighbors.
   - Optional **Steady Speed** retiming (`steadySpeed` 0…1) along the path using aspect-aware distance (`src/core/stageAspect.ts`).
   - Resample to `CANONICAL_SAMPLE_COUNT` (120) and pin endpoints to the original take.
4. **Path edit**: entering Edit path bakes a `GeometryEdit` (`geometryEdit` on `SceneActor`). While geometry exists, spatial smoothing is not reapplied (handle moves would be erased); Steady Speed may still retime for playback/export. Original `recording.samples` stay untouched.
5. **CSS simplification**: `processForCss` runs `processMotion` then Ramer–Douglas–Peucker down to at most `CSS_MAX_KEYFRAMES` (60).

Selector priority for the path used in preview and export (`selectProcessedPathForActor`):

1. Live edit drag preview (not cached)
2. In-progress edit session samples
3. Committed `geometryEdit` samples → `cachedApplySteadySpeed`
4. Else `cachedProcessMotion(recording.samples, smoothing, steadySpeed, stageAspect)`

## Shared clock and clip-local timing

- **Project timeline**: `Project.playback` (`durationMs`, `loop`, `loopMode`) is shared. `usePlaybackClock` drives `playbackHead` (normalized 0…1) and `playbackDirection` via `requestAnimationFrame` while `mode === 'playing'`.
- **Per-actor clip** (`ActorClip`): `start` / `end` on that timeline; minimum span `MIN_CLIP_SPAN` (0.05). Motion and transform tracks use **actor-local** progress inside the clip (`projectToLocal` in `src/core/clip.ts`). Outside the interval the actor holds first/last pose.
- **Visibility**: `hideBeforeStart` / `hideAfterEnd` are half-open rules on project time (documented in `clip.ts`). Export uses a separate step-timed visibility animation; motion transform timing stays linear.

## Transforms

- Keyframes store normalized progress `t` in `[0, 1]` along the actor’s clip-local progress (`TransformKeyframe` in `types.ts`). Changing Duration does not move relative placement.
- Scale clamped to `MIN_TRANSFORM_SCALE`…`MAX_TRANSFORM_SCALE` (0.1…4); max `MAX_TRANSFORM_KEYFRAMES` (40).
- Export transform order (CSS header): translate → center → rotate → scale.

## Rendering

The editor maps normalized coordinates onto the full-bleed stage. If the window aspect differs from `project.stageAspect`, presentation stretches — see [stage-aspect.md](./stage-aspect.md). Playback evaluation (`evaluate` / `selectActorPositionForActor`) combines processed path, clip remap, and transform at the current head.

## Export scope and instance prefixes

`resolveExportScope` / `ExportCssOptions` in `src/core/export/sceneScope.ts`:

| Field | Role |
| --- | --- |
| `sceneId` | Content fingerprint (or override). Drives keyframe and root naming — **not** the project title alone. |
| `instancePrefix` | Optional sanitized prefix (prefer trailing `-`, e.g. `hero-`) so two independently controlled copies of the same scene do not collide. |
| `rootClass` | e.g. `ms-scene-<id>` or `hero-ms-scene-<id>` |
| `stageClass` | Always `ms-stage`, selected under the root |
| `motionOkClass` | `ms-motion-ok` — opt into motion when `prefers-reduced-motion: reduce` |

Exported CSS scopes all rules under the root. Image assets are referenced in header comments for host wiring; the HTML demo embeds what it needs for offline play (`buildHtmlDemoFromProject`).

## Persistence and migrations

- Envelope `PERSIST_FORMAT_VERSION` **8** (`src/core/persist/document.ts`).
- Storage key: `motionsketch.project.v1`.
- Migration notes in that file:
  - v1–v4 → single actor migrated to one `SceneActor`
  - v5 → multi-actor + shared timeline; image dedupe
  - v6 → per-actor clips
  - v7 → `project.name`
  - v8 → clip hide flags (default off)
- Soft JSON cap: `MAX_PROJECT_JSON_CHARS` (4_500_000).
- Autosave policy: `src/lib/persistenceController.ts` (immediate vs ~350 ms debounce; skip empty untitled; quarantine on corrupt restore).

## Image assets

Rules and limits live in `src/core/imageAsset.ts` (`MAX_IMAGE_BYTES`, `MAX_IMAGE_EDGE_PX`, `ALLOWED_IMAGE_MIME`, SVG validation). Images are stored as data URLs on `ActorImage` and may be factored into snapshot `assets` for downloads.

## Undo / history boundaries

All stacks are capped at `MAX_UNDO` (40) in `src/state/store.ts`. Selection change clears path / transform / clip stacks for that session.

| History | Scope | Notes |
| --- | --- | --- |
| Path (`undoStack`) | Selected actor’s geometry edit | Separate from transform/clip |
| Transform / clip | Selected actor | Unified via `actorEditOrder` (`'transform' \| 'clip'`) so dock/keyboard undo pops the most recent kind |
| Project rename | Title only | Does not push actor history |
| Live transform drag preview | None until commit | |

Recording, New/Open project, Reset actor, and similar replace operations are not modeled as fine-grained undo steps.

## Identity-based path cache

`src/core/pathCache.ts`:

- Lookup key: **sample array identity** (`WeakMap`) + parameter string (smoothing / steadySpeed / stageAspect / mode).
- On admit: freeze sample objects and the array (“seal”) so in-place mutation cannot stale the cache. Callers must replace arrays immutably.
- LRU bound: `PROCESSED_PATH_CACHE_MAX` (48).
- Warm playback must not traverse content fingerprints (`fingerprintTraversals === 0` on the hot path). `fingerprintSamples` exists for tooling and is counted separately.

### Measured performance vs guarantees

`tests/unit/path-cache.test.ts` logs cold `processMotion` time (8 actors × 2400 samples) and warm evaluate time (60 frames × 8 actors) via `console.log`. Those numbers are **measurements on the machine running the test**, not product SLAs or guarantees. Correctness assertions there check identity-cache behavior (process call counts, zero fingerprint traversals on warm frames), not absolute millisecond budgets.

## Key tradeoffs

| Choice | Why |
| --- | --- |
| Full-bleed stage stretch vs letterbox | Prefer a large drawing surface; exports keep stored aspect ([stage-aspect.md](./stage-aspect.md)). |
| Original samples immutable | Re-tune smoothing without losing the take; path edit bakes a separate geometry layer. |
| Shared clock, per-actor clips | Compose staggered scenes without separate timelines. |
| Identity cache | Cheap playback-head updates; requires immutable sample arrays. |
| Scoped CSS + fingerprint | Multi-embed safety; host must wrap markup correctly. |
| CSS without inlined images | Keeps stylesheets smaller; host supplies assets. |
| One local project slot | Simple autosave; no sync protocol. |

## Current limitations

- Max **8** actors (`MAX_ACTORS` in `src/core/sceneActor.ts`).
- No cloud accounts, multi-device sync, or project library beyond one autosave slot + file download/open.
- CSS export requires container query units (or the documented px fallback) and correct scene markup.
- SVG images are static `<img>` data URLs only — no animated or scripted SVG markup.
- Path undo is selection-scoped and independent of transform/clip unified undo.
- Editor confirmation UI is app-owned (`ConfirmProvider` / `ConfirmDialog`); there is no native `window.confirm` in the product path.
- Playwright config covers **Chromium** only (`playwright.config.ts`).

## Related docs

- [README](../README.md) — setup, features, limits, export consumer notes
- [stage-aspect.md](./stage-aspect.md) — `stageAspect` and resize
- [src/examples/ASSETS.md](../src/examples/ASSETS.md) — example asset provenance
