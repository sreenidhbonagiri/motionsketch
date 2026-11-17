import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EasingPicker } from '../../src/components/EasingPicker'
import { useEditorStore } from '../../src/state/store'
import { buildEasingFixtureProject } from '../fixtures/easingProject'

describe('EasingPicker', () => {
  beforeEach(() => {
    const project = buildEasingFixtureProject()
    useEditorStore.setState({
      project,
      selectedActorId: project.actors[0]!.id,
      mode: 'idle',
      geometryEdit: null,
      easingUndoStack: [],
      easingRedoStack: [],
      actorEditOrder: [],
      actorEditRedoOrder: [],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('arrow navigation moves focus to the newly selected radio', async () => {
    render(createElement(EasingPicker))
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Linear', exact: true }))
    await user.keyboard('{ArrowRight}')
    const easeOut = screen.getByRole('radio', { name: 'Ease out', exact: true })
    expect(easeOut).toHaveAttribute('aria-checked', 'true')
    expect(easeOut).toHaveAttribute('tabIndex', '0')
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'easing-option-easeOut',
    )
  })

  it('uses readable label size (≥12px) without clipping class', () => {
    render(createElement(EasingPicker))
    const option = screen.getByRole('radio', { name: 'Ease in-out', exact: true })
    expect(option).toHaveAttribute('aria-label', 'Ease in-out')
    const label = screen.getByText('In-out')
    expect(label.className).toMatch(/text-xs/)
    expect(label.className).not.toMatch(/text-\[10px\]/)
  })

  it('disables picker and explains when timing is baked', () => {
    const project = buildEasingFixtureProject()
    const actor = project.actors[0]!
    const samples = actor.recording!.samples
    useEditorStore.setState({
      project: {
        ...project,
        actors: [
          {
            ...actor,
            geometryEdit: {
              samples: samples.map((s) => ({ ...s })),
              bakedSmoothing: 0,
              handleIndices: [0, samples.length - 1],
              timingBaked: true,
            },
          },
        ],
      },
      selectedActorId: actor.id,
    })
    render(createElement(EasingPicker))
    expect(screen.getByTestId('easing-option-spring')).toBeDisabled()
    expect(screen.getByTestId('easing-timing-baked-help')).toHaveTextContent(
      /baked timing/i,
    )
  })
})
