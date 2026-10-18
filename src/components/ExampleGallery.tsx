import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EXAMPLE_CATALOG, type ExampleId } from '../examples/catalog'
import { cloneExampleProject, loadExampleSnapshot } from '../examples/load'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'
import { getAppPersistenceController } from '../lib/persistenceController'
import { useEditorStore } from '../state/store'
import { ExamplePreviewStage } from './ExamplePreviewStage'
import { ExampleThumbnail } from './ExampleThumbnail'

interface ExampleGalleryProps {
  onClose: () => void
}

function findBuild(id: ExampleId) {
  const def = EXAMPLE_CATALOG.find((e) => e.id === id)
  if (!def) throw new Error(`Unknown example ${id}`)
  return def.build()
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Mounted only while the gallery is open so local preview state resets cleanly.
 */
export function ExampleGallery({ onClose }: ExampleGalleryProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const [activeId, setActiveId] = useState<ExampleId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const project = useEditorStore((s) => s.project)
  const applyPersistedSnapshot = useEditorStore((s) => s.applyPersistedSnapshot)
  const announceAction = useEditorStore((s) => s.announceAction)

  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeBtnRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previouslyFocused.current?.focus()
      previouslyFocused.current = null
    }
  }, [onClose])

  // Simple focus trap within the gallery panel.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [])

  const previewProject = useMemo(
    () => (activeId ? cloneExampleProject(findBuild(activeId)) : null),
    [activeId],
  )

  const handleUse = (id: ExampleId) => {
    setError(null)
    if (projectHasMeaningfulWork(project)) {
      const ok = window.confirm(
        'Load this example? It replaces your current project, including actors, appearance, and motion.',
      )
      if (!ok) return
    }
    const loaded = loadExampleSnapshot(id)
    if (!loaded.ok) {
      setError(loaded.error)
      return
    }
    applyPersistedSnapshot(loaded.snapshot)
    getAppPersistenceController().afterSuccessfulReplace()
    announceAction(
      `Loaded example “${loaded.title}”. You can edit it like any project.`,
    )
    onClose()
  }

  return (
    <div
      data-testid="examples-gallery-root"
      className="pointer-events-auto fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/35 p-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        data-testid="examples-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92dvh,40rem)] w-[min(36rem,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold text-slate-900"
            >
              Examples
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Preview a starter scene, then load it as a normal editable project.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            data-testid="btn-close-examples"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {error && (
            <p
              data-testid="examples-error"
              className="mb-3 text-xs text-red-700"
            >
              {error}
            </p>
          )}

          <ul data-testid="examples-list" className="grid gap-3" role="list">
            {EXAMPLE_CATALOG.map((example) => {
              const selected = activeId === example.id
              return (
                <li
                  key={example.id}
                  data-testid={`example-card-${example.id}`}
                  className={`rounded-xl border p-3 transition ${
                    selected
                      ? 'border-slate-800 bg-slate-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                    <ExampleThumbnail
                      id={example.id}
                      label={example.thumbnailLabel}
                    />
                    <div className="flex min-w-0 flex-col gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {example.title}
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                          {example.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid={`btn-preview-${example.id}`}
                          aria-pressed={selected}
                          onClick={() =>
                            setActiveId((prev) =>
                              prev === example.id ? null : example.id,
                            )
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
                        >
                          {selected ? 'Hide preview' : 'Preview'}
                        </button>
                        <button
                          type="button"
                          data-testid={`btn-use-${example.id}`}
                          onClick={() => handleUse(example.id)}
                          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                        >
                          Use this example
                        </button>
                      </div>
                    </div>
                  </div>
                  {selected && previewProject && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <ExamplePreviewStage
                        key={example.id}
                        project={previewProject}
                        reducedMotion={reducedMotion}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
