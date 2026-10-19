declare module 'ms-scene/MotionSketchScene' {
  import type { CSSProperties, ReactElement } from 'react'

  export type MotionSketchSceneProps = {
    className?: string
    style?: CSSProperties
    showControls?: boolean
  }

  export function MotionSketchScene(
    props: MotionSketchSceneProps,
  ): ReactElement

  export default MotionSketchScene
}
