import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

type Environment = Readonly<Record<string, unknown>>

const minimumCronSecretLength = 32

export type AccountPurgeEnvironment = Readonly<{
  enabled: boolean
  cronSecret: string | undefined
}>

/** The enable switch is intentionally fail-closed until the production gate. */
export function readAccountPurgeEnvironment(
  environment: Environment = process.env,
): AccountPurgeEnvironment {
  if (environment.ACCOUNT_PURGE_ENABLED !== 'true') {
    return { enabled: false, cronSecret: undefined }
  }

  const cronSecret = environment.CRON_SECRET
  if (typeof cronSecret !== 'string' || cronSecret.trim() !== cronSecret) {
    throw new Error('CRON_SECRET must be a trimmed string')
  }
  if (cronSecret.length < minimumCronSecretLength) {
    throw new Error('CRON_SECRET must be at least 32 characters')
  }

  return { enabled: true, cronSecret }
}

/**
 * Hashing fixes both operands to one length before timingSafeEqual, including
 * the differing-length case. Neither input is surfaced by this module.
 */
export function constantTimeSecretEquals(
  presentedSecret: string,
  configuredSecret: string,
): boolean {
  const presentedDigest = createHash('sha256').update(presentedSecret).digest()
  const configuredDigest = createHash('sha256')
    .update(configuredSecret)
    .digest()
  return timingSafeEqual(presentedDigest, configuredDigest)
}

export const accountPurgeMinimumCronSecretLength = minimumCronSecretLength
