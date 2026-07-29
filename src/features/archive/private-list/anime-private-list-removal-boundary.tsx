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
}: {
  activeElement: object | null
  status: object | null
}): { shouldFocusStatus: boolean; shouldRetainFocusIntent: boolean } {
  if (status === null) {
    return { shouldFocusStatus: false, shouldRetainFocusIntent: false }
  }

  return {
    shouldFocusStatus: status !== activeElement,
    shouldRetainFocusIntent: true,
  }
}

export function isAnimePrivateListRemovalUserFocusMove(
  eventType: string,
): boolean {
  return eventType === 'keydown' || eventType === 'pointerdown'
}

export type AnimePrivateListRemovalStatusFocusIntent = {
  nextEpoch: number
  pendingEpoch: number | null
}

export const initialAnimePrivateListRemovalStatusFocusIntent: AnimePrivateListRemovalStatusFocusIntent =
  {
    nextEpoch: 1,
    pendingEpoch: null,
  }

export function beginAnimePrivateListRemovalStatusFocusIntent(
  intent: AnimePrivateListRemovalStatusFocusIntent,
): AnimePrivateListRemovalStatusFocusIntent {
  return {
    nextEpoch: intent.nextEpoch + 1,
    pendingEpoch: intent.nextEpoch,
  }
}

export function cancelAnimePrivateListRemovalStatusFocusIntent(
  intent: AnimePrivateListRemovalStatusFocusIntent,
): AnimePrivateListRemovalStatusFocusIntent {
  return {
    ...intent,
    pendingEpoch: null,
  }
}

export function claimAnimePrivateListRemovalStatusFocusIntent(
  intent: AnimePrivateListRemovalStatusFocusIntent,
): {
  nextIntent: AnimePrivateListRemovalStatusFocusIntent
  shouldClaimFocus: boolean
} {
  return {
    nextIntent: cancelAnimePrivateListRemovalStatusFocusIntent(intent),
    shouldClaimFocus: intent.pendingEpoch !== null,
  }
}

export function scheduleAnimePrivateListRemovalStatusFocusRepair({
  currentFrame,
  repairFocus,
  requestFrame,
}: {
  currentFrame: number | null
  repairFocus: () => void
  requestFrame: (callback: () => void) => number
}): number {
  if (currentFrame !== null) return currentFrame

  return requestFrame(repairFocus)
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
  const statusFocusIntentRef = useRef(
    initialAnimePrivateListRemovalStatusFocusIntent,
  )
  const refreshAttemptCountRef = useRef(0)
  const scheduledRefreshTimeoutRef = useRef<number | null>(null)
  const scheduledRefreshWatchdogTimeoutRef = useRef<number | null>(null)
  const scheduledStatusFocusRepairFrameRef = useRef<number | null>(null)
  const refreshArchiveRef = useRef<() => void>(() => undefined)
  const maintainStatusFocusRef = useRef<() => void>(() => undefined)

  const clearStatusFocusOwnership = useCallback(() => {
    shouldFocusStatusRef.current = false
    if (scheduledStatusFocusRepairFrameRef.current !== null) {
      window.cancelAnimationFrame(scheduledStatusFocusRepairFrameRef.current)
      scheduledStatusFocusRepairFrameRef.current = null
    }
  }, [])

  const cancelStatusFocusIntent = useCallback(() => {
    statusFocusIntentRef.current =
      cancelAnimePrivateListRemovalStatusFocusIntent(
        statusFocusIntentRef.current,
      )
    clearStatusFocusOwnership()
  }, [clearStatusFocusOwnership])

  const maintainStatusFocus = useCallback(() => {
    if (!shouldFocusStatusRef.current) return

    const plan = getAnimePrivateListRemovalStatusFocusPlan({
      activeElement: document.activeElement,
      status: statusRef.current,
    })
    if (plan.shouldFocusStatus) {
      focusAnimePrivateListRemovalStatus(statusRef.current)
    }
    shouldFocusStatusRef.current = plan.shouldRetainFocusIntent
  }, [])

  useEffect(() => {
    maintainStatusFocusRef.current = maintainStatusFocus
  }, [maintainStatusFocus])

  const scheduleStatusFocusRepair = useCallback(() => {
    if (!shouldFocusStatusRef.current) return

    scheduledStatusFocusRepairFrameRef.current =
      scheduleAnimePrivateListRemovalStatusFocusRepair({
        currentFrame: scheduledStatusFocusRepairFrameRef.current,
        repairFocus: () => {
          scheduledStatusFocusRepairFrameRef.current = null
          maintainStatusFocusRef.current()
        },
        requestFrame: (callback) => window.requestAnimationFrame(callback),
      })
  }, [])

  useEffect(() => {
    // A completed removal owns focus until the person deliberately moves it.
    const releaseFocusOwnership = (event: Event) => {
      if (isAnimePrivateListRemovalUserFocusMove(event.type)) {
        cancelStatusFocusIntent()
      }
    }

    window.addEventListener('keydown', releaseFocusOwnership, true)
    window.addEventListener('pointerdown', releaseFocusOwnership, true)

    return () => {
      window.removeEventListener('keydown', releaseFocusOwnership, true)
      window.removeEventListener('pointerdown', releaseFocusOwnership, true)
    }
  }, [cancelStatusFocusIntent])

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
          cancelStatusFocusIntent()
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
  }, [cancelStatusFocusIntent])

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
      cancelStatusFocusIntent()
      clearRefreshWatchdog()
      if (scheduledRefreshTimeoutRef.current !== null) {
        window.clearTimeout(scheduledRefreshTimeoutRef.current)
      }
    },
    [cancelStatusFocusIntent, clearRefreshWatchdog],
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
      clearStatusFocusOwnership()
      clearRefreshWatchdog()
      refreshAttemptCountRef.current = 0
      refreshArchive()
      return
    }

    if (plan.shouldFocusStatus) {
      clearRefreshWatchdog()
      refreshAttemptCountRef.current = 0
      const focusClaim = claimAnimePrivateListRemovalStatusFocusIntent(
        statusFocusIntentRef.current,
      )
      statusFocusIntentRef.current = focusClaim.nextIntent
      if (focusClaim.shouldClaimFocus) {
        shouldFocusStatusRef.current = true
        maintainStatusFocus()
      }
    }
  }, [
    children,
    clearStatusFocusOwnership,
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
    clearStatusFocusOwnership()
    statusFocusIntentRef.current =
      beginAnimePrivateListRemovalStatusFocusIntent(
        statusFocusIntentRef.current,
      )
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
  }, [clearStatusFocusOwnership, clearRefreshWatchdog, refreshArchive])

  return (
    <AnimePrivateListRemovalContext.Provider value={reportRemoval}>
      {hasRemovalStatus ? (
        <p
          aria-live="polite"
          onBlur={scheduleStatusFocusRepair}
          ref={setStatusRef}
          role="status"
          tabIndex={-1}
        >
          Anime removed from your archive.
        </p>
      ) : null}
      {children}
    </AnimePrivateListRemovalContext.Provider>
  )
}
