import { describe, expect, it } from 'vitest'
import { entryStatusValues } from '@/features/archive/domain/entry-status'
import { getEntryStatusDisplayLabel } from '@/features/archive/domain/entry-status-display'

describe('getEntryStatusDisplayLabel', () => {
  it.each([
    ['planned', 'Plan to watch'],
    ['in_progress', 'In progress'],
    ['on_hold', 'On hold'],
    ['dropped', 'Dropped'],
    ['completed', 'Completed'],
  ] as const)('displays %s as %s', (status, label) => {
    expect(getEntryStatusDisplayLabel(status)).toBe(label)
  })

  it('has a display label for every canonical status', () => {
    expect(entryStatusValues.map(getEntryStatusDisplayLabel)).toHaveLength(
      entryStatusValues.length,
    )
  })
})
