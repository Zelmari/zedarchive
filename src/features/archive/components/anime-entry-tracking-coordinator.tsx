'use client'

import { useRef, useState, useTransition } from 'react'
import { updateAnimeEntryEpisodeProgress } from '@/features/archive/actions/update-anime-entry-episode-progress'
import { updateAnimeEntryEpisodeTotalOverride } from '@/features/archive/actions/update-anime-entry-episode-total-override'
import { updateAnimeEntryStatus } from '@/features/archive/actions/update-anime-entry-status'
import { updateAnimeEntryRating } from '@/features/archive/actions/update-anime-entry-rating'
import { AnimeEntryEpisodeProgressControls } from '@/features/archive/components/anime-entry-episode-progress-controls'
import { AnimeEntryRatingForm } from '@/features/archive/components/anime-entry-rating-form'
import {
  beginAnimeEntryTrackingOperation,
  createAnimeEntryTrackingCoordinatorState,
  finishAnimeEntryTrackingOperation,
  reconcileAnimeEntryTrackingOperation,
  type AnimeEntryTrackingOperation,
  type AnimeEntryTrackingReconciliation,
} from '@/features/archive/components/anime-entry-tracking-coordinator-state'
import { UpdateAnimeEntryStatusForm } from '@/features/archive/components/update-anime-entry-status-form'
import type { AnimeEpisodeProgressState } from '@/features/archive/private-list/anime-private-list-model'
import type { UpdateAnimeEntryEpisodeProgressActionState } from '@/features/archive/domain/update-anime-entry-episode-progress'
import type { UpdateAnimeEntryEpisodeTotalActionState } from '@/features/archive/domain/update-anime-entry-episode-total'
import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import type { UpdateAnimeEntryRatingActionState } from '@/features/archive/domain/update-anime-entry-rating'
import type { Rating } from '@/features/archive/domain/rating'

type Props = {
  entryId: string
  animeTitle: string
  initialStatus: EntryStatus
  initialRating: Rating | null
  progressState: AnimeEpisodeProgressState
}

type ActiveOperation = {
  kind: AnimeEntryTrackingOperation
  revision: number
}

function getStatusReconciliation(
  operation: 'status' | 'completion',
  result: UpdateAnimeEntryStatusActionState,
): AnimeEntryTrackingReconciliation | null {
  switch (result.kind) {
    case 'updated':
    case 'unchanged':
      return { operation, status: result.status }
    case 'conflict':
      return { operation, status: result.currentStatus }
    default:
      return null
  }
}

function getProgressReconciliation(
  operation: 'progress' | 'reset',
  result: UpdateAnimeEntryEpisodeProgressActionState,
): AnimeEntryTrackingReconciliation | null {
  switch (result.kind) {
    case 'updated':
    case 'unchanged':
      return { operation, progress: result.progress }
    case 'conflict':
      return { operation, progress: result.currentProgress }
    default:
      return null
  }
}

function getTotalReconciliation(
  result: UpdateAnimeEntryEpisodeTotalActionState,
): AnimeEntryTrackingReconciliation | null {
  switch (result.kind) {
    case 'updated':
    case 'unchanged':
      return { operation: 'total', personalTotal: result.personalTotal }
    case 'conflict':
      return {
        operation: 'total',
        personalTotal: result.currentPersonalTotal,
      }
    default:
      return null
  }
}

function getRatingReconciliation(
  result: UpdateAnimeEntryRatingActionState,
): AnimeEntryTrackingReconciliation | null {
  switch (result.kind) {
    case 'updated':
    case 'unchanged':
      return { operation: 'rating', rating: result.rating }
    case 'conflict':
      return { operation: 'rating', rating: result.currentRating }
    default:
      return null
  }
}

