import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCataloguePreferencesCoordinator } from '@/features/settings/catalogue-preferences-coordinator'

const userId = '11111111-1111-4111-8111-111111111111'

describe('catalogue preference coordinator', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'returns a signed-out gate without a preference read for %#',
    async (session) => {
      const readPreferences = vi.fn()
      const coordinate = createCataloguePreferencesCoordinator({
        getSession: vi.fn().mockResolvedValue(session),
        readPreferences,
      })

      await expect(coordinate()).resolves.toEqual({ kind: 'signed_out' })
      expect(readPreferences).not.toHaveBeenCalled()
    },
  )

  it('reads only the authoritative owner preferences', async () => {
    const readPreferences = vi.fn().mockResolvedValue({
      titleLanguage: 'original',
      adultContentEnabled: true,
    })
    const coordinate = createCataloguePreferencesCoordinator({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      readPreferences,
    })

    await expect(coordinate()).resolves.toEqual({
      kind: 'available',
      preferences: {
        titleLanguage: 'original',
        adultContentEnabled: true,
      },
    })
    expect(readPreferences).toHaveBeenCalledWith({ userId })
  })

  it('fails closed with fixed logs for session and preference failures', async () => {
    const privateDetail = 'PRIVATE_SETTINGS_FAILURE_DETAIL'
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const sessionFailure = createCataloguePreferencesCoordinator({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      readPreferences: vi.fn(),
    })
    const preferenceFailure = createCataloguePreferencesCoordinator({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      readPreferences: vi.fn().mockRejectedValue(new Error(privateDetail)),
    })

    await expect(sessionFailure()).resolves.toEqual({ kind: 'unavailable' })
    await expect(preferenceFailure()).resolves.toEqual({ kind: 'unavailable' })
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Settings session lookup failed.',
    )
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      'Catalogue preferences read failed.',
    )
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      privateDetail,
    )
  })
})
