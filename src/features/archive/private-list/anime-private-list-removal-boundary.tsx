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

// One delayed retry recovers a lost RSC refresh without turning success into polling.
export const animePrivateListRemovalRefreshWatchdogDelayMilliseconds = 3_000
export const maxAnimePrivateListRemovalRefreshAttempts = 2
export const maxAnimePrivateListRemovalStatusFocusVerificationFrames = 2

export type AnimePrivateListRemovalRefreshState = {
  activeRenderRevision: string | null
  hasQueuedRemoval: boolean
  isAwaitingRefresh: boolean
  requiresPostTerminalRefresh: boolean
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
    requiresPostTerminalRefresh: false,
  }

export function focusAnimePrivateListRemovalStatus(
  status: Pick<HTMLElement, 'focus'> | null,
): boolean {
  if (status === null) return false

  status.focus()
  return true
}

export function getAnimePrivateListRemovalStatusFocusPlan({
  activeElement,
  status,
  verificationFrames,
}: {
  activeElement: object | null
  status: object | null
  verificationFrames: number
}): { shouldFocusStatus: boolean; shouldRetainFocusIntent: boolean } {
  if (status === activeElement && status !== null) {
    return {
      shouldFocusStatus: false,
      shouldRetainFocusIntent:
        verificationFrames <
        maxAnimePrivateListRemovalStatusFocusVerificationFrames,
    }
  }

  if (
    status === null ||
    verificationFrames >=
      maxAnimePrivateListRemovalStatusFocusVerificationFrames
  ) {
    return { shouldFocusStatus: false, shouldRetainFocusIntent: false }
  }

  return { shouldFocusStatus: true, shouldRetainFocusIntent: true }
}

export function scheduleAnimePrivateListRemovalRefreshWatchdog({
  cancelTimeout,
  currentTimeout,
  onExhausted,
  onRetry,
  refreshAttemptCount,
  scheduleTimeout,
}: {
  cancelTimeout: (timeout: number) => void
  currentTimeout: number | null
  onExhausted: () => void
  onRetry: () => void
  refreshAttemptCount: number
  scheduleTimeout: (callback: () => void, delayMilliseconds: number) => number
}): number | null {
  if (currentTimeout !== null) cancelTimeout(currentTimeout)
  if (refreshAttemptCount > maxAnimePrivateListRemovalRefreshAttempts) {
    return null
  }

  return scheduleTimeout(
    refreshAttemptCount === maxAnimePrivateListRemovalRefreshAttempts
      ? onExhausted
      : onRetry,
    animePrivateListRemovalRefreshWatchdogDelayMilliseconds,
  )
}

