import type { EntryStatus } from '@/features/archive/domain/entry-status'
import type { EpisodeTotal } from '@/features/archive/domain/episode-total'

export type AnimeEntryTrackingSnapshot = {
  status: EntryStatus
  progress: number
  personalTotal: EpisodeTotal | null
  catalogueTotal: EpisodeTotal | null
}
export type AnimeEntryTrackingOperation =
  'status' | 'progress' | 'total' | 'reset' | 'completion'
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
  snapshot: AnimeEntryTrackingSnapshot,
): boolean {
  const total = snapshot.personalTotal ?? snapshot.catalogueTotal
  return (
    snapshot.status !== 'completed' &&
    total !== null &&
    total > 0 &&
    snapshot.progress >= total
  )
}
