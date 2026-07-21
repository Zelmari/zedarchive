import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getAddAnimeEntryFormFeedback } from '@/features/archive/components/add-anime-entry-form-state'
import {
  getAddAnimeEntryStatusValidationError,
  missingAddAnimeEntryStatusMessage,
} from '@/features/archive/components/add-anime-entry-form-validation'

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState,
}))

vi.mock('react-dom', () => ({ useFormStatus }))

vi.mock('@/features/archive/actions/add-anime-entry', () => ({
  addAnimeEntry: vi.fn(),
}))

import { AddAnimeEntryForm } from '@/features/archive/components/add-anime-entry-form'

describe('getAddAnimeEntryFormFeedback', () => {
  it('keeps idle state silent', () => {
    expect(getAddAnimeEntryFormFeedback({ kind: 'idle' })).toBeNull()
  })

  it('associates invalid status feedback with the select', () => {
    expect(getAddAnimeEntryFormFeedback({ kind: 'invalid_status' })).toEqual({
      tone: 'error',
      message: 'Choose one of the available statuses.',
      selectError: true,
    })
  })

  it.each([
    [
      { kind: 'created', status: 'planned' } as const,
      'Added to your archive as Plan to watch.',
    ],
    [
      { kind: 'already_exists', status: 'completed' } as const,
      'Already in your archive as Completed.',
    ],
    [
      { kind: 'sign_in_required' } as const,
      'Sign in to add anime to your archive.',
    ],
    [
      { kind: 'session_unavailable' } as const,
      'Archive controls are temporarily unavailable. Please try again.',
    ],
    [
      { kind: 'unavailable' } as const,
      'This anime is no longer available to add.',
    ],
    [
      { kind: 'retry' } as const,
      'We could not add this anime. Please try again.',
    ],
  ])('returns bounded feedback for %o', (state, message) => {
    const feedback = getAddAnimeEntryFormFeedback(state)

    expect(feedback).toMatchObject({ message, selectError: false })
  })
})

describe('getAddAnimeEntryStatusValidationError', () => {
  it('requires a deliberate status choice before client-side submission', () => {
    expect(getAddAnimeEntryStatusValidationError('')).toBe(
      missingAddAnimeEntryStatusMessage,
    )
  })

  it('clears the client-side validation error when a valid status is chosen', () => {
    expect(getAddAnimeEntryStatusValidationError('planned')).toBeNull()
  })
})

describe('AddAnimeEntryForm', () => {
  it('renders a labeled, deliberate status form without user identity input', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AddAnimeEntryForm, {
        catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
        animeTitle: 'Cowboy Bebop',
      }),
    )

    expect(markup).toContain('aria-label="Add Cowboy Bebop to your archive"')
    expect(markup).toContain('noValidate=""')
    expect(markup).toContain('type="hidden"')
    expect(markup).toContain('name="catalogueItemId"')
    expect(markup).toContain('value="550e8400-e29b-41d4-a716-446655440000"')
    expect(markup).not.toContain('userId')
    expect(markup).toContain('>Status</label>')
    expect(markup).toContain('name="status" required=""')
    expect(markup).toContain('<option disabled="" value="" selected="">')
    expect(markup).toContain('Choose a status</option>')
    expect(markup).toContain('<option value="planned">Plan to watch</option>')
    expect(markup).toContain('<option value="in_progress">In progress</option>')
    expect(markup).toContain('<option value="on_hold">On hold</option>')
    expect(markup).toContain('<option value="dropped">Dropped</option>')
    expect(markup).toContain('<option value="completed">Completed</option>')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="status"')
  })

  it('renders a red inline server validation alert associated with the select', () => {
    useActionState.mockReturnValue([{ kind: 'invalid_status' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AddAnimeEntryForm, {
        catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
        animeTitle: 'Cowboy Bebop',
      }),
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toMatch(/aria-describedby="[^"]+"/)
    expect(markup).toContain('class="text-sm text-red-700"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Choose one of the available statuses.')
  })

  it('disables controls and shows the local pending label', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), true])
    useFormStatus.mockReturnValue({ pending: true })

    const markup = renderToStaticMarkup(
      createElement(AddAnimeEntryForm, {
        catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
        animeTitle: 'Cowboy Bebop',
      }),
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('name="status"')
    expect(markup).toContain('required=""')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('<button class=')
    expect(markup).toContain('disabled="" type="submit">Adding…</button>')
  })

  it('offers a focused alert with a sign-in recovery link', () => {
    useActionState.mockReturnValue([
      { kind: 'sign_in_required' },
      vi.fn(),
      false,
    ])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AddAnimeEntryForm, {
        catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
        animeTitle: 'Cowboy Bebop',
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('tabindex="-1"')
    expect(markup).toContain('href="/sign-in"')
    expect(markup).toContain('Sign in</a> to add anime to your archive.')
  })

  it.each([
    [
      { kind: 'session_unavailable' } as const,
      'Archive controls are temporarily unavailable. Please try again.',
    ],
    [
      { kind: 'retry' } as const,
      'We could not add this anime. Please try again.',
    ],
  ])('renders non-validation action feedback for %o', (state, message) => {
    useActionState.mockReturnValue([state, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(AddAnimeEntryForm, {
        catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
        animeTitle: 'Cowboy Bebop',
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain(message)
  })

  it.each([
    [
      { kind: 'created', status: 'planned' } as const,
      'In your archive — Plan to watch',
      'Added to your archive as Plan to watch.',
    ],
    [
      { kind: 'already_exists', status: 'completed' } as const,
      'In your archive — Completed',
      'Already in your archive as Completed.',
    ],
  ])(
    'shows static saved state and distinct visible live feedback for %o',
    (state, savedMessage, resultMessage) => {
      useActionState.mockReturnValue([state, vi.fn(), false])
      useFormStatus.mockReturnValue({ pending: false })

      const markup = renderToStaticMarkup(
        createElement(AddAnimeEntryForm, {
          catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
          animeTitle: 'Cowboy Bebop',
        }),
      )

      expect(markup).toContain(savedMessage)
      expect(markup).toContain(resultMessage)
      expect(markup).toContain('aria-live="polite"')
      expect(markup).toContain('role="status"')
      expect(markup).not.toContain('<form')
    },
  )
})
