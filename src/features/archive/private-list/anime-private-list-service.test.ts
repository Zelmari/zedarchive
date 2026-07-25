import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { readAnimeArchivePage } from '@/server/database/anime-entry-service'

describe('readAnimeArchivePage request and transaction boundary', () => {
  it.each([
    {
      userId: 'not-a-uuid',
      page: 1,
      pageSize: 24,
    },
    {
      userId: '11111111-1111-4111-8111-111111111111',
      page: 0,
      pageSize: 24,
    },
    {
      userId: '11111111-1111-4111-8111-111111111111',
      page: 1.5,
      pageSize: 24,
    },
    {
      userId: '11111111-1111-4111-8111-111111111111',
      page: 10001,
      pageSize: 24,
    },
    {
      userId: '11111111-1111-4111-8111-111111111111',
      page: 1,
      pageSize: 25,
    },
    {
      userId: '11111111-1111-4111-8111-111111111111',
      page: 1,
      pageSize: 24,
    },
    {
      userId: '11111111-1111-4111-8111-111111111111',
      page: 1,
      pageSize: 24,
      sort: 'forged-sort',
      ownerId: 'forged-extra-owner',
    },
  ])(
    'rejects an invalid or unbounded request before a transaction',
    async (request) => {
      const transaction = vi.fn()
      const database = { transaction } as unknown as NodePgDatabase

      await expect(
        readAnimeArchivePage(
          database,
          request as unknown as Parameters<typeof readAnimeArchivePage>[1],
        ),
      ).rejects.toMatchObject({ name: 'ZodError' })
      expect(transaction).not.toHaveBeenCalled()
    },
  )

  it('uses a READ COMMITTED active-account barrier before one archive payload statement', async () => {
    const expectedPage = {
      entries: [],
      pagination: {
        page: 1,
        pageSize: 24 as const,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    }
    const operations: string[] = []
    const userLimit = vi.fn(async () => {
      operations.push('active-account user lock')
      return [{ id: '11111111-1111-4111-8111-111111111111' }]
    })
    const requestLimit = vi.fn(async () => {
      operations.push('active-account request check')
      return []
    })
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            for: () => ({ limit: userLimit }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: requestLimit }),
        }),
      })
    const execute = vi.fn(async () => {
      operations.push('archive payload')
      return { rows: [{ totalItems: 0, kind: null }] }
    })
    const transactionClient = {
      execute,
      select,
    } as unknown as NodePgDatabase
    const transaction = vi.fn(
      async (operation: (client: NodePgDatabase) => Promise<unknown>) =>
        operation(transactionClient),
    )
    const database = { transaction } as unknown as NodePgDatabase

    await expect(
      readAnimeArchivePage(database, {
        userId: '11111111-1111-4111-8111-111111111111',
        page: 1,
        pageSize: 24,
        sort: 'alphabetical',
      }),
    ).resolves.toStrictEqual(expectedPage)
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'read committed',
    })
    expect(select).toHaveBeenCalledTimes(2)
    expect(userLimit).toHaveBeenCalledOnce()
    expect(requestLimit).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    expect(operations).toEqual([
      'active-account user lock',
      'active-account request check',
      'archive payload',
    ])
  })
})
