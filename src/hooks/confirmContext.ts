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
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
  bodyTestId?: string
}

export type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)
