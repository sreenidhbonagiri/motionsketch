import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { exportCssFromProject } from '../core/export/css'
import { buildHtmlDemoFromProject } from '../core/export/htmlDemo'
import { downloadTextFile, stampProjectFilename } from '../lib/download'
import { copyText } from '../lib/clipboard'
import { projectHasAnyRecording } from '../core/sceneActor'
import { useProjectPersistence } from '../hooks/useProjectPersistence'
import { useEditorStore } from '../state/store'

export function ExportPanel() {
  const project = useEditorStore((s) => s.project)
  const announceAction = useEditorStore((s) => s.announceAction)
  const { downloadCurrentProject } = useProjectPersistence()

  const [copiedInline, setCopiedInline] = useState(false)
  const [copiedDialog, setCopiedDialog] = useState(false)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const viewBtnRef = useRef<HTMLButtonElement>(null)
  const codeRef = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()

  const hasExport = projectHasAnyRecording(project)

  const css = useMemo(() => {
    if (!hasExport) return ''
    return exportCssFromProject(project)
  }, [project, hasExport])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClose = () => {
      viewBtnRef.current?.focus()
    }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  if (!hasExport) return null

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
      stampProjectFilename(project.name, 'css'),
      'text/css;charset=utf-8',
    )
    if (ok) {
      announce('CSS download started.')
      return
    }
    announce('Could not download the CSS file.')
  }

  const downloadHtmlDemo = () => {
    try {
      const html = buildHtmlDemoFromProject(project)
      const ok = downloadTextFile(
        html,
        stampProjectFilename(`${project.name}-demo`, 'html'),
        'text/html;charset=utf-8',
      )
      if (ok) {
        announce('HTML demo download started.')
        return
      }
      announce('Could not download the HTML demo.')
    } catch {
      announce('Couldn’t build the HTML demo.')
    }
  }

  const downloadProjectFile = () => {
    const ok = downloadCurrentProject()
    if (ok) {
      announce('Project download started.')
      return
    }
    const message =
      useEditorStore.getState().actionAnnouncement ??
      'Could not download the project file.'
    announce(message)
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
    <div data-testid="export-panel" className="space-y-3">
      <div className="space-y-2">
        <button
          type="button"
          data-testid="btn-download-html-demo"
          onClick={downloadHtmlDemo}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Download HTML demo
        </button>
        <p
          data-testid="export-html-help"
          className="text-[11px] leading-relaxed text-slate-500"
        >
          Play in a browser without MotionSketch.
        </p>

        <button
          type="button"
          data-testid="btn-download-css"
          onClick={downloadCss}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Download CSS
        </button>
        <p
          data-testid="export-css-help"
          className="text-[11px] leading-relaxed text-slate-500"
        >
          Scoped CSS for your site (scene root + keyframes). Image assets are
          separate. See the header comments for reduced motion and instance
          prefixes.
        </p>

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
        <p
          data-testid="export-css-code-help"
          className="text-[11px] leading-relaxed text-slate-500"
        >
          Copy CSS and View CSS provide the same scoped scene code
          {project.actors.length > 1
            ? ' (unique classes per actor inside the scene root).'
            : ' (wrap in the documented scene root).'}
        </p>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          data-testid="btn-export-download-project"
          onClick={downloadProjectFile}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Download project file
        </button>
        <p
          data-testid="export-project-help"
          className="mt-1 text-[11px] leading-relaxed text-slate-500"
        >
          Reopen and edit in MotionSketch. Also available under Project.
        </p>
      </div>

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
