import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { exportCssFromRecording } from '../core/export/css'
import { copyText } from '../lib/clipboard'
import { selectProcessedPath } from '../state/selectors'
import { useEditorStore } from '../state/store'

export function ExportPanel() {
  const project = useEditorStore((s) => s.project)
  const recording = project.recording
  const actor = project.actor
  const durationMs = project.playback.durationMs
  const smoothing = project.playback.smoothing
  const steadySpeed = project.playback.steadySpeed
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)

  const [copiedInline, setCopiedInline] = useState(false)
  const [copiedDialog, setCopiedDialog] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const viewBtnRef = useRef<HTMLButtonElement>(null)
  const codeRef = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()

  const processedPath = useMemo(
    () =>
      selectProcessedPath(project, {
        geometryEdit,
        editSession,
        editPreview,
      }),
    [project, geometryEdit, editSession, editPreview],
  )

  const css = useMemo(() => {
    if (!recording) return ''
    return exportCssFromRecording({
      samples: recording.samples,
      smoothing,
      steadySpeed,
      durationMs,
      actor,
      processedPath,
    })
  }, [recording, smoothing, steadySpeed, durationMs, actor, processedPath])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClose = () => {
      viewBtnRef.current?.focus()
    }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  if (!recording) return null

  const copyCss = async (where: 'inline' | 'dialog') => {
    const ok = await copyText(css)
    if (!ok) return
    if (where === 'inline') {
      setCopiedInline(true)
      window.setTimeout(() => setCopiedInline(false), 1500)
    } else {
      setCopiedDialog(true)
      window.setTimeout(() => setCopiedDialog(false), 1500)
    }
  }

  const openDialog = () => {
    dialogRef.current?.showModal()
    // Reset after open so layout has applied; rAF covers first paint.
    requestAnimationFrame(() => {
      const code = codeRef.current
      if (code) {
        code.scrollTop = 0
        code.scrollLeft = 0
      }
    })
  }

  const closeDialog = () => {
    dialogRef.current?.close()
  }

  return (
    <div data-testid="export-panel" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Export
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="btn-copy-css"
          onClick={() => void copyCss('inline')}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
        >
          {copiedInline ? 'Copied' : 'Copy CSS'}
        </button>
        <button
          ref={viewBtnRef}
          type="button"
          data-testid="btn-view-css"
          onClick={openDialog}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          View CSS
        </button>
      </div>

      <dialog
        ref={dialogRef}
        data-testid="css-dialog"
        aria-labelledby={titleId}
        className="css-export-dialog fixed inset-0 z-50 m-auto h-[min(80dvh,calc(100dvh-1.5rem))] w-[min(85vw,1100px)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop:bg-slate-900/40 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog()
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 id={titleId} className="text-sm font-semibold text-slate-900">
              Exported CSS
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="btn-copy-css-dialog"
                onClick={() => void copyCss('dialog')}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                {copiedDialog ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                data-testid="btn-close-css-dialog"
                onClick={closeDialog}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
          <textarea
            ref={codeRef}
            data-testid="css-output"
            readOnly
            value={css}
            spellCheck={false}
            wrap="off"
            className="css-export-code min-h-0 w-full flex-1 resize-none overflow-auto whitespace-pre bg-slate-50 p-4 text-slate-800 outline-none"
          />
        </div>
      </dialog>
    </div>
  )
}
