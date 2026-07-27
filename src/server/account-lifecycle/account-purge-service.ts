import 'server-only'

import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { withDedicatedDatabaseClient } from '@/server/database/client'

export const accountPurgeAdvisoryLockKey = 34_033_001
export const accountPurgeCandidateSelectionLimit = 26
export const accountPurgeCandidateProcessingLimit = 25
export const accountPurgeSoftBudgetMilliseconds = 45_000

type PurgeStoredResult =
  | 'completed'
  | 'completed_backlog'
  | 'completed_with_failures'
  | 'time_budget_exhausted'
  | 'fatal_failure'

type CandidateOutcome =
  | 'purged'
  | 'missing_user'
  | 'missing_request'
  | 'not_due'
  | 'lock_timeout'
  | 'statement_timeout'
  | 'constraint_failure'
  | 'database_failure'

type CandidatePurgeResult =
  | Readonly<{ outcome: CandidateOutcome; connectionSafe: boolean }>
  | Readonly<{ outcome: 'time_budget_exhausted'; connectionSafe: boolean }>

export type AccountPurgeSweepResult =
  | Readonly<{
      result:
        | 'completed'
        | 'completed_backlog'
        | 'completed_with_failures'
        | 'time_budget_exhausted'
      examinedCount: number
      purgedCount: number
      skippedCount: number
      failedCount: number
    }>
  | Readonly<{ result: 'overlap_skipped' }>
  | Readonly<{ result: 'service_unavailable' }>

export type AccountPurgeSweepOptions = Readonly<{
  monotonicNow?: () => number
  /**
   * Test-only synchronization seam for proving that locked rechecks, rather
   * than unlocked discovery, decide whether a candidate is still purgeable.
   */
  afterCandidateDiscovery?: () => Promise<void>
  /**
   * Test-only synchronization seam for operations that must race a committed
   * user deletion without observing an early identifier release.
   */
  afterCandidateDeleted?: () => void
}>

type HeartbeatOwner = Readonly<{ runId: string; revision: number }>

type Counts = {
  examinedCount: number
  purgedCount: number
  skippedCount: number
  failedCount: number
}

function initialCounts(): Counts {
  return { examinedCount: 0, purgedCount: 0, skippedCount: 0, failedCount: 0 }
}

function categoryForCounts(
  counts: Counts,
  hasBacklog: boolean,
  budgetExhausted: boolean,
): Exclude<PurgeStoredResult, 'fatal_failure'> {
  if (budgetExhausted) return 'time_budget_exhausted'
  if (counts.failedCount > 0) return 'completed_with_failures'
  if (hasBacklog) return 'completed_backlog'
  return 'completed'
}

function recordCandidateOutcome(
  counts: Counts,
  outcome: CandidateOutcome,
): void {
  counts.examinedCount += 1
  if (outcome === 'purged') {
    counts.purgedCount += 1
  } else if (
    outcome === 'missing_user' ||
    outcome === 'missing_request' ||
    outcome === 'not_due'
  ) {
    counts.skippedCount += 1
  } else {
    counts.failedCount += 1
  }
}

function classifyCandidateError(error: unknown): CandidateOutcome {
  const code =
    error instanceof Error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
  if (code === '55P03') return 'lock_timeout'
  if (code === '57014') return 'statement_timeout'
  if (code === '23503' || code === '23505' || code === '23514') {
    return 'constraint_failure'
  }
  return 'database_failure'
}

async function rollbackIfPossible(client: PoolClient): Promise<boolean> {
  try {
    await client.query('rollback')
    return true
  } catch {
    return false
  }
}

