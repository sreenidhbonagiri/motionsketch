import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { exportCssFromRecording } from '../core/export/css'
import { buildHtmlDemo } from '../core/export/htmlDemo'
import { downloadTextFile, stampFilename } from '../lib/download'
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
  const loop = project.playback.loop
  const loopMode = project.playback.loopMode
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const editSession = useEditorStore((s) => s.editSession)
  const editPreview = useEditorStore((s) => s.editPreview)
  const announceAction = useEditorStore((s) => s.announceAction)

  const [copiedInline, setCopiedInline] = useState(false)
  const [copiedDialog, setCopiedDialog] = useState(false)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
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

  const stageAspect = project.stageAspect

  const transform = project.transform

  const exportOptions = useMemo(() => {
    if (!recording) return null
    return {
      samples: recording.samples,
      smoothing,
      steadySpeed,
      durationMs,
      actor,
      loop,
      loopMode,
      stageAspect,
      processedPath,
      transform,
    }
  }, [
    recording,
    smoothing,
    steadySpeed,
    durationMs,
    actor,
    loop,
    loopMode,
    stageAspect,
    processedPath,
    transform,
  ])

  const css = useMemo(() => {
    if (!exportOptions) return ''
    return exportCssFromRecording(exportOptions)
  }, [exportOptions])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClose = () => {
      viewBtnRef.current?.focus()
    }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  if (!recording || !exportOptions) return null

  const announce = (message: string) => {
    setActionStatus(message)
    announceAction(message)
  }

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

  const downloadCss = () => {
    const ok = downloadTextFile(
      css,
      stampFilename('motionsketch', 'css'),
      'text/css;charset=utf-8',
    )
    if (ok) announce('CSS download started.')
  }

  const downloadHtmlDemo = () => {
    try {
      const html = buildHtmlDemo(exportOptions)
      const ok = downloadTextFile(
        html,
        stampFilename('motionsketch-demo', 'html'),
        'text/html;charset=utf-8',
      )
      if (ok) announce('HTML demo download started.')
    } catch {
      setActionStatus('Couldn’t build the HTML demo.')
      announceAction('Couldn’t build the HTML demo.')
    }
  }

  const openDialog = () => {
    dialogRef.current?.showModal()
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
        <button
          type="button"
          data-testid="btn-download-css"
          onClick={downloadCss}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Download CSS
        </button>
        <button
          type="button"
          data-testid="btn-download-html-demo"
          onClick={downloadHtmlDemo}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Download HTML demo
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        CSS matches View/Copy. The HTML demo is standalone — open the file
        locally, no server needed.
      </p>
      {actionStatus && (
        <p data-testid="export-action-status" className="text-[11px] text-slate-600">
          {actionStatus}
        </p>
      )}

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
