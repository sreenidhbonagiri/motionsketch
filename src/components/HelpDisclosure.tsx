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
    <details className="group text-xs text-slate-500">
      <summary className="cursor-pointer select-none text-slate-600 outline-none hover:text-slate-800 focus-visible:text-slate-800">
        {summary}
      </summary>
      <div
        id={id}
        data-testid={testId}
        className="mt-1 leading-relaxed text-slate-500"
      >
        {children}
      </div>
    </details>
  )
}
