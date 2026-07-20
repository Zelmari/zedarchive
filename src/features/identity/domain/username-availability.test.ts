import { describe, expect, it } from 'vitest'
import {
  parseUsernameAvailability,
  usernameAvailabilitySchema,
} from '@/features/identity/domain/username-availability'

describe('usernameAvailabilitySchema', () => {
  it.each([
    [{ status: 'available' }],
    [{ status: 'unavailable' }],
    [{ status: 'invalid' }],
  ] as const)('accepts the exact status object %j', (value) => {
    expect(usernameAvailabilitySchema.parse(value)).toEqual(value)
  })

  it.each([
    ['missing status', {}],
    ['unknown status', { status: 'checking' }],
    ['boolean available', { status: true }],
    ['null status', { status: null }],
    ['string result', 'available'],
    ['null', null],
    ['undefined', undefined],
    ['array', [{ status: 'available' }]],
    ['extra field', { status: 'available', username: 'MediaFan' }],
    ['identity key leak', { status: 'unavailable', usernameIdentityKey: 'x' }],
    ['reason leak', { status: 'invalid', reason: 'restricted' }],
    [
      'id leak',
      { status: 'unavailable', id: '00000000-0000-4000-8000-000000000000' },
    ],
  ])('rejects %s', (_, value) => {
    expect(usernameAvailabilitySchema.safeParse(value).success).toBe(false)
  })
})

describe('parseUsernameAvailability', () => {
  it('returns the validated availability result', () => {
    expect(parseUsernameAvailability({ status: 'available' })).toEqual({
      status: 'available',
    })
    expect(parseUsernameAvailability({ status: 'unavailable' })).toEqual({
      status: 'unavailable',
    })
    expect(parseUsernameAvailability({ status: 'invalid' })).toEqual({
      status: 'invalid',
    })
  })

  it('returns null for unsafe or incomplete shapes', () => {
    expect(
      parseUsernameAvailability({ status: 'available', extra: true }),
    ).toBe(null)
    expect(parseUsernameAvailability({ available: true })).toBe(null)
    expect(parseUsernameAvailability(undefined)).toBe(null)
  })
})
