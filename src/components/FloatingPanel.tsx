import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '../state/store'

/** sm breakpoint — phone sheet keeps covering Fit; desktop clears the camera bar. */
const DESKTOP_PANEL_MQ = '(min-width: 640px)'
const PANEL_GAP_PX = 8
const PANEL_MAX_HEIGHT_PX = 32 * 16

export type ChromePanel =
  | 'project'
  | 'adjust'
  | 'appearance'
  | 'export'
  | 'help'

/**
 * After a chrome panel unmounts, return-focus to the opener only when focus
 * is still neutral (body / gone with the panel). If the user or a test already
 * moved focus elsewhere (e.g. the stage for Space play/pause), leave it alone —
 * double-rAF restore must not steal that focus back onto the opener button.
 */
export function shouldReturnFocusOnClose(
  active: Element | null,
  restore: HTMLElement,
): boolean {
  if (!restore.isConnected) return false
  if (
    !active ||
    active === document.body ||
    active === document.documentElement
  ) {
    return true
  }
  if (active === restore || restore.contains(active)) return true
  return false
}

type FocusVisibleOptions = FocusOptions & { focusVisible?: boolean }

/**
 * Restore focus to a chrome opener with an explicit `:focus-visible` intent.
 *
 * `focusVisible` must reflect close-time keyboard use (open-via-keyboard *or*
 * Tab/Arrow navigation while open) — not open modality alone. After a pure
 * pointer open → Escape, pass false so the closed opener has no ring.
 *
 * Chromium (and peers) ignore `focus({ focusVisible: false })` while the
 * element is already `:focus-visible` (Escape on a still-focused More button).
 * Blur only in that case; avoid cycling when a fresh focus() can apply the
 * option or when a keyboard ring should remain.
 */
export function focusOpener(el: HTMLElement, focusVisible: boolean): void {
  if (
    !focusVisible &&
    document.activeElement === el &&
    el.matches(':focus-visible')
  ) {
    el.blur()
  }
  el.focus({ preventScroll: true, focusVisible } as FocusVisibleOptions)
}

/** Whether `el` currently matches `:focus-visible` (keyboard-style focus). */
export function openerHadKeyboardFocus(el: Element | null): boolean {
  return el instanceof Element && el.matches(':focus-visible')
}

/** Keys that move focus inside an open panel/menu after a pointer open. */
export function isFocusNavigationKey(key: string): boolean {
  return (
    key === 'Tab' ||
    key === 'ArrowDown' ||
    key === 'ArrowUp' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Home' ||
    key === 'End'
  )
}

interface FloatingPanelProps {
  id: ChromePanel
  title: string
  open: boolean
  onClose: () => void
  /** Anchor side for desktop placement */
  align?: 'left' | 'right'
  children: ReactNode
  /** Optional summary line under the title (e.g. duration). */
  summary?: ReactNode
}

/**
 * Compact anchored contextual panel — shared treatment for Export / Help.
 * On sm+ viewports, top and max-height are measured so the panel clears the
 * camera bar and stops above the playback dock; extra content scrolls in the
 * body. On max-sm this stays a focused sheet between the header and safe-area
 * bottom (may cover Fit). Escape / Close dismiss without hitting the canvas.
 */
