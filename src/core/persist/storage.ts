import {
  STORAGE_KEY,
  parseSnapshotJson,
  serializeSnapshot,
  type PersistParseResult,
  type PersistedSnapshot,
} from './document'

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadStoredResult =
  | { status: 'empty' }
  | { status: 'ok'; snapshot: PersistedSnapshot; raw: string }
  | { status: 'invalid'; error: string; raw: string }
  | { status: 'error'; error: string }

export type WriteStoredResult =
  | { status: 'ok' }
  | { status: 'error'; error: string }

export function getLocalStorageAdapter(): StorageAdapter | null {
  try {
    if (typeof localStorage === 'undefined') return null
    // Touch to detect disabled / private-mode quirks early.
    const probe = '__motionsketch_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

export function loadStoredSnapshot(
  adapter: StorageAdapter,
  key: string = STORAGE_KEY,
): LoadStoredResult {
  let raw: string | null
  try {
    raw = adapter.getItem(key)
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not read storage.',
    }
  }

  if (raw === null || raw === '') {
    return { status: 'empty' }
  }

  const parsed: PersistParseResult = parseSnapshotJson(raw)
  if (!parsed.ok) {
    return { status: 'invalid', error: parsed.error, raw }
  }

  return { status: 'ok', snapshot: parsed.snapshot, raw }
}

export function writeStoredSnapshot(
  adapter: StorageAdapter,
  snapshot: PersistedSnapshot,
  key: string = STORAGE_KEY,
): WriteStoredResult {
  try {
    adapter.setItem(key, serializeSnapshot(snapshot))
    return { status: 'ok' }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not write storage.',
    }
  }
}

export function clearStoredSnapshot(
  adapter: StorageAdapter,
  key: string = STORAGE_KEY,
): WriteStoredResult {
  try {
    adapter.removeItem(key)
    return { status: 'ok' }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not clear storage.',
    }
  }
}

/** In-memory adapter for unit tests. */
export function createMemoryStorage(
  initial?: Record<string, string>,
): StorageAdapter {
  const map = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key, value) {
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}
