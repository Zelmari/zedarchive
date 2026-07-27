import type { PoolClient, QueryResult } from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const dedicatedClientHarness = vi.hoisted(() => ({
  client: undefined as PoolClient | undefined,
  connectionSafe: undefined as boolean | undefined,
}))

vi.mock('@/server/database/client', () => ({
  withDedicatedDatabaseClient: async <T>(
    operation: (dedicatedClient: { client: PoolClient }) => Promise<{
      value: T
      connectionSafe: boolean
    }>,
  ): Promise<T> => {
    if (dedicatedClientHarness.client === undefined) {
      throw new Error('Missing dedicated-client test harness')
    }
    const result = await operation({ client: dedicatedClientHarness.client })
    dedicatedClientHarness.connectionSafe = result.connectionSafe
    return result.value
  },
}))

const { runAccountPurgeSweep } =
  await import('@/server/account-lifecycle/account-purge-service')

type QueryHandler = (
  statement: string,
  values: readonly unknown[] | undefined,
) => Promise<QueryResult<Record<string, unknown>>>

function result(
  rows: Record<string, unknown>[] = [],
): QueryResult<Record<string, unknown>> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  }
}

function databaseError(code: string): Error & { code: string } {
  return Object.assign(new Error('database test fault'), { code })
}

function createClient(handler: QueryHandler): PoolClient {
  return {
    query: vi.fn(handler),
  } as unknown as PoolClient
}

function installClient(client: PoolClient): void {
  dedicatedClientHarness.client = client
  dedicatedClientHarness.connectionSafe = undefined
}

function is(statement: string, expected: string): boolean {
  return statement.toLowerCase().includes(expected)
}

function createHappyPathHandler(
  candidateIds: readonly string[],
  overrides: Readonly<{
    failCandidateId?: string
    failCode?: string
    unlock?: 'true' | 'false' | 'throw'
    commitFails?: boolean
    heartbeatCompletionRows?: number
  }> = {},
): QueryHandler {
  let currentCandidateId: string | undefined
  let completedHeartbeat = false

  return async (statement, values) => {
    if (is(statement, 'pg_try_advisory_lock'))
      return result([{ acquired: true }])
    if (is(statement, 'select revision from account_purge')) {
      return result([{ revision: 0 }])
    }
    if (is(statement, 'set run_id = $1::uuid')) return result([{ revision: 1 }])
    if (is(statement, 'select clock_timestamp() as cutoff')) {
      return result([{ cutoff: new Date() }])
    }
    if (
      is(statement, 'from account_deletion_requests') &&
      is(statement, 'limit $2')
    ) {
      return result(candidateIds.map((userId) => ({ userId })))
    }
    if (is(statement, 'begin transaction')) return result()
    if (is(statement, 'set local lock_timeout')) return result()
    if (is(statement, 'set local statement_timeout')) return result()
    if (is(statement, 'select id from users')) {
      currentCandidateId = String(values?.[0])
      if (
        currentCandidateId === overrides.failCandidateId &&
        overrides.failCode !== undefined
      ) {
        throw databaseError(overrides.failCode)
      }
      return result([{ id: currentCandidateId }])
    }
    if (is(statement, 'select purge_after <= clock_timestamp() as due')) {
      return result([{ due: true }])
    }
    if (is(statement, 'delete from users'))
      return result([{ id: currentCandidateId }])
    if (is(statement, 'commit')) {
      if (overrides.commitFails === true) throw databaseError('08006')
      return result()
    }
    if (is(statement, 'rollback')) return result()
    if (is(statement, 'set completed_at = clock_timestamp()')) {
      if (!completedHeartbeat) {
        completedHeartbeat = true
        return result(
          Array.from(
            { length: overrides.heartbeatCompletionRows ?? 1 },
            () => ({}),
          ),
        )
      }
      return result()
    }
    if (is(statement, 'pg_advisory_unlock')) {
      if (overrides.unlock === 'throw') throw databaseError('08006')
      return result([{ released: overrides.unlock !== 'false' }])
    }
    throw new Error(`Unexpected test query: ${statement}`)
  }
}

