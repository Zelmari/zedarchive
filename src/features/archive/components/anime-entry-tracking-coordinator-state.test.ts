import { describe, expect, it } from 'vitest'
import {
  beginAnimeEntryTrackingOperation,
  createAnimeEntryTrackingCoordinatorState,
  reconcileAnimeEntryTrackingOperation,
  shouldOfferCompletion,
} from '@/features/archive/components/anime-entry-tracking-coordinator-state'
const initial = () =>
  createAnimeEntryTrackingCoordinatorState({
    status: 'in_progress',
    progress: 7,
    personalTotal: null,
    catalogueTotal: 12,
  })
describe('anime entry tracking coordinator', () => {
  it('allows exactly one synchronous mutation and gives it a revision', () => {
    const pending = beginAnimeEntryTrackingOperation(initial(), 'progress')
    expect(pending.activeOperation).toEqual({ kind: 'progress', revision: 1 })
    expect(beginAnimeEntryTrackingOperation(pending, 'total')).toBe(pending)
  })
  it('rejects stale results and reconciles only the field owned by the operation', () => {
    const pending = beginAnimeEntryTrackingOperation(initial(), 'progress')
    expect(
      reconcileAnimeEntryTrackingOperation(pending, 2, {
        operation: 'progress',
        progress: 12,
      }),
    ).toBe(pending)
    expect(
      reconcileAnimeEntryTrackingOperation(pending, 1, {
        operation: 'progress',
        progress: 12,
      }).personalTotal,
    ).toBeNull()
    expect(
      reconcileAnimeEntryTrackingOperation(pending, 1, {
        operation: 'total',
        personalTotal: 20,
      }),
    ).toBe(pending)
  })

  it('accepts reversed results only for the currently active revision', () => {
    const first = beginAnimeEntryTrackingOperation(initial(), 'status')
    const settled = reconcileAnimeEntryTrackingOperation(first, 1, {
      operation: 'status',
      status: 'on_hold',
    })
    const second = beginAnimeEntryTrackingOperation(settled, 'total')

    expect(
      reconcileAnimeEntryTrackingOperation(second, 1, {
        operation: 'status',
        status: 'completed',
      }),
    ).toBe(second)
    expect(
      reconcileAnimeEntryTrackingOperation(second, 2, {
        operation: 'total',
        personalTotal: 20,
      }),
    ).toMatchObject({ status: 'on_hold', personalTotal: 20 })
  })

  it('reconciles a concurrent status change before a completion retry', () => {
    const completion = beginAnimeEntryTrackingOperation(initial(), 'completion')
    const conflicted = reconcileAnimeEntryTrackingOperation(completion, 1, {
      operation: 'completion',
      status: 'on_hold',
    })
    const retriedCompletion = beginAnimeEntryTrackingOperation(
      conflicted,
      'completion',
    )

    expect(conflicted.status).toBe('on_hold')
    expect(
      reconcileAnimeEntryTrackingOperation(retriedCompletion, 2, {
        operation: 'completion',
        status: 'completed',
      }),
    ).toMatchObject({ status: 'completed', progress: 7 })
  })
  it('offers completion only after a qualifying mutation snapshot', () => {
    expect(shouldOfferCompletion({ ...initial(), progress: 12 })).toBe(true)
    expect(
      shouldOfferCompletion({
        ...initial(),
        progress: 12,
        status: 'completed',
      }),
    ).toBe(false)
    expect(
      shouldOfferCompletion({
        ...initial(),
        progress: 12,
        catalogueTotal: null,
      }),
    ).toBe(false)
  })
})
