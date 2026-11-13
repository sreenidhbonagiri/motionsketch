/**
 * Shared chrome for desktop floating workspace cards (Elements, Inspector).
 * Keep both panels on this single style — do not fork another panel system.
 */
export const floatingWorkspaceCardClass =
  'pointer-events-auto h-fit max-h-full min-h-0 w-full overflow-y-auto overscroll-contain rounded-[12px] border border-ms-border/70 bg-white shadow-[var(--ms-shadow)]'

export const floatingWorkspaceCardSlotClass =
  'pointer-events-none absolute bottom-2 top-2 z-[40] flex max-w-full flex-col justify-start'
