import { ArrowLeft } from 'lucide-react'
import { AdjustPanel } from './AdjustPanel'
import { AppearancePanel } from './AppearancePanel'
import { MotionToolsSection } from './MotionToolsSection'
import { ProjectPanel } from './ProjectPanel'

export type InspectorTab = 'style' | 'motion' | 'project'

const tabBtn =
  'inline-flex h-8 min-h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition'
const tabIdle = `${tabBtn} text-slate-600 hover:bg-slate-900/[0.06]`
const tabActive = `${tabBtn} bg-slate-900/[0.08] text-slate-900 ring-1 ring-inset ring-slate-900/10`

interface InspectorPanelProps {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  /** Phone: leave the inspector and return to the stage. */
  onBackToStage?: () => void
  /** Desktop: close the docked inspector and return space to the canvas. */
  onClose?: () => void
  /** Optional duration chip on the Motion tab (was header Motion summary). */
  motionSummary?: string | null
}

/**
 * Docked right inspector: Style (Appearance), Motion (Adjust + tools), Project.
 * Same store actions and panel bodies as the former floating chrome.
 */
export function InspectorPanel({
  tab,
  onTabChange,
  onBackToStage,
  onClose,
  motionSummary,
}: InspectorPanelProps) {
  return (
    <aside
      data-testid="inspector-panel"
      data-inspector-tab={tab}
      className="flex h-full min-h-0 min-w-0 flex-col bg-white/90 md:border-l md:border-ms-border"
    >
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
          {motionSummary ? (
            <span
              data-testid="adjust-summary"
              className="rounded-md bg-slate-900/[0.06] px-1 py-px text-xs font-medium tabular-nums text-ms-ink"
            >
              {motionSummary}
            </span>
          ) : null}
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
        {onClose && (
          <button
            type="button"
            data-testid="btn-close-inspector"
            aria-label="Close inspector"
            title="Close inspector"
            onClick={onClose}
            className="ml-0.5 inline-flex h-8 min-h-8 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-900/[0.06]"
          >
            Close
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
            <AdjustPanel />
            <div
              data-testid="motion-tools-section-chrome"
              className="px-2.5 pb-2.5 pt-2"
            >
              <h3 className="mb-1.5 text-xs font-semibold text-ms-motion">
                Motion tools
              </h3>
              <MotionToolsSection />
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
