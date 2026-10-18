import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { parseSnapshotJson } from '../core/persist/document'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { useEditorStore } from '../state/store'

export function ProjectPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmDialogRef = useRef<HTMLDialogElement>(null)
  const newProjectBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [importError, setImportError] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)

  const project = useEditorStore((s) => s.project)
  const newProject = useEditorStore((s) => s.newProject)
  const applyPersistedSnapshot = useEditorStore((s) => s.applyPersistedSnapshot)
  const announceAction = useEditorStore((s) => s.announceAction)
  const storeAnnouncement = useEditorStore((s) => s.actionAnnouncement)

  const {
    status,
    hasQuarantine,
    discardStoredAndUnblock,
    afterSuccessfulReplace,
    downloadCurrentProject,
    downloadQuarantine,
  } = useProjectPersistence()

  const label = statusLabel(status)
  const hasRecording = project.actors.some((a) => !!a.recording)
  const canDownloadProject = hasRecording || status === 'save-error'
  const saveFailed = status === 'save-error'

  useEffect(() => {
    if (storeAnnouncement) {
      setActionStatus(storeAnnouncement)
    }
  }, [storeAnnouncement])

  useEffect(() => {
    const dialog = confirmDialogRef.current
    if (!dialog) return
    const onClose = () => {
      newProjectBtnRef.current?.focus()
    }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  const startFreshUntitled = () => {
    newProject()
    discardStoredAndUnblock()
    setImportError(null)
    setActionStatus('New project ready.')
  }

  const handleNewProject = () => {
    if (projectHasMeaningfulWork(project)) {
      confirmDialogRef.current?.showModal()
      return
    }
    startFreshUntitled()
  }

  const closeConfirm = () => {
    confirmDialogRef.current?.close()
  }

  const confirmNewProject = () => {
    closeConfirm()
    startFreshUntitled()
  }

  const handleDownload = () => {
    if (!canDownloadProject) return
    const ok = downloadCurrentProject()
    if (ok) {
      setActionStatus('Project download started.')
      announceAction('Project download started.')
      return
    }
    const message =
      useEditorStore.getState().actionAnnouncement ??
      'Could not download the project file.'
    setActionStatus(message)
    announceAction(message)
  }

  const handleDownloadQuarantine = () => {
    if (downloadQuarantine()) {
      setActionStatus('Project download started.')
      announceAction('Project download started.')
      return
    }
    const message = 'Could not download the unreadable save.'
    setActionStatus(message)
    announceAction(message)
  }

  const handleOpenClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    let text: string
    try {
      text = await file.text()
    } catch {
      setImportError('Could not read that file.')
      return
    }

    const parsed = parseSnapshotJson(text)
    if (!parsed.ok) {
      setImportError(parsed.error)
      return
    }

    if (projectHasMeaningfulWork(project)) {
      const ok = window.confirm(
        'Open this project file? This replaces the current project, including actors, appearance, and motion.',
      )
      if (!ok) return
    }

    applyPersistedSnapshot(parsed.snapshot)
    afterSuccessfulReplace()
    setImportError(null)
    setActionStatus(null)
    announceAction(
      `Opened “${parsed.snapshot.project.name}”. You can edit it like any project.`,
    )
  }

  return (
    <div data-testid="project-panel" className="space-y-3 p-3">
      <p
        data-testid="project-local-save-copy"
        className="text-xs leading-relaxed text-slate-500"
      >
        One project is saved in this browser. Download a project file to keep
        another copy.
      </p>

      {label && !saveFailed && (
        <p
          data-testid="save-status"
          className={
            status === 'saved'
              ? 'text-[11px] text-slate-600'
              : 'text-[11px] text-amber-800'
          }
        >
          {label}
        </p>
      )}

      {saveFailed && (
        <div
          data-testid="save-error-banner"
          className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3"
          role="alert"
        >
          <p data-testid="save-status" className="text-[11px] leading-relaxed text-amber-950">
            {label}
          </p>
          <button
            type="button"
            data-testid="btn-download-project-save-error"
            onClick={handleDownload}
            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            Download project file
          </button>
        </div>
      )}

      {actionStatus && (
        <p data-testid="project-action-status" className="text-[11px] text-slate-600">
          {actionStatus}
        </p>
      )}

      {hasQuarantine && (
        <div className="space-y-1.5">
          <p
            data-testid="quarantine-hint"
            className="text-[11px] leading-relaxed text-amber-800"
          >
            A previous save could not be read. It was not overwritten. Download
            it for recovery, or choose New project to discard it.
          </p>
          <button
            type="button"
            data-testid="btn-download-quarantine"
            onClick={handleDownloadQuarantine}
            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
          >
            Download unreadable save
          </button>
        </div>
      )}

      {importError && (
        <p data-testid="import-error" className="text-[11px] text-red-700">
          {importError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          ref={newProjectBtnRef}
          type="button"
          data-testid="btn-new-project"
          onClick={handleNewProject}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          New project
        </button>
        <button
          type="button"
          data-testid="btn-download-project"
          onClick={handleDownload}
          disabled={!canDownloadProject}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download project file
        </button>
        <button
          type="button"
          data-testid="btn-open-project"
          onClick={handleOpenClick}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Open project
        </button>
        <input
          ref={fileInputRef}
          data-testid="project-file-input"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
        />
      </div>
      <p
        id="download-project-help"
        data-testid="download-project-help"
        className="text-[11px] leading-relaxed text-slate-500"
      >
        Reopen and edit in MotionSketch.
      </p>

      <dialog
        ref={confirmDialogRef}
        data-testid="new-project-confirm"
        aria-labelledby={titleId}
        className="confirm-dialog fixed inset-0 z-50 m-auto w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)]"
        onClick={(e) => {
          if (e.target === confirmDialogRef.current) closeConfirm()
        }}
      >
        <div className="space-y-3 p-4">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Start a new project?
          </h2>
          <p
            data-testid="new-project-confirm-copy"
            className="text-[11px] leading-relaxed text-slate-600"
          >
            This replaces the current project. Download it first if you want to
            keep a copy.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              data-testid="btn-new-project-cancel"
              onClick={closeConfirm}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="btn-new-project-confirm"
              onClick={confirmNewProject}
              className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
            >
              Start new project
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
