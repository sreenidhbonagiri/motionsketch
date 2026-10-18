import { createContext, type ReactNode } from 'react'

export type ConfirmRequest = {
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  testId?: string
  confirmTestId?: string
  cancelTestId?: string
  bodyTestId?: string
}

export type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)
