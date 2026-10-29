import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildProjectCssExport } from '../core/export/css'
import { buildHtmlDemoFromProject } from '../core/export/htmlDemo'
import { buildOwnElementExport } from '../core/export/ownElement'
import {
  buildReactPackage,
  REACT_PACKAGE_COMPONENT_NAME,
  REACT_PACKAGE_CSS_NAME,
  REACT_PACKAGE_TRIGGER_JS_NAME,
} from '../core/export/reactPackage'
import {
  buildWebPackage,
  describeWebPackageIntegration,
  WEB_PACKAGE_CSS_NAME,
  WEB_PACKAGE_HTML_NAME,
  WEB_PACKAGE_TRIGGER_JS_NAME,
} from '../core/export/webPackage'
import {
  PLAYBACK_TRIGGERS,
  coercePlaybackTrigger,
  triggerHelpText,
  triggerNeedsJavaScript,
  type PlaybackTrigger,
} from '../core/export/triggers'
import {
  downloadBlob,
  downloadTextFile,
  stampProjectFilename,
} from '../lib/download'
import { copyText } from '../lib/clipboard'
import { findActor, projectHasAnyRecording } from '../core/sceneActor'
import { useProjectPersistence } from '../hooks/useProjectPersistence'
import { useEditorStore } from '../state/store'

type OwnCopyKind = 'css' | 'html' | 'react' | 'trigger'
type WebsitePath = 'html' | 'react'
type HtmlSectionCopy = 'head' | 'body' | 'scripts'