export function FloatingPanel({
  id,
  title,
  open,
  onClose,
  align = 'right',
  children,
  summary,
}: FloatingPanelProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  /** Open-via-keyboard *or* focus navigation while open (close-time intent). */
  const restoreFocusVisibleRef = useRef(false)
  /** Measured sm+ placement; null on phone so the focused sheet CSS applies. */
  const [desktopPlacement, setDesktopPlacement] = useState<{
    top: number
    maxHeight: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setDesktopPlacement(null)
      return
    }

    const measure = () => {
      const desktop = window.matchMedia(DESKTOP_PANEL_MQ).matches
      if (!desktop) {
        setDesktopPlacement(null)
        return
      }

      const cameraBar = document.querySelector(
        '[data-testid="workspace-camera-bar"]',
      )
      const header = document.querySelector('[data-testid="editor-header"]')
      const dock = document.querySelector('[data-testid="playback-dock"]')

      let clearTop = 56 + PANEL_GAP_PX
      if (cameraBar instanceof HTMLElement) {
        clearTop = Math.ceil(cameraBar.getBoundingClientRect().bottom) + PANEL_GAP_PX
      } else if (header instanceof HTMLElement) {
        clearTop = Math.ceil(header.getBoundingClientRect().bottom) + PANEL_GAP_PX
      }

      let bottomLimit = window.innerHeight - PANEL_GAP_PX
      if (dock instanceof HTMLElement) {
        bottomLimit = Math.floor(dock.getBoundingClientRect().top) - PANEL_GAP_PX
      }

      const maxHeight = Math.max(
        120,
        Math.min(PANEL_MAX_HEIGHT_PX, bottomLimit - clearTop),
      )
      setDesktopPlacement({ top: clearTop, maxHeight })
    }

    measure()
    const mq = window.matchMedia(DESKTOP_PANEL_MQ)
    mq.addEventListener('change', measure)
    window.addEventListener('resize', measure)
    const dock = document.querySelector('[data-testid="playback-dock"]')
    const bar = document.querySelector('[data-testid="workspace-camera-bar"]')
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(measure)
        : null
    if (dock) ro?.observe(dock)
    if (bar) ro?.observe(bar)
    return () => {
      mq.removeEventListener('change', measure)
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const trigger = document.querySelector(
      `[aria-controls="${id}-panel-root"]`,
    )
    const restoreTarget =
      trigger instanceof HTMLElement
        ? trigger
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
    returnFocusRef.current = restoreTarget
    // Seed from opener; Escape alone must not force a ring after pointer open,
    // but Tab (etc.) while open upgrades restore to keyboard-visible.
    restoreFocusVisibleRef.current = openerHadKeyboardFocus(restoreTarget)
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (isFocusNavigationKey(e.key)) {
        restoreFocusVisibleRef.current = true
      }
      if (e.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      const editor = useEditorStore.getState()
      if (editor.polishSession || editor.glideSession) return
      if (
        editor.mode === 'editing' &&
        (editor.pathGestureActive ||
          editor.editPreview !== null ||
          editor.pathAddMode)
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const restore = returnFocusRef.current
      const focusVisible = restoreFocusVisibleRef.current
      returnFocusRef.current = null
      restoreFocusVisibleRef.current = false
      const panelDomId = `${id}-panel-root`
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!restore || document.getElementById(panelDomId)) return
          if (!shouldReturnFocusOnClose(document.activeElement, restore)) {
            return
          }
          focusOpener(restore, focusVisible)
        })
      })
    }
  }, [open, onClose, id])

  if (!open) return null

  // Portal to body so header filters/stacking cannot trap position:fixed sheets.
  // Phone (max-sm): focused sheet via inset classes. sm+: measured top/maxHeight.
  const desktopStyle: CSSProperties | undefined = desktopPlacement
    ? {
        top: desktopPlacement.top,
        maxHeight: desktopPlacement.maxHeight,
      }
    : undefined
  const panel = (
    <div
      ref={panelRef}
      id={`${id}-panel-root`}
      data-testid={`${id}-panel-root`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={desktopStyle}
      className={`pointer-events-auto fixed z-40 flex flex-col overflow-hidden rounded-xl border border-ms-border bg-white/95 shadow-[var(--ms-shadow)] outline-none max-sm:inset-x-3 max-sm:top-14 max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:w-auto max-sm:max-h-none sm:w-[min(20rem,calc(100vw-1.5rem))] ${
        align === 'left' ? 'sm:left-3' : 'sm:right-3'
      } ${desktopPlacement ? '' : 'sm:top-14 sm:max-h-[min(32rem,calc(100dvh-6rem))]'}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 border-b border-ms-border py-2 pl-3 pr-14">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-sm font-semibold tracking-tight text-slate-800"
          >
            {title}
          </h2>
          {summary && (
            <div className="mt-0.5 text-xs text-slate-500">{summary}</div>
          )}
        </div>
      </div>
      <div
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
      >
        {children}
      </div>
      <button
        ref={closeRef}
        type="button"
        data-testid={`btn-close-${id}`}
        onClick={onClose}
        className="absolute top-2 right-2.5 inline-flex h-7 min-h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-900/[0.06] hover:text-slate-700"
      >
        Close
      </button>
    </div>
  )

  return createPortal(panel, document.body)
}