export function AnimeEntryTrackingCoordinator({
  entryId,
  animeTitle,
  initialStatus,
  initialRating,
  progressState,
}: Props) {
  const [state, setState] = useState(() =>
    createAnimeEntryTrackingCoordinatorState({
      status: initialStatus,
      progress: progressState.kind === 'trackable' ? progressState.progress : 0,
      personalTotal:
        progressState.kind === 'trackable' ? progressState.personalTotal : null,
      catalogueTotal:
        progressState.kind === 'trackable'
          ? progressState.catalogueTotal
          : null,
      rating: initialRating,
    }),
  )
  const activeOperationRef = useRef<ActiveOperation | null>(null)
  const nextRevisionRef = useRef(1)
  const [isTransitionPending, startTransition] = useTransition()
  const isPending = isTransitionPending || state.activeOperation !== null

  function runMutation<Result>(
    kind: AnimeEntryTrackingOperation,
    action: () => Promise<Result>,
    getReconciliation: (
      result: Result,
    ) => AnimeEntryTrackingReconciliation | null,
  ): Promise<Result | null> {
    if (activeOperationRef.current !== null) return Promise.resolve(null)

    const revision = nextRevisionRef.current
    nextRevisionRef.current += 1
    activeOperationRef.current = { kind, revision }
    setState((current) => beginAnimeEntryTrackingOperation(current, kind))

    return new Promise((resolve) => {
      startTransition(async () => {
        let result: Result

        try {
          result = await action()
        } catch {
          if (activeOperationRef.current?.revision === revision) {
            activeOperationRef.current = null
            setState((current) =>
              finishAnimeEntryTrackingOperation(current, revision),
            )
          }
          resolve(null)
          return
        }

        if (activeOperationRef.current?.revision !== revision) {
          resolve(null)
          return
        }

        activeOperationRef.current = null
        const reconciliation = getReconciliation(result)
        setState((current) =>
          reconciliation === null
            ? finishAnimeEntryTrackingOperation(current, revision)
            : reconcileAnimeEntryTrackingOperation(
                current,
                revision,
                reconciliation,
              ),
        )
        resolve(result)
      })
    })
  }

  function submitStatus(
    formData: FormData,
    operation: 'status' | 'completion' = 'status',
  ) {
    return runMutation(
      operation,
      async () => {
        try {
          return await updateAnimeEntryStatus({ kind: 'idle' }, formData)
        } catch {
          return { kind: 'retry' } as const
        }
      },
      (result) => getStatusReconciliation(operation, result),
    )
  }

  return (
    <div className="space-y-2">
      <UpdateAnimeEntryStatusForm
        animeTitle={animeTitle}
        currentStatus={state.status}
        entryId={entryId}
        isPending={isPending}
        onSubmit={submitStatus}
      />
      <AnimeEntryRatingForm
        animeTitle={animeTitle}
        entryId={entryId}
        isPending={isPending}
        onSubmit={(formData) =>
          runMutation(
            'rating',
            async () => {
              try {
                return await updateAnimeEntryRating({ kind: 'idle' }, formData)
              } catch {
                return { kind: 'retry' } as const
              }
            },
            getRatingReconciliation,
          )
        }
        rating={state.rating}
      />
      {progressState.kind === 'trackable' ? (
        <AnimeEntryEpisodeProgressControls
          catalogueTotal={state.catalogueTotal}
          entryId={entryId}
          isPending={isPending}
          onProgressSubmit={(formData, operation) =>
            runMutation(
              operation,
              async () => {
                try {
                  return await updateAnimeEntryEpisodeProgress(
                    { kind: 'idle' },
                    formData,
                  )
                } catch {
                  return { kind: 'retry' } as const
                }
              },
              (result) => getProgressReconciliation(operation, result),
            )
          }
          onStatusSubmit={(formData) => submitStatus(formData, 'completion')}
          onTotalSubmit={(formData) =>
            runMutation(
              'total',
              async () => {
                try {
                  return await updateAnimeEntryEpisodeTotalOverride(
                    { kind: 'idle' },
                    formData,
                  )
                } catch {
                  return { kind: 'retry' } as const
                }
              },
              getTotalReconciliation,
            )
          }
          personalTotal={state.personalTotal}
          progress={state.progress}
          status={state.status}
        />
      ) : progressState.kind === 'format_unknown' ? (
        <p>
          Episode tracking isn’t available until this anime’s format is known.
        </p>
      ) : null}
    </div>
  )
}
