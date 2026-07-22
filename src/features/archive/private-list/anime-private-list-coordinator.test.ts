import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  AnimePrivateListUnavailableError,
  createAnimePrivateListCoordinator,
} from '@/features/archive/private-list/anime-private-list-coordinator'
import type { AnimePrivateListPage } from '@/features/archive/private-list/anime-private-list-model'

const archivePage: AnimePrivateListPage = {
  entries: [],
  pagination: {
    page: 1,
    pageSize: 24,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('createAnimePrivateListCoordinator', () => {
  it('rejects invalid input before session or archive work', async () => {
    const getSession = vi.fn()
    const readArchivePage = vi.fn()
    const coordinate = createAnimePrivateListCoordinator({
      getSession,
      readArchivePage,
    })

    await expect(coordinate({ page: ['2', '3'] })).resolves.toEqual({
      kind: 'validation-error',
      message: 'Page must be provided only once',
    })
    expect(getSession).not.toHaveBeenCalled()
    expect(readArchivePage).not.toHaveBeenCalled()
  })

  it('returns a signed-out model without reading the archive', async () => {
    const readArchivePage = vi.fn()
    const coordinate = createAnimePrivateListCoordinator({
      getSession: vi.fn().mockResolvedValue(null),
      readArchivePage,
    })

    await expect(coordinate({})).resolves.toEqual({ kind: 'signed-out' })
    expect(readArchivePage).not.toHaveBeenCalled()
  })

  it('forwards exactly the session owner and parsed bounded page', async () => {
    const readArchivePage = vi.fn().mockResolvedValue(archivePage)
    const coordinate = createAnimePrivateListCoordinator({
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'authoritative-session-owner' },
      }),
      readArchivePage,
    })

    await expect(
      coordinate({ page: '2', userId: 'forged-owner', owner: 'forged-owner' }),
    ).resolves.toEqual({ kind: 'archive', page: archivePage })
    expect(readArchivePage).toHaveBeenCalledExactlyOnceWith({
      userId: 'authoritative-session-owner',
      page: 2,
      pageSize: 24,
    })
  })

  it.each([
    ['session', 'Private anime archive session lookup failed.'],
    ['archive', 'Private anime archive read failed.'],
  ] as const)(
    'sanitizes a %s failure into fixed logging and a cause-free error',
    async (failurePoint, expectedLog) => {
      const privateSentinel = 'private-user-title-sqlstate-sentinel'
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const getSession =
        failurePoint === 'session'
          ? vi.fn().mockRejectedValue(new Error(privateSentinel))
          : vi.fn().mockResolvedValue({ user: { id: 'session-owner' } })
      const readArchivePage =
        failurePoint === 'archive'
          ? vi.fn().mockRejectedValue(new Error(privateSentinel))
          : vi.fn()
      const coordinate = createAnimePrivateListCoordinator({
        getSession,
        readArchivePage,
      })

      const error = await coordinate({}).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(AnimePrivateListUnavailableError)
      expect(error).toMatchObject({
        message: 'The private anime archive is temporarily unavailable',
      })
      expect(Object.hasOwn(error as object, 'cause')).toBe(false)
      expect(String(error)).not.toContain(privateSentinel)
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(expectedLog)
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        privateSentinel,
      )
      expect(getSession).toHaveBeenCalledTimes(1)

      if (failurePoint === 'session') {
        expect(readArchivePage).not.toHaveBeenCalled()
      } else {
        expect(readArchivePage).toHaveBeenCalledTimes(1)
      }
    },
  )
})
