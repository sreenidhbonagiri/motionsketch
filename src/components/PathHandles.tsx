import type { PointerEventHandler } from 'react'
import type { MotionSample } from '../core/types'

interface PathHandlesProps {
  samples: MotionSample[]
  handleIndices: number[]
  selectedIndex: number | null
  /** Ghost sample while Add point mode is active. */
  candidateIndex?: number | null
  addMode?: boolean
  onHandlePointerDown: (
    handleIndex: number,
    event: Parameters<PointerEventHandler<HTMLButtonElement>>[0],
  ) => void
}

export function PathHandles({
  samples,
  handleIndices,
  selectedIndex,
  candidateIndex = null,
  addMode = false,
  onHandlePointerDown,
}: PathHandlesProps) {
  const candidateSample =
    candidateIndex !== null &&
    !handleIndices.includes(candidateIndex) &&
    samples[candidateIndex]
      ? samples[candidateIndex]
      : null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-testid="path-handles"
      data-add-mode={addMode ? 'true' : 'false'}
      role="group"
      aria-label="Path handles"
    >
      {candidateSample && candidateIndex !== null && (
        <div
          data-testid="path-add-candidate"
          data-candidate-sample-index={candidateIndex}
          data-sample-x={candidateSample.x}
          data-sample-y={candidateSample.y}
          aria-hidden
          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-ms-primary bg-ms-selected/80"
          style={{
            left: `${candidateSample.x * 100}%`,
            top: `${candidateSample.y * 100}%`,
          }}
        />
      )}
      {handleIndices.map((index, ordinal) => {
        const sample = samples[index]
        if (!sample) return null
        const selected = selectedIndex === index
        const endpoint = index === 0 || index === samples.length - 1
        return (
          <button
            key={index}
            type="button"
            data-testid={`path-handle-${index}`}
            data-handle-index={index}
            data-handle-ordinal={ordinal + 1}
            data-endpoint={endpoint ? 'true' : 'false'}
            data-sample-x={sample.x}
            data-sample-y={sample.y}
            aria-label={`Point ${ordinal + 1} of ${handleIndices.length}${endpoint ? ' (endpoint)' : ''}`}
            aria-pressed={selected}
            aria-current={selected ? 'true' : undefined}
            tabIndex={selected ? 0 : -1}
            className={`pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 shadow-sm transition ${
              selected
                ? 'z-10 border-ms-primary-pressed bg-white ring-2 ring-ms-primary/40 ring-offset-1 ring-offset-ms-canvas'
                : 'border-ms-primary bg-white hover:border-ms-primary-hover'
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
