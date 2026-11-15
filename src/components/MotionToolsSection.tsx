import { RESTORE_RECORDED_PATH_HELP } from '../core/continuePath'
import { useConfirm } from '../hooks/useConfirm'
import { useEditorStore } from '../state/store'
import { HelpDisclosure } from './HelpDisclosure'

/** Content-sized: label + description; no fixed height that clips wrapping copy. */
const toolBtn =
  'inline-flex h-auto min-h-8 w-full items-start justify-start rounded-lg border border-ms-border bg-white px-2.5 py-2 text-xs font-medium leading-snug text-slate-800 transition hover:bg-ms-selected disabled:opacity-40'
const toolBtnSingle =
  'inline-flex h-auto min-h-8 w-full items-center justify-start rounded-lg border border-ms-border bg-white px-2.5 py-2 text-xs font-medium text-slate-800 transition hover:bg-ms-selected disabled:opacity-40'

/**
 * Polish / Glide / Restore — same store actions as the former dock Refine
 * popover. Snap stays on the transport dock. Presets live in AdjustPanel.
 */
export function MotionToolsSection({
  showHelp = true,
}: {
  /** When false, the Motion-tab Help disclosure owns the explanations. */
  showHelp?: boolean
}) {
  const mode = useEditorStore((s) => s.mode)
  const selectedActor = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id) ?? s.project.actors[0]
  })
  const recording = selectedActor?.recording ?? null
  const hasRecording = !!recording
  const beginPolishSession = useEditorStore((s) => s.beginPolishSession)
  const beginGlideSession = useEditorStore((s) => s.beginGlideSession)
  const restoreRecordedPath = useEditorStore((s) => s.restoreRecordedPath)
  const geometryEdit = useEditorStore((s) => s.geometryEdit)
  const confirm = useConfirm()
  const busy =
    mode === 'recording' || mode === 'armed' || mode === 'editing'

  const onRestoreRecordedPath = async () => {
    const ok = await confirm({
      title: 'Restore recorded path?',
      body: RESTORE_RECORDED_PATH_HELP,
      confirmLabel: 'Restore recorded path',
      danger: true,
      testId: 'restore-path-confirm',
      confirmTestId: 'btn-restore-path-confirm',
    })
    if (ok) restoreRecordedPath()
  }

  return (
    <div data-testid="refine-motion-tools" className="space-y-3">
      <div className="flex flex-col gap-2">
        {showHelp && (
          <HelpDisclosure testId="refine-motion-help" summary="About Motion tools">
            Soften motion for{' '}
            <span className="font-medium text-slate-700">
              {selectedActor?.name ?? 'the selected element'}
            </span>
            . Polish keeps pauses and corners; Glide eases starts and stops. Snap
            stays next to Record and Play.
          </HelpDisclosure>
        )}
        <button
          type="button"
          data-testid="btn-polish-motion"
          disabled={!hasRecording || busy}
          title="Gentler path; pauses and corners stay"
          onClick={() => beginPolishSession()}
          className={toolBtn}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
            <span className="leading-snug">Polish motion</span>
            <span
              data-testid="polish-tool-desc"
              className="w-full whitespace-normal text-[11px] font-normal leading-snug text-slate-500"
            >
              Gentler path; pauses and corners stay
            </span>
          </span>
        </button>
        <button
          type="button"
          data-testid="btn-glide"
          disabled={!hasRecording || busy}
          title="Softer starts/stops; path stays"
          onClick={() => beginGlideSession()}
          className={toolBtn}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
            <span className="leading-snug">Glide</span>
            <span
              data-testid="glide-tool-desc"
              className="w-full whitespace-normal text-[11px] font-normal leading-snug text-slate-500"
            >
              Softer starts/stops; path stays
            </span>
          </span>
        </button>
        {(geometryEdit || selectedActor?.geometryEdit) && (
          <div className="border-t border-ms-border pt-2">
            <button
              type="button"
              data-testid="btn-restore-path"
              disabled={!hasRecording || busy}
              title={RESTORE_RECORDED_PATH_HELP}
              onClick={() => {
                void onRestoreRecordedPath()
              }}
              className={toolBtnSingle}
            >
              Restore recorded path
            </button>
            <p
              data-testid="restore-path-help"
              className="mt-0.5 px-0.5 text-[11px] leading-snug text-amber-800"
            >
              {RESTORE_RECORDED_PATH_HELP}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
