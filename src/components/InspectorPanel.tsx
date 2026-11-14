import { useId } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AdjustPanel } from './AdjustPanel'
import { AppearancePanel } from './AppearancePanel'
import { HelpDisclosure } from './HelpDisclosure'
import { MotionToolsSection } from './MotionToolsSection'
import { ProjectPanel } from './ProjectPanel'
import { useEditorStore } from '../state/store'

export type InspectorTab = 'style' | 'motion' | 'project'

const tabBtn =
  'inline-flex h-8 min-h-8 flex-1 items-center justify-center rounded-lg px-2 text-xs font-medium whitespace-nowrap transition'
const tabIdle = `${tabBtn} text-slate-600 hover:bg-slate-900/[0.06]`
const tabActive = `${tabBtn} bg-ms-selected text-ms-primary`

interface InspectorPanelProps {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  /** Phone: leave the inspector and return to the stage. */
  onBackToStage?: () => void
  /** Desktop: close the docked inspector and return space to the canvas. */
  onClose?: () => void
  /** Duration shown in the Motion body (not on the tab label). */
  motionSummary?: string | null
  /**
   * Phone/short sheet fills the slot. Desktop floating card sizes to content
   * (capped by max-height) so it does not look like an empty full-height rail.
   */
  fillHeight?: boolean
}

/**
 * Inspector chrome: Style / Motion / Project.
 * Desktop hosts this inside a floating card; focused chrome uses a full sheet.
 */
export function InspectorPanel({
  tab,
  onTabChange,
  onBackToStage,
  onClose,
  motionSummary,
  fillHeight = true,
}: InspectorPanelProps) {
  const motionHelpId = useId()
  const selectedName = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id)?.name ?? 'the selected element'
  })
  const chrome = (
    <>
      {onBackToStage && (
        <div className="flex shrink-0 items-center gap-1 border-b border-ms-border px-1.5 py-1">
          <button
            type="button"
            data-testid="btn-inspector-back-to-stage"
            onClick={onBackToStage}
            className="inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-900/[0.06]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Stage
          </button>
        </div>
      )}
      {onClose && (
        <div className="flex shrink-0 items-center justify-end border-b border-ms-border px-1.5 py-1">
          <button
            type="button"
            data-testid="btn-close-inspector"
            aria-label="Close inspector"
            title="Close inspector"
            onClick={onClose}
            className="inline-flex h-8 min-h-8 items-center rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-900/[0.06]"
          >
            Close
          </button>
        </div>
      )}
      <div
        role="tablist"
        aria-label="Inspector"
        className="flex shrink-0 items-center gap-0.5 border-b border-ms-border p-1.5"
      >
        <button
          type="button"
          role="tab"
          id="inspector-tab-style"
          data-testid="btn-inspector-style"
          aria-selected={tab === 'style'}
          aria-controls="inspector-style-body"
          tabIndex={tab === 'style' ? 0 : -1}
          onClick={() => onTabChange('style')}
          className={tab === 'style' ? tabActive : tabIdle}
        >
          Style
        </button>
        <button
          type="button"
          role="tab"
          id="inspector-tab-motion"
          data-testid="btn-inspector-motion"
          aria-selected={tab === 'motion'}
          aria-controls="inspector-motion-body"
          tabIndex={tab === 'motion' ? 0 : -1}
          onClick={() => onTabChange('motion')}
          className={tab === 'motion' ? tabActive : tabIdle}
        >
          Motion
        </button>
        <button
          type="button"
          role="tab"
          id="inspector-tab-project"
          data-testid="btn-inspector-project"
          aria-selected={tab === 'project'}
          aria-controls="inspector-project-body"
          tabIndex={tab === 'project' ? 0 : -1}
          onClick={() => onTabChange('project')}
          className={tab === 'project' ? tabActive : tabIdle}
        >
          Project
        </button>
      </div>
    </>
  )

  return (
    <aside
      data-testid="inspector-panel"
      data-inspector-tab={tab}
      className={
        fillHeight
          ? 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent'
          : 'flex min-h-0 min-w-0 flex-col bg-transparent'
      }
    >
      {fillHeight ? (
        chrome
      ) : (
        <div className="sticky top-0 z-[1] shrink-0 bg-white">{chrome}</div>
      )}
      <div
        className={
          fillHeight
            ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
            : 'min-h-0'
        }
      >
        {tab === 'style' && (
          <div
            role="tabpanel"
            id="inspector-style-body"
            data-testid="inspector-style-body"
            aria-labelledby="inspector-tab-style"
            className="contents"
          >
            <AppearancePanel />
          </div>
        )}
        {tab === 'motion' && (
          <div
            role="tabpanel"
            id="inspector-motion-body"
            data-testid="inspector-motion-body"
            aria-labelledby="inspector-tab-motion"
            className="divide-y divide-ms-border"
          >
            <div className="space-y-2 px-2.5 pt-2">
              <HelpDisclosure
                id={motionHelpId}
                testId="inspector-motion-help"
                summary="About Motion"
              >
                <p>
                  Adjusting{' '}
                  <span className="font-medium text-slate-700">
                    {selectedName}
                  </span>
                  . Duration is shared project playback time (scales Timing).
                  Smoothing reduces path wobble. Steady Speed evens movement
                  while keeping pauses — Glide eases starts/stops afterward.
                  Loop Repeat restarts (may jump); Back and forth alternates
                  with no jump.
                </p>
                <p className="mt-1.5">
                  Polish keeps pauses and corners; Glide softens starts and
                  stops. Snap stays next to Record and Play.
                </p>
                <p className="mt-1.5">
                  Import SVG path sets or replaces the path for {selectedName}{' '}
                  from one local SVG file. Preview on the stage, nudge if needed,
                  then apply. Uses project Duration; appearance stays the same;
                  movement is even-speed by default.
                </p>
              </HelpDisclosure>
            </div>
            <AdjustPanel showHelp={false} motionHelpId={motionHelpId} />
            <div
              data-testid="motion-tools-section-chrome"
              className="px-2.5 pb-2.5 pt-2"
            >
              <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold text-ms-motion">
                <span>Motion tools</span>
                {motionSummary ? (
                  <span
                    data-testid="adjust-summary"
                    className="font-medium tabular-nums text-ms-ink"
                  >
                    {motionSummary}
                  </span>
                ) : null}
              </h3>
              <MotionToolsSection showHelp={false} />
            </div>
          </div>
        )}
        {tab === 'project' && (
          <div
            role="tabpanel"
            id="inspector-project-body"
            data-testid="inspector-project-body"
            aria-labelledby="inspector-tab-project"
            className="contents"
          >
            <div data-testid="project-menu">
              <ProjectPanel />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
