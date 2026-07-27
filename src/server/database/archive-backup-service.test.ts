import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { readArchiveBackup } from '@/server/database/archive-backup-service'

describe('archive backup service', () => {
  it('rejects malformed caller identity before it can reach the database', async () => {
    const database = {
      transaction: () => {
        throw new Error('must not run')
      },
    }
    await expect(
      readArchiveBackup(database as never, { userId: 'forged' }),
    ).resolves.toEqual({ kind: 'account_unavailable' })
  })
})
