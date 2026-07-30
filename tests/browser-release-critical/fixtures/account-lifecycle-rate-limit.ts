export type AccountLifecycleRateLimitRow = Readonly<{
  id: string
  key: string
  count: number
  lastRequest: string
}>

export type AccountLifecycleRateLimitOperation =
  | 'request-password-reset'
  | 'reset-password'
  | 'sign-in'
  | 'sign-out'
  | 'verify-password'

export const accountLifecycleRateLimitKeys = {
  'sign-in': '127.0.0.1|/sign-in/email',
  'sign-out': '127.0.0.1|/sign-out',
  'request-password-reset': '127.0.0.1|/request-password-reset',
  'reset-password': '127.0.0.1|/reset-password',
  'verify-password': '127.0.0.1|/verify-password',
} as const satisfies Readonly<
  Record<AccountLifecycleRateLimitOperation, string>
>

function sameRow(
  left: AccountLifecycleRateLimitRow | undefined,
  right: AccountLifecycleRateLimitRow | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function assertExactRateLimitState(
  actual: AccountLifecycleRateLimitRow[],
  expected: AccountLifecycleRateLimitRow[],
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError('M42 rate-limit state changed unexpectedly')
  }
}

export function assertAccountLifecycleRateLimitTransition({
  after,
  before,
  key,
  minimumTimestamp,
}: Readonly<{
  after: AccountLifecycleRateLimitRow | undefined
  before: AccountLifecycleRateLimitRow | undefined
  key: string
  minimumTimestamp: number
}>) {
  if (
    after === undefined ||
    after.key !== key ||
    BigInt(after.lastRequest) < BigInt(minimumTimestamp)
  ) {
    throw new TypeError('M42 rate-limit request transition was not observed')
  }

  if (before === undefined) {
    if (after.count !== 1) {
      throw new TypeError('M42 rate-limit request transition was not observed')
    }
    return
  }

  if (
    before.key !== key ||
    after.id !== before.id ||
    ![1, before.count + 1].includes(after.count) ||
    sameRow(after, before)
  ) {
    throw new TypeError('M42 rate-limit request transition was not observed')
  }
}
