import type { TutorialStep } from './tutorial'

export type Rect = {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

export type CardPlacement = {
  top: number
  left: number
  width: number
  maxWidth: number
}

const GAP = 10
const MARGIN = 10
const CARD_MAX = 280

function asRect(r: DOMRect | Rect): Rect {
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    right: r.right ?? r.left + r.width,
    bottom: r.bottom ?? r.top + r.height,
  }
}

function overlaps(a: Rect, b: Rect, pad = 2): boolean {
  return (
    a.left < b.right - pad &&
    a.right > b.left + pad &&
    a.top < b.bottom - pad &&
    a.bottom > b.top + pad
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/** Preferred stable anchors — never the moving plane. */
export function placementAnchorTestId(
  step: TutorialStep,
  exportOpen: boolean,
): string | null {
  if (step === 'draw') return 'btn-record'
  if (step === 'play') return 'btn-play'
  if (step === 'export') return exportOpen ? 'export-panel-root' : 'btn-export'
  return null
}

/**
 * Resolve a placement anchor that stays put through Record→Cancel and Play→Pause.
 * Falls back to sibling controls in the same dock slot when the preferred id is gone.
 */
export function resolvePlacementAnchor(
  step: TutorialStep,
  exportOpen: boolean,
): HTMLElement | null {
  const preferred = placementAnchorTestId(step, exportOpen)
  if (preferred) {
    const el = document.querySelector(`[data-testid="${preferred}"]`)
    if (el instanceof HTMLElement) return el
  }
  if (step === 'draw') {
    const stop = document.querySelector('[data-testid="btn-stop"]')
    if (stop instanceof HTMLElement) return stop
  }
  if (step === 'play') {
    const pause = document.querySelector('[data-testid="btn-pause"]')
    if (pause instanceof HTMLElement) return pause
  }
  return null
}

function candidatesNearDockControl(
  anchor: Rect,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
): Array<{ top: number; left: number }> {
  const centeredLeft = clamp(
    anchor.left + anchor.width / 2 - cardW / 2,
    MARGIN,
    vw - cardW - MARGIN,
  )
  return [
    // Above (preferred for dock controls)
    { top: anchor.top - cardH - GAP, left: centeredLeft },
    // Above, shifted left
    {
      top: anchor.top - cardH - GAP,
      left: clamp(anchor.left - 8, MARGIN, vw - cardW - MARGIN),
    },
    // Above, shifted right
    {
      top: anchor.top - cardH - GAP,
      left: clamp(anchor.right - cardW + 8, MARGIN, vw - cardW - MARGIN),
    },
    // To the left of control
    {
      top: clamp(anchor.top + anchor.height / 2 - cardH / 2, MARGIN, vh - cardH - MARGIN),
      left: anchor.left - cardW - GAP,
    },
    // To the right
    {
      top: clamp(anchor.top + anchor.height / 2 - cardH / 2, MARGIN, vh - cardH - MARGIN),
      left: anchor.right + GAP,
    },
    // Compact fallback under header / top
    { top: MARGIN + 56, left: MARGIN },
  ]
}

function candidatesNearExportButton(
  anchor: Rect,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
): Array<{ top: number; left: number }> {
  return [
    {
      top: anchor.bottom + GAP,
      left: clamp(anchor.right - cardW, MARGIN, vw - cardW - MARGIN),
    },
    {
      top: anchor.bottom + GAP,
      left: clamp(anchor.left, MARGIN, vw - cardW - MARGIN),
    },
    {
      top: clamp(anchor.top, MARGIN, vh - cardH - MARGIN),
      left: clamp(anchor.left - cardW - GAP, MARGIN, vw - cardW - MARGIN),
    },
    { top: MARGIN + 56, left: MARGIN },
  ]
}

function candidatesBesideExportPanel(
  panel: Rect,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
  narrow: boolean,
): Array<{ top: number; left: number }> {
  if (narrow) {
    // Compact strip above the sheet body / under the chrome.
    return [
      { top: MARGIN + 4, left: MARGIN },
      {
        top: clamp(panel.top - cardH - GAP, MARGIN, vh - cardH - MARGIN),
        left: MARGIN,
      },
      {
        top: clamp(panel.bottom - cardH - MARGIN, MARGIN, vh - cardH - MARGIN),
        left: MARGIN,
      },
    ]
  }
  return [
    // Left of panel, top-aligned (associated with Export sheet)
    {
      top: clamp(panel.top, MARGIN, vh - cardH - MARGIN),
      left: clamp(panel.left - cardW - GAP, MARGIN, vw - cardW - MARGIN),
    },
    {
      top: clamp(panel.top + 40, MARGIN, vh - cardH - MARGIN),
      left: clamp(panel.left - cardW - GAP, MARGIN, vw - cardW - MARGIN),
    },
    {
      top: clamp(panel.top, MARGIN, vh - cardH - MARGIN),
      left: MARGIN,
    },
  ]
}

function scorePlacement(
  top: number,
  left: number,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
  avoid: Rect[],
): number {
  const box: Rect = {
    top,
    left,
    width: cardW,
    height: cardH,
    right: left + cardW,
    bottom: top + cardH,
  }
  let score = 0
  if (box.left < MARGIN - 1 || box.top < MARGIN - 1) score -= 200
  if (box.right > vw - MARGIN + 1 || box.bottom > vh - MARGIN + 1) score -= 200
  for (const a of avoid) {
    if (overlaps(box, a, 4)) score -= 120
  }
  // Prefer staying on-screen fully
  const onScreen =
    box.left >= 0 &&
    box.top >= 0 &&
    box.right <= vw &&
    box.bottom <= vh
  if (onScreen) score += 40
  // Prefer nearer the first avoid target (the anchor) without overlapping it
  if (avoid[0]) {
    const ax = avoid[0].left + avoid[0].width / 2
    const ay = avoid[0].top + avoid[0].height / 2
    const cx = left + cardW / 2
    const cy = top + cardH / 2
    const dist = Math.hypot(cx - ax, cy - ay)
    score -= dist * 0.05
  }
  return score
}

/**
 * Compact coach placement beside the relevant control (Spectrum-style).
 * Never follows the plane; callers must only recompute on step / panel / resize.
 */
export function placeTutorialCard(opts: {
  step: TutorialStep
  exportOpen: boolean
  vw: number
  vh: number
  cardWidth?: number
  cardHeight?: number
  anchor: Rect | null
  panel: Rect | null
  avoidExtra?: Rect[]
}): CardPlacement {
  const cardW = Math.min(opts.cardWidth ?? CARD_MAX, opts.vw - MARGIN * 2)
  const cardH = opts.cardHeight ?? 132
  const narrow = opts.vw < 640
  const avoid: Rect[] = [...(opts.avoidExtra ?? [])]
  if (opts.anchor) avoid.unshift(opts.anchor)

  let list: Array<{ top: number; left: number }>
  if (opts.step === 'export' && opts.exportOpen && opts.panel) {
    list = candidatesBesideExportPanel(
      opts.panel,
      cardW,
      cardH,
      opts.vw,
      opts.vh,
      narrow,
    )
    avoid.unshift(opts.panel)
  } else if (opts.step === 'export' && opts.anchor) {
    list = candidatesNearExportButton(
      opts.anchor,
      cardW,
      cardH,
      opts.vw,
      opts.vh,
    )
  } else if (opts.anchor) {
    list = candidatesNearDockControl(
      opts.anchor,
      cardW,
      cardH,
      opts.vw,
      opts.vh,
    )
  } else {
    list = [{ top: MARGIN + 56, left: MARGIN }]
  }

  let best = list[0]!
  let bestScore = -Infinity
  for (const c of list) {
    const top = clamp(c.top, MARGIN, Math.max(MARGIN, opts.vh - cardH - MARGIN))
    const left = clamp(
      c.left,
      MARGIN,
      Math.max(MARGIN, opts.vw - cardW - MARGIN),
    )
    const s = scorePlacement(top, left, cardW, cardH, opts.vw, opts.vh, avoid)
    if (s > bestScore) {
      bestScore = s
      best = { top, left }
    }
  }

  return {
    top: best.top,
    left: best.left,
    width: cardW,
    maxWidth: cardW,
  }
}

export function readElementRect(el: Element | null): Rect | null {
  if (!(el instanceof HTMLElement)) return null
  return asRect(el.getBoundingClientRect())
}
