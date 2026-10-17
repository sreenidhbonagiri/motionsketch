/**
 * Local image assets for actors.
 *
 * Limits (explained in UI):
 * - Max file size 1.5 MB — keeps downloaded projects and localStorage workable.
 * - Max decoded edge 2048 px — avoids huge GPU textures and oversized data URLs.
 *
 * SVGs are only ever rendered via <img src="data:..."> — never injected as markup.
 */

export const MAX_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024)
export const MAX_IMAGE_EDGE_PX = 2048

export const ALLOWED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number]

export interface ActorImageAsset {
  mimeType: AllowedImageMime
  /** Full data URL (data:<mime>;base64,...) — portable across project files. */
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
  /** Accessible short label (filename stem or user edit). */
  label: string
}

export type ImageLoadOk = { ok: true; asset: ActorImageAsset }
export type ImageLoadErr = { ok: false; error: string }
export type ImageLoadResult = ImageLoadOk | ImageLoadErr

const FORBIDDEN_SVG_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'embed',
  'object',
  'use', // can pull external resources
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'handler',
  'listener',
])

const EVENT_ATTR = /^on/i
const EXTERNAL_URL = /^(https?:|\/\/|data:text\/html)/i
const JS_URL = /^\s*javascript:/i

function isAllowedMime(value: string): value is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(value)
}

function normalizeMime(file: File): AllowedImageMime | null {
  const raw = (file.type || '').toLowerCase().trim()
  if (isAllowedMime(raw)) return raw
  // Some browsers omit type — sniff extension.
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.svg')) return 'image/svg+xml'
  return null
}

function labelFromFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '')
  const cleaned = base.replace(/[^\w\s.-]+/g, '').trim()
  return cleaned.slice(0, 64) || 'Image'
}

/** Reject active / external content in SVG source text. */
export function validateSvgMarkup(svgText: string): ImageLoadErr | null {
  if (!svgText || !/<svg[\s>]/i.test(svgText)) {
    return { ok: false, error: 'That file does not look like a valid SVG.' }
  }
  if (svgText.length > MAX_IMAGE_BYTES * 2) {
    return { ok: false, error: 'SVG is too large after decoding.' }
  }

  // Fast path string rejects before parse.
  if (/<script[\s>]/i.test(svgText)) {
    return { ok: false, error: 'SVG scripts are not allowed.' }
  }
  if (/\bjavascript\s*:/i.test(svgText)) {
    return { ok: false, error: 'SVG javascript: URLs are not allowed.' }
  }
  if (/@import/i.test(svgText)) {
    return { ok: false, error: 'SVG @import is not allowed.' }
  }

  if (typeof DOMParser === 'undefined') {
    // Node/unit fallback: rely on string checks above + tag scan.
    if (/<\/?\s*(script|foreignObject|iframe|embed|object|use)\b/i.test(svgText)) {
      return {
        ok: false,
        error: 'SVG contains unsupported active or external elements.',
      }
    }
    if (/\son[a-z]+\s*=/i.test(svgText)) {
      return { ok: false, error: 'SVG event handlers are not allowed.' }
    }
    if (/\b(?:href|xlink:href)\s*=\s*["']\s*https?:/i.test(svgText)) {
      return { ok: false, error: 'SVG external links are not allowed.' }
    }
    return null
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

  const all = doc.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    const tag = el.tagName.toLowerCase().replace(/^.*:/, '')
    if (FORBIDDEN_SVG_TAGS.has(tag)) {
      return {
        ok: false,
        error: `SVG element <${tag}> is not allowed.`,
      }
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (EVENT_ATTR.test(name)) {
        return { ok: false, error: 'SVG event handlers are not allowed.' }
      }
      if (
        name === 'href' ||
        name === 'xlink:href' ||
        name === 'src' ||
        name.endsWith(':href')
      ) {
        if (JS_URL.test(value) || EXTERNAL_URL.test(value)) {
          return {
            ok: false,
            error: 'SVG external or script URLs are not allowed.',
          }
        }
        // Allow only fragment refs (#id) or relative-looking empty; block other schemes.
        if (value && !value.startsWith('#') && /^[a-z][a-z0-9+.-]*:/i.test(value)) {
          return {
            ok: false,
            error: 'SVG linked resources are not allowed.',
          }
        }
      }
      if (name === 'style') {
        if (/url\s*\(\s*['"]?\s*https?:/i.test(value) || /expression\s*\(/i.test(value)) {
          return {
            ok: false,
            error: 'SVG styles with external URLs are not allowed.',
          }
        }
      }
    }
  }

  for (const style of Array.from(doc.getElementsByTagName('style'))) {
    const css = style.textContent ?? ''
    if (/url\s*\(\s*['"]?\s*https?:/i.test(css) || /@import/i.test(css)) {
      return {
        ok: false,
        error: 'SVG styles with external resources are not allowed.',
      }
    }
  }

  return null
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read that file.'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read that file.'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsText(file)
  })
}

function decodeRasterSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('Could not decode that image.'))
    img.src = dataUrl
  })
}

