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

import { AnimeEntryFavouriteControl } from '@/features/archive/components/anime-entry-favourite-control'

const props = {
  entryId: '550e8400-e29b-41d4-a716-446655440000',
  isFavourite: false,
  isPending: false,
  isOwnOperationPending: false,
  onSubmit: async () => null,
}

function mockState(state: object, hasHydrated = true) {
  useReducer.mockReturnValue([state, vi.fn()])
  useSyncExternalStore.mockReturnValue(hasHydrated)
}

describe('AnimeEntryFavouriteControl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders only the server-safe favourite line before hydration', () => {
    mockState(
      {
        authoritativeFavourite: false,
        feedback: null,
        focusTarget: null,
        focusVersion: 0,
      },
      false,
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryFavouriteControl, props),
    )

    expect(markup).toContain('Favourite — No')
    expect(markup).not.toContain('Add to favourites')
    expect(markup).not.toContain('<form')
  })

  it('renders a direct text action and focusable bounded feedback after hydration', () => {
    mockState({
      authoritativeFavourite: true,
      feedback: { tone: 'status', message: 'Added to favourites.' },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryFavouriteControl, {
        ...props,
        isFavourite: true,
      }),
    )

    expect(markup).toContain('Favourite — Yes')
    expect(markup).toContain('type="button">Remove from favourites</button>')
    expect(markup).toContain('role="status" tabindex="-1"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('<form')
  })

  it('uses operation-specific pending copy and an alert for errors', () => {
    mockState({
      authoritativeFavourite: false,
      feedback: {
        tone: 'error',
        message:
          'This archive entry is no longer available. Refresh your archive.',
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryFavouriteControl, {
        ...props,
        isPending: true,
        isOwnOperationPending: true,
      }),
    )

    expect(markup).toContain('Adding to favourites…')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('role="alert" tabindex="-1"')
  })

  it('stays disabled but keeps ordinary copy while a sibling card operation is pending', () => {
    mockState({
      authoritativeFavourite: false,
      feedback: null,
      focusTarget: null,
      focusVersion: 0,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryFavouriteControl, {
        ...props,
        isPending: true,
        isOwnOperationPending: false,
      }),
    )

    expect(markup).toContain('disabled=""')
    expect(markup).toContain('Add to favourites')
    expect(markup).not.toContain('Adding to favourites…')
  })
})
