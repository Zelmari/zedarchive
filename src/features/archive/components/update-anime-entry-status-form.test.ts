import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInitialUpdateAnimeEntryStatusFormState,
  updateAnimeEntryStatusFormReducer,
  type UpdateAnimeEntryStatusFormState,
} from '@/features/archive/components/update-anime-entry-status-form-state'

const { useReducer, useSyncExternalStore } = vi.hoisted(() => ({
  useReducer: vi.fn(),
  useSyncExternalStore: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useReducer,
  useSyncExternalStore,
}))

import { UpdateAnimeEntryStatusForm } from '@/features/archive/components/update-anime-entry-status-form'

const entryId = '550e8400-e29b-41d4-a716-446655440000'
let renderPending = false

function renderForm(): string {
  return renderToStaticMarkup(
    createElement(UpdateAnimeEntryStatusForm, {
      entryId,
      animeTitle: 'Cowboy Bebop',
      currentStatus: 'in_progress',
      isPending: renderPending,
      onSubmit: async () => null,
    }),
  )
}

function mockState(
  state: UpdateAnimeEntryStatusFormState,
  options: { hydrated?: boolean; pending?: boolean } = {},
) {
  renderPending = options.pending ?? false
  useReducer.mockReturnValue([state, vi.fn()])
  useSyncExternalStore.mockReturnValue(options.hydrated ?? true)
}

describe('UpdateAnimeEntryStatusForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderPending = false
  })

  it('server-renders the readable status without a dead edit control', () => {
    mockState(createInitialUpdateAnimeEntryStatusFormState('in_progress'), {
      hydrated: false,
    })

    const markup = renderForm()

    expect(markup).toContain('In your archive — In progress')
    expect(markup).not.toContain('Edit status')
    expect(markup).not.toContain(entryId)
    expect(markup).not.toContain('<form')
  })

  it('reveals only the Edit action after hydration in read mode', () => {
    mockState(createInitialUpdateAnimeEntryStatusFormState('in_progress'))

    const markup = renderForm()

    expect(markup).toContain('In your archive — In progress')
    expect(markup).toContain('aria-label="Edit status — Cowboy Bebop"')
    expect(markup).not.toContain(entryId)
  })

  it('disables Edit while a sibling card mutation is pending', () => {
    mockState(createInitialUpdateAnimeEntryStatusFormState('in_progress'), {
      pending: true,
    })

    const markup = renderForm()

    expect(markup).toContain('disabled=""')
    expect(markup).toContain('aria-label="Edit status — Cowboy Bebop"')
  })

  it('renders the deliberate form with exact mutation fields and all statuses', () => {
    mockState({
      ...createInitialUpdateAnimeEntryStatusFormState('in_progress'),
      mode: 'edit',
      focusTarget: 'select',
      focusVersion: 1,
    })

    const markup = renderForm()

    expect(markup).toContain('aria-label="Update status for Cowboy Bebop"')
    expect(markup).toContain(`type="hidden" name="entryId" value="${entryId}"`)
    expect(markup).toContain(
      'type="hidden" name="expectedStatus" value="in_progress"',
    )
    expect(markup).toContain('name="requestedStatus"')
    expect(markup).toContain('class="za-select"')
    expect(markup).toContain('class="za-button za-button--primary"')
    expect(markup).toContain('class="za-button za-button--tertiary"')
    expect(markup).toContain('<option value="planned">Plan to watch</option>')
    expect(markup).toContain(
      '<option value="in_progress" selected="">In progress</option>',
    )
    expect(markup).toContain('<option value="on_hold">On hold</option>')
    expect(markup).toContain('<option value="dropped">Dropped</option>')
    expect(markup).toContain('<option value="completed">Completed</option>')
    expect(markup).toContain('aria-label="Save status — Cowboy Bebop"')
    expect(markup).toContain('aria-label="Cancel status edit — Cowboy Bebop"')
    expect(markup).not.toContain('userId')
  })

  it('enables Save only after choosing a different status', () => {
    mockState({
      ...createInitialUpdateAnimeEntryStatusFormState('in_progress'),
      mode: 'edit',
      selectedStatus: 'completed',
    })

    const markup = renderForm()

    expect(markup).toContain('<option value="completed" selected="">')
    expect(markup).toContain('aria-label="Save status — Cowboy Bebop"')
  })

  it('disables every form control and shows Saving while pending', () => {
    mockState(
      {
        ...createInitialUpdateAnimeEntryStatusFormState('in_progress'),
        mode: 'edit',
        selectedStatus: 'completed',
      },
      { pending: true },
    )

    const markup = renderForm()

    expect(markup).toContain('aria-busy="true"')
    expect(markup.match(/disabled=""/g)).toHaveLength(3)
    expect(markup).toContain('>Saving…</button>')
  })

  it('associates and focuses local invalid feedback', () => {
    mockState({
      ...createInitialUpdateAnimeEntryStatusFormState('in_progress'),
      mode: 'edit',
      feedback: {
        tone: 'error',
        message: 'Choose a valid status before saving.',
        selectError: true,
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderForm()

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toMatch(/aria-describedby="[^"]+"/)
    expect(markup).toContain('role="alert" tabindex="-1"')
    expect(markup).toContain('Choose a valid status before saving.')
  })

  it('submits a conflict retry against the new authoritative status', () => {
    const attemptedState = {
      ...createInitialUpdateAnimeEntryStatusFormState('in_progress'),
      mode: 'edit' as const,
      selectedStatus: 'completed' as const,
    }
    const conflictState = updateAnimeEntryStatusFormReducer(attemptedState, {
      kind: 'action_result',
      result: { kind: 'conflict', currentStatus: 'on_hold' },
    })
    mockState(conflictState)

    const markup = renderForm()

    expect(markup).toContain(
      'type="hidden" name="expectedStatus" value="on_hold"',
    )
    expect(markup).toContain('<option value="completed" selected="">')
    expect(markup).toContain(
      'This status changed elsewhere. It is now On hold. Review your selection and try again.',
    )
    expect(markup).toContain('za-notice--warning')
    expect(markup).toContain('role="alert" tabindex="-1"')
  })

  it('renders polite focusable success feedback in read mode', () => {
    mockState({
      ...createInitialUpdateAnimeEntryStatusFormState('completed'),
      feedback: {
        tone: 'success',
        message: 'Status updated to Completed.',
        selectError: false,
      },
      focusTarget: 'feedback',
      focusVersion: 1,
    })

    const markup = renderForm()

    expect(markup).toContain('In your archive — Completed')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('za-notice--success')
    expect(markup).toContain('role="status" tabindex="-1"')
    expect(markup).toContain('Status updated to Completed.')
  })
})
