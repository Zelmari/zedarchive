import { describe, expect, it } from 'vitest'
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import {
  parseUpdateAnimeEntryStatusFormData,
  updateAnimeEntryStatusInputSchema,
} from '@/features/archive/domain/update-anime-entry-status'

const validEntryId = '11111111-1111-4111-8111-111111111111'

function createFormData(values: Record<string, string | string[]>) {
  const formData = new FormData()

  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      formData.append(name, entry)
    }
  }

  return formData
}

function validValues() {
  return {
    entryId: validEntryId,
    expectedStatus: 'planned',
    requestedStatus: 'completed',
  }
}

const statusTransitions = entryStatusValues.flatMap((expectedStatus) =>
  entryStatusValues.map((requestedStatus) => ({
    expectedStatus,
    requestedStatus,
  })),
)

describe('update anime entry status input', () => {
  it.each(statusTransitions)(
    'accepts $expectedStatus to $requestedStatus',
    ({ expectedStatus, requestedStatus }) => {
      expect(
        parseUpdateAnimeEntryStatusFormData(
          createFormData({
            entryId: validEntryId,
            expectedStatus,
            requestedStatus,
          }),
        ),
      ).toEqual({
        kind: 'valid',
        input: { entryId: validEntryId, expectedStatus, requestedStatus },
      })
    },
  )

  it.each(['expectedStatus', 'requestedStatus'] as const)(
    'rejects invalid %s values as invalid status input',
    (fieldName) => {
      for (const value of ['', 'watching', 'PLANNED']) {
        expect(
          parseUpdateAnimeEntryStatusFormData(
            createFormData({ ...validValues(), [fieldName]: value }),
          ),
        ).toEqual({ kind: 'invalid_status' })
      }

      const missingValue = validValues()
      delete missingValue[fieldName]
      expect(
        parseUpdateAnimeEntryStatusFormData(createFormData(missingValue)),
      ).toEqual({ kind: 'invalid_status' })

      expect(
        parseUpdateAnimeEntryStatusFormData(
          createFormData({
            ...validValues(),
            [fieldName]: ['planned', 'completed'],
          }),
        ),
      ).toEqual({ kind: 'invalid_status' })
    },
  )

  it.each(['expectedStatus', 'requestedStatus'] as const)(
    'rejects a File-valued %s as invalid status input',
    (fieldName) => {
      const formData = createFormData(validValues())
      formData.set(fieldName, new File(['planned'], 'status.txt'))

      expect(parseUpdateAnimeEntryStatusFormData(formData)).toEqual({
        kind: 'invalid_status',
      })
    },
  )

  it.each([
    ['missing', undefined],
    ['blank', ''],
    ['malformed', 'not-a-uuid'],
    ['v1', '11111111-1111-1111-8111-111111111111'],
    ['v7', '11111111-1111-7111-8111-111111111111'],
    ['repeated', [validEntryId, validEntryId]],
  ])('maps a %s entry ID to unavailable', (_, entryId) => {
    const values: Record<string, string | string[]> = {
      expectedStatus: 'planned',
      requestedStatus: 'completed',
    }

    if (entryId !== undefined) {
      values.entryId = entryId
    }

    expect(parseUpdateAnimeEntryStatusFormData(createFormData(values))).toEqual(
      { kind: 'unavailable' },
    )
  })

  it('maps a File-valued entry ID to unavailable', () => {
    const formData = createFormData(validValues())
    formData.set('entryId', new File([validEntryId], 'entry-id.txt'))

    expect(parseUpdateAnimeEntryStatusFormData(formData)).toEqual({
      kind: 'unavailable',
    })
  })

  it.each(['userId', 'catalogueItemId', 'updatedAt', 'unexpected'])(
    'rejects the extra %s field instead of treating it as input',
    (fieldName) => {
      expect(
        parseUpdateAnimeEntryStatusFormData(
          createFormData({ ...validValues(), [fieldName]: 'untrusted' }),
        ),
      ).toEqual({ kind: 'unavailable' })
    },
  )

  it('does not allow extra fields in the typed input contract', () => {
    expect(
      updateAnimeEntryStatusInputSchema.safeParse({
        ...validValues(),
        userId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(false)
  })
})
