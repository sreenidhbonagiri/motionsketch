import { describe, expect, it } from 'vitest'
import {
  cameraCssTransform,
  fitCamera,
  fitStageLayoutSize,
  formatZoomPercent,
  isBackgroundPanTarget,
  isSpacePanBlockedTarget,
  panCamera,
  preserveCameraCenterOnLayoutChange,
  zoomCameraAt,
  zoomCameraAtCenter,
} from '../../src/core/camera'
import { clientToNormalized } from '../../src/core/coords'

/** Simulated stage-frame rect after CSS camera (for round-trip checks). */
function stageRectFromCamera(
  viewportLeft: number,
  viewportTop: number,
  layout: { width: number; height: number },
  camera: { zoom: number; panX: number; panY: number },
) {
  return {
    left: viewportLeft + camera.panX,
    top: viewportTop + camera.panY,
    width: layout.width * camera.zoom,
    height: layout.height * camera.zoom,
  }
}

describe('workspace camera', () => {
  const viewport = { width: 1000, height: 600 }

  it('fits a stage frame to export aspect with padding', () => {
    const layout = fitStageLayoutSize(viewport, 16 / 10)
    expect(layout.width / layout.height).toBeCloseTo(1.6, 5)
    expect(layout.width).toBeLessThanOrEqual(viewport.width * 0.9 + 1e-6)
    expect(layout.height).toBeLessThanOrEqual(viewport.height * 0.9 + 1e-6)
    const cam = fitCamera(viewport, layout)
    expect(cam.zoom).toBe(1)
    expect(cam.panX).toBeCloseTo((viewport.width - layout.width) / 2)
    expect(cam.panY).toBeCloseTo((viewport.height - layout.height) / 2)
  })

  it('zooms around a pointer without drifting that world point', () => {
    const layout = fitStageLayoutSize(viewport, 1.6)
    let cam = fitCamera(viewport, layout)
    const vx = 400
    const vy = 250
    const beforeX = (vx - cam.panX) / cam.zoom
    const beforeY = (vy - cam.panY) / cam.zoom
    cam = zoomCameraAt(cam, 2, vx, vy)
    expect(cam.zoom).toBe(2)
    expect((vx - cam.panX) / cam.zoom).toBeCloseTo(beforeX)
    expect((vy - cam.panY) / cam.zoom).toBeCloseTo(beforeY)
  })

  it('button zoom uses the viewport center', () => {
    const layout = fitStageLayoutSize(viewport, 1)
    let cam = fitCamera(viewport, layout)
    const cx = viewport.width / 2
    const cy = viewport.height / 2
    const beforeX = (cx - cam.panX) / cam.zoom
    cam = zoomCameraAtCenter(cam, 1.25, viewport)
    expect((cx - cam.panX) / cam.zoom).toBeCloseTo(beforeX)
  })

  it('pans in viewport pixels', () => {
    const cam = panCamera({ zoom: 1, panX: 10, panY: 20 }, 5, -3)
    expect(cam.panX).toBe(15)
    expect(cam.panY).toBe(17)
  })

  it('preserves the normalized point under the viewport center on resize', () => {
    const oldLayout = fitStageLayoutSize(viewport, 1.6)
    let cam = fitCamera(viewport, oldLayout)
    cam = zoomCameraAtCenter(cam, 2, viewport)
    const newViewport = { width: 800, height: 500 }
    const newLayout = fitStageLayoutSize(newViewport, 1.6)
    const next = preserveCameraCenterOnLayoutChange(
      cam,
      oldLayout,
      newLayout,
      viewport,
      newViewport,
    )
    const cx = newViewport.width / 2
    const cy = newViewport.height / 2
    const oldCx = viewport.width / 2
    const oldCy = viewport.height / 2
    const oldNormX = (oldCx - cam.panX) / (cam.zoom * oldLayout.width)
    const oldNormY = (oldCy - cam.panY) / (cam.zoom * oldLayout.height)
    const newNormX = (cx - next.panX) / (next.zoom * newLayout.width)
    const newNormY = (cy - next.panY) / (next.zoom * newLayout.height)
    expect(newNormX).toBeCloseTo(oldNormX, 5)
    expect(newNormY).toBeCloseTo(oldNormY, 5)
  })

  it('round-trips client → normalized under pan/zoom via stage-frame rect', () => {
    const layout = { width: 400, height: 250 }
    const camera = { zoom: 1.5, panX: 80, panY: 40 }
    const rect = stageRectFromCamera(0, 0, layout, camera)
    const client = { x: 200, y: 120 }
    const norm = clientToNormalized(client.x, client.y, rect)
    const back = {
      x: rect.left + norm.x * rect.width,
      y: rect.top + norm.y * rect.height,
    }
    expect(back.x).toBeCloseTo(client.x, 5)
    expect(back.y).toBeCloseTo(client.y, 5)
    expect(clientToNormalized(rect.left, rect.top, rect)).toEqual({
      x: 0,
      y: 0,
    })
    expect(
      clientToNormalized(rect.left + rect.width, rect.top + rect.height, rect),
    ).toEqual({ x: 1, y: 1 })
  })

  it('formats zoom percent and CSS transform', () => {
    expect(formatZoomPercent(1)).toBe('100%')
    expect(formatZoomPercent(1.25)).toBe('125%')
    expect(cameraCssTransform({ zoom: 2, panX: 3, panY: 4 })).toBe(
      'translate(3px, 4px) scale(2)',
    )
  })

  it('blocks Space pan while focus is in form controls', () => {
    const input = document.createElement('input')
    expect(isSpacePanBlockedTarget(input)).toBe(true)
    const div = document.createElement('div')
    expect(isSpacePanBlockedTarget(div)).toBe(false)
  })

  it('treats empty stage canvas as a pan target, not actors or handles', () => {
    const stage = document.createElement('div')
    stage.setAttribute('data-testid', 'stage')
    const frame = document.createElement('div')
    frame.setAttribute('data-testid', 'stage-frame')
    const canvas = document.createElement('canvas')
    const actor = document.createElement('div')
    actor.setAttribute('data-testid', 'actor')
    const handle = document.createElement('button')
    handle.setAttribute('data-testid', 'path-handle-3')
    stage.appendChild(frame)
    frame.appendChild(canvas)
    frame.appendChild(actor)
    frame.appendChild(handle)
    document.body.appendChild(stage)

    expect(isBackgroundPanTarget(canvas)).toBe(true)
    expect(isBackgroundPanTarget(frame)).toBe(true)
    expect(isBackgroundPanTarget(actor)).toBe(false)
    expect(isBackgroundPanTarget(handle)).toBe(false)
    expect(
      isBackgroundPanTarget(canvas, { excludeStageFrame: true }),
    ).toBe(false)

    stage.remove()
  })
})
