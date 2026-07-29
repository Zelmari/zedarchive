import { describe, expect, it, vi } from 'vitest'
import {
  animePrivateListRemovalRefreshWatchdogDelayMilliseconds,
  beginAnimePrivateListRemovalStatusFocusIntent,
  cancelAnimePrivateListRemovalStatusFocusIntent,
  claimAnimePrivateListRemovalStatusFocusIntent,
  expireAnimePrivateListRemovalRefresh,
  focusAnimePrivateListRemovalStatus,
  getAnimePrivateListRemovalStatusFocusPlan,
  initialAnimePrivateListRemovalRefreshState,
  initialAnimePrivateListRemovalStatusFocusIntent,
  isAnimePrivateListRemovalUserFocusMove,
  maxAnimePrivateListRemovalRefreshAttempts,
  reconcileAnimePrivateListRemovalRefresh,
  reportAnimePrivateListRemoval,
  scheduleAnimePrivateListRemovalRefreshWatchdog,
  scheduleAnimePrivateListRemovalStatusFocusRepair,
} from '@/features/archive/private-list/anime-private-list-removal-boundary'

describe('anime private-list removal boundary', () => {
  it('focuses success only after a refreshed server render arrives', () => {
    const reported = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )
    const unchanged = reconcileAnimePrivateListRemovalRefresh(
      reported.nextState,
      'render-1',
    )
    const completed = reconcileAnimePrivateListRemovalRefresh(
      unchanged.nextState,
      'render-2',
    )

    expect(reported.shouldRefresh).toBe(true)
    expect(unchanged).toMatchObject({
      nextState: {
        isAwaitingRefresh: true,
      },
      shouldFocusStatus: false,
      shouldRefresh: false,
    })
    expect(completed).toMatchObject({
      nextState: {
        hasQueuedRemoval: false,
        isAwaitingRefresh: false,
      },
      shouldFocusStatus: true,
      shouldRefresh: false,
    })
  })

  it('queues a follow-up refresh when another removal commits before reconciliation', () => {
    const firstReport = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )
    const secondReport = reportAnimePrivateListRemoval(
      firstReport.nextState,
      'render-1',
    )
    const firstReconciliation = reconcileAnimePrivateListRemovalRefresh(
      secondReport.nextState,
      'render-2',
    )
    const unchangedFollowUp = reconcileAnimePrivateListRemovalRefresh(
      firstReconciliation.nextState,
      'render-2',
    )
    const finalReconciliation = reconcileAnimePrivateListRemovalRefresh(
      unchangedFollowUp.nextState,
      'render-3',
    )

    expect(firstReport).toMatchObject({
      shouldRefresh: true,
      shouldFocusStatus: false,
    })
    expect(secondReport).toMatchObject({
      nextState: {
        hasQueuedRemoval: true,
        isAwaitingRefresh: true,
      },
      shouldRefresh: false,
      shouldFocusStatus: false,
    })
    expect(firstReconciliation).toMatchObject({
      nextState: {
        activeRenderRevision: 'render-2',
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
        requiresPostTerminalRefresh: false,
      },
      shouldRefresh: true,
      shouldFocusStatus: false,
    })
    expect(unchangedFollowUp.shouldFocusStatus).toBe(false)
    expect(finalReconciliation).toMatchObject({
      nextState: {
        hasQueuedRemoval: false,
        isAwaitingRefresh: false,
      },
      shouldRefresh: false,
      shouldFocusStatus: true,
    })
  })

  it('does not settle until the authoritative render revision changes', () => {
    const reported = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )

    expect(
      reconcileAnimePrivateListRemovalRefresh(reported.nextState, 'render-1'),
    ).toMatchObject({
      nextState: reported.nextState,
      shouldFocusStatus: false,
      shouldRefresh: false,
    })
  })

  it('requires a distinct server render for a queued follow-up', () => {
    const firstReport = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )
    const secondReport = reportAnimePrivateListRemoval(
      firstReport.nextState,
      'render-1',
    )
    const followUp = reconcileAnimePrivateListRemovalRefresh(
      secondReport.nextState,
      'render-2',
    )
    const completed = reconcileAnimePrivateListRemovalRefresh(
      followUp.nextState,
      'render-3',
    )

    expect(followUp).toMatchObject({
      nextState: { hasQueuedRemoval: false, isAwaitingRefresh: true },
      shouldFocusStatus: false,
      shouldRefresh: true,
    })
    expect(completed).toMatchObject({
      nextState: initialAnimePrivateListRemovalRefreshState,
      shouldFocusStatus: true,
      shouldRefresh: false,
    })
  })

  it('focuses the settled status immediately or when its node becomes available', () => {
    const focus = vi.fn()

    expect(focusAnimePrivateListRemovalStatus(null)).toBe(false)
    expect(focus).not.toHaveBeenCalled()

    expect(
      focusAnimePrivateListRemovalStatus({
        focus,
      }),
    ).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
  })

  it('restores status focus after an authoritative refresh displaces it', () => {
    const status = {}
    const routerFocusTarget = {}

    expect(
      getAnimePrivateListRemovalStatusFocusPlan({
        activeElement: routerFocusTarget,
        status,
      }),
    ).toEqual({ shouldFocusStatus: true, shouldRetainFocusIntent: true })
    expect(
      getAnimePrivateListRemovalStatusFocusPlan({
        activeElement: status,
        status,
      }),
    ).toEqual({ shouldFocusStatus: false, shouldRetainFocusIntent: true })
  })

  it("releases status focus ownership only for a person's keyboard or pointer action", () => {
    expect(isAnimePrivateListRemovalUserFocusMove('keydown')).toBe(true)
    expect(isAnimePrivateListRemovalUserFocusMove('pointerdown')).toBe(true)
    expect(isAnimePrivateListRemovalUserFocusMove('focusin')).toBe(false)
    expect(
      getAnimePrivateListRemovalStatusFocusPlan({
        activeElement: {},
        status: null,
      }),
    ).toEqual({ shouldFocusStatus: false, shouldRetainFocusIntent: false })
  })

  it('coalesces focusout repair until the browser focus algorithm settles', () => {
    const repairFocus = vi.fn()
    const scheduled: Array<() => void> = []
    const requestFrame = vi.fn((callback: () => void) => {
      scheduled.push(callback)
      return 42
    })

    const firstFrame = scheduleAnimePrivateListRemovalStatusFocusRepair({
      currentFrame: null,
      repairFocus,
      requestFrame,
    })
    const coalescedFrame = scheduleAnimePrivateListRemovalStatusFocusRepair({
      currentFrame: firstFrame,
      repairFocus,
      requestFrame,
    })

    expect(firstFrame).toBe(42)
    expect(coalescedFrame).toBe(42)
    expect(requestFrame).toHaveBeenCalledOnce()
    expect(repairFocus).not.toHaveBeenCalled()

    scheduled[0]?.()
    expect(repairFocus).toHaveBeenCalledOnce()
  })

  it('claims post-refresh focus when no user movement cancels the removal intent', () => {
    const reported = beginAnimePrivateListRemovalStatusFocusIntent(
      initialAnimePrivateListRemovalStatusFocusIntent,
    )

    expect(claimAnimePrivateListRemovalStatusFocusIntent(reported)).toEqual({
      nextIntent: {
        nextEpoch: 2,
        pendingEpoch: null,
      },
      shouldClaimFocus: true,
    })
  })

  it('does not claim post-refresh focus after user movement during the refresh gap', () => {
    const reported = beginAnimePrivateListRemovalStatusFocusIntent(
      initialAnimePrivateListRemovalStatusFocusIntent,
    )
    const cancelled = cancelAnimePrivateListRemovalStatusFocusIntent(reported)

    expect(claimAnimePrivateListRemovalStatusFocusIntent(cancelled)).toEqual({
      nextIntent: {
        nextEpoch: 2,
        pendingEpoch: null,
      },
      shouldClaimFocus: false,
    })
  })

  it('starts a fresh focus intent for a later removal after cancellation', () => {
    const firstRemoval = beginAnimePrivateListRemovalStatusFocusIntent(
      initialAnimePrivateListRemovalStatusFocusIntent,
    )
    const cancelledFirstRemoval =
      cancelAnimePrivateListRemovalStatusFocusIntent(firstRemoval)
    const laterRemoval = beginAnimePrivateListRemovalStatusFocusIntent(
      cancelledFirstRemoval,
    )

    expect(laterRemoval).toEqual({
      nextEpoch: 3,
      pendingEpoch: 2,
    })
    expect(
      claimAnimePrivateListRemovalStatusFocusIntent(laterRemoval)
        .shouldClaimFocus,
    ).toBe(true)
  })

  it('schedules one bounded watchdog retry after an unsettled refresh', () => {
    const cancelTimeout = vi.fn()
    const onRetry = vi.fn()
    const scheduled: Array<{
      callback: () => void
      delayMilliseconds: number
    }> = []

    const timeout = scheduleAnimePrivateListRemovalRefreshWatchdog({
      cancelTimeout,
      currentTimeout: null,
      onExhausted: vi.fn(),
      onRetry,
      refreshAttemptCount: 1,
      scheduleTimeout: (callback, delayMilliseconds) => {
        scheduled.push({ callback, delayMilliseconds })
        return 42
      },
    })

    expect(timeout).toBe(42)
    expect(cancelTimeout).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]?.delayMilliseconds).toBe(
      animePrivateListRemovalRefreshWatchdogDelayMilliseconds,
    )
    scheduled[0]?.callback()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('replaces a pending watchdog when a newer refresh starts', () => {
    const cancelTimeout = vi.fn()
    const onRetry = vi.fn()
    const scheduleTimeout = vi.fn(() => 84)

    expect(
      scheduleAnimePrivateListRemovalRefreshWatchdog({
        cancelTimeout,
        currentTimeout: 17,
        onExhausted: vi.fn(),
        onRetry,
        refreshAttemptCount: 1,
        scheduleTimeout,
      }),
    ).toBe(84)

    expect(cancelTimeout).toHaveBeenCalledExactlyOnceWith(17)
    expect(scheduleTimeout).toHaveBeenCalledWith(
      onRetry,
      animePrivateListRemovalRefreshWatchdogDelayMilliseconds,
    )
  })

  it('schedules terminal cleanup once the refresh budget is exhausted', () => {
    const cancelTimeout = vi.fn()
    const onExhausted = vi.fn()
    const scheduleTimeout = vi.fn(() => 84)

    expect(
      scheduleAnimePrivateListRemovalRefreshWatchdog({
        cancelTimeout,
        currentTimeout: 17,
        onExhausted,
        onRetry: vi.fn(),
        refreshAttemptCount: maxAnimePrivateListRemovalRefreshAttempts,
        scheduleTimeout,
      }),
    ).toBe(84)

    expect(cancelTimeout).toHaveBeenCalledExactlyOnceWith(17)
    expect(scheduleTimeout).toHaveBeenCalledWith(
      onExhausted,
      animePrivateListRemovalRefreshWatchdogDelayMilliseconds,
    )
  })

  it('lets a later removal start a fresh refresh cycle after terminal cleanup', () => {
    const firstRemoval = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )
    const expired = expireAnimePrivateListRemovalRefresh(firstRemoval.nextState)
    const laterRemoval = reportAnimePrivateListRemoval(
      expired.nextState,
      'render-2',
    )

    expect(expired).toEqual({
      nextState: initialAnimePrivateListRemovalRefreshState,
      shouldFocusStatus: false,
      shouldRefresh: false,
    })
    expect(laterRemoval).toMatchObject({
      nextState: {
        activeRenderRevision: 'render-2',
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
        requiresPostTerminalRefresh: false,
      },
      shouldFocusStatus: false,
      shouldRefresh: true,
    })
  })

  it('refreshes queued removal work before clearing terminal state', () => {
    const firstRemoval = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )
    const queuedRemoval = reportAnimePrivateListRemoval(
      firstRemoval.nextState,
      'render-1',
    )
    const expired = expireAnimePrivateListRemovalRefresh(
      queuedRemoval.nextState,
    )

    expect(expired).toEqual({
      nextState: {
        activeRenderRevision: 'render-1',
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
        requiresPostTerminalRefresh: true,
      },
      shouldFocusStatus: false,
      shouldRefresh: true,
    })
  })

  it('waits for a post-terminal refresh after a late prior response', () => {
    const firstRemoval = reportAnimePrivateListRemoval(
      initialAnimePrivateListRemovalRefreshState,
      'render-1',
    )
    const queuedRemoval = reportAnimePrivateListRemoval(
      firstRemoval.nextState,
      'render-1',
    )
    const expired = expireAnimePrivateListRemovalRefresh(
      queuedRemoval.nextState,
    )
    const latePriorResponse = reconcileAnimePrivateListRemovalRefresh(
      expired.nextState,
      'render-2',
    )
    const postTerminalResponse = reconcileAnimePrivateListRemovalRefresh(
      latePriorResponse.nextState,
      'render-3',
    )

    expect(latePriorResponse).toEqual({
      nextState: {
        activeRenderRevision: 'render-2',
        hasQueuedRemoval: false,
        isAwaitingRefresh: true,
        requiresPostTerminalRefresh: false,
      },
      shouldFocusStatus: false,
      shouldRefresh: true,
    })
    expect(postTerminalResponse).toEqual({
      nextState: initialAnimePrivateListRemovalRefreshState,
      shouldFocusStatus: true,
      shouldRefresh: false,
    })
  })
})
