'use client'

import { useEffect, useId, useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ANIME_PRIVATE_LIST_SORT_STORAGE_KEY,
  animePrivateListSortLabels,
  animePrivateListSorts,
  isAnimePrivateListSort,
  type AnimePrivateListSort,
} from '@/features/archive/private-list/anime-private-list-sort'
import { buildAnimePrivateListPageHref } from '@/features/archive/private-list/anime-private-list-query'

const fieldClassName =
  'rounded border border-gray-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

let shouldRestoreApplyFocus = false

export function requestAnimePrivateListSortControlApplyFocus(): void {
  shouldRestoreApplyFocus = true
}

export function consumeAnimePrivateListSortControlApplyFocus(): boolean {
  const shouldFocus = shouldRestoreApplyFocus
  shouldRestoreApplyFocus = false
  return shouldFocus
}

export type AnimePrivateListSortPreferenceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function getBrowserPreferenceStorage(): AnimePrivateListSortPreferenceStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readAnimePrivateListSortPreference(
  storage: AnimePrivateListSortPreferenceStorage | null,
): AnimePrivateListSort | null {
  if (storage === null) return null

  try {
    const value = storage.getItem(ANIME_PRIVATE_LIST_SORT_STORAGE_KEY)
    return isAnimePrivateListSort(value) ? value : null
  } catch {
    return null
  }
}

export function writeAnimePrivateListSortPreference(
  storage: AnimePrivateListSortPreferenceStorage | null,
  sort: AnimePrivateListSort,
): void {
  if (storage === null) return

  try {
    storage.setItem(ANIME_PRIVATE_LIST_SORT_STORAGE_KEY, sort)
  } catch {
    // Sorting remains usable when browser storage is unavailable.
  }
}

export function getAnimePrivateListSortPreferenceRestoreHref({
  isSortExplicit,
  storedSort,
}: {
  isSortExplicit: boolean
  storedSort: AnimePrivateListSort | null
}): string | null {
  if (isSortExplicit || storedSort === null || storedSort === 'alphabetical') {
    return null
  }

  return buildAnimePrivateListPageHref({ page: 1, sort: storedSort })
}

export function getAnimePrivateListSortSubmissionHref(
  selectedSort: FormDataEntryValue | null,
): string | null {
  if (
    typeof selectedSort !== 'string' ||
    !isAnimePrivateListSort(selectedSort)
  ) {
    return null
  }

  return buildAnimePrivateListPageHref({ page: 1, sort: selectedSort })
}

export function getAnimePrivateListSortPreferenceBootstrapPlan({
  isSortExplicit,
  hasReadBareRoute,
}: {
  isSortExplicit: boolean
  hasReadBareRoute: boolean
}): { hasReadBareRoute: boolean; shouldRead: boolean } {
  if (isSortExplicit) {
    return { hasReadBareRoute: false, shouldRead: false }
  }

  if (hasReadBareRoute) {
    return { hasReadBareRoute: true, shouldRead: false }
  }

  return { hasReadBareRoute: true, shouldRead: true }
}

export function synchronizeAnimePrivateListSortControlSelect(
  select: Pick<HTMLSelectElement, 'value'> | null,
  sort: AnimePrivateListSort,
): void {
  if (select !== null) select.value = sort
}

type AnimePrivateListSortControlProps = {
  sort: AnimePrivateListSort
  isSortExplicit: boolean
  viewKey: string
  preferenceStorage?: AnimePrivateListSortPreferenceStorage | null
}

export function AnimePrivateListSortControl({
  sort,
  isSortExplicit,
  viewKey,
  preferenceStorage,
}: AnimePrivateListSortControlProps) {
  const router = useRouter()
  const selectId = useId()
  const selectRef = useRef<HTMLSelectElement>(null)
  const applyButtonRef = useRef<HTMLButtonElement>(null)
  const restoredPreferenceRef = useRef(false)

  useEffect(() => {
    synchronizeAnimePrivateListSortControlSelect(selectRef.current, sort)
    if (consumeAnimePrivateListSortControlApplyFocus()) {
      applyButtonRef.current?.focus()
    }
  }, [sort, viewKey])

  useEffect(() => {
    const bootstrapPlan = getAnimePrivateListSortPreferenceBootstrapPlan({
      isSortExplicit,
      hasReadBareRoute: restoredPreferenceRef.current,
    })
    restoredPreferenceRef.current = bootstrapPlan.hasReadBareRoute
    if (!bootstrapPlan.shouldRead) return

    const storedSort = readAnimePrivateListSortPreference(
      preferenceStorage ?? getBrowserPreferenceStorage(),
    )

    const destination = getAnimePrivateListSortPreferenceRestoreHref({
      isSortExplicit,
      storedSort,
    })
    if (destination !== null) router.replace(destination)
  }, [isSortExplicit, preferenceStorage, router])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const selectedSort = new FormData(event.currentTarget).get('sort')

    const destination = getAnimePrivateListSortSubmissionHref(selectedSort)
    if (destination === null || !isAnimePrivateListSort(selectedSort)) return

    event.preventDefault()

    writeAnimePrivateListSortPreference(
      preferenceStorage ?? getBrowserPreferenceStorage(),
      selectedSort,
    )
    requestAnimePrivateListSortControlApplyFocus()
    router.push(destination)
  }

  return (
    <form
      action="/archive/anime"
      className="flex flex-wrap items-end gap-3"
      method="get"
      onSubmit={handleSubmit}
    >
      <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={selectId}>
          Sort by
        </label>
        <select
          className={fieldClassName}
          defaultValue={sort}
          id={selectId}
          name="sort"
          ref={selectRef}
        >
          {animePrivateListSorts.map((option) => (
            <option key={option} value={option}>
              {animePrivateListSortLabels[option]}
            </option>
          ))}
        </select>
      </div>
      <button className={buttonClassName} ref={applyButtonRef} type="submit">
        Apply sort
      </button>
    </form>
  )
}
