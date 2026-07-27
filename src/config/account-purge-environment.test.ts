import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  accountPurgeMinimumCronSecretLength,
  constantTimeSecretEquals,
  readAccountPurgeEnvironment,
} from '@/config/account-purge-environment'

const secret = 'ci-disposable-cron-secret-with-32-characters'

describe('readAccountPurgeEnvironment', () => {
  it('is disabled unless the switch is exactly true', () => {
    for (const enabled of [undefined, '', 'TRUE', ' true', 'true ']) {
      expect(
        readAccountPurgeEnvironment({
          ACCOUNT_PURGE_ENABLED: enabled,
          CRON_SECRET: secret,
        }),
      ).toEqual({ enabled: false, cronSecret: undefined })
    }
  })

  it('accepts an exact enabled switch and a boundary-length secret', () => {
    const boundarySecret = 'a'.repeat(accountPurgeMinimumCronSecretLength)
    expect(
      readAccountPurgeEnvironment({
        ACCOUNT_PURGE_ENABLED: 'true',
        CRON_SECRET: boundarySecret,
      }),
    ).toEqual({ enabled: true, cronSecret: boundarySecret })
  })

  it.each([
    undefined,
    '',
    'a'.repeat(accountPurgeMinimumCronSecretLength - 1),
    ` ${secret}`,
    `${secret} `,
    32,
  ])('rejects an enabled invalid secret without exposing it', (value) => {
    expect(() =>
      readAccountPurgeEnvironment({
        ACCOUNT_PURGE_ENABLED: 'true',
        CRON_SECRET: value,
      }),
    ).toThrow(/CRON_SECRET/u)
    if (typeof value === 'string' && value.length > 0) {
      try {
        readAccountPurgeEnvironment({
          ACCOUNT_PURGE_ENABLED: 'true',
          CRON_SECRET: value,
        })
      } catch (error) {
        expect(error).toEqual(
          expect.objectContaining({
            message: expect.not.stringContaining(value),
          }),
        )
      }
    }
  })
})

describe('constantTimeSecretEquals', () => {
  it('compares equal, unequal, and different-length values', () => {
    expect(constantTimeSecretEquals(secret, secret)).toBe(true)
    expect(constantTimeSecretEquals(secret, `${secret}x`)).toBe(false)
    expect(
      constantTimeSecretEquals(secret, secret.replace('cron', 'crop')),
    ).toBe(false)
  })
})
