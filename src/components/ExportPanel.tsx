import { useMemo, useState } from 'react'
import { exportCssFromRecording } from '../core/export/css'
import { copyText } from '../lib/clipboard'
import { useEditorStore } from '../state/store'

export function ExportPanel() {
  const recording = useEditorStore((s) => s.project.recording)
  const actor = useEditorStore((s) => s.project.actor)
  const durationMs = useEditorStore((s) => s.project.playback.durationMs)
  const smoothing = useEditorStore((s) => s.project.playback.smoothing)
  const steadySpeed = useEditorStore((s) => s.project.playback.steadySpeed)
  const [copied, setCopied] = useState(false)

  const css = useMemo(() => {
    if (!recording) return ''
    return exportCssFromRecording({
      samples: recording.samples,
      smoothing,
      steadySpeed,
      durationMs,
      actor,
    })
  }, [recording, smoothing, steadySpeed, durationMs, actor])

  if (!recording) return null

  return (
    <div data-testid="export-panel" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          CSS export
        </h3>
        <button
          type="button"
          data-testid="btn-copy-css"
          onClick={async () => {
            const ok = await copyText(css)
            if (ok) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }
          }}
          className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        data-testid="css-output"
        readOnly
        value={css}
        className="h-40 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 outline-none focus:border-indigo-300"
      />
    </div>
  )
}
