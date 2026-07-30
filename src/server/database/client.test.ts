import type { PoolClient } from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dedicatedClientHarness = vi.hoisted(() => {
  const client = {
    release: vi.fn(),
  } as unknown as PoolClient
  const pool = {
    connect: vi.fn(async () => client),
  }

  return { client, pool }
})

vi.mock('@/config/database-environment', () => ({
  readDatabaseRuntimeEnvironment: () => ({
    databaseUrl: 'postgresql://test:test@localhost:5432/zedarchive_test',
  }),
}))

vi.mock('server-only', () => ({}))

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({})),
}))

vi.mock('pg', () => ({
  Pool: class {
    constructor() {
      return dedicatedClientHarness.pool
    }
  },
}))

const { withDedicatedDatabaseClient } = await import('@/server/database/client')

afterEach(() => {
  vi.clearAllMocks()
  dedicatedClientHarness.pool.connect.mockResolvedValue(
    dedicatedClientHarness.client,
  )
})

describe('withDedicatedDatabaseClient', () => {
  it('destroys an unsafe connection instead of returning it to the pool', async () => {
    await expect(
      withDedicatedDatabaseClient(async () => ({
        value: 'unavailable',
        connectionSafe: false,
      })),
    ).resolves.toBe('unavailable')

    expect(dedicatedClientHarness.client.release).toHaveBeenCalledWith(
      expect.any(Error),
    )
  })

  it('returns a confirmed-safe connection to the pool normally', async () => {
    await expect(
      withDedicatedDatabaseClient(async () => ({
        value: 'completed',
        connectionSafe: true,
      })),
    ).resolves.toBe('completed')

    expect(dedicatedClientHarness.client.release).toHaveBeenCalledWith(
      undefined,
    )
  })
})
