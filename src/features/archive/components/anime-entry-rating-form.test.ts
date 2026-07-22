import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useReducer, useState, useSyncExternalStore } = vi.hoisted(() => ({
  useReducer: vi.fn(),
  useState: vi.fn(),
  useSyncExternalStore: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useReducer,
  useState,
  useSyncExternalStore,
}))

import { AnimeEntryRatingForm } from '@/features/archive/components/anime-entry-rating-form'

const props = {
  entryId: '550e8400-e29b-41d4-a716-446655440000',
  animeTitle: 'Rating fixture',
  rating: 7.5,
  isPending: false,
  onSubmit: async () => null,
}

function mockFormState(
  state: object,
  pendingCommand: 'save' | 'remove' | null = null,
) {
  useReducer.mockReturnValue([state, vi.fn()])
  useState.mockReturnValue([pendingCommand, vi.fn()])
  useSyncExternalStore.mockReturnValue(true)
}

describe('AnimeEntryRatingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders server-safe read output with no dead editor controls before hydration', () => {
    mockFormState({
      mode: 'read',
      authoritativeRating: 7.5,
      value: '7.5',
      feedback: null,
      focusTarget: null,
      focusVersion: 0,
    })
    useSyncExternalStore.mockReturnValue(false)

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRatingForm, props),
    )

    expect(markup).toContain('Rating — 7.5/10')
    expect(markup).not.toContain('Edit rating')
    expect(markup).not.toContain('<form')
  })

  it('renders exact editable fields, validation association, and explicit removal', () => {
    mockFormState({
      mode: 'edit',
      authoritativeRating: 7.5,
      value: '7.55',
      feedback: {
        tone: 'error',
        message: 'Enter a rating from 1.0 to 10.0 in steps of 0.1.',
        inputError: true,
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRatingForm, props),
    )

    expect(markup).toContain('<form aria-busy="false"')
    expect(markup).toContain('noValidate=""')
    expect(markup).toContain(
      'type="hidden" name="ratingOperation" value="save"',
    )
    expect(markup).toContain('type="hidden" name="expectedRating" value="7.5"')
    expect(markup).toContain('name="requestedRating"')
    expect(markup).toContain('min="1"')
    expect(markup).toContain('max="10"')
    expect(markup).toContain('step="0.1"')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toMatch(/aria-describedby="[^"]+"/)
    expect(markup).toContain('role="alert" tabindex="-1"')
    expect(markup).toContain('type="submit">Save rating')
    expect(markup).toContain('type="button">Remove rating</button>')
    expect(markup).toContain('type="button">Cancel</button>')
  })

  it('shows operation-specific pending copy without offering removal for unrated entries', () => {
    mockFormState(
      {
        mode: 'edit',
        authoritativeRating: null,
        value: '8.0',
        feedback: null,
        focusTarget: null,
        focusVersion: 0,
      },
      'save',
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRatingForm, {
        ...props,
        rating: null,
        isPending: true,
      }),
    )

    expect(markup).toContain('Saving rating…')
    expect(markup).not.toContain('Remove rating')
  })

  it('renders successful rating feedback as a focusable polite status target', () => {
    mockFormState({
      mode: 'read',
      authoritativeRating: 7,
      value: '7.0',
      feedback: {
        tone: 'status',
        message: 'Rating updated to 7.0/10.',
        inputError: false,
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryRatingForm, props),
    )

    expect(markup).toContain('Rating — 7.0/10')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="status" tabindex="-1"')
    expect(markup).toContain('Rating updated to 7.0/10.')
  })
})
