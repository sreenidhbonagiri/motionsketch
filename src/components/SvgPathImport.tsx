import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  importSvgPathFromText,
  readSvgFileAsText,
  remapSvgPathImport,
  type SvgPathImportOk,
} from '../core/svgPathImport'
import { formatCssAspectRatio } from '../core/stageAspect'
import { useEditorStore } from '../state/store'

/** Stage preview drawn from samples only — never mounts uploaded SVG markup. */
function PathPreview({
  samples,
  label,
  stageAspect,
}: {
  samples: { x: number; y: number }[]
  label: string
  /** Project stage width/height — matches editor + CSS export. */
  stageAspect: number
}) {
  const points = samples.map((s) => `${s.x * 100},${s.y * 100}`).join(' ')
  const aspectCss = formatCssAspectRatio(stageAspect)
  return (
    <div
      data-testid="svg-path-import-preview"
      data-stage-aspect={String(stageAspect)}
      className="overflow-hidden rounded-lg border border-slate-200 bg-[#f4f6fb]"
      style={{ aspectRatio: aspectCss }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={label}
      >
        <rect width="100" height="100" fill="#f8fafc" />
        {/* Light stage grid */}
        {Array.from({ length: 5 }, (_, i) => (
          <line
            key={`v-${i}`}
            x1={(i + 1) * 20}
            y1={0}
            x2={(i + 1) * 20}
            y2={100}
            stroke="#e2e8f0"
            strokeWidth={0.35}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={(i + 1) * 20}
            x2={100}
            y2={(i + 1) * 20}
            stroke="#e2e8f0"
            strokeWidth={0.35}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="#0f766e"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {samples[0] ? (
          <circle
            cx={samples[0].x * 100}
            cy={samples[0].y * 100}
            r={1.4}
            fill="#115e59"
          />
        ) : null}
      </svg>
    </div>
  )
}

export function SvgPathImport() {
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const stageAspect = useEditorStore((s) => s.project.stageAspect)
  const mode = useEditorStore((s) => s.mode)
  const applyImportedPathTake = useEditorStore((s) => s.applyImportedPathTake)
  const announceAction = useEditorStore((s) => s.announceAction)

  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const helpId = useId()

  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SvgPathImportOk | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [busy, setBusy] = useState(false)

  const busyModes = mode === 'recording' || mode === 'armed' || mode === 'editing'
  const hasExistingTake = !!selectedActor?.recording

  const preview = useMemo(() => {
    if (!draft) return null
    return remapSvgPathImport(draft, durationMs, { x: offsetX, y: offsetY })
  }, [draft, durationMs, offsetX, offsetY])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (draft) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [draft])

  const onPickFile = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const text = await readSvgFileAsText(file)
      const result = importSvgPathFromText(text, durationMs)
      if (!result.ok) {
        setError(result.error)
        announceAction(result.error)
        return
      }
      setOffsetX(0)
      setOffsetY(0)
      setDraft(result)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not read that SVG file.'
      setError(message)
      announceAction(message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const closePreview = () => {
    setDraft(null)
    setOffsetX(0)
    setOffsetY(0)
  }

  const confirmImport = () => {
    if (!preview) return
    applyImportedPathTake(preview.recording)
    closePreview()
  }

  return (
    <div data-testid="svg-path-import" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="btn-import-svg-path"
          disabled={busyModes || busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Reading SVG…' : 'Import SVG path'}
        </button>
        <input
          ref={fileRef}
          data-testid="svg-path-file-input"
          type="file"
          accept="image/svg+xml,.svg"
          className="sr-only"
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <p id={helpId} className="text-xs leading-relaxed text-slate-500">
        Replace the path for{' '}
        <span className="font-medium text-slate-700">
          {selectedActor?.name ?? 'the selected actor'}
        </span>{' '}
        with one local SVG path. Preview fit on the stage, then confirm. Keeps
        Duration and appearance; movement is even-speed by default.
      </p>
      {error ? (
        <p
          data-testid="svg-path-import-error"
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] leading-relaxed text-rose-950"
        >
          {error}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        data-testid="svg-path-import-dialog"
        aria-labelledby={titleId}
        className="fixed inset-0 z-50 m-auto h-[min(88dvh,calc(100dvh-1.5rem))] w-[min(92vw,560px)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop:bg-slate-900/40"
        onClose={closePreview}
        onClick={(e) => {
          if (e.target === dialogRef.current) closePreview()
        }}
      >
        {preview ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Preview SVG path
              </h2>
              <button
                type="button"
                data-testid="btn-svg-path-import-cancel"
                onClick={closePreview}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
              <PathPreview
                samples={preview.samples}
                label="Imported path preview on the stage"
                stageAspect={stageAspect}
              />
              <p
                data-testid="svg-path-mapping-note"
                className="text-[11px] leading-relaxed text-slate-600"
              >
                {preview.mappingNote}
              </p>
              {preview.closed ? (
                <p
                  data-testid="svg-path-closed-note"
                  className="text-[11px] text-slate-500"
                >
                  Closed loop detected — the take returns to the start point.
                </p>
              ) : null}
              <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium text-slate-700">
                  Adjust placement before import
                </p>
                <label className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                  <span>Nudge X</span>
                  <input
                    data-testid="svg-path-offset-x"
                    type="range"
                    min={-0.25}
                    max={0.25}
                    step={0.005}
                    value={offsetX}
                    onChange={(e) => setOffsetX(Number(e.target.value))}
                    className="w-40 accent-teal-700"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                  <span>Nudge Y</span>
                  <input
                    data-testid="svg-path-offset-y"
                    type="range"
                    min={-0.25}
                    max={0.25}
                    step={0.005}
                    value={offsetY}
                    onChange={(e) => setOffsetY(Number(e.target.value))}
                    className="w-40 accent-teal-700"
                  />
                </label>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  After import you can also use Move path or Edit path on the
                  stage.
                </p>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-500">
                {preview.limitations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {hasExistingTake ? (
                <p
                  data-testid="svg-path-replace-warning"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950"
                >
                  Confirming replaces the current take for{' '}
                  {selectedActor?.name ?? 'this actor'} (path edits and
                  transform keys on this actor are cleared). Duration and
                  appearance stay the same.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                data-testid="btn-svg-path-import-confirm"
                onClick={confirmImport}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                Replace path
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  )
}
