import { useState } from 'react'
import { isActorVisibleAt } from '../core/clip'
import { MAX_ACTORS } from '../core/sceneActor'
import { useConfirm } from '../hooks/useConfirm'
import {
  ACTORS_PANEL_OPEN_KEY,
  readPanelOpenPref,
  writePanelOpenPref,
} from '../lib/panelOpenPref'
import { useEditorStore } from '../state/store'
import { ActorNameInput } from './ActorNameInput'

const panelSurface =
  'rounded-xl border border-ms-border bg-white/90 shadow-[var(--ms-shadow)] backdrop-blur-xl'
const togglePill =
  'pointer-events-auto inline-flex h-8 min-h-8 items-center gap-1.5 rounded-xl border border-ms-border bg-white/85 px-2.5 text-xs font-medium text-slate-700 shadow-[var(--ms-shadow-sm)] backdrop-blur-xl transition hover:bg-white'

export function ActorList() {
  const actors = useEditorStore((s) => s.project.actors)
  const selectedActorId = useEditorStore((s) => s.selectedActorId)
  const playbackHead = useEditorStore((s) => s.playbackHead)
  const mode = useEditorStore((s) => s.mode)
  const selectActor = useEditorStore((s) => s.selectActor)
  const scrubPlayback = useEditorStore((s) => s.scrubPlayback)
  const addActor = useEditorStore((s) => s.addActor)
  const duplicateSelectedActor = useEditorStore((s) => s.duplicateSelectedActor)
  const deleteSelectedActor = useEditorStore((s) => s.deleteSelectedActor)
  const renameActor = useEditorStore((s) => s.renameActor)
  const moveSelectedActor = useEditorStore((s) => s.moveSelectedActor)
  const confirm = useConfirm()

  // Fresh workspace: collapsed. Explicit toggles persist for this tab.
  const [open, setOpen] = useState(() =>
    readPanelOpenPref(ACTORS_PANEL_OPEN_KEY, false),
  )
  const busy =
    mode === 'recording' || mode === 'armed' || mode === 'editing'

  const selected = actors.find((a) => a.id === selectedActorId)
  const selectedHidden =
    !!selected && !isActorVisibleAt(playbackHead, selected.clip)

  const setOpenPref = (next: boolean) => {
    setOpen(next)
    writePanelOpenPref(ACTORS_PANEL_OPEN_KEY, next)
  }

  return (
    <div
      data-testid="actor-list"
      data-actors-open={open ? 'true' : 'false'}
      className={
        open
          ? // Narrow + open: float a bounded left sheet above Sequence so the
            // body is not crushed by toolbar clearance. Desktop stays in-slot.
            `pointer-events-none flex max-h-full w-[min(100%,16rem)] flex-col justify-end gap-1.5 max-sm:pointer-events-auto max-sm:fixed max-sm:left-3 max-sm:top-[var(--ms-sheet-top,4.5rem)] max-sm:z-[35] max-sm:w-[min(16rem,calc(100vw-1.5rem))] max-sm:max-h-[min(24rem,calc(100dvh-var(--ms-sheet-top,4.5rem)-7rem))] max-sm:justify-start max-sm:gap-0 max-sm:overflow-hidden max-sm:rounded-xl max-sm:border max-sm:border-ms-border max-sm:bg-white/90 max-sm:shadow-[var(--ms-shadow)] max-sm:backdrop-blur-xl`
          : 'pointer-events-none flex max-h-full w-[min(100%,16rem)] flex-col justify-end gap-1.5'
      }
    >
      {open && (
        <div
          id="actor-list-body"
          data-testid="actor-list-body"
          className={`pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden ${panelSurface} max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none max-sm:backdrop-blur-none`}
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2.5 py-2 [overflow-anchor:none]">
            <ul
              data-testid="actor-list-items"
              className="max-h-36 space-y-1 overflow-auto"
              role="listbox"
              aria-label="Actors"
            >
              {actors.map((actor, index) => {
                const selectedRow = actor.id === selectedActorId
                const hiddenNow = !isActorVisibleAt(playbackHead, actor.clip)
                return (
                  <li key={actor.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedRow}
                      data-testid={`actor-list-item-${actor.id}`}
                      data-selected={selectedRow ? 'true' : 'false'}
                      data-hidden-now={hiddenNow ? 'true' : 'false'}
                      disabled={busy && !selectedRow}
                      onClick={() => selectActor(actor.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                        selectedRow
                          ? 'bg-ms-selected font-medium text-ms-ink ring-1 ring-ms-primary/30'
                          : 'text-slate-700 hover:bg-slate-900/[0.05]'
                      } disabled:opacity-50`}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{
                          background:
                            actor.appearance.kind === 'shape'
                              ? actor.appearance.color
                              : '#94a3b8',
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {actor.name}
                      </span>
                      <span className="shrink-0 text-[10px] opacity-70">
                        {index + 1}
                        {actor.recording ? ' · path' : ''}
                        {hiddenNow ? ' · hidden' : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {selected && (
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Name</span>
                <ActorNameInput
                  actorId={selected.id}
                  committedName={selected.name}
                  disabled={busy}
                  onCommit={(id, name) => renameActor(id, name)}
                />
              </label>
            )}

            {selected && selectedHidden && (
              <div
                data-testid="actor-hidden-indicator"
                className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2"
              >
                <p className="text-[11px] font-medium text-amber-950">
                  Hidden at this time
                </p>
                <button
                  type="button"
                  data-testid="btn-seek-clip-start"
                  disabled={busy}
                  onClick={() => scrubPlayback(selected.clip.start)}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-950 transition hover:bg-amber-100 disabled:opacity-40"
                >
                  Go to start
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                data-testid="btn-add-actor"
                disabled={busy || actors.length >= MAX_ACTORS}
                onClick={() => addActor()}
                className="inline-flex h-8 min-h-8 items-center rounded-lg bg-ms-primary px-2.5 text-xs font-medium text-white transition hover:bg-ms-primary-hover disabled:opacity-40"
              >
                Add
              </button>
              <button
                type="button"
                data-testid="btn-duplicate-actor"
                disabled={busy || actors.length >= MAX_ACTORS}
                onClick={() => duplicateSelectedActor()}
                className="inline-flex h-8 min-h-8 items-center rounded-lg px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06] disabled:opacity-40"
              >
                Duplicate
              </button>
              <button
                type="button"
                data-testid="btn-delete-actor"
                disabled={busy || actors.length <= 1}
                aria-describedby="actor-list-help"
                onClick={() => {
                  void (async () => {
                    const label = selected?.name?.trim() || 'this actor'
                    const ok = await confirm({
                      title: `Delete “${label}”?`,
                      body: 'Its path, transform keyframes, path edits, and appearance are removed. This cannot be undone.',
                      confirmLabel: 'Delete actor',
                      danger: true,
                      testId: 'delete-actor-confirm',
                      confirmTestId: 'btn-delete-actor-confirm',
                      cancelTestId: 'btn-delete-actor-cancel',
                      bodyTestId: 'delete-actor-confirm-copy',
                    })
                    if (ok) deleteSelectedActor()
                  })()
                }}
                className="inline-flex h-8 min-h-8 items-center rounded-lg px-2.5 text-xs font-medium text-ms-danger transition hover:bg-red-50 disabled:opacity-40"
              >
                Delete
              </button>
              <button
                type="button"
                data-testid="btn-actor-reorder-up"
                disabled={busy}
                onClick={() => moveSelectedActor(-1)}
                className="inline-flex h-8 min-h-8 min-w-8 items-center justify-center rounded-lg text-xs font-medium text-slate-600 transition hover:bg-slate-900/[0.06] disabled:opacity-40"
                aria-label="Move actor earlier in stack"
              >
                ↑
              </button>
              <button
                type="button"
                data-testid="btn-actor-reorder-down"
                disabled={busy}
                onClick={() => moveSelectedActor(1)}
                className="inline-flex h-8 min-h-8 min-w-8 items-center justify-center rounded-lg text-xs font-medium text-slate-600 transition hover:bg-slate-900/[0.06] disabled:opacity-40"
                aria-label="Move actor later in stack"
              >
                ↓
              </button>
            </div>
            <p
              id="actor-list-help"
              data-testid="actor-list-help"
              className="text-[10px] leading-relaxed text-slate-500"
            >
              List order is stacking (later on top). Path and transform edits
              apply to the selected actor only. Switching actors clears path and
              transform undo history for the previous selection.
              {actors.length <= 1
                ? ' Delete stays unavailable while only one actor remains.'
                : busy
                  ? ' Actor list actions pause while recording or editing a path.'
                  : ''}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        data-testid="btn-toggle-actor-list"
        aria-expanded={open}
        aria-controls="actor-list-body"
        onClick={() => setOpenPref(!open)}
        className={
          open
            ? // Sheet chrome on narrow (above the scroll body); pill under the
              // body on desktop.
              `${togglePill} shrink-0 max-sm:order-first max-sm:h-auto max-sm:min-h-8 max-sm:w-full max-sm:justify-between max-sm:rounded-none max-sm:border-0 max-sm:border-b max-sm:border-ms-border max-sm:bg-transparent max-sm:px-3 max-sm:py-1.5 max-sm:shadow-none max-sm:backdrop-blur-none`
            : `${togglePill} shrink-0`
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span>Actors</span>
          <span className="tabular-nums text-slate-500">
            {actors.length}/{MAX_ACTORS}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500">
          {open ? (
            <span data-testid="actors-collapse-label" className="max-sm:inline">
              Collapse
            </span>
          ) : null}
          <span aria-hidden className="text-slate-400">
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>
    </div>
  )
}