function svgViewBoxSize(
  svgText: string,
): { width: number; height: number } | null {
  if (typeof DOMParser === 'undefined') {
    const vb = /viewBox\s*=\s*["']\s*([\d.\s+-]+)["']/i.exec(svgText)
    if (vb) {
      const parts = vb[1].trim().split(/[\s,]+/).map(Number)
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] }
      }
    }
    const w = /<svg[^>]*\bwidth\s*=\s*["']([\d.]+)/i.exec(svgText)
    const h = /<svg[^>]*\bheight\s*=\s*["']([\d.]+)/i.exec(svgText)
    if (w && h) {
      const width = Number(w[1])
      const height = Number(h[1])
      if (width > 0 && height > 0) return { width, height }
    }
    return { width: 512, height: 512 }
  }
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.tagName.toLowerCase() !== 'svg') return null
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] }
    }
  }
  const w = parseFloat(svg.getAttribute('width') ?? '')
  const h = parseFloat(svg.getAttribute('height') ?? '')
  if (w > 0 && h > 0) return { width: w, height: h }
  return { width: 512, height: 512 }
}

/**
 * Validate and load a local image file into a portable actor asset.
 */
export async function loadActorImageFromFile(
  file: File,
): Promise<ImageLoadResult> {
  if (!file) {
    return { ok: false, error: 'No file selected.' }
  }
  if (file.size <= 0) {
    return { ok: false, error: 'That file is empty.' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Image is too large (max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024) * 10) / 10} MB).`,
    }
  }

  const mime = normalizeMime(file)
  if (!mime) {
    return {
      ok: false,
      error: 'Use a PNG, JPEG, WebP, or SVG image.',
    }
  }

  const label = labelFromFilename(file.name)

  try {
    if (mime === 'image/svg+xml') {
      const text = await readAsText(file)
      const invalid = validateSvgMarkup(text)
      if (invalid) return invalid

      const size = svgViewBoxSize(text)
      if (!size) {
        return { ok: false, error: 'Could not determine SVG dimensions.' }
      }
      if (
        size.width > MAX_IMAGE_EDGE_PX ||
        size.height > MAX_IMAGE_EDGE_PX
      ) {
        return {
          ok: false,
          error: `Image dimensions must be at most ${MAX_IMAGE_EDGE_PX}×${MAX_IMAGE_EDGE_PX}px.`,
        }
      }

      // Build a data URL from UTF-8 (base64) so <img> can render it safely.
      const dataUrl = await readAsDataUrl(
        new File([text], file.name, { type: 'image/svg+xml' }),
      )
      if (!dataUrl.startsWith('data:image/svg+xml')) {
        return { ok: false, error: 'Could not encode that SVG.' }
      }

      return {
        ok: true,
        asset: {
          mimeType: mime,
          dataUrl,
          naturalWidth: Math.round(size.width),
          naturalHeight: Math.round(size.height),
          label,
        },
      }
    }

    const dataUrl = await readAsDataUrl(file)
    if (!dataUrl.startsWith('data:image/')) {
      return { ok: false, error: 'Could not encode that image.' }
    }
    const dims = await decodeRasterSize(dataUrl)
    if (dims.width <= 0 || dims.height <= 0) {
      return { ok: false, error: 'Could not decode that image.' }
    }
    if (
      dims.width > MAX_IMAGE_EDGE_PX ||
      dims.height > MAX_IMAGE_EDGE_PX
    ) {
      return {
        ok: false,
        error: `Image dimensions must be at most ${MAX_IMAGE_EDGE_PX}×${MAX_IMAGE_EDGE_PX}px.`,
      }
    }

    return {
      ok: true,
      asset: {
        mimeType: mime,
        dataUrl,
        naturalWidth: dims.width,
        naturalHeight: dims.height,
        label,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load that image.',
    }
  }
}

/** Coerce a persisted image payload; returns null if missing/invalid. */
export function coerceActorImage(value: unknown): ActorImageAsset | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const mimeType =
    typeof record.mimeType === 'string' ? record.mimeType.toLowerCase() : ''
  if (!isAllowedMime(mimeType)) return null
  const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl : ''
  if (!dataUrl.startsWith('data:image/')) return null
  // Block HTML/script data URLs masquerading as images.
  if (/^data:text\/html/i.test(dataUrl) || /data:.*script/i.test(dataUrl)) {
    return null
  }
  const naturalWidth =
    typeof record.naturalWidth === 'number' && Number.isFinite(record.naturalWidth)
      ? record.naturalWidth
      : 0
  const naturalHeight =
    typeof record.naturalHeight === 'number' &&
    Number.isFinite(record.naturalHeight)
      ? record.naturalHeight
      : 0
  if (naturalWidth <= 0 || naturalHeight <= 0) return null
  if (
    naturalWidth > MAX_IMAGE_EDGE_PX ||
    naturalHeight > MAX_IMAGE_EDGE_PX
  ) {
    return null
  }
  if (mimeType === 'image/svg+xml') {
    // Best-effort: decode base64/utf8 payload and re-validate when possible.
    const comma = dataUrl.indexOf(',')
    if (comma === -1) return null
    const meta = dataUrl.slice(0, comma)
    const payload = dataUrl.slice(comma + 1)
    try {
      let text: string
      if (/;base64/i.test(meta)) {
        if (typeof atob !== 'function') return null
        text = atob(payload)
      } else {
        text = decodeURIComponent(payload)
      }
      if (validateSvgMarkup(text)) return null
    } catch {
      return null
    }
  }

  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim().slice(0, 64)
      : 'Image'

  return {
    mimeType,
    dataUrl,
    naturalWidth,
    naturalHeight,
    label,
  }
}

/** Image width/height ratio (w/h). */
export function imageAspectRatio(asset: ActorImageAsset): number {
  if (asset.naturalHeight <= 0) return 1
  return asset.naturalWidth / asset.naturalHeight
}
