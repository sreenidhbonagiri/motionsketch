/**
 * SVG path → MotionSketch recording (v1: one `<path>`, one subpath).
 *
 * Never injects uploaded markup into the live page. Parsing uses DOMParser
 * (off-document) only to read `viewBox` / a single `d` string, then a pure
 * geometry pipeline builds stage-normalized samples.
 */

import { validateSvgMarkup, MAX_IMAGE_BYTES } from './imageAsset'
import { clamp, clamp01 } from './coords'
import {
  CANONICAL_SAMPLE_COUNT,
  MIN_RECORDING_DURATION_MS,
  MIN_RECORDING_SAMPLES,
  type MotionSample,
  type Recording,
  type Vec2,
} from './types'

export type SvgViewBox = { x: number; y: number; w: number; h: number }

export type SvgPathImportOk = {
  ok: true
  /** Source path `d` (for diagnostics only — not rendered as markup). */
  pathD: string
  viewBox: SvgViewBox
  /** Even-speed samples in stage space (0..1), times 0..durationMs. */
  samples: MotionSample[]
  recording: Recording
  closed: boolean
  mappingNote: string
  limitations: string[]
}

export type SvgPathImportErr = { ok: false; error: string }
export type SvgPathImportResult = SvgPathImportOk | SvgPathImportErr

const MAX_SVG_PATH_CHARS = 200_000
const SAMPLE_COUNT = CANONICAL_SAMPLE_COUNT

const MAPPING_NOTE =
  'The SVG viewBox maps onto the stage: left→right becomes x 0→1, top→bottom becomes y 0→1 (same y-down direction as SVG). Path coordinates are scaled by the viewBox width and height independently, so the shape fills that box on the stage. Empty margins in the viewBox become empty stage margins. After import, use Move path or Edit path to adjust placement.'

const LIMITATIONS = [
  'One <path> element with a single continuous subpath (no extra moveto).',
  'Circles, lines, polylines, and groups are not imported — convert to a path first.',
  'Transforms on the SVG or path element are ignored in v1.',
  'Even speed is baked into the imported take; Steady Speed stays available afterward.',
]

type Point = { x: number; y: number }

function err(error: string): SvgPathImportErr {
  return { ok: false, error }
}

function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Tokenize SVG path `d` into command letters and numbers. */
export function tokenizePathD(d: string): Array<string | number> {
  const tokens: Array<string | number> = []
  const re =
    /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push(m[1])
    else if (m[2]) tokens.push(Number(m[2]))
  }
  return tokens
}

function readNums(
  tokens: Array<string | number>,
  i: number,
  count: number,
): { values: number[]; next: number } | null {
  const values: number[] = []
  let cursor = i
  while (values.length < count && cursor < tokens.length) {
    const t = tokens[cursor]
    if (typeof t !== 'number' || !Number.isFinite(t)) return null
    values.push(t)
    cursor += 1
  }
  if (values.length < count) return null
  return { values, next: cursor }
}

