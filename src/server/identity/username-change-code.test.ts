import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createUsernameChangeCode,
  createUsernameChangeCodeDigest,
  isUsernameChangeCode,
  verifyUsernameChangeCodeDigest,
} from '@/server/identity/username-change-code'

const secret = 'ci-disposable-better-auth-secret-32chars-min'
const challengeId = '11111111-1111-4111-8111-111111111111'

describe('username change code', () => {
  it('creates fixed-width decimal codes including the supported leading-zero shape', () => {
    expect(isUsernameChangeCode('00000001')).toBe(true)
    expect(createUsernameChangeCode()).toMatch(/^\d{8}$/u)
  })

  it('creates a deterministic, domain-separated HMAC digest without storing the code', () => {
    const digest = createUsernameChangeCodeDigest(
      secret,
      challengeId,
      '00000001',
    )
    expect(digest).toMatch(/^[a-f0-9]{64}$/u)
    expect(digest).not.toContain('00000001')
    expect(digest).not.toBe(
      createUsernameChangeCodeDigest(secret, challengeId, '00000002'),
    )
    expect(
      verifyUsernameChangeCodeDigest(secret, challengeId, '00000001', digest),
    ).toBe(true)
    expect(
      verifyUsernameChangeCodeDigest(secret, challengeId, '00000002', digest),
    ).toBe(false)
  })
})
