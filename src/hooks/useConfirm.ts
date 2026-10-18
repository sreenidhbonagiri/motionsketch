import { useContext } from 'react'
import { ConfirmContext, type ConfirmFn } from './confirmContext'

export type { ConfirmRequest } from './confirmContext'
export { ConfirmProvider } from './ConfirmProvider'

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return confirm
}
