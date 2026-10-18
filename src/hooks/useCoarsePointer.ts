import { useEffect, useState } from 'react'

/** True when the primary pointer is coarse (typical touch), not hover-only. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(pointer: coarse)').matches
  })

  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    const onChange = () => setCoarse(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return coarse
}