/** Convert SVG arc to cubic bezier segments (W3C endpoint parameterization). */
function arcToCubics(
  from: Point,
  rx: number,
  ry: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): Point[][] {
  if (rx === 0 || ry === 0) return [[from, from, to, to]]
  if (from.x === to.x && from.y === to.y) return []

  const phi = (phiDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx2 = (from.x - to.x) / 2
  const dy2 = (from.y - to.y) / 2
  let x1p = cosPhi * dx2 + sinPhi * dy2
  let y1p = -sinPhi * dx2 + cosPhi * dy2

  let rxAbs = Math.abs(rx)
  let ryAbs = Math.abs(ry)
  const lam = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs)
  if (lam > 1) {
    const s = Math.sqrt(lam)
    rxAbs *= s
    ryAbs *= s
  }

  const rxSq = rxAbs * rxAbs
  const rySq = ryAbs * ryAbs
  const x1pSq = x1p * x1p
  const y1pSq = y1p * y1p
  let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq
  let den = rxSq * y1pSq + rySq * x1pSq
  if (num < 0) num = 0
  let cSign = largeArc === sweep ? -1 : 1
  const cFact = den === 0 ? 0 : cSign * Math.sqrt(num / den)
  const cxp = (cFact * (rxAbs * y1p)) / ryAbs
  const cyp = (cFact * (-ryAbs * x1p)) / rxAbs

  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2

  function angle(u: Point, v: Point): number {
    const dot = u.x * v.x + u.y * v.y
    const len = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)
    let ang = Math.acos(clamp(dot / (len || 1), -1, 1))
    if (u.x * v.y - u.y * v.x < 0) ang = -ang
    return ang
  }

  const v1: Point = { x: (x1p - cxp) / rxAbs, y: (y1p - cyp) / ryAbs }
  const v2: Point = { x: (-x1p - cxp) / rxAbs, y: (-y1p - cyp) / ryAbs }
  let theta1 = angle({ x: 1, y: 0 }, v1)
  let dTheta = angle(v1, v2)
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)))
  const delta = dTheta / segments
  const t = ((8 / 3) * Math.sin(delta / 4) * Math.sin(delta / 4)) / Math.sin(delta / 2)

  const cubics: Point[][] = []
  for (let i = 0; i < segments; i++) {
    const th1 = theta1 + i * delta
    const th2 = th1 + delta
    const cos1 = Math.cos(th1)
    const sin1 = Math.sin(th1)
    const cos2 = Math.cos(th2)
    const sin2 = Math.sin(th2)

    const e1: Point = {
      x: cx + rxAbs * (cosPhi * cos1 - sinPhi * sin1),
      y: cy + ryAbs * (sinPhi * cos1 + cosPhi * sin1),
    }
    const e2: Point = {
      x: cx + rxAbs * (cosPhi * cos2 - sinPhi * sin2),
      y: cy + ryAbs * (sinPhi * cos2 + cosPhi * sin2),
    }
    const ep1: Point = {
      x: -rxAbs * (cosPhi * sin1 + sinPhi * cos1),
      y: -ryAbs * (sinPhi * sin1 - cosPhi * cos1),
    }
    const ep2: Point = {
      x: -rxAbs * (cosPhi * sin2 + sinPhi * cos2),
      y: -ryAbs * (sinPhi * sin2 - cosPhi * cos2),
    }
    cubics.push([
      i === 0 ? from : e1,
      { x: e1.x + t * ep1.x, y: e1.y + t * ep1.y },
      { x: e2.x - t * ep2.x, y: e2.y - t * ep2.y },
      e2,
    ])
  }
  return cubics
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  }
}

function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  out: Point[],
  depth = 0,
): void {
  const mid = cubicPoint(p0, p1, p2, p3, 0.5)
  const chord = dist(p0, p3)
  const via = dist(p0, mid) + dist(mid, p3)
  if (depth >= 8 || Math.abs(via - chord) < 0.25) {
    out.push(p3)
    return
  }
  const p01 = lerpPoint(p0, p1, 0.5)
  const p12 = lerpPoint(p1, p2, 0.5)
  const p23 = lerpPoint(p2, p3, 0.5)
  const p012 = lerpPoint(p01, p12, 0.5)
  const p123 = lerpPoint(p12, p23, 0.5)
  const p0123 = lerpPoint(p012, p123, 0.5)
  flattenCubic(p0, p01, p012, p0123, out, depth + 1)
  flattenCubic(p0123, p123, p23, p3, out, depth + 1)
}

/**
 * Parse one SVG path `d` into a single polyline in path user units.
 * Rejects multiple subpaths (extra moveto).
 */
