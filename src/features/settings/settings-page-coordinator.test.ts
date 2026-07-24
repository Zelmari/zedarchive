import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSettingsPageCoordinator } from '@/features/settings/settings-page-coordinator'

const session = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  session: { id: '22222222-2222-4222-8222-222222222222' },
}

describe('settings page coordinator', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses one session read and independently preserves each available section', async () => {
    const getSession = vi.fn().mockResolvedValue(session)
    const readPreferences = vi.fn().mockRejectedValue(new Error('private'))
    const readUsernameChangeState = vi.fn().mockResolvedValue({
      kind: 'available',
      username: 'CurrentName',
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const coordinate = createSettingsPageCoordinator({
      getSession,
      readPreferences,
      readUsernameChangeState,
    })

    await expect(coordinate()).resolves.toEqual({
      kind: 'available',
      catalogue: { kind: 'unavailable' },
      username: { kind: 'available', username: 'CurrentName' },
    })
    expect(getSession).toHaveBeenCalledOnce()
    expect(readPreferences).toHaveBeenCalledWith({ userId: session.user.id })
    expect(readUsernameChangeState).toHaveBeenCalledWith({
      userId: session.user.id,
      sessionId: session.session.id,
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Catalogue preferences read failed.',
    )
  })

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'returns the signed-out gate without private reads for %#',
    async (session) => {
      const readPreferences = vi.fn()
      const readUsernameChangeState = vi.fn()
      const coordinate = createSettingsPageCoordinator({
        getSession: vi.fn().mockResolvedValue(session),
        readPreferences,
        readUsernameChangeState,
      })

      await expect(coordinate()).resolves.toEqual({ kind: 'signed_out' })
      expect(readPreferences).not.toHaveBeenCalled()
      expect(readUsernameChangeState).not.toHaveBeenCalled()
    },
  )

  it('fails closed when the session is present without the session id needed for a bound challenge', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const readPreferences = vi.fn()
    const readUsernameChangeState = vi.fn()
    const coordinate = createSettingsPageCoordinator({
      getSession: vi.fn().mockResolvedValue({ user: session.user }),
      readPreferences,
      readUsernameChangeState,
    })

    await expect(coordinate()).resolves.toEqual({ kind: 'unavailable' })
    expect(readPreferences).not.toHaveBeenCalled()
    expect(readUsernameChangeState).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Settings session identity was unavailable.',
    )
  })
})
