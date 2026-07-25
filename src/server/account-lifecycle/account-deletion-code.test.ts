import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createAccountDeletionCode,
  createAccountDeletionCodeDigest,
  isAccountDeletionCode,
  verifyAccountDeletionCodeDigest,
} from '@/server/account-lifecycle/account-deletion-code'

const secret = 'ci-disposable-better-auth-secret-32chars-min'
const userId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const challengeId = '33333333-3333-4333-8333-333333333333'

describe('account deletion code', () => {
  it('creates and validates fixed-width decimal codes', () => {
    expect(isAccountDeletionCode('00000001')).toBe(true)
    expect(isAccountDeletionCode('0000001')).toBe(false)
    expect(createAccountDeletionCode()).toMatch(/^\d{8}$/u)
  })

  it('binds the domain-separated digest to purpose, owner, session, challenge, and code', () => {
    const digest = createAccountDeletionCodeDigest(
      secret,
      userId,
      sessionId,
      challengeId,
      '00000001',
    )

    expect(digest).toMatch(/^[a-f0-9]{64}$/u)
    expect(digest).not.toContain('00000001')
    expect(
      verifyAccountDeletionCodeDigest(
        secret,
        userId,
        sessionId,
        challengeId,
        '00000001',
        digest,
      ),
    ).toBe(true)
    expect(
      verifyAccountDeletionCodeDigest(
        secret,
        userId,
        '44444444-4444-4444-8444-444444444444',
        challengeId,
        '00000001',
        digest,
      ),
    ).toBe(false)
    expect(
      verifyAccountDeletionCodeDigest(
        secret,
        userId,
        sessionId,
        challengeId,
        '00000002',
        digest,
      ),
    ).toBe(false)
  })
})
