# Handoff: Chromium Space-pan failure (full E2E 39533795844 @ 78afa03)

## Verdict
Not a recording / gesture-state bug. FloatingPanel’s deferred return-focus steals focus back onto `btn-project` after the test focuses the stage, so Space is correctly ignored (`isSpacePanBlockedTarget` on a `<button>`). Camera never changes; assertion measures the correct layer (`workspace-world` CSS transform).

## Answers to investigation questions
| Question | Evidence |
|---|---|
| Recording finished before Space-pan? | Yes. CI + local: `btn-record` visible, `btn-stop` absent, samples committed (24). Stale live-region text `"Recording"` remains — clue only. |
| Focus when Space pressed? | CI implied / local diag proved: after `stage.focus()`, double-rAF restore moves focus to **`btn-project`**. Space blocked as form control. |
| Did keydown activate temporary pan? | No — blocked by `isSpacePanBlockedTarget(button)`. |
| Did pointerdown reach camera handler? | Pointer hit `actor` with `pointer-events: auto` (Space never armed). Actor early-returns when a take exists; pan never starts. |
| Camera / assertion layer? | `readCamera` reads `workspace-world` transform. Before=after `{panX:64,…}`; correct layer, zero delta. |

## Root cause (product)
`FloatingPanel` cleanup schedules:
```ts
requestAnimationFrame(() => requestAnimationFrame(() => restore.focus()))
```
`waitForSaved` opens/closes Project → restore target is `btn-project`. Race vs `stage.focus()`: on slower CI timing the rAF wins *after* stage focus → Space lands on the button.

## Fix prepared (uncommitted)
1. **Product:** `shouldReturnFocusOnClose()` — skip restore when focus already moved elsewhere (e.g. stage).
2. **Regression unit:** `tests/unit/floating-panel-focus.test.ts`
3. **E2E:** assert `stage` is focused immediately before Space (deterministic; keeps real keyboard/pointer).
4. **Sequence layout fix left unchanged.**

## Verification (local, isolated candidate)
- Space-pan Chromium ×10: pass
- `workspace-camera.spec.ts` × chromium/firefox/webkit: **24/24**
- smoke: **15/15**
- build: OK
- Not committed / pushed / deployed

## Next steps
1. Review uncommitted diff (`FloatingPanel.tsx`, `workspace-camera.spec.ts`, `floating-panel-focus.test.ts`).
2. Commit + push when ready; re-dispatch full E2E on that SHA (optional — don’t need another full run solely for this if camera+smoke green).
3. Consider same “don’t steal focus” guard for ExampleGallery’s double-rAF restore (out of scope here).

## Commit
`7329821dec9096d5f7c7e14d502a77441e7a7537` — `fix: preserve intentional focus when closing panels`
Staged/committed: FloatingPanel.tsx, workspace-camera.spec.ts, floating-panel-focus.test.ts.

Pushed to `origin/main` (78afa03..7329821). SVG/export WIP left unstaged.

- Push CI: success — https://github.com/sreenidhbonagiri/motionsketch/actions/runs/40620839736
- Full E2E: success (chromium, firefox, webkit 1/2, webkit 2/2) — https://github.com/sreenidhbonagiri/motionsketch/actions/runs/40620854339
- Not deployed.
