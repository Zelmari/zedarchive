import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  getAdultVisibilityFeedback,
  getTitleLanguageFeedback,
  missingAdultConfirmationMessage,
} from '@/features/settings/components/catalogue-preferences-form-state'

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState,
}))

vi.mock('react-dom', () => ({ useFormStatus }))

vi.mock('@/features/settings/actions/set-anime-title-language', () => ({
  setAnimeTitleLanguage: vi.fn(),
}))
vi.mock('@/features/settings/actions/enable-adult-content', () => ({
  enableAdultContent: vi.fn(),
}))
vi.mock('@/features/settings/actions/disable-adult-content', () => ({
  disableAdultContent: vi.fn(),
}))

import { CataloguePreferencesForms } from '@/features/settings/components/catalogue-preferences-forms'
import { CataloguePreferencesRouteContent } from '@/features/settings/components/catalogue-preferences-presentation'

describe('catalogue preference feedback', () => {
  it.each([
    [{ kind: 'updated' } as const, 'Title language saved.', 'success'],
    [{ kind: 'unchanged' } as const, 'Title language saved.', 'information'],
    [
      { kind: 'invalid' } as const,
      'Choose a valid anime title language.',
      'error',
    ],
    [
      { kind: 'sign_in_required' } as const,
      'Your session has expired. Sign in and try again.',
      'error',
    ],
    [
      { kind: 'retry' } as const,
      'We couldn’t save your title language right now. Try again.',
      'error',
    ],
  ] as const)(
    'maps title state %o to fixed feedback',
    (state, message, tone) => {
      expect(getTitleLanguageFeedback(state)).toMatchObject({ message, tone })
    },
  )

  it('uses command-specific adult success and validation copy', () => {
    expect(
      getAdultVisibilityFeedback({ kind: 'updated' }, 'enable'),
    ).toMatchObject({
      message: 'Adult content is now shown for your account.',
    })
    expect(
      getAdultVisibilityFeedback({ kind: 'updated' }, 'disable'),
    ).toMatchObject({ message: 'Adult content is now hidden.' })
    expect(
      getAdultVisibilityFeedback({ kind: 'invalid' }, 'enable'),
    ).toMatchObject({ message: missingAdultConfirmationMessage })
  })
})

describe('CataloguePreferencesForms', () => {
  it('renders the exact default title and adult confirmation commands', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(CataloguePreferencesForms, {
        preferences: {
          titleLanguage: 'english',
          adultContentEnabled: false,
        },
      }),
    )

    expect(markup).toContain('>Anime title language</legend>')
    expect(markup).toContain(
      'Choose which primary title zedarchive shows first.',
    )
    expect(markup).toMatch(
      /<input required="" type="radio" name="titleLanguage" checked="" value="english"\/>/,
    )
    expect(markup).toContain('English (default)')
    expect(markup).toContain('Romaji')
    expect(markup).toContain('Original')
    expect(markup).toContain('Save title language')
    expect(markup).toContain('>Adult content</h3>')
    expect(markup).toContain('Adult content is hidden by default.')
    expect(markup).toContain('name="confirmation"')
    expect(markup).toContain('required="" type="checkbox"')
    expect(markup).toContain('value="at-least-18"')
    expect(markup).toContain(
      'I confirm that I am at least 18 years old and want to show adult content.',
    )
    expect(markup).toContain('Show adult content')
    expect(markup).not.toContain('userId')
    expect(markup.match(/role="status"/g)).toHaveLength(2)
    expect(markup).not.toContain('za-notice')
  })

  it('renders the authoritative title selection and direct adult hide command', () => {
    useActionState.mockReturnValue([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus.mockReturnValue({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(CataloguePreferencesForms, {
        preferences: {
          titleLanguage: 'original',
          adultContentEnabled: true,
        },
      }),
    )

    expect(markup).toMatch(
      /<input required="" type="radio" name="titleLanguage" checked="" value="original"\/>/,
    )
    expect(markup).toContain(
      'Adult content is currently shown for your account.',
    )
    expect(markup).toContain('Hide adult content')
    expect(markup).not.toContain('name="confirmation"')
  })

  it('limits pending state to each form and exposes focused title feedback', () => {
    useActionState
      .mockReturnValueOnce([{ kind: 'updated' }, vi.fn(), true])
      .mockReturnValueOnce([{ kind: 'invalid' }, vi.fn(), false])
      .mockReturnValueOnce([{ kind: 'idle' }, vi.fn(), false])
    useFormStatus
      .mockReturnValueOnce({ pending: true })
      .mockReturnValueOnce({ pending: false })

    const markup = renderToStaticMarkup(
      createElement(CataloguePreferencesForms, {
        preferences: {
          titleLanguage: 'romaji',
          adultContentEnabled: false,
        },
      }),
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Saving…')
    expect(markup).toContain('Title language saved.')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('tabindex="-1"')
    expect(markup).toContain('za-notice--success')
  })
})

describe('CataloguePreferencesRouteContent', () => {
  it('renders a contextual signed-out gate', () => {
    const markup = renderToStaticMarkup(
      createElement(CataloguePreferencesRouteContent, {
        model: { kind: 'signed_out' },
      }),
    )

    expect(markup).toContain('href="/sign-in"')
    expect(markup).toContain('Sign in')
    expect(markup).toContain('to manage catalogue preferences.')
  })

  it('renders a bounded unavailable state', () => {
    const markup = renderToStaticMarkup(
      createElement(CataloguePreferencesRouteContent, {
        model: { kind: 'unavailable' },
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain(
      'Catalogue preferences are temporarily unavailable.',
    )
    expect(markup).toContain('Try again in a moment.')
  })
})
