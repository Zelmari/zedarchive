import { describe, expect, it, vi } from 'vitest'
import {
  initialAnimePrivateListRemovalRefreshState,
  reconcileAnimePrivateListRemovalRefresh,
  reportAnimePrivateListRemoval,
  scheduleAnimePrivateListRemovalStatusFocus,
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

  it('defers final focus until the next frame and replaces stale focus work', () => {
    const cancelFrame = vi.fn()
    const focusStatus = vi.fn()
    const frameCallbacks: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return 42
    })

    const frame = scheduleAnimePrivateListRemovalStatusFocus({
      cancelFrame,
      currentFrame: 17,
      focusStatus,
      requestFrame,
    })

    expect(frame).toBe(42)
    expect(cancelFrame).toHaveBeenCalledExactlyOnceWith(17)
    expect(focusStatus).not.toHaveBeenCalled()

    const frameCallback = frameCallbacks[0]
    if (frameCallback === undefined) {
      throw new Error('Expected a scheduled animation frame')
    }
    frameCallback(0)
    expect(focusStatus).toHaveBeenCalledOnce()
  })
})
