import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  ConfirmContext,
  type ConfirmFn,
  type ConfirmRequest,
} from './confirmContext'

type Pending = ConfirmRequest & {
  resolve: (value: boolean | null) => void
  /** Control that opened the dialog — restored after close (incl. Escape). */
  opener: HTMLElement | null
}

/**
 * App-wide confirmation dialogs (replaces window.confirm).
 * Mount once near the editor root; call useConfirm() from children.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const settle = useCallback((value: boolean | null) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(value)
  }, [])

  const confirm = useCallback<ConfirmFn>((request) => {
    return new Promise<boolean | null>((resolve) => {
      // Replace any prior pending prompt (should not overlap in practice).
      if (pendingRef.current) {
        pendingRef.current.resolve(false)
      }
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      // `body` / `html` are useless restore targets (common after WebKit clicks).
      const activeOpener =
        active &&
        active !== document.body &&
        active !== document.documentElement
          ? active
          : null
      const opener = request.returnFocus ?? activeOpener
      openerRef.current = opener
      const next: Pending = { ...request, resolve, opener }
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
        initialFocus={pending?.initialFocus}
        testId={pending?.testId}
        confirmTestId={pending?.confirmTestId}
        cancelTestId={pending?.cancelTestId}
        bodyTestId={pending?.bodyTestId}
        returnFocusRef={openerRef}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
        onPassiveDismiss={() =>
          settle(pendingRef.current?.passiveDismiss === 'abort' ? null : false)
        }
      />
    </ConfirmContext.Provider>
  )
}
