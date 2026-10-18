import { applySteadySpeed, processMotion } from './process'
import type { MotionSample } from './types'

/** Bound the module cache so long sessions cannot grow without limit. */
export const PROCESSED_PATH_CACHE_MAX = 48

export interface ProcessedPathCacheStats {
  hits: number
  misses: number
  size: number
  /**
   * Content-fingerprint traversals over sample arrays.
   * Warm playback must keep this at 0 — lookup is by array identity only.
   */
  fingerprintTraversals: number
}

type CacheMode = 'pm' | 'ss'

type LruEntry = {
  samples: MotionSample[]
  paramKey: string
  path: MotionSample[]
}

let hits = 0
let misses = 0
let fingerprintTraversals = 0

/**
 * Fast path: sample-array identity → param map → LRU entry.
 * Invalidates when callers replace the array reference (immutable updates).
 */
const byIdentity = new WeakMap<MotionSample[], Map<string, LruEntry>>()

/** Strong LRU so retention stays bounded while sample arrays remain live. */
const lru: LruEntry[] = []

function paramKey(
  mode: CacheMode,
  smoothing: number,
  steadySpeed: number,
  stageAspect: number,
): string {
  if (mode === 'pm') {
    return `pm:s${smoothing.toFixed(4)}:v${steadySpeed.toFixed(4)}:a${stageAspect.toFixed(6)}`
  }
  return `ss:v${steadySpeed.toFixed(4)}:a${stageAspect.toFixed(6)}`
}

/**
 * Seal committed inputs on cache admission (cold path only): freeze each sample
 * object, then the array. A frozen array alone is not enough — nested x/y/t
 * writes would otherwise mutate through and stale the identity cache.
 * Callers must replace arrays (copyPath / new takes), never mutate in place.
 */
function sealSampleArray(samples: MotionSample[]): void {
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    if (!Object.isFrozen(sample)) Object.freeze(sample)
  }
  if (!Object.isFrozen(samples)) Object.freeze(samples)
}

function touchLru(entry: LruEntry): void {
  const idx = lru.indexOf(entry)
  if (idx >= 0) lru.splice(idx, 1)
  lru.push(entry)
  while (lru.length > PROCESSED_PATH_CACHE_MAX) {
    const evicted = lru.shift()
    if (!evicted) break
    const map = byIdentity.get(evicted.samples)
    if (map?.get(evicted.paramKey) === evicted) {
      map.delete(evicted.paramKey)
    }
  }
}

function lookup(
  samples: MotionSample[],
  mode: CacheMode,
  smoothing: number,
  steadySpeed: number,
  stageAspect: number,
): MotionSample[] | null {
  const key = paramKey(mode, smoothing, steadySpeed, stageAspect)
  const entry = byIdentity.get(samples)?.get(key)
  if (!entry) return null
  hits += 1
  touchLru(entry)
  return entry.path
}

function store(
  samples: MotionSample[],
  mode: CacheMode,
  smoothing: number,
  steadySpeed: number,
  stageAspect: number,
  path: MotionSample[],
): MotionSample[] {
  sealSampleArray(samples)
  const key = paramKey(mode, smoothing, steadySpeed, stageAspect)
  let map = byIdentity.get(samples)
  if (!map) {
    map = new Map()
    byIdentity.set(samples, map)
  }
  const prev = map.get(key)
  if (prev) {
    const idx = lru.indexOf(prev)
    if (idx >= 0) lru.splice(idx, 1)
  }
  const entry: LruEntry = { samples, paramKey: key, path }
  map.set(key, entry)
  touchLru(entry)
  misses += 1
  return path
}

export function getProcessedPathCacheStats(): ProcessedPathCacheStats {
  return {
    hits,
    misses,
    size: lru.length,
    fingerprintTraversals,
  }
}

/** Test helper — clears strong LRU entries and counters. */
export function resetProcessedPathCache(): void {
  lru.length = 0
  hits = 0
  misses = 0
  fingerprintTraversals = 0
}

/**
 * Content fingerprint over sample values. Not used on the warm playback path;
 * available for tooling that needs value identity across replaced arrays.
 */
export function fingerprintSamples(samples: MotionSample[]): string {
  fingerprintTraversals += 1
  const n = samples.length
  if (n === 0) return '0'
  const a = samples[0]
  const b = samples[n - 1]
  const m = samples[n >> 1]
  let acc = n >>> 0
  const step = Math.max(1, Math.floor(n / 16))
  for (let i = 0; i < n; i += step) {
    const s = samples[i]
    acc =
      (Math.imul(acc, 33) +
        Math.round(s.t * 1000) +
        Math.round(s.x * 1e6) +
        Math.round(s.y * 1e6)) >>>
      0
  }
  return `${n}:${a.t.toFixed(3)}:${a.x.toFixed(5)}:${a.y.toFixed(5)}:${m.t.toFixed(3)}:${m.x.toFixed(5)}:${m.y.toFixed(5)}:${b.t.toFixed(3)}:${b.x.toFixed(5)}:${b.y.toFixed(5)}:${acc.toString(36)}`
}

/**
 * Cached `processMotion` keyed by sample-array identity + processing params.
 */
export function cachedProcessMotion(
  samples: MotionSample[],
  smoothing: number,
  steadySpeed: number,
  stageAspect: number,
): MotionSample[] {
  const hit = lookup(samples, 'pm', smoothing, steadySpeed, stageAspect)
  if (hit) return hit
  return store(
    samples,
    'pm',
    smoothing,
    steadySpeed,
    stageAspect,
    processMotion(samples, smoothing, steadySpeed, stageAspect),
  )
}

/**
 * Cached `applySteadySpeed` keyed by sample-array identity + params.
 */
export function cachedApplySteadySpeed(
  samples: MotionSample[],
  steadySpeed: number,
  stageAspect: number,
): MotionSample[] {
  const hit = lookup(samples, 'ss', 0, steadySpeed, stageAspect)
  if (hit) return hit
  return store(
    samples,
    'ss',
    0,
    steadySpeed,
    stageAspect,
    applySteadySpeed(samples, steadySpeed, stageAspect),
  )
}
