import { AdjustPanel } from './AdjustPanel'
import { AppearancePanel } from './AppearancePanel'
import { MotionToolsSection } from './MotionToolsSection'
import { ProjectPanel } from './ProjectPanel'

export type InspectorTab = 'style' | 'motion' | 'project'

const tabBtn =
  'inline-flex h-8 min-h-8 flex-1 items-center justify-center rounded-lg px-2 text-xs font-medium transition'
const tabIdle = `${tabBtn} text-slate-600 hover:bg-slate-900/[0.06]`
const tabActive = `${tabBtn} bg-slate-900/[0.08] text-slate-900`

interface InspectorPanelProps {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
}

/**
 * Docked right inspector: Style (Appearance), Motion (Adjust + tools), Project.
 * Same store actions and panel bodies as the former floating chrome.
 */
export function InspectorPanel({ tab, onTabChange }: InspectorPanelProps) {
  return (
    <aside
      data-testid="inspector-panel"
      data-inspector-tab={tab}
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-ms-border bg-white/90"
    >
      <div
        role="tablist"
        aria-label="Inspector"
        className="flex shrink-0 gap-0.5 border-b border-ms-border p-1.5"
      >
        <button
          type="button"
          role="tab"
          data-testid="btn-inspector-style"
          aria-selected={tab === 'style'}
          onClick={() => onTabChange('style')}
          className={tab === 'style' ? tabActive : tabIdle}
        >
          Style
        </button>
        <button
          type="button"
          role="tab"
          data-testid="btn-inspector-motion"
          aria-selected={tab === 'motion'}
          onClick={() => onTabChange('motion')}
          className={tab === 'motion' ? tabActive : tabIdle}
        >
          Motion
        </button>
        <button
          type="button"
          role="tab"
          data-testid="btn-inspector-project"
          aria-selected={tab === 'project'}
          onClick={() => onTabChange('project')}
          className={tab === 'project' ? tabActive : tabIdle}
        >
          Project
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'style' && (
          <div data-testid="inspector-style-body" className="contents">
            <AppearancePanel />
          </div>
        )}
        {tab === 'motion' && (
          <div data-testid="inspector-motion-body" className="space-y-1">
            <AdjustPanel />
            <div className="border-t border-ms-border px-3 pb-3 pt-2">
              <h3 className="mb-2 text-xs font-semibold text-slate-800">
                Motion tools
              </h3>
              <MotionToolsSection />
            </div>
          </div>
        )}
        {tab === 'project' && (
          <div data-testid="inspector-project-body" className="contents">
            <div data-testid="project-menu">
              <ProjectPanel />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
