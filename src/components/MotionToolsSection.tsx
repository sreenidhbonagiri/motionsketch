import { RESTORE_RECORDED_PATH_HELP } from '../core/continuePath'
import { useConfirm } from '../hooks/useConfirm'
import { useEditorStore } from '../state/store'
import { HelpDisclosure } from './HelpDisclosure'

const toolBtn =
  'inline-flex h-8 min-h-8 w-full items-center justify-start rounded-lg border border-ms-border bg-white px-2.5 text-xs font-medium text-slate-800 transition hover:bg-ms-selected disabled:opacity-40'

/**
 * Polish / Glide / Restore — same store actions as the former dock Refine
 * popover. Snap stays on the transport dock. Presets live in AdjustPanel.
 */
export function MotionToolsSection() {
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
      <div className="space-y-1.5">
        <HelpDisclosure testId="refine-motion-help" summary="About Motion tools">
          Soften motion for{' '}
          <span className="font-medium text-slate-700">
            {selectedActor?.name ?? 'the selected element'}
          </span>
          . Polish keeps pauses and corners; Glide eases starts and stops. Snap
          stays next to Record and Play.
        </HelpDisclosure>
        <button
          type="button"
          data-testid="btn-polish-motion"
          disabled={!hasRecording || busy}
          title="Preview a gentler path while keeping pauses and corners"
          onClick={() => beginPolishSession()}
          className={toolBtn}
        >
          Polish motion
        </button>
        <button
          type="button"
          data-testid="btn-glide"
          disabled={!hasRecording || busy}
          title="Softens starts and stops while keeping your path and pauses"
          onClick={() => beginGlideSession()}
          className={toolBtn}
        >
          Glide
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
              className={toolBtn}
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