export function pathDToPolyline(d: string):
  | { ok: true; points: Point[]; closed: boolean }
  | { ok: false; error: string } {
  const tokens = tokenizePathD(d)
  if (tokens.length === 0) return { ok: false, error: 'That SVG path is empty.' }

  const points: Point[] = []
  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let lastC2: Point | null = null
  let lastQ: Point | null = null
  let subpaths = 0
  let closed = false

  const pushCorner = (p: Point) => {
    const last = points[points.length - 1]
    if (last && dist(last, p) < 1e-9) return
    points.push(p)
  }

  const appendCubic = (p0: Point, p1: Point, p2: Point, p3: Point) => {
    const densified: Point[] = []
    flattenCubic(p0, p1, p2, p3, densified)
    for (const p of densified) pushCorner(p)
  }

  while (i < tokens.length) {
    const t = tokens[i]
    if (typeof t === 'string') {
      cmd = t
      i += 1
      if (cmd === 'Z' || cmd === 'z') {
        closed = true
        pushCorner({ x: startX, y: startY })
        cx = startX
        cy = startY
        lastC2 = null
        lastQ = null
        continue
      }
    }
    if (!cmd) return { ok: false, error: 'That SVG path is malformed.' }

    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()

    if (C === 'M') {
      const nums = readNums(tokens, i, 2)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let x = nums.values[0]!
      let y = nums.values[1]!
      if (rel) {
        x += cx
        y += cy
      }
      subpaths += 1
      if (subpaths > 1) {
        return {
          ok: false,
          error:
            'This SVG has disconnected subpaths (more than one moveto). Import one continuous path.',
        }
      }
      cx = x
      cy = y
      startX = x
      startY = y
      pushCorner({ x, y })
      lastC2 = null
      lastQ = null
      // Implicit lineto only when more coordinate pairs follow (not another command).
      if (i < tokens.length && typeof tokens[i] === 'number') {
        cmd = rel ? 'l' : 'L'
      } else {
        cmd = ''
      }
      continue
    }

    if (C === 'L') {
      const nums = readNums(tokens, i, 2)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let x = nums.values[0]!
      let y = nums.values[1]!
      if (rel) {
        x += cx
        y += cy
      }
      cx = x
      cy = y
      pushCorner({ x, y })
      lastC2 = null
      lastQ = null
      continue
    }

    if (C === 'H') {
      const nums = readNums(tokens, i, 1)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let x = nums.values[0]!
      if (rel) x += cx
      cx = x
      pushCorner({ x: cx, y: cy })
      lastC2 = null
      lastQ = null
      continue
    }

    if (C === 'V') {
      const nums = readNums(tokens, i, 1)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let y = nums.values[0]!
      if (rel) y += cy
      cy = y
      pushCorner({ x: cx, y: cy })
      lastC2 = null
      lastQ = null
      continue
    }

    if (C === 'C') {
      const nums = readNums(tokens, i, 6)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let [x1, y1, x2, y2, x, y] = nums.values
      if (rel) {
        x1 += cx
        y1 += cy
        x2 += cx
        y2 += cy
        x += cx
        y += cy
      }
      const p0 = { x: cx, y: cy }
      const p1 = { x: x1!, y: y1! }
      const p2 = { x: x2!, y: y2! }
      const p3 = { x: x!, y: y! }
      appendCubic(p0, p1, p2, p3)
      lastC2 = p2
      lastQ = null
      cx = p3.x
      cy = p3.y
      continue
    }

    if (C === 'S') {
      const nums = readNums(tokens, i, 4)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let [x2, y2, x, y] = nums.values
      if (rel) {
        x2 += cx
        y2 += cy
        x += cx
        y += cy
      }
      const p0 = { x: cx, y: cy }
      const p1 = lastC2
        ? { x: 2 * cx - lastC2.x, y: 2 * cy - lastC2.y }
        : { x: cx, y: cy }
      const p2 = { x: x2!, y: y2! }
      const p3 = { x: x!, y: y! }
      appendCubic(p0, p1, p2, p3)
      lastC2 = p2
      lastQ = null
      cx = p3.x
      cy = p3.y
      continue
    }

    if (C === 'Q') {
      const nums = readNums(tokens, i, 4)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let [x1, y1, x, y] = nums.values
      if (rel) {
        x1 += cx
        y1 += cy
        x += cx
        y += cy
      }
      const p0 = { x: cx, y: cy }
      const q = { x: x1!, y: y1! }
      const p3 = { x: x!, y: y! }
      // Degree elevation quadratic → cubic
      const p1 = {
        x: p0.x + (2 / 3) * (q.x - p0.x),
        y: p0.y + (2 / 3) * (q.y - p0.y),
      }
      const p2 = {
        x: p3.x + (2 / 3) * (q.x - p3.x),
        y: p3.y + (2 / 3) * (q.y - p3.y),
      }
      appendCubic(p0, p1, p2, p3)
      lastQ = q
      lastC2 = null
      cx = p3.x
      cy = p3.y
      continue
    }

    if (C === 'T') {
      const nums = readNums(tokens, i, 2)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let x = nums.values[0]!
      let y = nums.values[1]!
      if (rel) {
        x += cx
        y += cy
      }
      const p0: Point = { x: cx, y: cy }
      const q: Point = lastQ
        ? { x: 2 * cx - lastQ.x, y: 2 * cy - lastQ.y }
        : { x: cx, y: cy }
      const p3: Point = { x, y }
      const p1: Point = {
        x: p0.x + (2 / 3) * (q.x - p0.x),
        y: p0.y + (2 / 3) * (q.y - p0.y),
      }
      const p2: Point = {
        x: p3.x + (2 / 3) * (q.x - p3.x),
        y: p3.y + (2 / 3) * (q.y - p3.y),
      }
      appendCubic(p0, p1, p2, p3)
      lastQ = q
      lastC2 = null
      cx = p3.x
      cy = p3.y
      continue
    }

    if (C === 'A') {
      const nums = readNums(tokens, i, 7)
      if (!nums) return { ok: false, error: 'That SVG path is malformed.' }
      i = nums.next
      let [rx, ry, phi, large, sweep, x, y] = nums.values
      if (rel) {
        x += cx
        y += cy
      }
      const from = { x: cx, y: cy }
      const to = { x: x!, y: y! }
      const cubics = arcToCubics(
        from,
        rx!,
        ry!,
        phi!,
        large! !== 0,
        sweep! !== 0,
        to,
      )
      for (const c of cubics) {
        appendCubic(c[0]!, c[1]!, c[2]!, c[3]!)
      }
      lastC2 = null
      lastQ = null
      cx = to.x
      cy = to.y
      continue
    }

    return {
      ok: false,
      error: `Unsupported path command “${cmd}” in this SVG.`,
    }
  }

  if (subpaths === 0 || points.length < 2) {
    return {
      ok: false,
      error: 'That SVG path needs at least two points to become motion.',
    }
  }
  for (const p of points) {
    if (!isFinitePoint(p)) {
      return { ok: false, error: 'That SVG path contains invalid coordinates.' }
    }
  }
  return { ok: true, points, closed }
}

