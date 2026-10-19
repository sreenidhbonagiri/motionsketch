import { useState } from 'react'
import { MotionSketchScene } from 'ms-scene/MotionSketchScene'

/**
 * Small host that exercises Strict Mode (via main.tsx), remount, and
 * multiple scene instances against a generated React package in ../scene.
 */
export function App() {
  const [mounted, setMounted] = useState(true)
  const [second, setSecond] = useState(false)

  return (
    <div
      data-testid="react-consumer-app"
      style={{
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="btn-toggle-mount"
          onClick={() => setMounted((v) => !v)}
        >
          {mounted ? 'Unmount scene' : 'Mount scene'}
        </button>
        <button
          type="button"
          data-testid="btn-toggle-second"
          onClick={() => setSecond((v) => !v)}
        >
          {second ? 'Hide second' : 'Show second'}
        </button>
      </div>
      {mounted ? (
        <div data-testid="react-consumer-primary">
          <MotionSketchScene />
        </div>
      ) : null}
      {second ? (
        <div data-testid="react-consumer-secondary">
          <MotionSketchScene />
        </div>
      ) : null}
    </div>
  )
}