export function ExportPanel() {
  const project = useEditorStore((s) => s.project)
  const selectedActorId = useEditorStore((s) => s.selectedActorId)
  const announceAction = useEditorStore((s) => s.announceAction)
  const setPlaybackTrigger = useEditorStore((s) => s.setPlaybackTrigger)
  const { downloadCurrentProject } = useProjectPersistence()

  const [copiedInline, setCopiedInline] = useState(false)
  const [copiedDialog, setCopiedDialog] = useState(false)
  const [ownCopied, setOwnCopied] = useState<OwnCopyKind | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [packaging, setPackaging] = useState<null | 'web' | 'react'>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [websitePath, setWebsitePath] = useState<WebsitePath>('html')
  const [webDownloadSuccess, setWebDownloadSuccess] = useState(false)
  const [htmlSectionCopied, setHtmlSectionCopied] =
    useState<HtmlSectionCopy | null>(null)
  const triggerRegenHelpId = useId()
  const playButtonHelpId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previewRef = useRef<HTMLDialogElement>(null)
  const viewBtnRef = useRef<HTMLButtonElement>(null)
  const codeRef = useRef<HTMLTextAreaElement>(null)
  const htmlGuideRef = useRef<HTMLDivElement>(null)
  const downloadSuccessRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const packageStatusId = useId()
  const reactPackageStatusId = useId()
  const triggerHelpId = useId()
  const previewTitleId = useId()
  const embedHeadingId = useId()
  const websiteLimitsId = useId()
  const ownElementHeadingId = useId()
  const ownElementHelpId = useId()
  const projectHeadingId = useId()
  const projectHelpId = useId()
  const projectActionHelpId = useId()
  const advancedHeadingId = useId()
  const advancedHelpId = useId()
  const previewTriggerHelpId = useId()
  const cssFileHelpId = useId()
  const cssCodeHelpId = useId()
  const htmlDemoHelpId = useId()
  const packagingHelpId = useId()
  const ownElementTriggerHelpId = useId()
  const downloadSuccessId = useId()

  useEffect(() => {
    if (!webDownloadSuccess) return
    downloadSuccessRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [webDownloadSuccess])

  const describedBy = (...ids: Array<string | false | null | undefined>) => {
    const list = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    return list.length > 0 ? list.join(' ') : undefined
  }
  const busy = packaging !== null

  const hasExport = projectHasAnyRecording(project)
  const trigger = coercePlaybackTrigger(project.playback.trigger)
  const selectedActor = findActor(project.actors, selectedActorId)

  const { css, facingFidelityWarnings } = useMemo(() => {
    if (!hasExport) return { css: '', facingFidelityWarnings: [] }
    return buildProjectCssExport(project)
  }, [project, hasExport])

  const ownElement = useMemo(() => {
    if (!hasExport) return null
    return buildOwnElementExport(project, selectedActorId)
  }, [project, selectedActorId, hasExport])

  const websiteIntegration = useMemo(() => {
    if (!hasExport) return null
    return describeWebPackageIntegration(project)
  }, [project, hasExport])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClose = () => {
      viewBtnRef.current?.focus()
    }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  if (!hasExport) return null

  const announce = (message: string) => {
    setActionStatus(message)
    announceAction(message)
  }

  const copyCss = async (where: 'inline' | 'dialog') => {
    const ok = await copyText(css)
    if (!ok) return
    if (where === 'inline') {
      setCopiedInline(true)
      window.setTimeout(() => setCopiedInline(false), 1500)
    } else {
      setCopiedDialog(true)
      window.setTimeout(() => setCopiedDialog(false), 1500)
    }
  }

  const copyOwnElement = async (kind: OwnCopyKind) => {
    if (!ownElement || !ownElement.ok) return
    const text =
      kind === 'css'
        ? ownElement.css
        : kind === 'html'
          ? ownElement.htmlExample
          : kind === 'react'
            ? ownElement.reactExample
            : (ownElement.triggerJs ?? '')
    if (!text) return
    const ok = await copyText(text)
    if (!ok) return
    setOwnCopied(kind)
    window.setTimeout(() => setOwnCopied(null), 1500)
    announce(
      kind === 'css'
        ? 'Motion wrapper CSS copied.'
        : kind === 'html'
          ? 'HTML example copied.'
          : kind === 'react'
            ? 'React example copied.'
            : 'Trigger script copied.',
    )
  }

  const downloadCss = () => {
    const ok = downloadTextFile(
      css,
      stampProjectFilename(project.name, 'css'),
      'text/css;charset=utf-8',
    )
    if (ok) {
      announce('CSS download started.')
      return
    }
    announce('Could not download the CSS file.')
  }

  const downloadHtmlDemo = () => {
    try {
      const html = buildHtmlDemoFromProject(project)
      const ok = downloadTextFile(
        html,
        stampProjectFilename(`${project.name}-demo`, 'html'),
        'text/html;charset=utf-8',
      )
      if (ok) {
        announce('HTML demo download started.')
        return
      }
      announce('Could not download the HTML demo.')
    } catch {
      announce('Couldn’t build the HTML demo.')
    }
  }

  const downloadWebPackage = () => {
    if (packaging) return
    setPackaging('web')
    setWebDownloadSuccess(false)
    setActionStatus('Building website package…')
    // Yield so the busy state paints before ZIP work.
    window.setTimeout(() => {
      try {
        const result = buildWebPackage(project)
        if (!result.ok) {
          setWebDownloadSuccess(false)
          announce(result.error)
          return
        }
        const blob = new Blob([result.zip as BlobPart], {
          type: 'application/zip',
        })
        const ok = downloadBlob(
          blob,
          stampProjectFilename(`${project.name}-web`, 'zip'),
        )
        if (ok) {
          setWebDownloadSuccess(true)
          setActionStatus(null)
          const message =
            'Website package download started. Unzip the folder and open index.html to preview.'
          announceAction(message)
          return
        }
        setWebDownloadSuccess(false)
        announce('Could not download the website package.')
      } catch {
        setWebDownloadSuccess(false)
        announce('Couldn’t build the website package.')
      } finally {
        setPackaging(null)
      }
    }, 0)
  }

  const showHtmlIntegration = () => {
    setWebsitePath('html')
    requestAnimationFrame(() => {
      htmlGuideRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  const copyHtmlSection = async (section: HtmlSectionCopy) => {
    if (!websiteIntegration || !websiteIntegration.ok) return
    const text = websiteIntegration.sections[section]
    const ok = await copyText(text)
    if (!ok) return
    setHtmlSectionCopied(section)
    window.setTimeout(() => setHtmlSectionCopied(null), 1500)
    const label =
      section === 'head'
        ? 'In <head>'
        : section === 'body'
          ? 'Body placement'
          : 'Before </body> (after the scene markup)'
    announce(`${label} snippet copied.`)
  }

  const downloadReactPackage = () => {
    if (packaging) return
    setPackaging('react')
    setActionStatus('Building React package…')
    window.setTimeout(() => {
      try {
        const result = buildReactPackage(project)
        if (!result.ok) {
          announce(result.error)
          return
        }
        const blob = new Blob([result.zip as BlobPart], {
          type: 'application/zip',
        })
        const ok = downloadBlob(
          blob,
          stampProjectFilename(`${project.name}-react`, 'zip'),
        )
        if (ok) {
          announce('React package download started.')
          return
        }
        announce('Could not download the React package.')
      } catch {
        announce('Couldn’t build the React package.')
      } finally {
        setPackaging(null)
      }
    }, 0)
  }

  const downloadProjectFile = () => {
    const ok = downloadCurrentProject()
    if (ok) {
      announce('Project download started.')
      return
    }
    const message =
      useEditorStore.getState().actionAnnouncement ??
      'Could not download the project file.'
    announce(message)
  }

  const openDialog = () => {
    dialogRef.current?.showModal()
    requestAnimationFrame(() => {
      const code = codeRef.current
      if (code) {
        code.scrollTop = 0
        code.scrollLeft = 0
      }
    })
  }

  const closeDialog = () => {
    dialogRef.current?.close()
  }

  const openTriggerPreview = () => {
    try {
      const html = buildHtmlDemoFromProject(project)
      setPreviewHtml(html)
      previewRef.current?.showModal()
    } catch {
      announce('Couldn’t build the trigger preview.')
    }
  }

  const closeTriggerPreview = () => {
    previewRef.current?.close()
    setPreviewHtml(null)
  }

  const onTriggerChange = (value: string) => {
    const next = coercePlaybackTrigger(value)
    setPlaybackTrigger(next as PlaybackTrigger)
  }

  return (
    <div data-testid="export-panel" className="space-y-4">
      {facingFidelityWarnings.length > 0 && (
        <div
          data-testid="export-facing-fidelity-warning"
          role="status"
          className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2"
        >
          <p className="text-[11px] font-medium text-amber-950">
            Facing export fidelity
          </p>
          {facingFidelityWarnings.map((notice) => (
            <p
              key={`${notice.actorName}-${notice.maxErrDeg.toFixed(3)}`}
              className="text-[11px] leading-relaxed text-amber-900/90"
            >
              {notice.plainMessage}
            </p>
          ))}
          <p className="text-[11px] leading-relaxed text-amber-800/90">
            Applies to Copy CSS, View CSS, Download CSS, HTML demo, web package,
            React package, and Animate your own element. Export still proceeds;
            the CSS also includes a matching comment.
          </p>
        </div>
      )}

      {busy ? (
        <p id={packagingHelpId} className="sr-only" data-testid="export-packaging-help">
          A package is building. Other export actions are unavailable until it
          finishes.
        </p>
      ) : null}

      <section
        className="space-y-3"
        data-testid="export-primary"
        aria-labelledby={embedHeadingId}
        aria-describedby={describedBy(websiteLimitsId, packageStatusId)}
      >
        <div className="space-y-1.5">
          <h3
            id={embedHeadingId}
            className="text-xs font-semibold text-slate-900"
          >
            Add to your website
          </h3>
          <p
            id={websiteLimitsId}
            data-testid="export-website-limits"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Needs access to your site’s code. Does not install into WordPress or
            Webflow, and downloading does not publish anything.
          </p>
          <p id={packageStatusId} className="sr-only" data-testid="export-web-package-help">
            ZIP with a working index.html preview and files to add the animation
            to your site. Downloading does not publish anything.
          </p>
        </div>

        {webDownloadSuccess ? (
          <div
            ref={downloadSuccessRef}
            id={downloadSuccessId}
            data-testid="export-download-success"
            role="status"
            className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/80 px-2.5 py-2"
          >
            <p
              data-testid="export-download-success-title"
              className="text-[11px] font-medium text-teal-950"
            >
              Website package download started.
            </p>
            <p
              data-testid="export-download-success-hint"
              className="text-[11px] leading-relaxed text-teal-900/90"
            >
              Unzip the folder and open index.html to preview.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="btn-export-view-integration"
                onClick={showHtmlIntegration}
                className="rounded-md bg-teal-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-teal-800"
              >
                View integration instructions
              </button>
              <button
                type="button"
                data-testid="btn-dismiss-download-success"
                onClick={() => setWebDownloadSuccess(false)}
                className="rounded-md border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-900 transition hover:bg-teal-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div
          role="tablist"
          aria-label="Website integration path"
          className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          data-testid="export-website-path-tabs"
        >
          {(
            [
              ['html', 'HTML website'],
              ['react', 'React'],
            ] as const
          ).map(([id, label]) => {
            const selected = websitePath === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                data-testid={`btn-export-path-${id}`}
                aria-selected={selected}
                aria-controls={`export-guide-${id}`}
                data-selected={selected ? 'true' : 'false'}
                onClick={() => setWebsitePath(id)}
                // No color/bg transition — highlight must move with content in the
                // same paint (animated lag made React look like HTML was still selected).
                className={`rounded-md px-1.5 py-1.5 text-[11px] ${
                  selected
                    ? 'bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'font-medium text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {websitePath === 'html' && (
          <div
            ref={htmlGuideRef}
            id="export-guide-html"
            role="tabpanel"
            data-testid="export-guide-html"
            className="space-y-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
          >
            <button
              type="button"
              data-testid="btn-download-web-package"
              onClick={downloadWebPackage}
              disabled={busy}
              aria-busy={packaging === 'web'}
              aria-describedby={describedBy(
                packageStatusId,
                'export-html-download-blurb',
                webDownloadSuccess && downloadSuccessId,
                busy && packagingHelpId,
              )}
              className="w-full rounded-lg bg-slate-900 px-2.5 py-2 text-left text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {packaging === 'web'
                ? 'Building website package…'
                : 'Download for your website'}
            </button>
            <p
              id="export-html-download-blurb"
              data-testid="export-html-download-blurb"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              ZIP with a working <code>{WEB_PACKAGE_HTML_NAME}</code> preview
              plus <code>{WEB_PACKAGE_CSS_NAME}</code>,{' '}
              <code>{WEB_PACKAGE_TRIGGER_JS_NAME}</code>
              {websiteIntegration?.ok &&
              websiteIntegration.assetHrefs.length > 0
                ? ', and assets/'
                : ''}
              . Downloading does not publish anything.
            </p>
            {websiteIntegration?.ok ? (
              <pre
                data-testid="export-html-folder-layout"
                className="overflow-x-auto rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-slate-700 whitespace-pre"
              >
                {websiteIntegration.folderLayout}
              </pre>
            ) : null}
          </div>
        )}

        {websitePath === 'react' && (
          <div
            id="export-guide-react"
            role="tabpanel"
            data-testid="export-guide-react"
            className="space-y-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
          >
            <button
              type="button"
              data-testid="btn-download-react-package"
              onClick={downloadReactPackage}
              disabled={busy}
              aria-busy={packaging === 'react'}
              aria-describedby={describedBy(
                reactPackageStatusId,
                busy && packagingHelpId,
              )}
              className="w-full rounded-lg bg-slate-900 px-2.5 py-2 text-left text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {packaging === 'react'
                ? 'Building React package…'
                : 'Download React package'}
            </button>
            <p
              id={reactPackageStatusId}
              data-testid="export-react-package-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              ZIP with {REACT_PACKAGE_COMPONENT_NAME}, scoped CSS, images,
              trigger script, and a Vite React README. Same motion as the HTML
              package. Downloading does not publish anything.
            </p>
          </div>
        )}

        <div className="space-y-2" data-testid="export-playback-settings">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-800">
              Playback trigger
            </span>
            <select
              data-testid="export-trigger-select"
              value={trigger}
              aria-describedby={describedBy(triggerHelpId, triggerRegenHelpId)}
              onChange={(e) => onTriggerChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              {PLAYBACK_TRIGGERS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'page-load'
                    ? 'Page load'
                    : mode === 'click'
                      ? 'Click / tap'
                      : mode === 'hover'
                        ? 'Hover / focus'
                        : 'Enter viewport'}
                </option>
              ))}
            </select>
          </label>
          <p
            id={triggerHelpId}
            data-testid="export-trigger-help"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            {triggerHelpText(trigger)}
            {triggerNeedsJavaScript(trigger)
              ? ' Download CSS is CSS-only — this trigger needs the HTML demo, web package, or React package (includes ms-trigger.js).'
              : ' For page-load, CSS alone can start the motion when prefers-reduced-motion is off. The documented website integration still includes ms-trigger.js so Play/Replay and reduced-motion controls work; Download CSS alone skips that controller.'}{' '}
            Loop / alternate still apply after the scene starts.
          </p>
          <p
            id={triggerRegenHelpId}
            data-testid="export-trigger-regen-help"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Changing the trigger updates the generated embed code below.
            Copy the sections again (and download a fresh ZIP if you need the
            package files) after you change it.
          </p>
          {websitePath === 'html' && websiteIntegration?.ok ? (
            <p
              id={playButtonHelpId}
              data-testid="export-play-button-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              {websiteIntegration.playButtonHelp}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="btn-preview-trigger"
            onClick={openTriggerPreview}
            disabled={busy}
            aria-describedby={describedBy(
              previewTriggerHelpId,
              busy && packagingHelpId,
            )}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Test playback behavior
          </button>
          <p
            id={previewTriggerHelpId}
            data-testid="export-preview-trigger-help"
            className="text-[11px] leading-relaxed text-slate-500"
          >
            Opens an isolated preview of the selected start setting. Does not
            change the editor playhead, recording, or undo history.
          </p>
        </div>

        {websitePath === 'html' && (
          <div
            data-testid="export-html-integration"
            className="space-y-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
          >
            <ol
              data-testid="export-html-steps"
              className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-600"
            >
              <li>
                Unzip the package. Keep <code>{WEB_PACKAGE_HTML_NAME}</code>,{' '}
                <code>{WEB_PACKAGE_CSS_NAME}</code>,{' '}
                <code>{WEB_PACKAGE_TRIGGER_JS_NAME}</code>
                {websiteIntegration?.ok &&
                websiteIntegration.assetHrefs.length > 0
                  ? ', and assets/'
                  : ''}{' '}
                together as shown above.
              </li>
              <li>
                Open <code>{WEB_PACKAGE_HTML_NAME}</code> for a self-contained
                preview page (layout and controls). To embed in an existing page,
                copy those files beside your HTML and paste the three sections
                below
                {websiteIntegration?.ok
                  ? ` (stage aspect ${websiteIntegration.aspectCss})`
                  : ''}
                — the snippets are the equivalent integration pieces.
              </li>
              <li>
                <code>README.txt</code> is instructions;{' '}
                <code>project.json</code> reopens the project in MotionSketch.
                Neither is required to run the embedded animation.
              </li>
            </ol>
            <p
              data-testid="export-html-required-files"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Required to run:{' '}
              <code>{WEB_PACKAGE_CSS_NAME}</code>,{' '}
              <code>{WEB_PACKAGE_TRIGGER_JS_NAME}</code>
              {websiteIntegration?.ok &&
              websiteIntegration.assetHrefs.length > 0
                ? `, ${websiteIntegration.assetHrefs.join(', ')}`
                : ''}
              .
            </p>
            <p
              data-testid="export-html-paste-order"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Paste each section where its label indicates, in the order shown.
              Initialization goes after the scene markup, before{' '}
              <code>{'</body>'}</code>.
            </p>
            {websiteIntegration?.ok ? (
              (
                [
                  ['head', 'In <head>', websiteIntegration.sections.head],
                  [
                    'body',
                    'Where you want the animation, inside <body>',
                    websiteIntegration.sections.body,
                  ],
                  [
                    'scripts',
                    'Before </body> (after the scene markup)',
                    websiteIntegration.sections.scripts,
                  ],
                ] as const
              ).map(([id, label, value]) => (
                <div
                  key={id}
                  data-testid={`export-html-section-${id}`}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-800">
                      {label}
                    </p>
                    <button
                      type="button"
                      data-testid={`btn-copy-html-section-${id}`}
                      onClick={() => void copyHtmlSection(id)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      {htmlSectionCopied === id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <textarea
                    data-testid={`export-html-section-${id}-code`}
                    readOnly
                    spellCheck={false}
                    wrap="off"
                    value={value}
                    aria-label={label}
                    className="h-28 w-full resize-y rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-700 outline-none"
                  />
                </div>
              ))
            ) : websiteIntegration && !websiteIntegration.ok ? (
              <p className="text-[11px] text-amber-800">
                {websiteIntegration.error}
              </p>
            ) : null}
          </div>
        )}

        {websitePath === 'react' && (
          <ol
            data-testid="export-react-steps"
            className="list-decimal space-y-1.5 rounded-lg border border-slate-100 bg-white px-2.5 py-2 pl-6 text-[11px] leading-relaxed text-slate-600"
          >
            <li>
              Unzip <strong>all</strong> files into a folder in your Vite React
              app (for example <code>src/motionsketch/</code>). The archive is
              flat — do not leave <code>{REACT_PACKAGE_COMPONENT_NAME}</code> at
              the project root.
            </li>
            <li>
              Keep <code>{REACT_PACKAGE_CSS_NAME}</code>,{' '}
              <code>{REACT_PACKAGE_TRIGGER_JS_NAME}</code>, and any{' '}
              <code>assets/</code> files beside the component.
            </li>
            <li>
              Import and render <code>{`{ MotionSketchScene }`}</code> from{' '}
              <code>{REACT_PACKAGE_COMPONENT_NAME}</code> (see the package{' '}
              <code>README.md</code> for a full <code>main.tsx</code> example).
            </li>
          </ol>
        )}

      </section>

      <details
        data-testid="export-other-ways"
        className="rounded-lg border border-slate-100 bg-slate-50/60"
      >
        <summary
          data-testid="export-other-ways-summary"
          className="cursor-pointer list-outside px-2.5 py-2 text-xs font-semibold text-slate-800 marker:text-slate-400"
        >
          Advanced exports
        </summary>
        <div className="space-y-4 border-t border-slate-100 px-2.5 py-3">
          <section
            className="space-y-2"
            data-testid="export-goal-embed"
            aria-labelledby={advancedHeadingId}
          >
            <div
              data-testid="export-embed-advanced"
              className="space-y-2 rounded-lg border border-slate-100 bg-white/80 px-2.5 py-2"
              role="group"
              aria-labelledby={advancedHeadingId}
              aria-describedby={advancedHelpId}
            >
              <h4
                id={advancedHeadingId}
                className="text-xs font-medium text-slate-800"
              >
                CSS and offline preview
              </h4>
              <p
                id={advancedHelpId}
                data-testid="export-embed-advanced-help"
                className="text-[11px] leading-relaxed text-slate-500"
              >
                When you already have markup, or only need a single-file preview.
              </p>

              <button
                type="button"
                data-testid="btn-download-css"
                onClick={downloadCss}
                disabled={busy}
                aria-describedby={describedBy(
                  cssFileHelpId,
                  busy && packagingHelpId,
                )}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download CSS
              </button>
              <p
                id={cssFileHelpId}
                data-testid="export-css-help"
                className="text-[11px] leading-relaxed text-slate-500"
              >
                Scoped CSS only (scene root + keyframes). You supply the HTML.
                Image assets are separate. See the header comments for reduced
                motion, triggers, and instance prefixes.
                {triggerNeedsJavaScript(trigger)
                  ? ' This project’s trigger requires JavaScript (not included in Download CSS).'
                  : ''}
              </p>

              <div className="flex min-w-0 flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="btn-copy-css"
                  onClick={() => void copyCss('inline')}
                  aria-describedby={cssCodeHelpId}
                  className="min-h-9 min-w-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                >
                  {copiedInline ? 'Copied' : 'Copy CSS'}
                </button>
                <button
                  ref={viewBtnRef}
                  type="button"
                  data-testid="btn-view-css"
                  onClick={openDialog}
                  aria-describedby={cssCodeHelpId}
                  className="min-h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  View CSS
                </button>
              </div>
              <p
                id={cssCodeHelpId}
                data-testid="export-css-code-help"
                className="text-[11px] leading-relaxed text-slate-500"
              >
                Copy CSS and View CSS provide the same scoped scene code
                {project.actors.length > 1
                  ? ' (unique classes per actor inside the scene root).'
                  : ' (wrap in the documented scene root).'}
              </p>

              <button
                type="button"
                data-testid="btn-download-html-demo"
                onClick={downloadHtmlDemo}
                disabled={busy}
                aria-describedby={describedBy(
                  htmlDemoHelpId,
                  busy && packagingHelpId,
                )}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download HTML demo
              </button>
              <p
                id={htmlDemoHelpId}
                data-testid="export-html-help"
                className="text-[11px] leading-relaxed text-slate-500"
              >
                Single-file offline preview — open in a browser; not for
                embedding in your site.
              </p>
            </div>
          </section>

          <section
            className="space-y-2 border-t border-slate-100 pt-3"
            data-testid="export-own-element"
            aria-labelledby={ownElementHeadingId}
            aria-describedby={ownElementHelpId}
          >
        <h3
          id={ownElementHeadingId}
          className="text-xs font-semibold text-slate-900"
        >
          Animate your own element
        </h3>
        <p
          id={ownElementHelpId}
          data-testid="export-own-element-help"
          className="text-[11px] leading-relaxed text-slate-500"
        >
          {ownElement?.ok
            ? `Motion wrapper for “${ownElement.actorName}” — path and timing only. Nest your HTML or React node inside .${ownElement.wrapperClass}; your child’s size, color, image, text, and transforms stay yours.`
            : selectedActor
              ? `Select an actor with a recording (currently “${selectedActor.name}” has no exportable path).`
              : 'Select an actor with a recording to export a motion wrapper.'}
        </p>
        {ownElement?.ok ? (
          <>
            <p
              id={ownElementTriggerHelpId}
              data-testid="export-own-element-trigger"
              className={
                ownElement.requiresTriggerJs
                  ? 'rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950'
                  : 'text-[11px] leading-relaxed text-slate-500'
              }
              role={ownElement.requiresTriggerJs ? 'status' : undefined}
            >
              {ownElement.triggerRequirement}
            </p>
            <div className="flex min-w-0 flex-wrap gap-2">
              <button
                type="button"
                data-testid="btn-copy-own-element-css"
                onClick={() => void copyOwnElement('css')}
                aria-describedby={describedBy(
                  ownElementHelpId,
                  ownElementTriggerHelpId,
                )}
                className="min-h-9 min-w-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                {ownCopied === 'css' ? 'Copied' : 'Copy wrapper CSS'}
              </button>
              <button
                type="button"
                data-testid="btn-copy-own-element-html"
                onClick={() => void copyOwnElement('html')}
                aria-describedby={describedBy(
                  ownElementHelpId,
                  ownElementTriggerHelpId,
                )}
                className="min-h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
              >
                {ownCopied === 'html' ? 'Copied' : 'Copy HTML example'}
              </button>
              <button
                type="button"
                data-testid="btn-copy-own-element-react"
                onClick={() => void copyOwnElement('react')}
                aria-describedby={describedBy(
                  ownElementHelpId,
                  ownElementTriggerHelpId,
                )}
                className="min-h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50"
              >
                {ownCopied === 'react' ? 'Copied' : 'Copy React example'}
              </button>
              {ownElement.requiresTriggerJs ? (
                <button
                  type="button"
                  data-testid="btn-copy-own-element-trigger"
                  onClick={() => void copyOwnElement('trigger')}
                  aria-describedby={describedBy(
                    ownElementHelpId,
                    ownElementTriggerHelpId,
                  )}
                  className="min-h-9 min-w-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-100"
                >
                  {ownCopied === 'trigger' ? 'Copied' : 'Copy trigger script'}
                </button>
              ) : null}
            </div>
            <p
              data-testid="export-own-element-setup"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              HTML example is a complete host page (links{' '}
              <code>motion-wrapper.css</code>, sizes <code>.ms-stage</code>).
              React: save <code>motion-wrapper.css</code> beside the example
              component before importing it
              {ownElement.requiresTriggerJs ? (
                <>
                  ; also save <code>ms-trigger.js</code> in that same folder
                </>
              ) : null}
              .
            </p>
            {ownElement.requiresTriggerJs ? (
              <p
                data-testid="export-own-element-trigger-save"
                className="text-[11px] leading-relaxed text-amber-950/90"
              >
                Save the copied script as <code>ms-trigger.js</code> in the same
                folder as your HTML or React example (beside{' '}
                <code>motion-wrapper.css</code>).
              </p>
            ) : null}
            <ul
              data-testid="export-own-element-limits"
              className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-500"
            >
              {ownElement.limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-2">
            <button
              type="button"
              data-testid="btn-copy-own-element-css"
              disabled
              aria-describedby={ownElementHelpId}
              className="min-h-9 min-w-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-40"
            >
              Copy wrapper CSS
            </button>
            <button
              type="button"
              data-testid="btn-copy-own-element-html"
              disabled
              aria-describedby={ownElementHelpId}
              className="min-h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 opacity-40"
            >
              Copy HTML example
            </button>
            <button
              type="button"
              data-testid="btn-copy-own-element-react"
              disabled
              aria-describedby={ownElementHelpId}
              className="min-h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 opacity-40"
            >
              Copy React example
            </button>
          </div>
        )}
          </section>

          <section
            className="space-y-2 border-t border-slate-100 pt-3"
            data-testid="export-goal-project"
            aria-labelledby={projectHeadingId}
            aria-describedby={projectHelpId}
          >
            <h3
              id={projectHeadingId}
              className="text-xs font-semibold text-slate-900"
            >
              Continue editing elsewhere
            </h3>
            <p
              id={projectHelpId}
              data-testid="export-project-goal-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Save a MotionSketch project file you can reopen later or on another
              machine.
            </p>
            <button
              type="button"
              data-testid="btn-export-download-project"
              onClick={downloadProjectFile}
              disabled={busy}
              aria-describedby={describedBy(
                projectActionHelpId,
                busy && packagingHelpId,
              )}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Download project file
            </button>
            <p
              id={projectActionHelpId}
              data-testid="export-project-help"
              className="text-[11px] leading-relaxed text-slate-500"
            >
              Reopen and edit in MotionSketch. Also available under Project.
            </p>
          </section>
        </div>
      </details>

      {actionStatus && (
        <p
          data-testid="export-action-status"
          role="status"
          className="text-[11px] text-slate-600"
        >
          {actionStatus}
        </p>
      )}

      <dialog
        ref={dialogRef}
        data-testid="css-dialog"
        aria-labelledby={titleId}
        className="css-export-dialog fixed inset-0 z-50 m-auto h-[min(80dvh,calc(100dvh-1.5rem))] w-[min(85vw,1100px)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop:bg-slate-900/40 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog()
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 id={titleId} className="text-sm font-semibold text-slate-900">
              Exported CSS
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="btn-copy-css-dialog"
                onClick={() => void copyCss('dialog')}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                {copiedDialog ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                data-testid="btn-close-css-dialog"
                onClick={closeDialog}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
          <textarea
            ref={codeRef}
            data-testid="css-output"
            readOnly
            value={css}
            spellCheck={false}
            wrap="off"
            className="css-export-code min-h-0 w-full flex-1 resize-none overflow-auto whitespace-pre bg-slate-50 p-4 text-slate-800 outline-none"
          />
        </div>
      </dialog>

      <dialog
        ref={previewRef}
        data-testid="trigger-preview-dialog"
        aria-labelledby={previewTitleId}
        className="fixed inset-0 z-50 m-auto h-[min(85dvh,calc(100dvh-1.5rem))] w-[min(90vw,960px)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop:bg-slate-900/40"
        onClose={() => setPreviewHtml(null)}
        onClick={(e) => {
          if (e.target === previewRef.current) closeTriggerPreview()
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2
              id={previewTitleId}
              className="text-sm font-semibold text-slate-900"
            >
              Trigger preview
            </h2>
            <button
              type="button"
              data-testid="btn-close-trigger-preview"
              onClick={closeTriggerPreview}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          {previewHtml && (
            <iframe
              title="Export trigger preview"
              data-testid="trigger-preview-frame"
              srcDoc={previewHtml}
              sandbox="allow-scripts allow-same-origin"
              className="min-h-0 w-full flex-1 border-0 bg-[#f4f6fb]"
            />
          )}
        </div>
      </dialog>
    </div>
  )
}