export function expireAnimePrivateListRemovalRefresh(
  state: AnimePrivateListRemovalRefreshState,
): AnimePrivateListRemovalRefreshPlan {
  if (!state.isAwaitingRefresh) {
    return {
      nextState: state,
      shouldFocusStatus: false,
      shouldRefresh: false,
    }
  }

  if (state.hasQueuedRemoval) {
    return {
      nextState: {
        ...state,
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
        requiresPostTerminalRefresh: true,
      },
      shouldFocusStatus: false,
      shouldRefresh: true,
    }
  }

  return {
    nextState: initialAnimePrivateListRemovalRefreshState,
    shouldFocusStatus: false,
    shouldRefresh: false,
  }
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
      requiresPostTerminalRefresh: false,
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

  if (state.requiresPostTerminalRefresh) {
    return {
      nextState: {
        ...state,
        activeRenderRevision: currentRenderRevision,
        requiresPostTerminalRefresh: false,
      },
      shouldFocusStatus: false,
      shouldRefresh: true,
    }
  }

  if (state.hasQueuedRemoval) {
    return {
      nextState: {
        activeRenderRevision: currentRenderRevision,
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
        requiresPostTerminalRefresh: false,
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
  const childrenRevisionRef = useRef(0)
  const observedRenderRevisionRef = useRef(`${renderRevision}:0`)
  const hasObservedChildrenRef = useRef(false)
  const shouldFocusStatusRef = useRef(false)
  const statusFocusVerificationFramesRef = useRef(0)
  const refreshAttemptCountRef = useRef(0)
  const scheduledRefreshTimeoutRef = useRef<number | null>(null)
  const scheduledRefreshWatchdogTimeoutRef = useRef<number | null>(null)
  const scheduledStatusFocusVerificationFrameRef = useRef<number | null>(null)
  const refreshArchiveRef = useRef<() => void>(() => undefined)
  const maintainStatusFocusRef = useRef<() => void>(() => undefined)

  const clearPendingStatusFocus = useCallback(() => {
    shouldFocusStatusRef.current = false
    statusFocusVerificationFramesRef.current = 0
    if (scheduledStatusFocusVerificationFrameRef.current !== null) {
      window.cancelAnimationFrame(
        scheduledStatusFocusVerificationFrameRef.current,
      )
      scheduledStatusFocusVerificationFrameRef.current = null
    }
  }, [])

  const scheduleStatusFocusVerification = useCallback(() => {
    if (scheduledStatusFocusVerificationFrameRef.current !== null) return

    scheduledStatusFocusVerificationFrameRef.current =
      window.requestAnimationFrame(() => {
        scheduledStatusFocusVerificationFrameRef.current = null
        statusFocusVerificationFramesRef.current += 1
        maintainStatusFocusRef.current()
      })
  }, [])

  const maintainStatusFocus = useCallback(() => {
    if (!shouldFocusStatusRef.current) return

    const plan = getAnimePrivateListRemovalStatusFocusPlan({
      activeElement: document.activeElement,
      status: statusRef.current,
      verificationFrames: statusFocusVerificationFramesRef.current,
    })
    if (plan.shouldFocusStatus) {
      focusAnimePrivateListRemovalStatus(statusRef.current)
    }
    if (plan.shouldRetainFocusIntent) {
      scheduleStatusFocusVerification()
      return
    }

    shouldFocusStatusRef.current = false
    statusFocusVerificationFramesRef.current = 0
  }, [scheduleStatusFocusVerification])

  useEffect(() => {
    maintainStatusFocusRef.current = maintainStatusFocus
  }, [maintainStatusFocus])

  const clearRefreshWatchdog = useCallback(() => {
    if (scheduledRefreshWatchdogTimeoutRef.current === null) return

    window.clearTimeout(scheduledRefreshWatchdogTimeoutRef.current)
    scheduledRefreshWatchdogTimeoutRef.current = null
  }, [])

  const scheduleRefreshWatchdog = useCallback(() => {
    scheduledRefreshWatchdogTimeoutRef.current =
      scheduleAnimePrivateListRemovalRefreshWatchdog({
        cancelTimeout: (timeout) => window.clearTimeout(timeout),
        currentTimeout: scheduledRefreshWatchdogTimeoutRef.current,
        onExhausted: () => {
          scheduledRefreshWatchdogTimeoutRef.current = null
          const plan = expireAnimePrivateListRemovalRefresh(
            refreshStateRef.current,
          )
          refreshStateRef.current = plan.nextState
          refreshAttemptCountRef.current = 0
          clearPendingStatusFocus()
          if (plan.shouldRefresh) refreshArchiveRef.current()
        },
        onRetry: () => {
          scheduledRefreshWatchdogTimeoutRef.current = null
          if (!refreshStateRef.current.isAwaitingRefresh) return

          refreshArchiveRef.current()
        },
        refreshAttemptCount: refreshAttemptCountRef.current,
        scheduleTimeout: (callback, delayMilliseconds) =>
          window.setTimeout(callback, delayMilliseconds),
      })
  }, [clearPendingStatusFocus])

  const refreshArchive = useCallback(() => {
    if (scheduledRefreshTimeoutRef.current !== null) return

    scheduledRefreshTimeoutRef.current = window.setTimeout(() => {
      scheduledRefreshTimeoutRef.current = null
      if (
        !refreshStateRef.current.isAwaitingRefresh ||
        refreshAttemptCountRef.current >=
          maxAnimePrivateListRemovalRefreshAttempts
      ) {
        return
      }

      refreshAttemptCountRef.current += 1
      startTransition(() => router.refresh())
      scheduleRefreshWatchdog()
    }, 50)
  }, [router, scheduleRefreshWatchdog])

  useEffect(() => {
    refreshArchiveRef.current = refreshArchive
  }, [refreshArchive])

  useEffect(
    () => () => {
      clearPendingStatusFocus()
      clearRefreshWatchdog()
      if (scheduledRefreshTimeoutRef.current !== null) {
        window.clearTimeout(scheduledRefreshTimeoutRef.current)
      }
    },
    [clearPendingStatusFocus, clearRefreshWatchdog],
  )

  useEffect(() => {
    // A refresh can replace this RSC child slot without changing the preserved
    // client-boundary prop. Its identity is therefore the reliable completion
    // signal for the authoritative server render.
    childrenRevisionRef.current += 1
    observedRenderRevisionRef.current = `${renderRevision}:${childrenRevisionRef.current}`
    if (!hasObservedChildrenRef.current) {
      hasObservedChildrenRef.current = true
      return
    }

    const wasAwaitingRefresh = refreshStateRef.current.isAwaitingRefresh
    const plan = reconcileAnimePrivateListRemovalRefresh(
      refreshStateRef.current,
      observedRenderRevisionRef.current,
    )
    refreshStateRef.current = plan.nextState

    if (wasAwaitingRefresh) {
      clearRefreshWatchdog()
    }

    if (plan.shouldRefresh) {
      clearPendingStatusFocus()
      clearRefreshWatchdog()
      refreshAttemptCountRef.current = 0
      refreshArchive()
      return
    }

    if (plan.shouldFocusStatus) {
      clearRefreshWatchdog()
      refreshAttemptCountRef.current = 0
      shouldFocusStatusRef.current = true
      statusFocusVerificationFramesRef.current = 0
      maintainStatusFocus()
    }
  }, [
    children,
    clearPendingStatusFocus,
    clearRefreshWatchdog,
    maintainStatusFocus,
    refreshArchive,
    renderRevision,
  ])

  const setStatusRef = useCallback((status: HTMLParagraphElement | null) => {
    statusRef.current = status
    if (
      status !== null &&
      shouldFocusStatusRef.current &&
      !refreshStateRef.current.isAwaitingRefresh
    ) {
      maintainStatusFocusRef.current()
    }
  }, [])

  const reportRemoval = useCallback(() => {
    clearPendingStatusFocus()
    const plan = reportAnimePrivateListRemoval(
      refreshStateRef.current,
      observedRenderRevisionRef.current,
    )
    refreshStateRef.current = plan.nextState

    if (plan.shouldRefresh) {
      clearRefreshWatchdog()
      refreshAttemptCountRef.current = 0
      refreshArchive()
    }
    setHasRemovalStatus(true)
  }, [clearPendingStatusFocus, clearRefreshWatchdog, refreshArchive])

  return (
    <AnimePrivateListRemovalContext.Provider value={reportRemoval}>
      {hasRemovalStatus ? (
        <p aria-live="polite" ref={setStatusRef} role="status" tabIndex={-1}>
          Anime removed from your archive.
        </p>
      ) : null}
      {children}
    </AnimePrivateListRemovalContext.Provider>
  )
}
