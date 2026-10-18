import { coerceActor } from '../actor'
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  type AllowedImageMime,
} from '../imageAsset'
import type { ActorImage, Project } from '../types'

const MIME_EXTENSION: Record<AllowedImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export type PackageAssetFile = {
  /** Path inside the zip, e.g. `assets/asset-01.png`. */
  path: string
  /** Relative URL from package root / HTML, e.g. `assets/asset-01.png`. */
  href: string
  mimeType: AllowedImageMime
  bytes: Uint8Array
  /** Source data URL used for dedupe. */
  dataUrl: string
}

export type CollectAssetsOk = {
  ok: true
  assets: PackageAssetFile[]
  /** dataUrl → relative href for HTML src. */
  hrefByDataUrl: Map<string, string>
}

export type CollectAssetsErr = { ok: false; error: string }
export type CollectAssetsResult = CollectAssetsOk | CollectAssetsErr

function isAllowedMime(value: string): value is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(value)
}

/**
 * Decode a `data:<mime>;base64,...` URL into raw bytes.
 * Rejects non-base64 payloads and oversized buffers.
 */
export function decodeDataUrlBytes(
  dataUrl: string,
):
  | { ok: true; mimeType: AllowedImageMime; bytes: Uint8Array }
  | { ok: false; error: string } {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return { ok: false, error: 'An image asset is missing a valid data URL.' }
  }
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    return { ok: false, error: 'An image asset data URL is malformed.' }
  }
  const header = dataUrl.slice(5, comma)
  const payload = dataUrl.slice(comma + 1)
  const parts = header.split(';')
  const mimeRaw = (parts[0] || '').toLowerCase().trim()
  if (!isAllowedMime(mimeRaw)) {
    return {
      ok: false,
      error: `Unsupported image type in package export (${mimeRaw || 'unknown'}).`,
    }
  }
  const isBase64 = parts.some((p) => p.toLowerCase() === 'base64')
  if (!isBase64) {
    return {
      ok: false,
      error: 'Image assets must use base64 data URLs for packaging.',
    }
  }
  try {
    const binary = atob(payload)
    if (binary.length > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: `An image exceeds the ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB package limit.`,
      }
    }
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return { ok: true, mimeType: mimeRaw, bytes }
  } catch {
    return { ok: false, error: 'Could not decode an image asset for packaging.' }
  }
}

/** Stable package filenames — never derived from user labels. */
export function packageAssetFileName(
  index: number,
  mimeType: AllowedImageMime,
): string {
  const n = String(index).padStart(2, '0')
  return `asset-${n}.${MIME_EXTENSION[mimeType]}`
}

/**
 * Collect unique image payloads required by the scene.
 * Filenames are generated; actor labels are never used as paths.
 */
export function collectPackageAssets(project: Project): CollectAssetsResult {
  const hrefByDataUrl = new Map<string, string>()
  const assets: PackageAssetFile[] = []
  let nextIndex = 1

  for (let i = 0; i < project.actors.length; i++) {
    const appearance = coerceActor(project.actors[i].appearance)
    if (appearance.kind !== 'image' || !appearance.image) continue
    const image: ActorImage = appearance.image
    const dataUrl = image.dataUrl
    if (hrefByDataUrl.has(dataUrl)) continue

    const decoded = decodeDataUrlBytes(dataUrl)
    if (!decoded.ok) {
      return {
        ok: false,
        error: `${decoded.error} (actor “${project.actors[i].name || i + 1}”).`,
      }
    }
    if (decoded.mimeType !== image.mimeType) {
      // Prefer the data-URL mime when they disagree; still must be allowed.
    }
    const mimeType = decoded.mimeType
    const fileName = packageAssetFileName(nextIndex, mimeType)
    nextIndex += 1
    // Guard against any future generator producing unsafe names.
    if (
      fileName.includes('..') ||
      fileName.includes('/') ||
      fileName.includes('\\')
    ) {
      return { ok: false, error: 'Internal error: unsafe asset filename.' }
    }
    const path = `assets/${fileName}`
    hrefByDataUrl.set(dataUrl, path)
    assets.push({
      path,
      href: path,
      mimeType,
      bytes: decoded.bytes,
      dataUrl,
    })
  }

  return { ok: true, assets, hrefByDataUrl }
}
