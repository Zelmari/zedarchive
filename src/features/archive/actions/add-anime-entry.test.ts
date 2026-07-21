import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { initialAddAnimeEntryActionState } from '@/features/archive/domain/add-anime-entry'
import { createAddAnimeEntryHandler } from '@/features/archive/actions/add-anime-entry-handler'

const validCatalogueItemId = '11111111-1111-4111-8111-111111111111'
const authoritativeUserId = '22222222-2222-4222-8222-222222222222'

function validFormData() {
  const formData = new FormData()
  formData.set('catalogueItemId', validCatalogueItemId)
  formData.set('status', 'planned')
  return formData
}

describe('addAnimeEntry action', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects invalid form input before session or database work', async () => {
    const getSession = vi.fn()
    const createEntry = vi.fn()
    const action = createAddAnimeEntryHandler({ getSession, createEntry })
    const formData = validFormData()
    formData.set('status', 'PLANNED')

    await expect(
      action(initialAddAnimeEntryActionState, formData),
    ).resolves.toEqual({
      kind: 'invalid_status',
    })
    expect(getSession).not.toHaveBeenCalled()
    expect(createEntry).not.toHaveBeenCalled()
  })

  it.each([
    ['status', 'invalid_status'],
    ['catalogueItemId', 'unavailable'],
  ] as const)(
    'rejects a File-valued %s before session or database work',
    async (fieldName, expectedKind) => {
      const getSession = vi.fn()
      const createEntry = vi.fn()
      const action = createAddAnimeEntryHandler({ getSession, createEntry })
      const formData = validFormData()
      formData.set(fieldName, new File(['untrusted'], 'untrusted.txt'))

      await expect(
        action(initialAddAnimeEntryActionState, formData),
      ).resolves.toEqual({ kind: expectedKind })
      expect(getSession).not.toHaveBeenCalled()
      expect(createEntry).not.toHaveBeenCalled()
    },
  )

  it('uses the session owner and ignores a forged form owner', async () => {
    const createEntry = vi.fn().mockResolvedValue({
      kind: 'created',
      status: 'planned',
    })
    const action = createAddAnimeEntryHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      createEntry,
    })
    const formData = validFormData()
    formData.set('userId', '33333333-3333-4333-8333-333333333333')

    await expect(
      action(initialAddAnimeEntryActionState, formData),
    ).resolves.toEqual({
      kind: 'created',
      status: 'planned',
    })
    expect(createEntry).toHaveBeenCalledWith({
      catalogueItemId: validCatalogueItemId,
      status: 'planned',
      userId: authoritativeUserId,
    })
  })

  it('fails closed when there is no authoritative session', async () => {
    const createEntry = vi.fn()
    const action = createAddAnimeEntryHandler({
      getSession: vi.fn().mockResolvedValue(null),
      createEntry,
    })

    await expect(
      action(initialAddAnimeEntryActionState, validFormData()),
    ).resolves.toEqual({ kind: 'sign_in_required' })
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('sanitizes session and database failures without logging private detail', async () => {
    const privateDetail = 'PRIVATE_DATABASE_AND_SESSION_DETAIL_FOR_TEST_ONLY'
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const sessionFailureAction = createAddAnimeEntryHandler({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      createEntry: vi.fn(),
    })

    await expect(
      sessionFailureAction(initialAddAnimeEntryActionState, validFormData()),
    ).resolves.toEqual({ kind: 'session_unavailable' })

    const databaseFailureAction = createAddAnimeEntryHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      createEntry: vi.fn().mockRejectedValue(new Error(privateDetail)),
    })

    await expect(
      databaseFailureAction(initialAddAnimeEntryActionState, validFormData()),
    ).resolves.toEqual({ kind: 'retry' })
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      'Add anime entry session lookup failed.',
    )
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      'Add anime entry creation failed.',
    )
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      privateDetail,
    )
  })

  it.each([
    [{ kind: 'created', status: 'completed' }],
    [{ kind: 'already_exists', status: 'on_hold' }],
    [{ kind: 'unavailable' }],
  ] as const)('returns the bounded service outcome %#', async (outcome) => {
    const action = createAddAnimeEntryHandler({
      getSession: vi.fn().mockResolvedValue({
        user: { id: authoritativeUserId },
      }),
      createEntry: vi.fn().mockResolvedValue(outcome),
    })

    await expect(
      action(initialAddAnimeEntryActionState, validFormData()),
    ).resolves.toEqual(outcome)
  })
})
