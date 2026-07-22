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

  it('opens the archive snapshot as read-only repeatable-read', async () => {
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
    const transaction = vi.fn().mockResolvedValue(expectedPage)
    const database = { transaction } as unknown as NodePgDatabase

    await expect(
      readAnimeArchivePage(database, {
        userId: '11111111-1111-4111-8111-111111111111',
        page: 1,
        pageSize: 24,
      }),
    ).resolves.toBe(expectedPage)
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  })
})
