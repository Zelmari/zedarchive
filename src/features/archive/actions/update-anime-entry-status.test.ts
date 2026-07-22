import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createUpdateAnimeEntryStatusHandler } from '@/features/archive/actions/update-anime-entry-status-handler'
import { initialUpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'

const validEntryId = '11111111-1111-4111-8111-111111111111'
const authoritativeUserId = '22222222-2222-4222-8222-222222222222'

function validFormData() {
  const formData = new FormData()
  formData.set('entryId', validEntryId)
  formData.set('expectedStatus', 'planned')
  formData.set('requestedStatus', 'completed')
  return formData
}

describe('updateAnimeEntryStatus action', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['invalid status', 'expectedStatus', 'PLANNED', 'invalid_status'],
    ['malformed target', 'entryId', 'not-a-uuid', 'unavailable'],
    ['extra field', 'userId', authoritativeUserId, 'unavailable'],
  ] as const)(
    'rejects %s before session or database work',
    async (_, fieldName, fieldValue, expectedKind) => {
      const getSession = vi.fn()
      const updateEntryStatus = vi.fn()
      const action = createUpdateAnimeEntryStatusHandler({
        getSession,
        updateEntryStatus,
      })
      const formData = validFormData()
      formData.set(fieldName, fieldValue)

      await expect(
        action(initialUpdateAnimeEntryStatusActionState, formData),
      ).resolves.toEqual({ kind: expectedKind })
      expect(getSession).not.toHaveBeenCalled()
      expect(updateEntryStatus).not.toHaveBeenCalled()
    },
  )

  it.each(['entryId', 'expectedStatus', 'requestedStatus'] as const)(
    'rejects a File-valued %s before session or database work',
    async (fieldName) => {
      const getSession = vi.fn()
      const updateEntryStatus = vi.fn()
      const action = createUpdateAnimeEntryStatusHandler({
        getSession,
        updateEntryStatus,
      })
      const formData = validFormData()
      formData.set(fieldName, new File(['untrusted'], 'untrusted.txt'))

      await action(initialUpdateAnimeEntryStatusActionState, formData)
      expect(getSession).not.toHaveBeenCalled()
      expect(updateEntryStatus).not.toHaveBeenCalled()
    },
  )

  it('passes only parsed input and the authoritative session owner to the service', async () => {
    const updateEntryStatus = vi.fn().mockResolvedValue({
      kind: 'updated',
      status: 'completed',
    })
    const action = createUpdateAnimeEntryStatusHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      updateEntryStatus,
    })

    await expect(
      action(initialUpdateAnimeEntryStatusActionState, validFormData()),
    ).resolves.toEqual({ kind: 'updated', status: 'completed' })
    expect(updateEntryStatus).toHaveBeenCalledWith({
      entryId: validEntryId,
      expectedStatus: 'planned',
      requestedStatus: 'completed',
      userId: authoritativeUserId,
    })
  })

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'fails closed without a usable authoritative session: %#',
    async (session) => {
      const updateEntryStatus = vi.fn()
      const action = createUpdateAnimeEntryStatusHandler({
        getSession: vi.fn().mockResolvedValue(session),
        updateEntryStatus,
      })

      await expect(
        action(initialUpdateAnimeEntryStatusActionState, validFormData()),
      ).resolves.toEqual({ kind: 'sign_in_required' })
      expect(updateEntryStatus).not.toHaveBeenCalled()
    },
  )

  it('sanitizes session and database failures without logging private detail', async () => {
    const privateDetail = 'PRIVATE_ENTRY_SESSION_AND_DATABASE_DETAIL'
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const sessionFailureAction = createUpdateAnimeEntryStatusHandler({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      updateEntryStatus: vi.fn(),
    })

    await expect(
      sessionFailureAction(
        initialUpdateAnimeEntryStatusActionState,
        validFormData(),
      ),
    ).resolves.toEqual({ kind: 'session_unavailable' })

    const databaseFailureAction = createUpdateAnimeEntryStatusHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      updateEntryStatus: vi.fn().mockRejectedValue(new Error(privateDetail)),
    })

    await expect(
      databaseFailureAction(
        initialUpdateAnimeEntryStatusActionState,
        validFormData(),
      ),
    ).resolves.toEqual({ kind: 'retry' })
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Anime entry status session lookup failed.',
    )
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      'Anime entry status update failed.',
    )
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      privateDetail,
    )
  })

  it.each([
    { kind: 'updated', status: 'completed' },
    { kind: 'unchanged', status: 'on_hold' },
    { kind: 'conflict', currentStatus: 'dropped' },
    { kind: 'unavailable' },
  ] as const)('returns the bounded service outcome %#', async (outcome) => {
    const action = createUpdateAnimeEntryStatusHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      updateEntryStatus: vi.fn().mockResolvedValue(outcome),
    })

    await expect(
      action(initialUpdateAnimeEntryStatusActionState, validFormData()),
    ).resolves.toEqual(outcome)
  })
})
