import {
  buildSnapshot,
  parseSnapshotJson,
  serializeSnapshot,
  type PersistedSnapshot,
} from '../core/persist/document'
import { cloneSceneActor } from '../core/sceneActor'
import type { Project } from '../core/types'
import { EXAMPLE_CATALOG, findExample, type ExampleId } from './catalog'

export type ExampleLoadOk = { ok: true; snapshot: PersistedSnapshot; title: string }
export type ExampleLoadErr = { ok: false; error: string }
export type ExampleLoadResult = ExampleLoadOk | ExampleLoadErr

/** Deep-clone a project graph (actors, recordings, transforms, clips). */
export function cloneExampleProject(project: Project): Project {
  return {
    version: 1,
    stageAspect: project.stageAspect,
    playback: { ...project.playback },
    actors: project.actors.map((a) => cloneSceneActor(a)),
  }
}

/**
 * Build a fresh example, round-trip through the normal persist validation
 * path, and return an isolated snapshot. Authored stageAspect is preserved.
 */
export function loadExampleSnapshot(id: ExampleId): ExampleLoadResult {
  const def = findExample(id)
  if (!def) {
    return { ok: false, error: `Unknown example “${id}”.` }
  }
  const fresh = cloneExampleProject(def.build())
  const built = buildSnapshot(fresh, null, '1970-01-01T00:00:00.000Z')
  const parsed = parseSnapshotJson(serializeSnapshot(built))
  if (!parsed.ok) {
    return {
      ok: false,
      error: `Example “${def.title}” failed validation: ${parsed.error}`,
    }
  }
  // Clone again so callers cannot mutate the validated snapshot’s project.
  return {
    ok: true,
    title: def.title,
    snapshot: {
      formatVersion: parsed.snapshot.formatVersion,
      savedAt: parsed.snapshot.savedAt,
      project: cloneExampleProject(parsed.snapshot.project),
    },
  }
}

/** List catalog entries (stable order). */
export function listExamples() {
  return EXAMPLE_CATALOG.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    thumbnailLabel: e.thumbnailLabel,
  }))
}
