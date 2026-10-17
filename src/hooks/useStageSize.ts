import { useEffect, useState, type RefObject } from 'react'

export interface StageSize {
  width: number
  height: number
  dpr: number
}

export function useStageSize(ref: RefObject<HTMLElement | null>): StageSize {
  const [size, setSize] = useState<StageSize>({
    width: 0,
    height: 0,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({
        width: rect.width,
        height: rect.height,
        dpr: window.devicePixelRatio || 1,
      })
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(el)

    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref])

  return size
}
