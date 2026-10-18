import { useState } from 'react'
import { isActorVisibleAt } from '../core/clip'
import { MAX_ACTORS } from '../core/sceneActor'
import { useConfirm } from '../hooks/useConfirm'
import { useEditorStore } from '../state/store'
import { ActorNameInput } from './ActorNameInput'

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

  // Collapsed on narrow viewports so the dock and chrome stay reachable.
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true,
  )
  const busy =
    mode === 'recording' || mode === 'armed' || mode === 'editing'

  const selected = actors.find((a) => a.id === selectedActorId)
  const selectedHidden =
    !!selected && !isActorVisibleAt(playbackHead, selected.clip)

  return (
    <div
      data-testid="actor-list"
      className="pointer-events-auto w-[min(100%,16rem)] rounded-2xl border border-white/80 bg-white/92 shadow-[0_12px_36px_rgba(15,23,42,0.12)] backdrop-blur-md"
    >
      <button
        type="button"
        data-testid="btn-toggle-actor-list"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800"
      >
        <span>Actors ({actors.length}/{MAX_ACTORS})</span>
        <span aria-hidden className="text-slate-400">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 px-2.5 pb-2.5 pt-2">
          <ul
            data-testid="actor-list-items"
            className="max-h-40 space-y-1 overflow-auto"
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
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
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
                Go to clip start
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="btn-add-actor"
              disabled={busy || actors.length >= MAX_ACTORS}
              onClick={() => addActor()}
              className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              data-testid="btn-duplicate-actor"
              disabled={busy || actors.length >= MAX_ACTORS}
              onClick={() => duplicateSelectedActor()}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
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
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              type="button"
              data-testid="btn-actor-reorder-up"
              disabled={busy}
              onClick={() => moveSelectedActor(-1)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
              aria-label="Move actor earlier in stack"
            >
              ↑
            </button>
            <button
              type="button"
              data-testid="btn-actor-reorder-down"
              disabled={busy}
              onClick={() => moveSelectedActor(1)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
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
      )}
    </div>
  )
}
