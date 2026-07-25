import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const accountDeletionCodeLength = 8
export const accountDeletionCodeExpiresInMilliseconds = 10 * 60 * 1000
export const accountDeletionReauthenticationMilliseconds = 15 * 60 * 1000
export const accountDeletionMaximumFailedAttempts = 5
export const accountDeletionMaximumSends = 3
export const accountDeletionSendWindowMilliseconds = 15 * 60 * 1000
export const accountDeletionResendCooldownMilliseconds = 60 * 1000

const codePattern = /^\d{8}$/u
const digestPattern = /^[a-f0-9]{64}$/u
const keyContext = 'zedarchive/account-deletion-code/v1'
const purpose = 'request-account-deletion'

export function createAccountDeletionCode(): string {
  return randomInt(0, 100_000_000)
    .toString()
    .padStart(accountDeletionCodeLength, '0')
}

function deriveCodeKey(authSecret: string): Buffer {
  return createHmac('sha256', authSecret).update(keyContext).digest()
}

function digestMessage(
  userId: string,
  sessionId: string,
  challengeId: string,
  code: string,
): string {
  return [purpose, userId, sessionId, challengeId, code].join('\0')
}

export function createAccountDeletionCodeDigest(
  authSecret: string,
  userId: string,
  sessionId: string,
  challengeId: string,
  code: string,
): string {
  return createHmac('sha256', deriveCodeKey(authSecret))
    .update(digestMessage(userId, sessionId, challengeId, code))
    .digest('hex')
}

export function isAccountDeletionCode(value: unknown): value is string {
  return typeof value === 'string' && codePattern.test(value)
}

export function verifyAccountDeletionCodeDigest(
  authSecret: string,
  userId: string,
  sessionId: string,
  challengeId: string,
  code: string,
  expectedDigest: string,
): boolean {
  if (!isAccountDeletionCode(code) || !digestPattern.test(expectedDigest)) {
    return false
  }

  const actual = Buffer.from(
    createAccountDeletionCodeDigest(
      authSecret,
      userId,
      sessionId,
      challengeId,
      code,
    ),
    'hex',
  )
  const expected = Buffer.from(expectedDigest, 'hex')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
