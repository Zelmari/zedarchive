import 'server-only'

import type { AccountDeletionState } from '@/server/account-lifecycle/account-deletion-state'

export type AccountDeletionStateReader = (
  userId: string,
) => Promise<AccountDeletionState>

export type { AccountDeletionState }