afterEach(() => {
  dedicatedClientHarness.client = undefined
  dedicatedClientHarness.connectionSafe = undefined
  vi.clearAllMocks()
})

describe('account purge sweep connection safety', () => {
  it.each([
    ['lock timeout', '55P03'],
    ['statement timeout', '57014'],
  ])(
    'rolls back a %s and continues to a later candidate on a sound connection',
    async (_description, failureCode) => {
      const client = createClient(
        createHappyPathHandler(['first', 'later'], {
          failCandidateId: 'first',
          failCode: failureCode,
        }),
      )
      installClient(client)

      await expect(runAccountPurgeSweep()).resolves.toEqual({
        result: 'completed_with_failures',
        examinedCount: 2,
        purgedCount: 1,
        skippedCount: 0,
        failedCount: 1,
      })
      expect(client.query).toHaveBeenCalledWith('rollback')
      expect(dedicatedClientHarness.connectionSafe).toBe(true)
    },
  )

  it('destroys the dedicated connection when advisory unlock reports false', async () => {
    installClient(createClient(createHappyPathHandler([], { unlock: 'false' })))

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'service_unavailable',
    })
    expect(dedicatedClientHarness.connectionSafe).toBe(false)
  })

  it('destroys the dedicated connection when advisory unlock throws', async () => {
    installClient(createClient(createHappyPathHandler([], { unlock: 'throw' })))

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'service_unavailable',
    })
    expect(dedicatedClientHarness.connectionSafe).toBe(false)
  })

  it('destroys the dedicated connection when BEGIN fails', async () => {
    const client = createClient(async (statement, values) => {
      if (is(statement, 'begin transaction')) throw databaseError('08006')
      return createHappyPathHandler(['only'])(statement, values)
    })
    installClient(client)

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'service_unavailable',
    })
    expect(client.query).not.toHaveBeenCalledWith('rollback')
    expect(dedicatedClientHarness.connectionSafe).toBe(false)
  })

  it('destroys the dedicated connection after an ambiguous COMMIT failure', async () => {
    const client = createClient(
      createHappyPathHandler(['only'], { commitFails: true }),
    )
    installClient(client)

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'service_unavailable',
    })
    expect(client.query).not.toHaveBeenCalledWith('rollback')
    expect(dedicatedClientHarness.connectionSafe).toBe(false)
  })

  it('never lets a stale heartbeat owner complete a newer revision', async () => {
    installClient(
      createClient(createHappyPathHandler([], { heartbeatCompletionRows: 0 })),
    )

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'service_unavailable',
    })
    expect(dedicatedClientHarness.connectionSafe).toBe(false)
  })

  it('treats duplicate discovered candidates as independently rechecked work', async () => {
    let duplicateSeen = 0
    const happyPath = createHappyPathHandler(['duplicate', 'duplicate'])
    const client = createClient(async (statement, values) => {
      if (
        is(statement, 'select id from users') &&
        values?.[0] === 'duplicate'
      ) {
        duplicateSeen += 1
        if (duplicateSeen === 2) return result()
      }
      return happyPath(statement, values)
    })
    installClient(client)

    await expect(runAccountPurgeSweep()).resolves.toEqual({
      result: 'completed',
      examinedCount: 2,
      purgedCount: 1,
      skippedCount: 1,
      failedCount: 0,
    })
  })

  it('clamps a positive fractional remaining budget to a one-millisecond statement timeout', async () => {
    const client = createClient(createHappyPathHandler(['only']))
    installClient(client)
    const monotonicValues = [0, 0, 44_999.5, 45_000]

    await expect(
      runAccountPurgeSweep({
        monotonicNow: () => monotonicValues.shift() ?? 45_000,
      }),
    ).resolves.toEqual({
      result: 'time_budget_exhausted',
      examinedCount: 0,
      purgedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    })
    expect(client.query).toHaveBeenCalledWith(
      "set local statement_timeout = '1ms'",
    )
  })
})
