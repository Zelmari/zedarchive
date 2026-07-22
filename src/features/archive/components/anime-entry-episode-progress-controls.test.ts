import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useState, useSyncExternalStore } = vi.hoisted(() => ({
  useState: vi.fn(),
  useSyncExternalStore: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState,
  useSyncExternalStore,
}))

import {
  AnimeEntryEpisodeProgressControls,
  getTotalFeedback,
} from '@/features/archive/components/anime-entry-episode-progress-controls'

const props = {
  entryId: '550e8400-e29b-41d4-a716-446655440000',
  progress: 7,
  catalogueTotal: 12,
  personalTotal: null,
  status: 'in_progress' as const,
  isPending: false,
  onProgressSubmit: async () => null,
  onTotalSubmit: async () => null,
  onStatusSubmit: async () => null,
}

function mockControlState(
  mode: 'read' | 'progress' | 'total',
  value: string,
  totalValue: string,
  message: string | null,
  fieldError: boolean,
  completionOffered = false,
  completionFeedbackTone: 'error' | 'status' | null = null,
  pendingCommand:
    'progress' | 'total' | 'clear_total' | 'reset' | 'completion' | null = null,
) {
  const stateValues = [
    mode,
    value,
    totalValue,
    message,
    fieldError,
    completionOffered,
    completionFeedbackTone,
    pendingCommand,
  ]
  useState.mockImplementation((initial) => [
    stateValues.shift() ?? initial,
    vi.fn(),
  ])
  useSyncExternalStore.mockReturnValue(true)
}

describe('AnimeEntryEpisodeProgressControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders focusable total validation feedback in total mode', () => {
    mockControlState(
      'total',
      '7',
      '1e2',
      'Enter a whole personal total of at least 1 episode.',
      true,
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryEpisodeProgressControls, props),
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toMatch(/aria-describedby="[^\"]+"/)
    expect(markup).toContain('role="alert" tabindex="-1"')
    expect(markup).toContain(
      'Enter a whole personal total of at least 1 episode.',
    )
    expect(markup).toContain('disabled="" type="submit">Save personal total')
  })

  it('disables Save progress for a numerically equivalent leading-zero value', () => {
    mockControlState('progress', '007', '12', null, false)

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryEpisodeProgressControls, props),
    )

    expect(markup).toContain('disabled="" type="submit">Save progress')
  })

  it('keeps a completion retry open while rendering failure feedback as an alert', () => {
    mockControlState(
      'read',
      '12',
      '12',
      'This status changed elsewhere. It is now On hold. Review your entry and try again.',
      false,
      true,
      'error',
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryEpisodeProgressControls, props),
    )

    expect(markup).toContain('role="alert" tabindex="-1"')
    expect(markup).toContain('Mark completed')
    expect(markup).toContain('Keep current status')
  })

  it('uses operation-specific pending labels only for the active command', () => {
    mockControlState(
      'progress',
      '12',
      '12',
      null,
      false,
      false,
      null,
      'progress',
    )

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryEpisodeProgressControls, {
        ...props,
        isPending: true,
      }),
    )

    expect(markup).toContain('Saving progress…')
    expect(markup).not.toContain('Saving personal total…')
  })

  it('renders the Reset progress launcher for positive progress', () => {
    mockControlState('progress', '7', '12', null, false)

    const markup = renderToStaticMarkup(
      createElement(AnimeEntryEpisodeProgressControls, props),
    )

    expect(markup).toContain('type="button">Reset progress</button>')
  })

  it('uses the authoritative catalogue total returned by a cleared-total mutation', () => {
    expect(
      getTotalFeedback({
        kind: 'updated',
        personalTotal: null,
        progress: 7,
        catalogueTotal: 24,
        status: 'in_progress',
      }),
    ).toBe('Using the catalogue total of 24 episodes.')
  })
})
