import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EXAMPLE_CATALOG, type ExampleId } from '../examples/catalog'
import { cloneExampleProject, loadExampleSnapshot } from '../examples/load'
import { projectHasMeaningfulWork } from '../examples/meaningfulWork'
import { useConfirm } from '../hooks/useConfirm'
import { getAppPersistenceController } from '../lib/persistenceController'
import { blockProjectReplaceDuringTutorial } from '../lib/tutorialGuard'
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
  const confirm = useConfirm()

  useLayoutEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const examplesTrigger = document.querySelector(
      '[data-testid="btn-examples"]',
    )
    previouslyFocused.current =
      opener?.getAttribute('data-testid') === 'btn-examples'
        ? opener
        : examplesTrigger instanceof HTMLElement
          ? examplesTrigger
          : opener
    closeBtnRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const restore = previouslyFocused.current
      previouslyFocused.current = null
      // Defer restore; skip if the gallery remounted (React Strict Mode).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (
            restore &&
            document.contains(restore) &&
            !document.querySelector('[data-testid="examples-gallery"]')
          ) {
            restore.focus()
          }
        })
      })
    }
  }, [onClose])

  // Keep Tab inside the dialog. WebKit's sequential focus navigation can leave
  // the overlay without a full cycle trap (Chromium/Firefox follow DOM order).
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true' &&
          (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0),
      )
      if (focusable.length === 0) return
      const active = document.activeElement
      const index =
        active instanceof HTMLElement ? focusable.indexOf(active) : -1
      event.preventDefault()
      if (event.shiftKey) {
        const prev =
          index <= 0 ? focusable[focusable.length - 1]! : focusable[index - 1]!
        prev.focus()
      } else {
        const next =
          index >= focusable.length - 1
            ? focusable[0]!
            : focusable[index + 1]!
        next.focus()
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
    void (async () => {
      setError(null)
      if (await blockProjectReplaceDuringTutorial(confirm)) return
      if (projectHasMeaningfulWork(project)) {
        const ok = await confirm({
          title: 'Load this example?',
          body: 'It replaces your current project, including actors, appearance, and motion.',
          confirmLabel: 'Load example',
          testId: 'load-example-confirm',
          confirmTestId: 'btn-load-example-confirm',
          cancelTestId: 'btn-load-example-cancel',
          bodyTestId: 'load-example-confirm-copy',
        })
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
    })()
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
        className="flex max-h-[min(92dvh,40rem)] w-[min(36rem,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-2xl border border-ms-border bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
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
            className="shrink-0 rounded-lg border border-ms-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {error && (
            <p
              data-testid="examples-error"
              className="mb-3 text-xs text-ms-danger"
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
                      : 'border-ms-border bg-white'
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
                          className="rounded-lg border border-ms-border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
                        >
                          {selected ? 'Hide preview' : 'Preview'}
                        </button>
                        <button
                          type="button"
                          data-testid={`btn-use-${example.id}`}
                          onClick={() => handleUse(example.id)}
                          className="rounded-lg bg-ms-primary px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-ms-primary-hover"
                        >
                          Use this example
                        </button>
                      </div>
                    </div>
                  </div>
                  {selected && previewProject && (
                    <div className="mt-3 border-t border-ms-border pt-3">
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
