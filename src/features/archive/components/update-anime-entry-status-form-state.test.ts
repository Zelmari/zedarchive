import { describe, expect, it } from 'vitest'
import {
  createInitialUpdateAnimeEntryStatusFormState,
  updateAnimeEntryStatusFormReducer,
  type UpdateAnimeEntryStatusFormState,
} from '@/features/archive/components/update-anime-entry-status-form-state'
import type { UpdateAnimeEntryStatusActionState } from '@/features/archive/domain/update-anime-entry-status'

function editingState(): UpdateAnimeEntryStatusFormState {
  return updateAnimeEntryStatusFormReducer(
    updateAnimeEntryStatusFormReducer(
      createInitialUpdateAnimeEntryStatusFormState('in_progress'),
      { kind: 'open' },
    ),
    { kind: 'select', status: 'completed' },
  )
}

describe('updateAnimeEntryStatusFormReducer', () => {
  it('opens with the authoritative status selected and a select focus request', () => {
    const state = updateAnimeEntryStatusFormReducer(
      createInitialUpdateAnimeEntryStatusFormState('on_hold'),
      { kind: 'open' },
    )

    expect(state).toMatchObject({
      mode: 'edit',
      authoritativeStatus: 'on_hold',
      selectedStatus: 'on_hold',
      feedback: null,
      focusTarget: 'select',
      focusVersion: 1,
    })
  })

  it('cancels without changing the authoritative status and requests Edit focus', () => {
    const state = updateAnimeEntryStatusFormReducer(editingState(), {
      kind: 'cancel',
    })

    expect(state).toMatchObject({
      mode: 'read',
      authoritativeStatus: 'in_progress',
      selectedStatus: 'in_progress',
      feedback: null,
      focusTarget: 'edit',
      focusVersion: 2,
    })
  })

  it.each([
    [
      { kind: 'updated', status: 'completed' } as const,
      'Status updated to Completed.',
    ],
    [
      { kind: 'unchanged', status: 'completed' } as const,
      'Status is already Completed.',
    ],
  ])('returns to read mode for %o', (result, message) => {
    const state = updateAnimeEntryStatusFormReducer(editingState(), {
      kind: 'action_result',
      result,
    })

    expect(state).toMatchObject({
      mode: 'read',
      authoritativeStatus: 'completed',
      selectedStatus: 'completed',
      feedback: { tone: 'status', message, selectError: false },
      focusTarget: 'feedback',
    })
  })

  it('keeps the attempted choice while adopting a conflict status for retry', () => {
    const state = updateAnimeEntryStatusFormReducer(editingState(), {
      kind: 'action_result',
      result: { kind: 'conflict', currentStatus: 'on_hold' },
    })

    expect(state).toMatchObject({
      mode: 'edit',
      authoritativeStatus: 'on_hold',
      selectedStatus: 'completed',
      feedback: {
        tone: 'error',
        message:
          'This status changed elsewhere. It is now On hold. Review your selection and try again.',
        selectError: false,
      },
      focusTarget: 'feedback',
    })
  })

  it('keeps an active selection while accepting a sibling status reconciliation', () => {
    const state = updateAnimeEntryStatusFormReducer(editingState(), {
      kind: 'authoritative_status',
      status: 'on_hold',
    })

    expect(state).toMatchObject({
      mode: 'edit',
      authoritativeStatus: 'on_hold',
      selectedStatus: 'completed',
    })
  })

  it.each<[UpdateAnimeEntryStatusActionState, string, boolean]>([
    [{ kind: 'invalid_status' }, 'Choose a valid status before saving.', true],
    [
      { kind: 'sign_in_required' },
      'Your session has expired. Sign in and try again.',
      false,
    ],
    [
      { kind: 'session_unavailable' },
      'We couldn’t update this status right now. Try again.',
      false,
    ],
    [
      { kind: 'unavailable' },
      'This archive entry is no longer available. Refresh your archive.',
      false,
    ],
    [
      { kind: 'retry' },
      'We couldn’t update this status right now. Try again.',
      false,
    ],
  ])('keeps edit intent for %o', (result, message, selectError) => {
    const state = updateAnimeEntryStatusFormReducer(editingState(), {
      kind: 'action_result',
      result,
    })

    expect(state).toMatchObject({
      mode: 'edit',
      authoritativeStatus: 'in_progress',
      selectedStatus: 'completed',
      feedback: { tone: 'error', message, selectError },
      focusTarget: 'feedback',
    })
  })

  it('ignores the initial idle action state', () => {
    const state = editingState()

    expect(
      updateAnimeEntryStatusFormReducer(state, {
        kind: 'action_result',
        result: { kind: 'idle' },
      }),
    ).toBe(state)
  })
})