function parseViewBox(svg: Element): SvgViewBox | null {
  const raw = svg.getAttribute('viewBox')?.trim()
  if (raw) {
    const parts = raw.split(/[\s,]+/).map(Number)
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      parts[2]! > 0 &&
      parts[3]! > 0
    ) {
      return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! }
    }
  }
  const wAttr = svg.getAttribute('width')
  const hAttr = svg.getAttribute('height')
  const w = wAttr ? parseFloat(wAttr) : NaN
  const h = hAttr ? parseFloat(hAttr) : NaN
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { x: 0, y: 0, w, h }
  }
  return null
}

function viewBoxFromPoints(points: Point[]): SvgViewBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const w = Math.max(maxX - minX, 1e-6)
  const h = Math.max(maxY - minY, 1e-6)
  const pad = 0.05 * Math.max(w, h)
  return { x: minX - pad, y: minY - pad, w: w + 2 * pad, h: h + 2 * pad }
}

/** Map path-user points into stage-normalized 0..1 via viewBox. */
export function mapPointsToStage(
  points: Point[],
  viewBox: SvgViewBox,
  offset: Vec2 = { x: 0, y: 0 },
): Vec2[] {
  return points.map((p) => ({
    x: clamp01((p.x - viewBox.x) / viewBox.w + offset.x),
    y: clamp01((p.y - viewBox.y) / viewBox.h + offset.y),
  }))
}

/** Even arc-length timing across the polyline. */
export function resampleEvenSpeed(
  points: Vec2[],
  durationMs: number,
  count: number = SAMPLE_COUNT,
): MotionSample[] {
  if (points.length < 2) return []
  const duration = Math.max(MIN_RECORDING_DURATION_MS, Math.round(durationMs))
  const n = Math.max(MIN_RECORDING_SAMPLES, count)

  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y))
  }
  const total = cum[cum.length - 1]!
  if (total < 1e-9) {
    return [
      { t: 0, x: points[0]!.x, y: points[0]!.y },
      { t: duration, x: points[0]!.x, y: points[0]!.y },
    ]
  }

  const out: MotionSample[] = []
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const target = u * total
    // Binary search segment
    let lo = 0
    let hi = cum.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid]! <= target) lo = mid
      else hi = mid
    }
    const a = points[lo]!
    const b = points[Math.min(lo + 1, points.length - 1)]!
    const seg = cum[lo + 1]! - cum[lo]!
    const local = seg <= 0 ? 0 : (target - cum[lo]!) / seg
    out.push({
      t: u * duration,
      x: clamp01(a.x + (b.x - a.x) * local),
      y: clamp01(a.y + (b.y - a.y) * local),
    })
  }
  out[0]!.t = 0
  out[out.length - 1]!.t = duration
  // Preserve exact endpoints / corners at start & end
  out[0]!.x = points[0]!.x
  out[0]!.y = points[0]!.y
  out[out.length - 1]!.x = points[points.length - 1]!.x
  out[out.length - 1]!.y = points[points.length - 1]!.y
  return out
}

