import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  ConfirmContext,
  type ConfirmFn,
  type ConfirmRequest,
} from './confirmContext'

type Pending = ConfirmRequest & {
  resolve: (value: boolean) => void
}

/**
 * App-wide confirmation dialogs (replaces window.confirm).
 * Mount once near the editor root; call useConfirm() from children.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(value)
  }, [])

  const confirm = useCallback<ConfirmFn>((request) => {
    return new Promise<boolean>((resolve) => {
      // Replace any prior pending prompt (should not overlap in practice).
      if (pendingRef.current) {
        pendingRef.current.resolve(false)
      }
      const next: Pending = { ...request, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        body={pending?.body ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        cancelLabel={pending?.cancelLabel}
        danger={pending?.danger}
        testId={pending?.testId}
        confirmTestId={pending?.confirmTestId}
        cancelTestId={pending?.cancelTestId}
        bodyTestId={pending?.bodyTestId}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}
