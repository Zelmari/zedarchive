import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createRemoveAnimeEntryHandler } from '@/features/archive/actions/remove-anime-entry-handler'
import { initialRemoveAnimeEntryActionState } from '@/features/archive/domain/remove-anime-entry'

const entryId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

function validFormData(): FormData {
  const formData = new FormData()
  formData.set('entryId', entryId)
  return formData
}

describe('remove anime entry action handler', () => {
  it('rejects malformed input before session or removal work', async () => {
    const getSession = vi.fn()
    const removeEntry = vi.fn()
    const formData = validFormData()
    formData.set('entryId', 'not-a-uuid')

    await expect(
      createRemoveAnimeEntryHandler({ getSession, removeEntry })(
        initialRemoveAnimeEntryActionState,
        formData,
      ),
    ).resolves.toEqual({ kind: 'unavailable' })
    expect(getSession).not.toHaveBeenCalled()
    expect(removeEntry).not.toHaveBeenCalled()
  })

  it.each([{ kind: 'removed' }, { kind: 'unavailable' }] as const)(
    'uses the authoritative session owner and returns bounded outcome %#',
    async (outcome) => {
      const getSession = vi.fn().mockResolvedValue({ user: { id: userId } })
      const removeEntry = vi.fn().mockResolvedValue(outcome)

      await expect(
        createRemoveAnimeEntryHandler({ getSession, removeEntry })(
          initialRemoveAnimeEntryActionState,
          validFormData(),
        ),
      ).resolves.toEqual(outcome)
      expect(getSession).toHaveBeenCalledOnce()
      expect(removeEntry).toHaveBeenCalledWith({ entryId, userId })
    },
  )

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'fails closed without a usable authoritative session: %#',
    async (session) => {
      const removeEntry = vi.fn()

      await expect(
        createRemoveAnimeEntryHandler({
          getSession: vi.fn().mockResolvedValue(session),
          removeEntry,
        })(initialRemoveAnimeEntryActionState, validFormData()),
      ).resolves.toEqual({ kind: 'sign_in_required' })
      expect(removeEntry).not.toHaveBeenCalled()
    },
  )

  it('uses fixed private-safe failure logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const privateDetail = 'PRIVATE_REMOVAL_DETAIL'
    const sessionFailure = createRemoveAnimeEntryHandler({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      removeEntry: vi.fn(),
    })
    const removalFailure = createRemoveAnimeEntryHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      removeEntry: vi.fn().mockRejectedValue(new Error(privateDetail)),
    })

    await expect(
      sessionFailure(initialRemoveAnimeEntryActionState, validFormData()),
    ).resolves.toEqual({ kind: 'session_unavailable' })
    await expect(
      removalFailure(initialRemoveAnimeEntryActionState, validFormData()),
    ).resolves.toEqual({ kind: 'retry' })
    expect(error).toHaveBeenNthCalledWith(
      1,
      'Anime entry removal session lookup failed.',
    )
    expect(error).toHaveBeenNthCalledWith(2, 'Anime entry removal failed.')
    expect(JSON.stringify(error.mock.calls)).not.toContain(privateDetail)
    error.mockRestore()
  })
})
