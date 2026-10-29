import { useId, useState } from 'react'
import {
  DEFAULT_STAGE_RESIZE_ANCHOR,
  resolveProjectStageSize,
  STAGE_RESIZE_ANCHORS,
  stageResizeAnchorLabel,
  type StageResizeAnchor,
} from '../core/stageResize'
import { useEditorStore } from '../state/store'

/**
 * Compact Stage size controls under Project.
 * Width/Height are persisted composition units (working area); exports stay responsive.
 */
export function StageSizeSection() {
  const project = useEditorStore((s) => s.project)
  const mode = useEditorStore((s) => s.mode)
  const polishSession = useEditorStore((s) => s.polishSession)
  const glideSession = useEditorStore((s) => s.glideSession)
  const presetSession = useEditorStore((s) => s.presetSession)
  const resizeProjectStage = useEditorStore((s) => s.resizeProjectStage)

  const size = resolveProjectStageSize(project)
  const [widthDraft, setWidthDraft] = useState(String(size.width))
  const [heightDraft, setHeightDraft] = useState(String(size.height))
  const [draftSize, setDraftSize] = useState(size)
  const [anchor, setAnchor] = useState<StageResizeAnchor>(
    DEFAULT_STAGE_RESIZE_ANCHOR,
  )
  const [localError, setLocalError] = useState<string | null>(null)

  const headingId = useId()
  const helpId = useId()
  const widthId = useId()
  const heightId = useId()
  const anchorGroupId = useId()

  // Sync drafts when the committed composition size changes (resize / undo / load).
  if (size.width !== draftSize.width || size.height !== draftSize.height) {
    setDraftSize(size)
    setWidthDraft(String(size.width))
    setHeightDraft(String(size.height))
    setLocalError(null)
  }

  const busy =
    mode === 'recording' ||
    mode === 'armed' ||
    mode === 'editing' ||
    mode === 'playing' ||
    !!polishSession ||
    !!glideSession ||
    !!presetSession

  const handleResize = () => {
    setLocalError(null)
    const width = Number(widthDraft)
    const height = Number(heightDraft)
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setLocalError('Enter finite Width and Height values.')
      return
    }
    const ok = resizeProjectStage(width, height, anchor)
    if (!ok) {
      const message = useEditorStore.getState().actionAnnouncement
      if (message) setLocalError(message)
    }
  }

  return (
    <section
      data-testid="stage-size-section"
      aria-labelledby={headingId}
      className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
    >
      <div className="min-w-0">
        <h3 id={headingId} className="text-sm font-medium text-slate-800">
          Stage size
        </h3>
        <p id={helpId} className="text-xs leading-relaxed text-slate-500">
          Width and Height are saved composition units for aspect and working
          area (not export pixels). Expanding adds space without stretching
          motion. Same-aspect growth is real extra drawing room. Exports stay
          responsive to the page.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1" htmlFor={widthId}>
          <span className="block text-[11px] font-medium text-slate-600">
            Width
          </span>
          <input
            id={widthId}
            data-testid="stage-size-width"
            type="number"
            inputMode="numeric"
            min={200}
            max={8000}
            step={1}
            value={widthDraft}
            disabled={busy}
            aria-describedby={helpId}
            onChange={(e) => setWidthDraft(e.target.value)}
            className="w-full rounded-md border border-ms-border bg-white px-2 py-1.5 text-xs text-slate-800 disabled:opacity-40"
          />
        </label>
        <label className="space-y-1" htmlFor={heightId}>
          <span className="block text-[11px] font-medium text-slate-600">
            Height
          </span>
          <input
            id={heightId}
            data-testid="stage-size-height"
            type="number"
            inputMode="numeric"
            min={200}
            max={8000}
            step={1}
            value={heightDraft}
            disabled={busy}
            aria-describedby={helpId}
            onChange={(e) => setHeightDraft(e.target.value)}
            className="w-full rounded-md border border-ms-border bg-white px-2 py-1.5 text-xs text-slate-800 disabled:opacity-40"
          />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">Composition units</p>

      <div className="space-y-1.5">
        <p
          id={anchorGroupId}
          className="text-[11px] font-medium text-slate-600"
        >
          Expansion anchor
        </p>
        <div
          role="radiogroup"
          aria-labelledby={anchorGroupId}
          data-testid="stage-size-anchor-grid"
          className="inline-grid grid-cols-3 gap-1"
        >
          {STAGE_RESIZE_ANCHORS.map((key) => {
            const selected = anchor === key
            const label = stageResizeAnchorLabel(key)
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                data-testid={`stage-size-anchor-${key}`}
                disabled={busy}
                onClick={() => setAnchor(key)}
                className={
                  selected
                    ? 'flex size-7 items-center justify-center rounded-md border border-ms-primary bg-ms-selected text-ms-primary-pressed disabled:opacity-40'
                    : 'flex size-7 items-center justify-center rounded-md border border-ms-border bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40'
                }
              >
                <span
                  aria-hidden
                  className={
                    selected
                      ? 'size-2 rounded-full bg-ms-primary'
                      : 'size-1.5 rounded-full bg-slate-300'
                  }
                />
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-500">
          Where the current frame sits in the new size. Default: center.
        </p>
      </div>

      <button
        type="button"
        data-testid="btn-stage-resize"
        onClick={handleResize}
        disabled={busy}
        className="rounded-lg border border-ms-border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Resize
      </button>

      {localError && (
        <p
          data-testid="stage-size-error"
          className="text-[11px] leading-relaxed text-amber-900"
          role="alert"
        >
          {localError}
        </p>
      )}
    </section>
  )
}
