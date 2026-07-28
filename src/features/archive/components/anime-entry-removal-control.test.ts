import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useReducer, useSyncExternalStore } = vi.hoisted(() => ({
  useReducer: vi.fn(),
  useSyncExternalStore: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useReducer,
  useSyncExternalStore,
}))

import {
  AnimeEntryRemovalControl,
  publishAnimeEntryRemoval,
} from '@/features/archive/components/anime-entry-removal-control'

const props = {
  animeTitle: 'Cowboy Bebop',
  entryId: '550e8400-e29b-41d4-a716-446655440000',
  isOwnOperationPending: false,
  isPending: false,
  onRemoved: vi.fn(),
  onSubmit: async () => null,
}

function mockState(
  state: {
    mode: 'closed' | 'open'
    feedback: { tone: 'error'; message: string } | null
    focusTarget: 'cancel' | 'feedback' | 'launcher' | null
    focusVersion: number
  },
  hasHydrated = true,
) {
  useReducer.mockReturnValue([state, vi.fn()])
  useSyncExternalStore.mockReturnValue(hasHydrated)
}

describe('AnimeEntryRemovalControl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders no destructive target or dialog before hydration', () => {
    mockState(
      {
        mode: 'closed',
        feedback: null,
        focusTarget: null,
        focusVersion: 0,
      },
      false,
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRemovalControl, props),
    )

    expect(markup).toBe('')
    expect(markup).not.toContain(props.entryId)
    expect(markup).not.toContain('Remove from archive')
    expect(markup).not.toContain('<dialog')
  })

  it('renders the exact accessible native confirmation after hydration', () => {
    mockState({
      mode: 'open',
      feedback: null,
      focusTarget: 'cancel',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRemovalControl, props),
    )

    expect(markup).toContain('<dialog aria-busy="false"')
    expect(markup).toMatch(/aria-describedby="[^"]+"/)
    expect(markup).toMatch(/aria-labelledby="[^"]+"/)
    expect(markup).toContain('Remove Cowboy Bebop from your archive?')
    expect(markup).toContain(
      'Removing this entry permanently deletes its status, episode progress, personal episode total, rating, favourite, and viewing dates. This can’t be undone. The shared catalogue anime will remain.',
    )
    expect(markup.indexOf('>Cancel</button>')).toBeLessThan(
      markup.lastIndexOf('>Remove from archive</button>'),
    )
    expect(markup).toContain(
      `type="hidden" name="entryId" value="${props.entryId}"`,
    )
  })

  it('uses bounded focused failure copy inside the open dialog', () => {
    mockState({
      mode: 'open',
      feedback: {
        tone: 'error',
        message:
          'This archive entry is no longer available. Refresh your archive.',
      },
      focusTarget: 'feedback',
      focusVersion: 2,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRemovalControl, props),
    )

    expect(markup).toContain('role="alert" tabindex="-1"')
    expect(markup).toContain(
      'This archive entry is no longer available. Refresh your archive.',
    )
  })

  it('disables both actions and uses exact pending semantics', () => {
    mockState({
      mode: 'open',
      feedback: null,
      focusTarget: 'cancel',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRemovalControl, {
        ...props,
        isOwnOperationPending: true,
        isPending: true,
      }),
    )

    expect(markup).toContain('<dialog aria-busy="true"')
    expect(markup).toContain('<form aria-busy="true"')
    expect(markup.match(/disabled=""/g)).toHaveLength(3)
    expect(markup).toContain('Removing…')
  })

  it('publishes confirmed removal synchronously after closing the dialog and updating local state', () => {
    const events: string[] = []

    publishAnimeEntryRemoval({
      closeDialog: () => events.push('dialog closed'),
      dispatch: (event) => events.push(`state ${event.kind}`),
      onRemoved: () => events.push('removal published'),
    })

    expect(events).toEqual([
      'dialog closed',
      'state removed',
      'removal published',
    ])
  })
})
