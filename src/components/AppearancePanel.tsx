import { useId, useRef, useState } from 'react'
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE_PX,
  loadActorImageFromFile,
} from '../core/imageAsset'
import {
  MAX_ACTOR_SIZE,
  MIN_ACTOR_SIZE,
} from '../core/types'
import { useEditorStore } from '../state/store'
import { TransformSection } from './TransformSection'

function formatSizePercent(size: number): string {
  return `${Math.round(size * 100)}% of stage`
}

function formatCornerLabel(radius: number): string {
  if (radius <= 0.01) return 'Square'
  if (radius >= 0.99) return 'Circle'
  return `${Math.round(radius * 100)}%`
}

export function AppearancePanel() {
  const actor = useEditorStore((s) => {
    const id = s.selectedActorId
    return (
      s.project.actors.find((a) => a.id === id)?.appearance ??
      s.project.actors[0]?.appearance
    )
  })
  const selectedName = useEditorStore((s) => {
    const id = s.selectedActorId
    return s.project.actors.find((a) => a.id === id)?.name ?? 'Actor'
  })
  const setActorColor = useEditorStore((s) => s.setActorColor)
  const setActorSize = useEditorStore((s) => s.setActorSize)
  const setActorBorderRadius = useEditorStore((s) => s.setActorBorderRadius)
  const setActorKind = useEditorStore((s) => s.setActorKind)
  const setActorImage = useEditorStore((s) => s.setActorImage)
  const clearActorImage = useEditorStore((s) => s.clearActorImage)
  const setActorImageLabel = useEditorStore((s) => s.setActorImageLabel)

  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const kindGroupId = useId()

  if (!actor) {
    return (
      <div data-testid="appearance-panel" className="p-3 text-sm text-slate-500">
        No actor selected.
      </div>
    )
  }

  const actorSize = actor.width

  const pickFile = () => {
    fileRef.current?.click()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setStatus('Loading image…')
    const result = await loadActorImageFromFile(file)
    setBusy(false)
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    setActorImage(result.asset)
    setStatus(`Loaded “${result.asset.label}”.`)
  }

  return (
    <div data-testid="appearance-panel" className="space-y-4 p-3">
      <p className="text-xs text-slate-500">
        Editing <span className="font-medium text-slate-700">{selectedName}</span>
      </p>
      <fieldset data-testid="actor-kind-fieldset" className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">Actor type</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              data-testid="actor-kind-shape"
              type="radio"
              name={kindGroupId}
              checked={actor.kind === 'shape'}
              onChange={() => {
                setActorKind('shape')
                setStatus(null)
              }}
              className="size-3.5 accent-teal-700"
            />
            Shape
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              data-testid="actor-kind-image"
              type="radio"
              name={kindGroupId}
              checked={actor.kind === 'image'}
              disabled={!actor.image && actor.kind !== 'image'}
              onChange={() => {
                if (actor.image) setActorKind('image')
              }}
              className="size-3.5 accent-teal-700 disabled:opacity-40"
            />
            Image
          </label>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Shape color and corners are kept when you switch to Image, then restored
          when you switch back.
        </p>
      </fieldset>

      <div data-testid="actor-panel" className="space-y-3">
        {/* Shared size — center and path stay fixed when resizing */}
        <div className="space-y-2">
          <label
            htmlFor="actor-size-slider"
            className="flex items-center justify-between text-sm text-slate-600"
          >
            <span>Size</span>
            <span data-testid="actor-size-value">
              {formatSizePercent(actorSize)}
            </span>
          </label>
          <input
            id="actor-size-slider"
            data-testid="actor-size-slider"
            type="range"
            min={MIN_ACTOR_SIZE}
            max={MAX_ACTOR_SIZE}
            step={0.01}
            value={actorSize}
            aria-describedby="actor-size-help"
            onChange={(e) => setActorSize(Number(e.target.value))}
            className="w-full accent-teal-700"
          />
          <p
            id="actor-size-help"
            data-testid="actor-size-help"
            className="text-xs leading-relaxed text-slate-500"
          >
            Longer edge of the actor box, as a fraction of the stage’s shorter
            side. Images keep their proportions inside that box. Center stays
            fixed.
          </p>
        </div>

        {actor.kind === 'shape' && (
          <>
            <div className="space-y-2">
              <label
                htmlFor="actor-color"
                className="flex items-center justify-between gap-2 text-sm text-slate-600"
              >
                <span>Color</span>
                <span
                  data-testid="actor-color-value"
                  className="font-mono text-xs"
                >
                  {actor.color}
                </span>
              </label>
              <input
                id="actor-color"
                data-testid="actor-color"
                type="color"
                value={actor.color}
                aria-describedby="actor-color-help"
                onChange={(e) => setActorColor(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
              />
              <p
                id="actor-color-help"
                className="text-xs leading-relaxed text-slate-500"
              >
                Fill color of the tile.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="actor-radius-slider"
                className="flex items-center justify-between text-sm text-slate-600"
              >
                <span>Corners</span>
                <span data-testid="actor-radius-value">
                  {formatCornerLabel(actor.borderRadius)}
                </span>
              </label>
              <input
                id="actor-radius-slider"
                data-testid="actor-radius-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={actor.borderRadius}
                aria-describedby="actor-radius-help"
                onChange={(e) => setActorBorderRadius(Number(e.target.value))}
                className="w-full accent-teal-700"
              />
              <p
                id="actor-radius-help"
                className="text-xs leading-relaxed text-slate-500"
              >
                Square through fully round.
              </p>
            </div>
          </>
        )}

        <div
            data-testid="actor-image-section"
            className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
          >
            <p className="text-sm font-medium text-slate-800">Image</p>
            <p className="text-xs leading-relaxed text-slate-500">
              PNG, JPEG, WebP, or SVG from this device. Max{' '}
              {(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(1)} MB and{' '}
              {MAX_IMAGE_EDGE_PX}×{MAX_IMAGE_EDGE_PX}px. SVGs must be static
              (no scripts or external links) and render as an image, not live
              markup.
            </p>

            {actor.image && (
              <div className="flex items-center gap-3">
                <img
                  data-testid="actor-image-preview"
                  src={actor.image.dataUrl}
                  alt=""
                  className="size-14 rounded-md border border-slate-200 bg-white object-contain"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <label
                    htmlFor="actor-image-label"
                    className="text-xs text-slate-600"
                  >
                    Label
                  </label>
                  <input
                    id="actor-image-label"
                    data-testid="actor-image-label"
                    type="text"
                    value={actor.image.label}
                    maxLength={64}
                    onChange={(e) => setActorImageLabel(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
                  />
                  <p
                    data-testid="actor-image-meta"
                    className="text-xs text-slate-500"
                  >
                    {actor.image.naturalWidth}×{actor.image.naturalHeight} ·{' '}
                    {actor.image.mimeType.replace('image/', '')}
                  </p>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              data-testid="actor-image-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void onFile(file)
              }}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="btn-upload-image"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  pickFile()
                }}
                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
              >
                {actor.image ? 'Replace image' : 'Upload image'}
              </button>
              {actor.image && (
                <button
                  type="button"
                  data-testid="btn-remove-image"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    clearActorImage()
                    setStatus('Image removed. Back to shape.')
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Remove image
                </button>
              )}
            </div>

            {status && (
              <p
                data-testid="actor-image-status"
                role="status"
                className="text-xs text-slate-600"
              >
                {status}
              </p>
            )}
        </div>

        <TransformSection />
      </div>
    </div>
  )
}
