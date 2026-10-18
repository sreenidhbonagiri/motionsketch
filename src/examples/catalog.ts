import {
  buildFollowTheLeaderProject,
  buildLogoEntranceProject,
  buildOrbitProject,
} from './buildScenes'
import type { Project } from '../core/types'

export type ExampleId = 'logo-entrance' | 'follow-the-leader' | 'orbit'

export interface ExampleDefinition {
  id: ExampleId
  title: string
  /** One-sentence gallery description. */
  description: string
  /** Short label for the card thumbnail aria text. */
  thumbnailLabel: string
  build: () => Project
}

/**
 * Bundled starter scenes. Each `build()` returns a fresh project graph —
 * never reuse actors/recordings across loads.
 */
export const EXAMPLE_CATALOG: readonly ExampleDefinition[] = [
  {
    id: 'logo-entrance',
    title: 'Logo entrance',
    description:
      'An original mark slides into place while rotating and scaling to its final pose.',
    thumbnailLabel: 'Logo entrance thumbnail',
    build: buildLogoEntranceProject,
  },
  {
    id: 'follow-the-leader',
    title: 'Follow the leader',
    description:
      'Three distinct tiles follow a shared route with staggered clip timing.',
    thumbnailLabel: 'Follow the leader thumbnail',
    build: buildFollowTheLeaderProject,
  },
  {
    id: 'orbit',
    title: 'Orbit',
    description:
      'A satellite loops around a stationary center with matching endpoints for a smooth repeat.',
    thumbnailLabel: 'Orbit thumbnail',
    build: buildOrbitProject,
  },
] as const

export function findExample(id: ExampleId): ExampleDefinition | undefined {
  return EXAMPLE_CATALOG.find((e) => e.id === id)
}
