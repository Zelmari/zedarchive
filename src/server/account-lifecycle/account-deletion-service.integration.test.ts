import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { readDatabaseTestEnvironment } from '@/config/database-environment'
import {
  accountDeletionRequests,
  deletionChallenges,
  sessions,
  usernameChangeChallenges,
  users,
} from '@/server/database/schema'
import {
  cancelAccountDeletion,
  cancelAccountDeletionSetup,
  completeAccountDeletion,
  readAccountDeletionSetupState,
  resendAccountDeletionCode,
  startAccountDeletionChallenge,
} from '@/server/account-lifecycle/account-deletion-service'
import { readAccountDeletionState } from '@/server/account-lifecycle/account-deletion-state'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const authSecret = 'ci-disposable-better-auth-secret-32chars-min'
const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

async function createSessionFixture() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await database
    .insert(users)
    .values({
      username: `Delete${suffix}`,
      usernameIdentityKey: `delete${suffix}`,
      email: `${randomUUID()}@example.test`,
      emailVerified: true,
    })
    .returning()
  if (user === undefined) throw new Error('Expected deletion user fixture')

  const sessionId = randomUUID()
  await database.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })

  return { user, session: { userId: user.id, sessionId } }
}

async function createAdditionalSession(userId: string) {
  const sessionId = randomUUID()
  await database.insert(sessions).values({
    id: sessionId,
    userId,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return { userId, sessionId }
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

beforeEach(async () => {
  await pool.query(`
    truncate table
      anime_entries,
      rate_limits,
      verifications,
      sessions,
      accounts,
      users
    restart identity cascade
  `)
})

afterAll(async () => {
  await pool.end()
})

describe('account deletion lifecycle service', () => {
  it('retains setup throttling, commits one exact request, revokes other sessions, and cancels from a later session', async () => {
    const { user, session } = await createSessionFixture()
    const otherSession = await createAdditionalSession(user.id)

    await expect(readAccountDeletionState(database, user.id)).resolves.toEqual({
      kind: 'active',
    })
    await expect(
      readAccountDeletionSetupState(database, session),
    ).resolves.toEqual({ kind: 'start' })

    const firstStart = await startAccountDeletionChallenge(
      database,
      authSecret,
      session,
    )
    expect(firstStart.kind).toBe('challenge_created')
    if (firstStart.kind !== 'challenge_created') return

    const [firstStored] = await database
      .select()
      .from(deletionChallenges)
      .where(eq(deletionChallenges.userId, user.id))
    expect(firstStored).toMatchObject({
      userId: user.id,
      sessionId: session.sessionId,
      sendCount: 1,
      failedCodeAttempts: 0,
    })
    expect(firstStored?.codeDigest).not.toContain(firstStart.delivery.code)
    await expect(
      readAccountDeletionSetupState(database, session),
    ).resolves.toMatchObject({
      kind: 'pending',
      resend: { kind: 'cooldown' },
    })

    await expect(
      completeAccountDeletion(database, authSecret, session, '99999999', true),
    ).resolves.toEqual({ kind: 'invalid_code' })

    await expect(
      cancelAccountDeletionSetup(database, session),
    ).resolves.toEqual({ kind: 'cancelled' })
    const [detached] = await database
      .select()
      .from(deletionChallenges)
      .where(eq(deletionChallenges.userId, user.id))
    expect(detached).toMatchObject({
      sessionId: null,
      sendCount: 1,
      failedCodeAttempts: 1,
    })
    await expect(
      startAccountDeletionChallenge(database, authSecret, session),
    ).resolves.toEqual({ kind: 'resend_cooldown' })

    await database
      .update(deletionChallenges)
      .set({
        sendWindowStartedAt: new Date(Date.now() - 120_000),
        lastSentAt: new Date(Date.now() - 61_000),
        updatedAt: new Date(),
      })
      .where(eq(deletionChallenges.userId, user.id))
    const secondStart = await startAccountDeletionChallenge(
      database,
      authSecret,
      session,
    )
    expect(secondStart.kind).toBe('challenge_created')
    if (secondStart.kind !== 'challenge_created') return

    const now = new Date()
    await database.insert(usernameChangeChallenges).values({
      userId: user.id,
      sessionId: session.sessionId,
      proposedUsername: 'DifferentName',
      proposedUsernameIdentityKey: 'differentname',
      codeDigest: 'a'.repeat(64),
      codeExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      reauthenticatedUntil: new Date(now.getTime() + 15 * 60 * 1000),
      sendWindowStartedAt: now,
      lastSentAt: now,
    })

    const completed = await completeAccountDeletion(
      database,
      authSecret,
      session,
      secondStart.delivery.code,
      true,
    )
    expect(completed).toMatchObject({
      kind: 'deletion_requested',
      recipient: user.email,
    })
    if (completed.kind !== 'deletion_requested') return

    const [request] = await database
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, user.id))
    expect(request?.purgeAfter.getTime() - request!.requestedAt.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000,
    )
    expect(completed.purgeAfter).toEqual(request?.purgeAfter)
    await expect(database.select().from(deletionChallenges)).resolves.toEqual(
      [],
    )
    await expect(
      database.select().from(usernameChangeChallenges),
    ).resolves.toEqual([])
    await expect(
      database.select({ id: sessions.id }).from(sessions),
    ).resolves.toEqual([{ id: session.sessionId }])
    await expect(readAccountDeletionState(database, user.id)).resolves.toEqual({
      kind: 'deletion_recoverable',
      purgeAfter: request?.purgeAfter,
    })

    const laterSession = await createAdditionalSession(user.id)
    const cancelled = await cancelAccountDeletion(database, laterSession)
    expect(cancelled).toEqual({
      kind: 'deletion_cancelled',
      recipient: user.email,
      purgeAfter: request?.purgeAfter,
    })
    await expect(readAccountDeletionState(database, user.id)).resolves.toEqual({
      kind: 'active',
    })
    await expect(
      database.select().from(accountDeletionRequests),
    ).resolves.toEqual([])
    expect(otherSession.sessionId).not.toBe(session.sessionId)
  })

  it('resends only after cooldown and makes only the newest code usable', async () => {
    const { user, session } = await createSessionFixture()
    const started = await startAccountDeletionChallenge(
      database,
      authSecret,
      session,
    )
    expect(started.kind).toBe('challenge_created')
    if (started.kind !== 'challenge_created') return

    await expect(
      resendAccountDeletionCode(database, authSecret, session),
    ).resolves.toEqual({ kind: 'resend_cooldown' })

    await database
      .update(deletionChallenges)
      .set({
        sendWindowStartedAt: new Date(Date.now() - 120_000),
        lastSentAt: new Date(Date.now() - 61_000),
        updatedAt: new Date(),
      })
      .where(eq(deletionChallenges.userId, user.id))
    const resent = await resendAccountDeletionCode(
      database,
      authSecret,
      session,
    )
    expect(resent.kind).toBe('challenge_resent')
    if (resent.kind !== 'challenge_resent') return

    await expect(
      completeAccountDeletion(
        database,
        authSecret,
        session,
        started.delivery.code,
        true,
      ),
    ).resolves.toEqual({ kind: 'invalid_code' })
    await expect(
      completeAccountDeletion(
        database,
        authSecret,
        session,
        resent.delivery.code,
        true,
      ),
    ).resolves.toMatchObject({ kind: 'deletion_requested' })
  })

  it('uses a strict half-open deadline and preserves a due request', async () => {
    const { user, session } = await createSessionFixture()
    const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    const purgeAfter = new Date(
      requestedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
    )
    await database.insert(accountDeletionRequests).values({
      userId: user.id,
      requestedAt,
      purgeAfter,
    })

    await expect(cancelAccountDeletion(database, session)).resolves.toEqual({
      kind: 'deletion_due',
      purgeAfter,
    })
    await expect(readAccountDeletionState(database, user.id)).resolves.toEqual({
      kind: 'deletion_due',
      purgeAfter,
    })
    await expect(
      database.select().from(accountDeletionRequests),
    ).resolves.toHaveLength(1)
  })

  it('does not cancel at the exact deadline through the controlled SQL predicate', async () => {
    const { user } = await createSessionFixture()
    const requestedAt = new Date('2026-03-15T12:00:00.000Z')
    const purgeAfter = new Date(
      requestedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
    )
    await database.insert(accountDeletionRequests).values({
      userId: user.id,
      requestedAt,
      purgeAfter,
    })

    const equalityDelete = await pool.query<{ userId: string }>(
      `
        delete from account_deletion_requests
        where user_id = $1
          and $2::timestamptz < purge_after
        returning user_id as "userId"
      `,
      [user.id, purgeAfter.toISOString()],
    )
    expect(equalityDelete.rows).toEqual([])
    await expect(
      database
        .select({ userId: accountDeletionRequests.userId })
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, user.id)),
    ).resolves.toEqual([{ userId: user.id }])
  })
})
