import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createDisableAdultContentHandler } from '@/features/settings/actions/disable-adult-content-handler'
import { createEnableAdultContentHandler } from '@/features/settings/actions/enable-adult-content-handler'
import { createSetAnimeTitleLanguageHandler } from '@/features/settings/actions/set-anime-title-language-handler'
import { cataloguePreferenceRevalidationPaths } from '@/features/settings/actions/catalogue-preference-action-helpers'
import { initialCataloguePreferenceActionState } from '@/features/settings/domain/catalogue-preferences'

const authoritativeUserId = '11111111-1111-4111-8111-111111111111'

function titleFormData(value: string | File = 'romaji') {
  const formData = new FormData()
  formData.set('titleLanguage', value)
  return formData
}

function enableFormData(value: string | File = 'at-least-18') {
  const formData = new FormData()
  formData.set('confirmation', value)
  return formData
}

describe('catalogue preference actions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('revalidates only the approved personalized surfaces', () => {
    expect(cataloguePreferenceRevalidationPaths).toEqual([
      '/settings',
      '/',
      '/archive/anime',
    ])
  })

  it('rejects malformed title input before session, service, or revalidation work', async () => {
    const getSession = vi.fn()
    const setTitleLanguage = vi.fn()
    const revalidate = vi.fn()
    const action = createSetAnimeTitleLanguageHandler({
      getSession,
      setTitleLanguage,
      revalidate,
    })
    const formData = titleFormData()
    formData.set('userId', authoritativeUserId)

    await expect(
      action(initialCataloguePreferenceActionState, formData),
    ).resolves.toEqual({ kind: 'invalid' })
    expect(getSession).not.toHaveBeenCalled()
    expect(setTitleLanguage).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('passes only the parsed title and authoritative session owner', async () => {
    const setTitleLanguage = vi.fn().mockResolvedValue({ kind: 'updated' })
    const revalidate = vi.fn()
    const action = createSetAnimeTitleLanguageHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      setTitleLanguage,
      revalidate,
    })

    await expect(
      action(initialCataloguePreferenceActionState, titleFormData()),
    ).resolves.toEqual({ kind: 'updated' })
    expect(setTitleLanguage).toHaveBeenCalledWith({
      userId: authoritativeUserId,
      titleLanguage: 'romaji',
    })
    expect(revalidate).toHaveBeenCalledOnce()
  })

  it('requires exact adult confirmation before authoritative work', async () => {
    const getSession = vi.fn()
    const enableAdultContent = vi.fn()
    const revalidate = vi.fn()
    const action = createEnableAdultContentHandler({
      getSession,
      enableAdultContent,
      revalidate,
    })

    await expect(
      action(
        initialCataloguePreferenceActionState,
        enableFormData('untrusted'),
      ),
    ).resolves.toEqual({ kind: 'invalid' })
    expect(getSession).not.toHaveBeenCalled()
    expect(enableAdultContent).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('enables adult content only for the authoritative session owner', async () => {
    const enableAdultContent = vi.fn().mockResolvedValue({ kind: 'unchanged' })
    const revalidate = vi.fn()
    const action = createEnableAdultContentHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      enableAdultContent,
      revalidate,
    })

    await expect(
      action(initialCataloguePreferenceActionState, enableFormData()),
    ).resolves.toEqual({ kind: 'unchanged' })
    expect(enableAdultContent).toHaveBeenCalledWith({
      userId: authoritativeUserId,
    })
    expect(revalidate).toHaveBeenCalledOnce()
  })

  it('accepts only an empty disable command and derives its owner', async () => {
    const disableAdultContent = vi.fn().mockResolvedValue({ kind: 'updated' })
    const revalidate = vi.fn()
    const action = createDisableAdultContentHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      disableAdultContent,
      revalidate,
    })
    const malformed = new FormData()
    malformed.set('enabled', 'false')

    await expect(
      action(initialCataloguePreferenceActionState, malformed),
    ).resolves.toEqual({ kind: 'invalid' })
    expect(disableAdultContent).not.toHaveBeenCalled()
    await expect(
      action(initialCataloguePreferenceActionState, new FormData()),
    ).resolves.toEqual({ kind: 'updated' })
    expect(disableAdultContent).toHaveBeenCalledWith({
      userId: authoritativeUserId,
    })
    expect(revalidate).toHaveBeenCalledOnce()
  })

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'fails closed without a usable session: %#',
    async (session) => {
      const setTitleLanguage = vi.fn()
      const revalidate = vi.fn()
      const action = createSetAnimeTitleLanguageHandler({
        getSession: vi.fn().mockResolvedValue(session),
        setTitleLanguage,
        revalidate,
      })

      await expect(
        action(initialCataloguePreferenceActionState, titleFormData()),
      ).resolves.toEqual({ kind: 'sign_in_required' })
      expect(setTitleLanguage).not.toHaveBeenCalled()
      expect(revalidate).not.toHaveBeenCalled()
    },
  )

  it('sanitizes session and service failures', async () => {
    const privateDetail = 'PRIVATE_PREFERENCE_FAILURE_DETAIL'
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    const sessionFailure = createSetAnimeTitleLanguageHandler({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      setTitleLanguage: vi.fn(),
      revalidate: vi.fn(),
    })
    await expect(
      sessionFailure(initialCataloguePreferenceActionState, titleFormData()),
    ).resolves.toEqual({ kind: 'session_unavailable' })

    const serviceFailure = createEnableAdultContentHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      enableAdultContent: vi.fn().mockRejectedValue(new Error(privateDetail)),
      revalidate: vi.fn(),
    })
    await expect(
      serviceFailure(initialCataloguePreferenceActionState, enableFormData()),
    ).resolves.toEqual({ kind: 'retry' })

    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Catalogue title preference session lookup failed.',
    )
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      'Adult content preference enable failed.',
    )
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      privateDetail,
    )
  })

  it('preserves every committed field result when post-commit revalidation fails', async () => {
    const privateDetail = 'PRIVATE_REVALIDATION_FAILURE_DETAIL'
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const session = {
      user: { id: authoritativeUserId },
    }
    const failingRevalidate = vi.fn(() => {
      throw new Error(privateDetail)
    })
    const cases = [
      {
        action: createSetAnimeTitleLanguageHandler({
          getSession: vi.fn().mockResolvedValue(session),
          setTitleLanguage: vi.fn().mockResolvedValue({ kind: 'updated' }),
          revalidate: failingRevalidate,
        }),
        formData: titleFormData(),
        result: { kind: 'updated' },
      },
      {
        action: createEnableAdultContentHandler({
          getSession: vi.fn().mockResolvedValue(session),
          enableAdultContent: vi.fn().mockResolvedValue({ kind: 'unchanged' }),
          revalidate: failingRevalidate,
        }),
        formData: enableFormData(),
        result: { kind: 'unchanged' },
      },
      {
        action: createDisableAdultContentHandler({
          getSession: vi.fn().mockResolvedValue(session),
          disableAdultContent: vi.fn().mockResolvedValue({ kind: 'updated' }),
          revalidate: failingRevalidate,
        }),
        formData: new FormData(),
        result: { kind: 'updated' },
      },
    ] as const

    for (const testCase of cases) {
      await expect(
        testCase.action(
          initialCataloguePreferenceActionState,
          testCase.formData,
        ),
      ).resolves.toEqual(testCase.result)
    }

    expect(consoleErrorSpy).toHaveBeenCalledTimes(3)
    for (const call of consoleErrorSpy.mock.calls) {
      expect(call).toEqual(['Catalogue preference revalidation failed.'])
    }
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      privateDetail,
    )
  })
})
