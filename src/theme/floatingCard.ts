/**
 * Shared chrome for desktop floating workspace cards (Elements, Inspector).
 * Keep both panels on this single style — do not fork another panel system.
 */
export const floatingWorkspaceCardClass =
  'pointer-events-auto h-fit max-h-full min-h-0 w-full overflow-y-auto overscroll-contain rounded-[12px] border border-ms-border/70 bg-white shadow-[var(--ms-shadow)]'

export const floatingWorkspaceCardSlotClass =
  'pointer-events-none absolute bottom-2 top-2 z-[40] flex max-w-full flex-col justify-start'

/** Desktop Elements floating card width (16rem). */
export const FLOATING_ELEMENTS_WIDTH_CLASS =
  'left-2 w-[min(16rem,calc(100%-1rem))]'

/**
 * Desktop Inspector floating card width (~260px / 16.25rem).
 * Wide enough for Style/Motion/Project tabs and color/size controls.
 */
export const FLOATING_INSPECTOR_WIDTH_CLASS =
  'right-2 w-[min(16.25rem,calc(100%-1rem))]'

/**
 * Camera-bar right offset while the Inspector card is open
 * (card 16.25rem + right-2 0.5rem + ~0.75rem gap).
 */
export const FLOATING_INSPECTOR_CAMERA_BAR_RIGHT_CLASS =
  'right-[min(17.5rem,calc(100%-0.25rem))]'

/** Nominal CSS widths used to decide when both cards leave too little stage. */
export const FLOATING_ELEMENTS_WIDTH_PX = 256
export const FLOATING_INSPECTOR_WIDTH_PX = 260
/** left-2 + right-2 outer gaps */
export const FLOATING_SIDE_GAP_PX = 16
/** Minimum clear stage width between both floating cards. */
export const MIN_FLOATING_CLEAR_STAGE_PX = 300

/** Viewport must be at least this wide to float both cards together. */
export const MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX =
  FLOATING_ELEMENTS_WIDTH_PX +
  FLOATING_INSPECTOR_WIDTH_PX +
  FLOATING_SIDE_GAP_PX +
  MIN_FLOATING_CLEAR_STAGE_PX

export function canFloatBothWorkspaceCards(viewportWidthPx: number): boolean {
  return viewportWidthPx >= MIN_WIDTH_FOR_BOTH_FLOATING_CARDS_PX
}
