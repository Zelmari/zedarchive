import type { EntryStatus } from '@/features/archive/domain/entry-status'

const entryStatusDisplayLabels = {
  planned: 'Plan to watch',
  in_progress: 'In progress',
  on_hold: 'On hold',
  dropped: 'Dropped',
  completed: 'Completed',
} as const satisfies Record<EntryStatus, string>

export function getEntryStatusDisplayLabel(status: EntryStatus): string {
  return entryStatusDisplayLabels[status]
}
