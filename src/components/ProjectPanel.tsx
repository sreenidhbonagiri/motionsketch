import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { parseSnapshotJson } from '../core/persist/document'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { useEditorStore } from '../state/store'
import { ProjectNameDialog } from './ProjectNameDialog'

export function ProjectPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmDialogRef = useRef<HTMLDialogElement>(null)
  const newProjectBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [importError, setImportError] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [nameOpen, setNameOpen] = useState(false)

  const project = useEditorStore((s) => s.project)
  const createNamedProject = useEditorStore((s) => s.createNamedProject)
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

  const handleNewProject = () => {
    if (projectHasMeaningfulWork(project)) {
      confirmDialogRef.current?.showModal()
      return
    }
    setNameOpen(true)
  }

  const closeConfirm = () => {
    confirmDialogRef.current?.close()
  }

  const confirmThenName = () => {
    closeConfirm()
    setNameOpen(true)
  }

  const finishNewProject = (name: string) => {
    if (!createNamedProject(name)) return
    setNameOpen(false)
    discardStoredAndUnblock()
    setImportError(null)
    setActionStatus(`Created “${name}”.`)
  }

  const handleDownload = () => {
    if (!hasRecording) return
    if (downloadCurrentProject()) {
      setActionStatus('Project download started.')
      announceAction('Project download started.')
    } else {
      const message =
        useEditorStore.getState().actionAnnouncement ??
        'Could not download the project file.'
      setActionStatus(message)
      setImportError(null)
    }
  }

  const handleDownloadQuarantine = () => {
    if (downloadQuarantine()) {
      setActionStatus('Project download started.')
      announceAction('Project download started.')
    }
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
      <p className="text-xs leading-relaxed text-slate-500">
        Autosaves in this browser on this device. Download a project file for a
        portable backup you can open later.
      </p>

      {label && (
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
          disabled={!hasRecording}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download current project
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
        Save this animation as a project file you can reopen.
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
            keep a copy. You’ll name the new project next.
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
              onClick={confirmThenName}
              className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
            >
              Continue
            </button>
          </div>
        </div>
      </dialog>

      <ProjectNameDialog
        open={nameOpen}
        title="Name your new project"
        description="Cancel keeps your current project unchanged."
        confirmLabel="Create project"
        initialName=""
        onCancel={() => setNameOpen(false)}
        onConfirm={finishNewProject}
      />
    </div>
  )
}
