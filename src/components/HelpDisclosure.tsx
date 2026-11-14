import type { ReactNode } from 'react'

/**
 * Collapses long inspector explanations behind an accessible disclosure.
 * Help text stays in the DOM for aria-describedby.
 */
export function HelpDisclosure({
  id,
  testId,
  summary,
  children,
}: {
  id?: string
  testId?: string
  summary: string
  children: ReactNode
}) {
  return (
    <details data-testid={testId} className="group ms-caption">
      <summary className="cursor-pointer select-none font-medium text-slate-700 outline-none hover:text-slate-900 focus-visible:text-slate-900">
        {summary}
      </summary>
      <div id={id} className="mt-1 leading-relaxed text-slate-600">
        {children}
      </div>
    </details>
  )
}