async function startHeartbeat(client: PoolClient): Promise<HeartbeatOwner> {
  const current = await client.query<{ revision: string | number }>(
    'select revision from account_purge_run_heartbeats where singleton = true',
  )
  const previousRevision = current.rows[0]?.revision
  if (previousRevision === undefined) throw new Error('Missing purge heartbeat')

  const runId = randomUUID()
  const updated = await client.query<{ revision: string | number }>(
    `update account_purge_run_heartbeats
       set run_id = $1::uuid,
           revision = revision + 1,
           started_at = clock_timestamp(),
           completed_at = null,
           result_category = 'running',
           examined_count = 0,
           purged_count = 0,
           skipped_count = 0,
           failed_count = 0
     where singleton = true and revision = $2::bigint
     returning revision`,
    [runId, previousRevision],
  )
  const revision = updated.rows[0]?.revision
  if (revision === undefined) throw new Error('Purge heartbeat ownership lost')
  return { runId, revision: Number(revision) }
}

async function completeHeartbeat(
  client: PoolClient,
  owner: HeartbeatOwner,
  category: PurgeStoredResult,
  counts: Counts,
): Promise<void> {
  const completed = await client.query(
    `update account_purge_run_heartbeats
       set completed_at = clock_timestamp(),
           result_category = $3,
           examined_count = $4,
           purged_count = $5,
           skipped_count = $6,
           failed_count = $7
     where singleton = true and run_id = $1::uuid and revision = $2::bigint
       and result_category = 'running'`,
    [
      owner.runId,
      owner.revision,
      category,
      counts.examinedCount,
      counts.purgedCount,
      counts.skippedCount,
      counts.failedCount,
    ],
  )
  if (completed.rowCount !== 1)
    throw new Error('Purge heartbeat completion lost')
}

async function discoverCandidates(client: PoolClient): Promise<string[]> {
  const cutoffResult = await client.query<{ cutoff: Date }>(
    'select clock_timestamp() as cutoff',
  )
  const cutoff = cutoffResult.rows[0]?.cutoff
  if (cutoff === undefined)
    throw new Error('Purge discovery cutoff unavailable')
  const candidates = await client.query<{ userId: string }>(
    `select user_id as "userId"
       from account_deletion_requests
      where purge_after <= $1::timestamptz
      order by purge_after, user_id
      limit $2`,
    [cutoff, accountPurgeCandidateSelectionLimit],
  )
  return candidates.rows.map(({ userId }) => userId)
}

async function purgeCandidate(
  client: PoolClient,
  userId: string,
  remainingBudgetMilliseconds: () => number,
  afterCandidateDeleted: (() => void) | undefined,
): Promise<CandidatePurgeResult> {
  let transactionStarted = false
  let commitAttempted = false
  try {
    await client.query('begin transaction isolation level read committed')
    transactionStarted = true
    await client.query("set local lock_timeout = '2s'")

    const setRemainingStatementTimeout = async (): Promise<void> => {
      const remaining = remainingBudgetMilliseconds()
      if (remaining <= 0) throw new PurgeDeadlineExceededError()
      const statementTimeoutMilliseconds = Math.min(
        10_000,
        Math.max(1, Math.ceil(remaining)),
      )
      await client.query(
        `set local statement_timeout = '${statementTimeoutMilliseconds}ms'`,
      )
    }

    await setRemainingStatementTimeout()
    const user = await client.query(
      'select id from users where id = $1::uuid for update',
      [userId],
    )
    if (user.rowCount !== 1) {
      commitAttempted = true
      await client.query('commit')
      return { outcome: 'missing_user', connectionSafe: true }
    }
    await setRemainingStatementTimeout()
    const request = await client.query<{ due: boolean }>(
      `select purge_after <= clock_timestamp() as due
         from account_deletion_requests
        where user_id = $1::uuid
        for update`,
      [userId],
    )
    if (request.rowCount !== 1) {
      commitAttempted = true
      await client.query('commit')
      return { outcome: 'missing_request', connectionSafe: true }
    }
    if (request.rows[0]?.due !== true) {
      commitAttempted = true
      await client.query('commit')
      return { outcome: 'not_due', connectionSafe: true }
    }
    await setRemainingStatementTimeout()
    const deleted = await client.query(
      'delete from users where id = $1::uuid returning id',
      [userId],
    )
    if (deleted.rowCount !== 1)
      throw new Error('Expected exactly one purged user')
    afterCandidateDeleted?.()
    commitAttempted = true
    await client.query('commit')
    return { outcome: 'purged', connectionSafe: true }
  } catch (error) {
    if (error instanceof PurgeDeadlineExceededError) {
      return {
        outcome: 'time_budget_exhausted',
        connectionSafe: await rollbackIfPossible(client),
      }
    }
    // A failed BEGIN and an attempted COMMIT leave protocol state ambiguous.
    // Only an established, uncommitted transaction with a confirmed rollback
    // is safe to return to the pool.
    const connectionSafe =
      transactionStarted &&
      !commitAttempted &&
      (await rollbackIfPossible(client))
    return { outcome: classifyCandidateError(error), connectionSafe }
  }
}

