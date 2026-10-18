import { filenameStemFromProjectName } from '../core/projectName'

/** Trigger a browser download for a Blob. Returns false if the API fails. */
export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

/** Trigger a browser download for a text file. Returns false if the API fails. */
export function downloadTextFile(
  text: string,
  filename: string,
  mimeType: string,
): boolean {
  try {
    return downloadBlob(new Blob([text], { type: mimeType }), filename)
  } catch {
    return false
  }
}

export function stampFilename(prefix: string, extension: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `${prefix}-${stamp}.${extension}`
}

/** Download filename using a sanitized project-name stem + timestamp. */
export function stampProjectFilename(
  projectName: string,
  extension: string,
): string {
  return stampFilename(filenameStemFromProjectName(projectName), extension)
}
