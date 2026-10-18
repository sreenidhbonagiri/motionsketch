import { useRef, useState, type ChangeEvent } from 'react'
import { parseSnapshotJson } from '../core/persist/document'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'
import {
  statusLabel,
  useProjectPersistence,
} from '../hooks/useProjectPersistence'
import { useEditorStore } from '../state/store'
import { ExampleGallery } from './ExampleGallery'
import { ProjectNameDialog } from './ProjectNameDialog'

/**
 * First-run / no-save entry: create, open, or try an example.
 * Does not render the drawing board until a project is intentionally opened.
 */
export function WelcomeScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [nameOpen, setNameOpen] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const createNamedProject = useEditorStore((s) => s.createNamedProject)
  const applyPersistedSnapshot = useEditorStore((s) => s.applyPersistedSnapshot)
  const announceAction = useEditorStore((s) => s.announceAction)
  const project = useEditorStore((s) => s.project)

  const {
    status,
    hasQuarantine,
    discardStoredAndUnblock,
    afterSuccessfulReplace,
    downloadQuarantine,
  } = useProjectPersistence()

  const label = statusLabel(status)

  const finishCreate = (name: string) => {
    if (!createNamedProject(name)) return
    setNameOpen(false)
    if (hasQuarantine) discardStoredAndUnblock()
    else afterSuccessfulReplace()
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
    // Welcome has no meaningful work; open replaces the placeholder only.
    void projectHasMeaningfulWork(project)
    applyPersistedSnapshot(parsed.snapshot)
    afterSuccessfulReplace()
    setImportError(null)
    announceAction(
      `Opened “${parsed.snapshot.project.name}”. You can edit it like any project.`,
    )
  }

  return (
    <div
      data-testid="welcome-screen"
      className="fixed inset-0 flex items-center justify-center overflow-auto bg-[#eef1f6] px-4 py-8 text-slate-900 antialiased"
    >
      <div className="w-[min(26rem,100%)] rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          MotionSketch
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Your drawing board
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Create a named project on this device, open a saved file, or try an
          example. Nothing is stored until you create or open a project.
        </p>

        {label && status !== 'idle' && (
          <p
            data-testid="welcome-save-status"
            className={
              status === 'saved'
                ? 'mt-3 text-[11px] text-slate-600'
                : 'mt-3 text-[11px] text-amber-800'
            }
          >
            {label}
          </p>
        )}

        {hasQuarantine && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p
              data-testid="quarantine-hint"
              className="text-[11px] leading-relaxed text-amber-900"
            >
              A previous save could not be read. It was not overwritten. Download
              it for recovery, or create a new project to discard it.
            </p>
            <button
              type="button"
              data-testid="btn-download-quarantine"
              onClick={() => downloadQuarantine()}
              className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
            >
              Download unreadable save
            </button>
          </div>
        )}

        {importError && (
          <p data-testid="import-error" className="mt-3 text-[11px] text-red-700">
            {importError}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            data-testid="btn-welcome-create"
            onClick={() => setNameOpen(true)}
            className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create project
          </button>
          <button
            type="button"
            data-testid="btn-welcome-open"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Open project
          </button>
          <button
            type="button"
            data-testid="btn-welcome-examples"
            onClick={() => setExamplesOpen(true)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Try an example
          </button>
          <input
            ref={fileInputRef}
            data-testid="welcome-file-input"
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      </div>

      <ProjectNameDialog
        open={nameOpen}
        title="Name your project"
        description="You’ll see this name in the editor. You can rename it anytime."
        confirmLabel="Create project"
        initialName=""
        onCancel={() => setNameOpen(false)}
        onConfirm={finishCreate}
      />

      {examplesOpen && (
        <ExampleGallery onClose={() => setExamplesOpen(false)} />
      )}
    </div>
  )
}
