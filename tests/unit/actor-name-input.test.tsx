import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActorNameInput } from '../../src/components/ActorNameInput'
import { ActorList } from '../../src/components/ActorList'
import { ConfirmProvider } from '../../src/hooks/useConfirm'
import { findActor } from '../../src/core/sceneActor'
import { useEditorStore } from '../../src/state/store'
import { makeActor, makeProject, makeRecording } from './helpers/project'

afterEach(() => {
  cleanup()
})

describe('ActorNameInput', () => {
  it('allows clearing the field without snapping back to Actor', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <ActorNameInput
        actorId="a1"
        committedName="Beacon"
        onCommit={onCommit}
      />,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    expect(input).toHaveValue('')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('replaces the entire name after select-all then typing', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <ActorNameInput
        actorId="a1"
        committedName="Beacon"
        onCommit={onCommit}
      />,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.tripleClick(input)
    await user.keyboard('Nova')
    expect(input).toHaveValue('Nova')
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('a1', 'Nova')
  })

  it('restores the previous name when blur commits an empty draft', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <div>
        <ActorNameInput
          actorId="a1"
          committedName="Beacon"
          onCommit={onCommit}
        />
        <button type="button">away</button>
      </div>,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    expect(input).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'away' }))
    expect(input).toHaveValue('Beacon')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('Escape cancels the draft and does not commit', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <ActorNameInput
        actorId="a1"
        committedName="Beacon"
        onCommit={onCommit}
      />,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    await user.keyboard('Temp')
    await user.keyboard('{Escape}')
    expect(input).toHaveValue('Beacon')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not double-commit when Enter is followed by blur', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <div>
        <ActorNameInput
          actorId="a1"
          committedName="Beacon"
          onCommit={onCommit}
        />
        <button type="button">away</button>
      </div>,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    await user.keyboard('Nova')
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'away' }))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('keeps an in-progress draft through unrelated prop churn', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const { rerender } = render(
      <ActorNameInput
        actorId="a1"
        committedName="Beacon"
        onCommit={onCommit}
      />,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    await user.keyboard('No')
    expect(input).toHaveValue('No')

    rerender(
      <ActorNameInput
        actorId="a1"
        committedName="Beacon"
        onCommit={onCommit}
      />,
    )
    expect(screen.getByTestId('actor-name-input')).toHaveValue('No')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('discards the draft when the actor id changes', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const { rerender } = render(
      <ActorNameInput
        actorId="a1"
        committedName="Beacon"
        onCommit={onCommit}
      />,
    )
    await user.clear(screen.getByTestId('actor-name-input'))
    await user.keyboard('Scratch')

    rerender(
      <ActorNameInput
        actorId="a2"
        committedName="Other"
        onCommit={onCommit}
      />,
    )
    expect(screen.getByTestId('actor-name-input')).toHaveValue('Other')
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('ActorList rename integration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    const project = makeProject({
      actors: [
        makeActor({
          id: 'a1',
          name: 'Shape',
          recording: makeRecording(),
        }),
        makeActor({
          id: 'a2',
          name: 'Wide',
          recording: makeRecording(),
        }),
      ],
    })
    useEditorStore.setState({
      project,
      selectedActorId: 'a1',
      mode: 'idle',
      playbackHead: 0,
      playbackDirection: 1,
      actionAnnouncement: null,
    })
  })

  it('persists a committed rename in the list while playback head updates', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmProvider>
        <ActorList />
      </ConfirmProvider>,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    expect(input).toHaveValue('')

    act(() => {
      useEditorStore.getState().setPlaybackHead(0.4)
      useEditorStore.getState().setPlaybackHead(0.7)
    })
    expect(screen.getByTestId('actor-name-input')).toHaveValue('')

    await user.keyboard('Relay')
    await user.keyboard('{Enter}')
    expect(findActor(useEditorStore.getState().project.actors, 'a1')?.name).toBe(
      'Relay',
    )
    expect(screen.getByTestId('actor-list-item-a1')).toHaveTextContent('Relay')
  })

  it('does not apply a draft to another actor when selection changes', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmProvider>
        <ActorList />
      </ConfirmProvider>,
    )
    const input = screen.getByTestId('actor-name-input')
    await user.clear(input)
    await user.keyboard('Scratch')
    await user.click(screen.getByTestId('actor-list-item-a2'))
    expect(findActor(useEditorStore.getState().project.actors, 'a2')?.name).toBe(
      'Wide',
    )
    expect(screen.getByTestId('actor-name-input')).toHaveValue('Wide')
    // Blur commits the draft for the actor that was being edited.
    expect(findActor(useEditorStore.getState().project.actors, 'a1')?.name).toBe(
      'Scratch',
    )
  })
})
