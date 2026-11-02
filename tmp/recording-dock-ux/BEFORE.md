# Recording dock — before-fix findings (origin/main @ e4dbc70)

## Dock / control movement
- Play X stays centered (desktop 624 / mobile 179) across idle → armed → recorded → playing.
- Dock **height** grows: empty idle 50 → armed 70.5 (+status) → recorded 124.5 (+timeline + Edit/Refine/Reset). Playing matches recorded.
- Armed mounts `dock-status`; Continue unmounts while armed/recording — left cluster shrinks (Play still centered via grid).

## Armed empty-canvas drag
- `isRecordingActive()` is true only during an in-progress recording drag, **not** while merely armed.
- `useWorkspaceCamera` therefore still allows background pan while armed.
- Repro: armed + drag empty stage → camera translate changes (~+90,+40), mode stays `armed`, no miss feedback beyond the static Ready line.

## Reset confirmation
- `btn-reset` opens `reset-actor-confirm` (danger). **Works** — no bypass observed.

## Restart / Undo / Redo a11y
- `aria-label` + `title` present on Restart/Undo/Redo.
- Disabled icon opacity is `0.35`; native `title` tooltips often fail to show on disabled buttons in Chromium.

## Undo after recording / replace
- Dock Undo uses `undoActorEdit` / `actorEditOrder` (placement, transform, clip, glide, preset, continuePath, stageResize).
- `finishRecording` (first take or replace) does **not** push a history entry; clears placement history. Undo stays disabled after record/replace.
- Continue-path commits *are* undoable. **Do not add recording undo in this PR** — smallest safe approach would be a dedicated take-history entry on finishRecording; out of scope here.
