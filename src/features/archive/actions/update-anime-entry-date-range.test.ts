import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createUpdateAnimeEntryDateRangeHandler } from '@/features/archive/actions/update-anime-entry-date-range-handler'
import {
  entryDateNoneSentinel,
  initialUpdateAnimeEntryDateRangeActionState,
} from '@/features/archive/domain/update-anime-entry-date-range'

const entryId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

function form(): FormData {
  const data = new FormData()
  data.set('entryId', entryId)
  data.set('expectedStartDate', entryDateNoneSentinel)
  data.set('expectedFinishDate', entryDateNoneSentinel)
  data.set('requestedStartDate', '2024-02-29')
  data.set('requestedFinishDate', '2024-03-01')
  return data
}

describe('date range action', () => {
  it('returns requested-date validation before session work', async () => {
    const getSession = vi.fn()
    const updateDateRange = vi.fn()
    const data = form()
    data.set('requestedFinishDate', '2024-02-28')
    await expect(
      createUpdateAnimeEntryDateRangeHandler({ getSession, updateDateRange })(
        initialUpdateAnimeEntryDateRangeActionState,
        data,
      ),
    ).resolves.toEqual({ kind: 'invalid_dates' })
    expect(getSession).not.toHaveBeenCalled()
    expect(updateDateRange).not.toHaveBeenCalled()
  })

  it('uses the authoritative session owner and exact nullable request', async () => {
    const updateDateRange = vi.fn().mockResolvedValue({
      kind: 'updated',
      startDate: '2024-02-29',
      finishDate: '2024-03-01',
    })
    await expect(
      createUpdateAnimeEntryDateRangeHandler({
        getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
        updateDateRange,
      })(initialUpdateAnimeEntryDateRangeActionState, form()),
    ).resolves.toEqual({
      kind: 'updated',
      startDate: '2024-02-29',
      finishDate: '2024-03-01',
    })
    expect(updateDateRange).toHaveBeenCalledWith({
      entryId,
      expectedStartDate: null,
      expectedFinishDate: null,
      requestedStartDate: '2024-02-29',
      requestedFinishDate: '2024-03-01',
      userId,
    })
  })

  it.each([null, {}, { user: {} }, { user: { id: '' } }])(
    'fails closed without a usable session %#',
    async (session) => {
      const updateDateRange = vi.fn()
      await expect(
        createUpdateAnimeEntryDateRangeHandler({
          getSession: vi.fn().mockResolvedValue(session),
          updateDateRange,
        })(initialUpdateAnimeEntryDateRangeActionState, form()),
      ).resolves.toEqual({ kind: 'sign_in_required' })
      expect(updateDateRange).not.toHaveBeenCalled()
    },
  )

  it('uses fixed private-safe failure logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const privateDetail = 'PRIVATE_DATE_RANGE_DETAIL'
    const sessionFailure = createUpdateAnimeEntryDateRangeHandler({
      getSession: vi.fn().mockRejectedValue(new Error(privateDetail)),
      updateDateRange: vi.fn(),
    })
    const mutationFailure = createUpdateAnimeEntryDateRangeHandler({
      getSession: vi.fn().mockResolvedValue({ user: { id: userId } }),
      updateDateRange: vi.fn().mockRejectedValue(new Error(privateDetail)),
    })
    await expect(
      sessionFailure(initialUpdateAnimeEntryDateRangeActionState, form()),
    ).resolves.toEqual({ kind: 'session_unavailable' })
    await expect(
      mutationFailure(initialUpdateAnimeEntryDateRangeActionState, form()),
    ).resolves.toEqual({ kind: 'retry' })
    expect(error).toHaveBeenNthCalledWith(
      1,
      'Anime entry date range session lookup failed.',
    )
    expect(error).toHaveBeenNthCalledWith(
      2,
      'Anime entry date range update failed.',
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain(privateDetail)
    error.mockRestore()
  })
})
