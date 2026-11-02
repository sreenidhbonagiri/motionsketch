import {
  HELP_EXPORT_BLURB,
  HELP_RECORDING_BLURB,
  HELP_RESTART_TUTORIAL_LABEL,
} from '../lib/tutorial'

interface HelpPanelProps {
  onRestartTutorial: () => void
  restartDisabled?: boolean
}

export function HelpPanel({
  onRestartTutorial,
  restartDisabled = false,
}: HelpPanelProps) {
  return (
    <div data-testid="help-panel" className="space-y-3 p-3">
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-800">Recording</h3>
        <p
          data-testid="help-recording-blurb"
          className="text-xs leading-relaxed text-slate-600"
        >
          {HELP_RECORDING_BLURB}
        </p>
      </section>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-800">Export</h3>
        <p
          data-testid="help-export-blurb"
          className="text-xs leading-relaxed text-slate-600"
        >
          {HELP_EXPORT_BLURB}
        </p>
      </section>
      <div className="border-t border-ms-border pt-3">
        <button
          type="button"
          data-testid="btn-restart-tutorial"
          disabled={restartDisabled}
          onClick={onRestartTutorial}
          className="inline-flex h-8 items-center rounded-lg border border-ms-border bg-white px-2.5 text-xs font-medium text-slate-800 transition hover:bg-ms-selected disabled:opacity-40"
        >
          {HELP_RESTART_TUTORIAL_LABEL}
        </button>
      </div>
    </div>
  )
}
