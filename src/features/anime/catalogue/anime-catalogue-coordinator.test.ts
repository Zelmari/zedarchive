import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createAnimeCatalogueCoordinator } from '@/features/anime/catalogue/anime-catalogue-coordinator'
import type { AnimeCatalogueViewerPage } from '@/server/database/anime-catalogue-service'

const emptyPage: AnimeCatalogueViewerPage['cataloguePage'] = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 24,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  },
}

const browseQuery = {
  kind: 'browse',
  page: 1,
  pageSize: 24,
} as const

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('createAnimeCatalogueCoordinator', () => {
  it('reads signed-out catalogue state without attempting personalization', async () => {
    const readCatalogue = vi.fn().mockResolvedValue({
      cataloguePage: emptyPage,
      memberships: null,
    })
    const coordinate = createAnimeCatalogueCoordinator({
      getSession: vi.fn().mockResolvedValue(null),
      readCatalogue,
    })

    await expect(coordinate(browseQuery)).resolves.toEqual({
      cataloguePage: emptyPage,
      archiveAccess: { kind: 'signed-out' },
    })
    expect(readCatalogue).toHaveBeenCalledWith({
      kind: 'browse',
      userId: null,
      page: 1,
      pageSize: 24,
    })
  })

  it('uses one authenticated read for policy, catalogue, and memberships', async () => {
    const memberships = [
      {
        catalogueItemId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'planned' as const,
      },
    ]
    const readCatalogue = vi.fn().mockResolvedValue({
      cataloguePage: emptyPage,
      memberships,
    })
    const coordinate = createAnimeCatalogueCoordinator({
      getSession: vi.fn().mockResolvedValue({
        user: { id: '11111111-1111-4111-8111-111111111111' },
      }),
      readCatalogue,
    })

    await expect(coordinate(browseQuery)).resolves.toEqual({
      cataloguePage: emptyPage,
      archiveAccess: { kind: 'memberships', memberships },
    })
    expect(readCatalogue).toHaveBeenCalledTimes(1)
    expect(readCatalogue).toHaveBeenCalledWith({
      kind: 'browse',
      userId: '11111111-1111-4111-8111-111111111111',
      page: 1,
      pageSize: 24,
    })
  })

  it.each(['session', 'personalization'] as const)(
    'falls back to English/adult-off with unavailable controls after a %s failure',
    async (failureKind) => {
      const privateSentinel = `PRIVATE_${failureKind.toUpperCase()}_DETAIL`
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const readCatalogue = vi
        .fn()
        .mockImplementation(
          async (request): Promise<AnimeCatalogueViewerPage> => {
            if (request.userId !== null) {
              throw new Error(privateSentinel)
            }

            return { cataloguePage: emptyPage, memberships: null }
          },
        )
      const coordinate = createAnimeCatalogueCoordinator({
        getSession:
          failureKind === 'session'
            ? vi.fn().mockRejectedValue(new Error(privateSentinel))
            : vi.fn().mockResolvedValue({
                user: { id: '11111111-1111-4111-8111-111111111111' },
              }),
        readCatalogue,
      })

      await expect(coordinate(browseQuery)).resolves.toEqual({
        cataloguePage: emptyPage,
        archiveAccess: { kind: 'controls-unavailable' },
      })
      expect(readCatalogue).toHaveBeenLastCalledWith({
        kind: 'browse',
        userId: null,
        page: 1,
        pageSize: 24,
      })
      expect(JSON.stringify(error.mock.calls)).not.toContain(privateSentinel)
    },
  )

  it('lets an anonymous fallback catalogue failure reach the route boundary', async () => {
    const coordinate = createAnimeCatalogueCoordinator({
      getSession: vi.fn().mockRejectedValue(new Error('session unavailable')),
      readCatalogue: vi
        .fn()
        .mockRejectedValue(new Error('catalogue unavailable')),
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(coordinate(browseQuery)).rejects.toThrow(
      'catalogue unavailable',
    )
  })
})
