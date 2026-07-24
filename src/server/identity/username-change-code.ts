import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const usernameChangeCodeLength = 8
export const usernameChangeCodeExpiresInMilliseconds = 10 * 60 * 1000
export const usernameChangeReauthenticationMilliseconds = 15 * 60 * 1000
export const usernameChangeMaximumFailedAttempts = 5
export const usernameChangeMaximumSends = 3
export const usernameChangeSendWindowMilliseconds = 15 * 60 * 1000
export const usernameChangeResendCooldownMilliseconds = 60 * 1000

const codePattern = /^\d{8}$/u
const keyContext = 'zedarchive/username-change-code/v1'

export function createUsernameChangeCode(): string {
  return randomInt(0, 100_000_000)
    .toString()
    .padStart(usernameChangeCodeLength, '0')
}

function deriveCodeKey(authSecret: string): Buffer {
  return createHmac('sha256', authSecret).update(keyContext).digest()
}

export function createUsernameChangeCodeDigest(
  authSecret: string,
  challengeId: string,
  code: string,
): string {
  return createHmac('sha256', deriveCodeKey(authSecret))
    .update(`${challengeId}:${code}`)
    .digest('hex')
}

export function isUsernameChangeCode(value: unknown): value is string {
  return typeof value === 'string' && codePattern.test(value)
}

export function verifyUsernameChangeCodeDigest(
  authSecret: string,
  challengeId: string,
  code: string,
  expectedDigest: string,
): boolean {
  if (!isUsernameChangeCode(code) || !/^[a-f0-9]{64}$/u.test(expectedDigest)) {
    return false
  }

  const actual = Buffer.from(
    createUsernameChangeCodeDigest(authSecret, challengeId, code),
    'hex',
  )
  const expected = Buffer.from(expectedDigest, 'hex')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
