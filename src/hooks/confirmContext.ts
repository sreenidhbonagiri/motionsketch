import { createContext, type ReactNode } from 'react'

export type ConfirmRequest = {
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  /**
   * Which action receives initial focus. Default `cancel` (safer for destructive
   * confirms). Use `confirm` when cancel discards work (e.g. tutorial Keep).
   */
  initialFocus?: 'confirm' | 'cancel'
  /**
   * Escape / backdrop behavior. Default `cancel` (same as the Cancel button).
   * Use `abort` when passive dismissal must leave the caller unchanged
   * (tutorial Keep/Restore — Escape returns to the tutorial).
   */
  passiveDismiss?: 'cancel' | 'abort'
  /**
   * Prefer this over `document.activeElement` (WebKit Playwright clicks often
   * leave focus on `body`, so Escape restore would miss the opener).
   */
  returnFocus?: HTMLElement | null
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
  bodyTestId?: string
}

/**
 * `true` = confirm, `false` = cancel button, `null` = passive dismiss when
 * `passiveDismiss: 'abort'` (Escape / backdrop).
 */
export type ConfirmResult = boolean | null

export type ConfirmFn = (request: ConfirmRequest) => Promise<ConfirmResult>

export const ConfirmContext = createContext<ConfirmFn | null>(null)