class PurgeDeadlineExceededError extends Error {}

async function releaseAdvisoryLock(client: PoolClient): Promise<boolean> {
  try {
    const result = await client.query<{ released: boolean }>(
      'select pg_advisory_unlock($1) as released',
      [accountPurgeAdvisoryLockKey],
    )
    return result.rows[0]?.released === true
  } catch {
    return false
  }
}

/**
 * Performs a bounded, aggregate-only sweep. PostgreSQL's clock is the sole
 * eligibility authority; the monotonic clock only bounds this invocation.
 */
export async function runAccountPurgeSweep(
  options: AccountPurgeSweepOptions = {},
): Promise<AccountPurgeSweepResult> {
  const monotonicNow = options.monotonicNow ?? (() => performance.now())

  try {
    return await withDedicatedDatabaseClient<AccountPurgeSweepResult>(
      async ({ client }) => {
        let advisoryLockOwned = false
        let connectionSafe = false
        let value: AccountPurgeSweepResult = { result: 'service_unavailable' }
        let owner: HeartbeatOwner | undefined
        const counts = initialCounts()
        try {
          const lock = await client.query<{ acquired: boolean }>(
            'select pg_try_advisory_lock($1) as acquired',
            [accountPurgeAdvisoryLockKey],
          )
          if (lock.rows[0]?.acquired !== true) {
            return {
              value: { result: 'overlap_skipped' } as const,
              connectionSafe: true,
            }
          }
          advisoryLockOwned = true
          const startedMonotonic = monotonicNow()
          owner = await startHeartbeat(client)
          const candidates = await discoverCandidates(client)
          await options.afterCandidateDiscovery?.()
          let budgetExhausted = false
          let connectionUncertain = false

          for (const userId of candidates.slice(
            0,
            accountPurgeCandidateProcessingLimit,
          )) {
            if (
              monotonicNow() - startedMonotonic >=
              accountPurgeSoftBudgetMilliseconds
            ) {
              budgetExhausted = true
              break
            }
            const candidate = await purgeCandidate(
              client,
              userId,
              () =>
                accountPurgeSoftBudgetMilliseconds -
                (monotonicNow() - startedMonotonic),
              options.afterCandidateDeleted,
            )
            if (candidate.outcome === 'time_budget_exhausted') {
              budgetExhausted = true
              if (!candidate.connectionSafe) connectionUncertain = true
              break
            }
            recordCandidateOutcome(counts, candidate.outcome)
            if (!candidate.connectionSafe) {
              connectionUncertain = true
              break
            }
          }

          if (connectionUncertain) {
            value = { result: 'service_unavailable' }
          } else {
            const category = categoryForCounts(
              counts,
              candidates.length === accountPurgeCandidateSelectionLimit,
              budgetExhausted,
            )
            await completeHeartbeat(client, owner, category, counts)
            value = { result: category, ...counts }
            connectionSafe = true
          }
        } catch {
          if (owner !== undefined) {
            try {
              await completeHeartbeat(client, owner, 'fatal_failure', counts)
              connectionSafe = true
            } catch {
              connectionSafe = false
            }
          }
          value = { result: 'service_unavailable' }
        } finally {
          if (advisoryLockOwned) {
            connectionSafe =
              (await releaseAdvisoryLock(client)) && connectionSafe
            if (!connectionSafe) value = { result: 'service_unavailable' }
          }
        }
        return { value, connectionSafe }
      },
    )
  } catch {
    return { result: 'service_unavailable' }
  }
}
