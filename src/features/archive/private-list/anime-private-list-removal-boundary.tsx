'use client'

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'

const AnimePrivateListRemovalContext = createContext<(() => void) | null>(null)

export type AnimePrivateListRemovalRefreshState = {
  activeRenderRevision: string | null
  hasQueuedRemoval: boolean
  isAwaitingRefresh: boolean
}

export type AnimePrivateListRemovalRefreshPlan = {
  nextState: AnimePrivateListRemovalRefreshState
  shouldFocusStatus: boolean
  shouldRefresh: boolean
}

export const initialAnimePrivateListRemovalRefreshState: AnimePrivateListRemovalRefreshState =
  {
    activeRenderRevision: null,
    hasQueuedRemoval: false,
    isAwaitingRefresh: false,
  }

export function scheduleAnimePrivateListRemovalStatusFocus({
  cancelFrame,
  currentFrame,
  focusStatus,
  requestFrame,
}: {
  cancelFrame: (frame: number) => void
  currentFrame: number | null
  focusStatus: () => void
  requestFrame: (callback: FrameRequestCallback) => number
}): number {
  if (currentFrame !== null) cancelFrame(currentFrame)
  return requestFrame(() => focusStatus())
}

export function reportAnimePrivateListRemoval(
  state: AnimePrivateListRemovalRefreshState,
  currentRenderRevision: string,
): AnimePrivateListRemovalRefreshPlan {
  if (state.isAwaitingRefresh) {
    return {
      nextState: { ...state, hasQueuedRemoval: true },
      shouldFocusStatus: false,
      shouldRefresh: false,
    }
  }

  return {
    nextState: {
      activeRenderRevision: currentRenderRevision,
      hasQueuedRemoval: false,
      isAwaitingRefresh: true,
    },
    shouldFocusStatus: false,
    shouldRefresh: true,
  }
}

export function reconcileAnimePrivateListRemovalRefresh(
  state: AnimePrivateListRemovalRefreshState,
  currentRenderRevision: string,
): AnimePrivateListRemovalRefreshPlan {
  if (
    !state.isAwaitingRefresh ||
    state.activeRenderRevision === currentRenderRevision
  ) {
    return {
      nextState: state,
      shouldFocusStatus: false,
      shouldRefresh: false,
    }
  }

  if (state.hasQueuedRemoval) {
    return {
      nextState: {
        activeRenderRevision: currentRenderRevision,
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
      },
      shouldFocusStatus: false,
      shouldRefresh: true,
    }
  }

  return {
    nextState: initialAnimePrivateListRemovalRefreshState,
    shouldFocusStatus: true,
    shouldRefresh: false,
  }
}

export function useAnimePrivateListRemovalSuccess(): () => void {
  const reportRemoval = useContext(AnimePrivateListRemovalContext)

  if (reportRemoval === null) {
    throw new Error(
      'Anime entry removal must be rendered inside the private-list removal boundary',
    )
  }

  return reportRemoval
}

export function AnimePrivateListRemovalBoundary({
  children,
  renderRevision,
}: {
  children: ReactNode
  renderRevision: string
}) {
  const router = useRouter()
  const [hasRemovalStatus, setHasRemovalStatus] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const refreshStateRef = useRef(initialAnimePrivateListRemovalRefreshState)
  const scheduledFocusFrameRef = useRef<number | null>(null)
  const scheduledRefreshTimeoutRef = useRef<number | null>(null)

  const cancelScheduledStatusFocus = useCallback(() => {
    if (scheduledFocusFrameRef.current === null) return

    window.cancelAnimationFrame(scheduledFocusFrameRef.current)
    scheduledFocusFrameRef.current = null
  }, [])

  const refreshArchive = useCallback(() => {
    if (scheduledRefreshTimeoutRef.current !== null) return

    scheduledRefreshTimeoutRef.current = window.setTimeout(() => {
      scheduledRefreshTimeoutRef.current = null
      startTransition(() => router.refresh())
    }, 50)
  }, [router])

  useEffect(
    () => () => {
      cancelScheduledStatusFocus()
      if (scheduledRefreshTimeoutRef.current !== null) {
        window.clearTimeout(scheduledRefreshTimeoutRef.current)
      }
    },
    [cancelScheduledStatusFocus],
  )

  useEffect(() => {
    const plan = reconcileAnimePrivateListRemovalRefresh(
      refreshStateRef.current,
      renderRevision,
    )
    refreshStateRef.current = plan.nextState

    if (plan.shouldRefresh) {
      cancelScheduledStatusFocus()
      refreshArchive()
      return
    }

    if (plan.shouldFocusStatus) {
      scheduledFocusFrameRef.current =
        scheduleAnimePrivateListRemovalStatusFocus({
          cancelFrame: (frame) => window.cancelAnimationFrame(frame),
          currentFrame: scheduledFocusFrameRef.current,
          focusStatus: () => {
            scheduledFocusFrameRef.current = null
            if (!refreshStateRef.current.isAwaitingRefresh) {
              statusRef.current?.focus()
            }
          },
          requestFrame: (callback) =>
            window.requestAnimationFrame(() => {
              window.setTimeout(() => callback(performance.now()), 0)
            }),
        })
    }
  }, [cancelScheduledStatusFocus, refreshArchive, renderRevision])

  const reportRemoval = useCallback(() => {
    cancelScheduledStatusFocus()
    const plan = reportAnimePrivateListRemoval(
      refreshStateRef.current,
      renderRevision,
    )
    refreshStateRef.current = plan.nextState

    if (plan.shouldRefresh) {
      refreshArchive()
    }
    setHasRemovalStatus(true)
  }, [cancelScheduledStatusFocus, refreshArchive, renderRevision])

  return (
    <AnimePrivateListRemovalContext.Provider value={reportRemoval}>
      {hasRemovalStatus ? (
        <p aria-live="polite" ref={statusRef} role="status" tabIndex={-1}>
          Anime removed from your archive.
        </p>
      ) : null}
      {children}
    </AnimePrivateListRemovalContext.Provider>
  )
}
