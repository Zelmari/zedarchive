import type { EntryStatus } from '@/features/archive/domain/entry-status'
import type { EpisodeTotal } from '@/features/archive/domain/episode-total'
import type { Rating } from '@/features/archive/domain/rating'
import type { CalendarDate } from '@/features/archive/domain/entry-date-range'

export type AnimeEntryTrackingSnapshot = {
  status: EntryStatus
  progress: number
  personalTotal: EpisodeTotal | null
  catalogueTotal: EpisodeTotal | null
  rating: Rating | null
  isFavourite: boolean
  startDate: CalendarDate | null
  finishDate: CalendarDate | null
}
export type AnimeEntryTrackingOperation =
  | 'status'
  | 'progress'
  | 'total'
  | 'reset'
  | 'completion'
  | 'rating'
  | 'favourite'
  | 'dates'
export type AnimeEntryTrackingCoordinatorState = AnimeEntryTrackingSnapshot & {
  activeOperation: {
    kind: AnimeEntryTrackingOperation
    revision: number
  } | null
  nextRevision: number
}

export type AnimeEntryTrackingReconciliation =
  | {
      operation: 'status' | 'completion'
      status: EntryStatus
    }
  | {
      operation: 'progress' | 'reset'
      progress: number
    }
  | {
      operation: 'total'
      personalTotal: EpisodeTotal | null
    }
  | {
      operation: 'rating'
      rating: Rating | null
    }
  | {
      operation: 'favourite'
      isFavourite: boolean
    }
  | {
      operation: 'dates'
      startDate: CalendarDate | null
      finishDate: CalendarDate | null
    }
export function createAnimeEntryTrackingCoordinatorState(
  snapshot: AnimeEntryTrackingSnapshot,
): AnimeEntryTrackingCoordinatorState {
  return { ...snapshot, activeOperation: null, nextRevision: 1 }
}
export function beginAnimeEntryTrackingOperation(
  state: AnimeEntryTrackingCoordinatorState,
  kind: AnimeEntryTrackingOperation,
): AnimeEntryTrackingCoordinatorState {
  if (state.activeOperation !== null) return state
  return {
    ...state,
    activeOperation: { kind, revision: state.nextRevision },
    nextRevision: state.nextRevision + 1,
  }
}
export function reconcileAnimeEntryTrackingOperation(
  state: AnimeEntryTrackingCoordinatorState,
  revision: number,
  update: AnimeEntryTrackingReconciliation,
): AnimeEntryTrackingCoordinatorState {
  if (
    state.activeOperation?.revision !== revision ||
    state.activeOperation.kind !== update.operation
  )
    return state

  switch (update.operation) {
    case 'status':
    case 'completion':
      return { ...state, status: update.status, activeOperation: null }
    case 'progress':
    case 'reset':
      return { ...state, progress: update.progress, activeOperation: null }
    case 'total':
      return {
        ...state,
        personalTotal: update.personalTotal,
        activeOperation: null,
      }
    case 'rating':
      return { ...state, rating: update.rating, activeOperation: null }
    case 'favourite':
      return {
        ...state,
        isFavourite: update.isFavourite,
        activeOperation: null,
      }
    case 'dates':
      return {
        ...state,
        startDate: update.startDate,
        finishDate: update.finishDate,
        activeOperation: null,
      }
  }
}
export function finishAnimeEntryTrackingOperation(
  state: AnimeEntryTrackingCoordinatorState,
  revision: number,
): AnimeEntryTrackingCoordinatorState {
  return state.activeOperation?.revision === revision
    ? { ...state, activeOperation: null }
    : state
}
export function shouldOfferCompletion(
  snapshot: Pick<
    AnimeEntryTrackingSnapshot,
    'status' | 'progress' | 'personalTotal' | 'catalogueTotal'
  >,
): boolean {
  const total = snapshot.personalTotal ?? snapshot.catalogueTotal
  return (
    snapshot.status !== 'completed' &&
    total !== null &&
    total > 0 &&
    snapshot.progress >= total
  )
}