function extractPathFromSvgText(svgText: string):
  | { ok: true; d: string; viewBox: SvgViewBox | null }
  | { ok: false; error: string } {
  if (typeof DOMParser === 'undefined') {
    return { ok: false, error: 'SVG parsing is unavailable in this environment.' }
  }
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  } catch {
    return { ok: false, error: 'Could not parse that SVG.' }
  }
  if (doc.querySelector('parsererror')) {
    return { ok: false, error: 'Could not parse that SVG.' }
  }

  const svg = doc.querySelector('svg')
  if (!svg) return { ok: false, error: 'That file does not look like a valid SVG.' }

  const paths = Array.from(doc.querySelectorAll('path'))
  if (paths.length === 0) {
    return {
      ok: false,
      error:
        'No <path> found. Convert shapes to a single path, then try again.',
    }
  }
  if (paths.length > 1) {
    return {
      ok: false,
      error: `This SVG has ${paths.length} paths. Import one path only.`,
    }
  }

  const d = (paths[0]!.getAttribute('d') ?? '').trim()
  if (!d) return { ok: false, error: 'That <path> has an empty d attribute.' }
  if (d.length > MAX_SVG_PATH_CHARS) {
    return { ok: false, error: 'That path data is too large to import.' }
  }

  return { ok: true, d, viewBox: parseViewBox(svg) }
}

/**
 * Parse SVG text into an even-speed recording for the project duration.
 * `offset` nudges the mapped path in stage space before clamping (preview).
 */
export function importSvgPathFromText(
  svgText: string,
  durationMs: number,
  offset: Vec2 = { x: 0, y: 0 },
): SvgPathImportResult {
  if (!svgText || !svgText.trim()) {
    return err('Choose an SVG file that contains one motion path.')
  }
  if (svgText.length > MAX_IMAGE_BYTES * 2) {
    return err('That SVG file is too large.')
  }

  const security = validateSvgMarkup(svgText)
  if (security) return err(security.error)

  const extracted = extractPathFromSvgText(svgText)
  if (!extracted.ok) return err(extracted.error)

  const poly = pathDToPolyline(extracted.d)
  if (!poly.ok) return err(poly.error)

  const viewBox = extracted.viewBox ?? viewBoxFromPoints(poly.points)
  const staged = mapPointsToStage(poly.points, viewBox, offset)
  const samples = resampleEvenSpeed(staged, durationMs)
  if (samples.length < MIN_RECORDING_SAMPLES) {
    return err('Could not build enough motion samples from that path.')
  }

  const recordedDurationMs = samples[samples.length - 1]!.t
  if (recordedDurationMs < MIN_RECORDING_DURATION_MS) {
    return err('That path is too short to import as motion.')
  }

  return {
    ok: true,
    pathD: extracted.d,
    viewBox,
    samples,
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs,
    },
    closed: poly.closed,
    mappingNote: MAPPING_NOTE,
    limitations: LIMITATIONS,
  }
}

/** Re-map a successful import with a new placement offset (preview). */
export function remapSvgPathImport(
  base: SvgPathImportOk,
  durationMs: number,
  offset: Vec2,
): SvgPathImportOk {
  const poly = pathDToPolyline(base.pathD)
  if (!poly.ok) return base
  const staged = mapPointsToStage(poly.points, base.viewBox, offset)
  const samples = resampleEvenSpeed(staged, durationMs)
  return {
    ...base,
    samples,
    recording: {
      samples: samples.map((s) => ({ ...s })),
      recordedDurationMs: samples[samples.length - 1]!.t,
    },
    closed: poly.closed,
  }
}

export async function readSvgFileAsText(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('That SVG file is too large (max 1.5 MB).')
  }
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  if (
    type &&
    type !== 'image/svg+xml' &&
    type !== 'text/plain' &&
    type !== 'application/xml' &&
    type !== 'text/xml' &&
    !name.endsWith('.svg')
  ) {
    throw new Error('Choose an .svg file.')
  }
  return await file.text()
}
