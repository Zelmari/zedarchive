import { describe, expect, it, vi } from 'vitest'
import {
  consumeAnimePrivateListSortControlApplyFocus,
  getAnimePrivateListSortPreferenceBootstrapPlan,
  getAnimePrivateListSortPreferenceRestoreHref,
  getAnimePrivateListSortSubmissionHref,
  readAnimePrivateListSortPreference,
  requestAnimePrivateListSortControlApplyFocus,
  synchronizeAnimePrivateListSortControlSelect,
  writeAnimePrivateListSortPreference,
  type AnimePrivateListSortPreferenceStorage,
} from '@/features/archive/private-list/anime-private-list-sort-control'
import { ANIME_PRIVATE_LIST_SORT_STORAGE_KEY } from '@/features/archive/private-list/anime-private-list-sort'

describe('anime private-list sort preference storage', () => {
  it('returns only a valid stored sort', () => {
    const storage: AnimePrivateListSortPreferenceStorage = {
      getItem: vi.fn().mockReturnValue('highest-rated'),
      setItem: vi.fn(),
    }

    expect(readAnimePrivateListSortPreference(storage)).toBe('highest-rated')
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(
      ANIME_PRIVATE_LIST_SORT_STORAGE_KEY,
    )
  })

  it.each([null, 'alphabetically', ' highest-rated ', ''])(
    'ignores missing or malformed preference %j',
    (value) => {
      const storage: AnimePrivateListSortPreferenceStorage = {
        getItem: vi.fn().mockReturnValue(value),
        setItem: vi.fn(),
      }

      expect(readAnimePrivateListSortPreference(storage)).toBeNull()
    },
  )

  it('fails closed when preference reads throw', () => {
    const storage: AnimePrivateListSortPreferenceStorage = {
      getItem: vi.fn(() => {
        throw new Error('storage unavailable')
      }),
      setItem: vi.fn(),
    }

    expect(readAnimePrivateListSortPreference(storage)).toBeNull()
  })

  it('writes only the canonical preference key and tolerates write failure', () => {
    const setItem = vi.fn()
    const storage: AnimePrivateListSortPreferenceStorage = {
      getItem: vi.fn(),
      setItem,
    }

    writeAnimePrivateListSortPreference(storage, 'recently-added')

    expect(setItem).toHaveBeenCalledExactlyOnceWith(
      ANIME_PRIVATE_LIST_SORT_STORAGE_KEY,
      'recently-added',
    )
    expect(() =>
      writeAnimePrivateListSortPreference(
        {
          getItem: vi.fn(),
          setItem: () => {
            throw new Error('storage unavailable')
          },
        },
        'recently-added',
      ),
    ).not.toThrow()
  })

  it('does not access a missing storage boundary', () => {
    expect(readAnimePrivateListSortPreference(null)).toBeNull()
    expect(() =>
      writeAnimePrivateListSortPreference(null, 'recently-updated'),
    ).not.toThrow()
  })
})

describe('anime private-list sort navigation helpers', () => {
  it('consumes an Apply focus handoff exactly once', () => {
    expect(consumeAnimePrivateListSortControlApplyFocus()).toBe(false)

    requestAnimePrivateListSortControlApplyFocus()

    expect(consumeAnimePrivateListSortControlApplyFocus()).toBe(true)
    expect(consumeAnimePrivateListSortControlApplyFocus()).toBe(false)
  })

  it('reconciles a stale native select to the server-applied sort', () => {
    const select = { value: 'recently-updated' }

    synchronizeAnimePrivateListSortControlSelect(select, 'alphabetical')

    expect(select.value).toBe('alphabetical')
    expect(() =>
      synchronizeAnimePrivateListSortControlSelect(null, 'highest-rated'),
    ).not.toThrow()
  })

  it('resets the bare-route read guard after an explicit route', () => {
    expect(
      getAnimePrivateListSortPreferenceBootstrapPlan({
        isSortExplicit: false,
        hasReadBareRoute: false,
      }),
    ).toEqual({ hasReadBareRoute: true, shouldRead: true })
    expect(
      getAnimePrivateListSortPreferenceBootstrapPlan({
        isSortExplicit: true,
        hasReadBareRoute: true,
      }),
    ).toEqual({ hasReadBareRoute: false, shouldRead: false })
    expect(
      getAnimePrivateListSortPreferenceBootstrapPlan({
        isSortExplicit: false,
        hasReadBareRoute: false,
      }),
    ).toEqual({ hasReadBareRoute: true, shouldRead: true })
  })

  it('restores only a non-default preference from a bare route', () => {
    expect(
      getAnimePrivateListSortPreferenceRestoreHref({
        isSortExplicit: false,
        storedSort: 'highest-rated',
      }),
    ).toBe('/archive/anime?sort=highest-rated')
    expect(
      getAnimePrivateListSortPreferenceRestoreHref({
        isSortExplicit: true,
        storedSort: 'highest-rated',
      }),
    ).toBeNull()
    expect(
      getAnimePrivateListSortPreferenceRestoreHref({
        isSortExplicit: false,
        storedSort: 'alphabetical',
      }),
    ).toBeNull()
  })

  it('creates a page-one destination only for an exact submitted sort', () => {
    expect(getAnimePrivateListSortSubmissionHref('recently-added')).toBe(
      '/archive/anime?sort=recently-added',
    )
    expect(getAnimePrivateListSortSubmissionHref('not-a-sort')).toBeNull()
    expect(getAnimePrivateListSortSubmissionHref(null)).toBeNull()
  })
})
