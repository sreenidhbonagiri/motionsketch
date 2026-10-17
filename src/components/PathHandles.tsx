import type { PointerEventHandler } from 'react'
import type { MotionSample } from '../core/types'

interface PathHandlesProps {
  samples: MotionSample[]
  handleIndices: number[]
  selectedIndex: number | null
  onHandlePointerDown: (
    handleIndex: number,
    event: Parameters<PointerEventHandler<HTMLButtonElement>>[0],
  ) => void
}

export function PathHandles({
  samples,
  handleIndices,
  selectedIndex,
  onHandlePointerDown,
}: PathHandlesProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-testid="path-handles">
      {handleIndices.map((index) => {
        const sample = samples[index]
        if (!sample) return null
        const selected = selectedIndex === index
        return (
          <button
            key={index}
            type="button"
            data-testid={`path-handle-${index}`}
            data-handle-index={index}
            aria-label={`Path handle ${index + 1} of ${handleIndices.length}`}
            aria-pressed={selected}
            tabIndex={0}
            className={`pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 shadow-sm transition ${
              selected
                ? 'border-indigo-700 bg-white ring-2 ring-indigo-300'
                : 'border-indigo-500 bg-white hover:border-indigo-600'
            }`}
            style={{
              left: `${sample.x * 100}%`,
              top: `${sample.y * 100}%`,
            }}
            onPointerDown={(e) => onHandlePointerDown(index, e)}
          />
        )
      })}
    </div>
  )
}
