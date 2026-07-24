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
  sessions,
  usernameChangeChallenges,
  usernameChangeRecords,
  users,
} from '@/server/database/schema'
import {
  cancelUsernameChange,
  completeUsernameChange,
  preflightUsernameChange,
  readUsernameChangeState,
  requestUsernameChange,
  resendUsernameChangeCode,
} from '@/server/identity/username-change-service'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

const authSecret = 'ci-disposable-better-auth-secret-32chars-min'
const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })

async function createAuthenticatedSession(username = 'MediaFan') {
  const [user] = await database
    .insert(users)
    .values({
      username,
      usernameIdentityKey: username.toLowerCase(),
      email: `${randomUUID()}@example.test`,
      emailVerified: true,
    })
    .returning()
  if (user === undefined) throw new Error('Expected username-change test user')

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

async function loadChallenge(userId: string) {
  const [challenge] = await database
    .select()
    .from(usernameChangeChallenges)
    .where(eq(usernameChangeChallenges.userId, userId))
  if (challenge === undefined)
    throw new Error('Expected username-change challenge')
  return challenge
}

async function makeResendEligible(userId: string, overrides = {}) {
  const now = Date.now()
  await database
    .update(usernameChangeChallenges)
    .set({
      createdAt: new Date(now - 120_000),
      sendWindowStartedAt: new Date(now - 120_000),
      lastSentAt: new Date(now - 61_000),
      updatedAt: new Date(now),
      ...overrides,
    })
    .where(eq(usernameChangeChallenges.userId, userId))
}

async function waitForAdvisoryLockWait(expectedWaiters = 1): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: number }>(`
      select count(*)::int as waiting
      from pg_catalog.pg_stat_activity
      where datname = current_database()
        and wait_event_type = 'Lock'
        and lower(coalesce(wait_event, '')) = 'advisory'
    `)
    if ((result.rows[0]?.waiting ?? 0) >= expectedWaiters) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Expected completion to wait on the advisory identity lock')
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

describe('username change service', () => {
  it('preflights exact, unavailable, and capitalization-only names without writing challenge state', async () => {
    const { user, session } = await createAuthenticatedSession()

    await expect(
      preflightUsernameChange(database, session, user.username),
    ).resolves.toEqual({ kind: 'no_change' })
    await expect(
      preflightUsernameChange(database, session, 'mediafan'),
    ).resolves.toEqual({ kind: 'ready', username: 'mediafan' })
    await database.insert(users).values({
      username: 'TakenName',
      usernameIdentityKey: 'takenname',
      email: `${randomUUID()}@example.test`,
    })
    await expect(
      preflightUsernameChange(database, session, 'TakenName'),
    ).resolves.toEqual({ kind: 'target_unavailable' })
    await expect(
      database
        .select()
        .from(usernameChangeChallenges)
        .where(eq(usernameChangeChallenges.userId, user.id)),
    ).resolves.toEqual([])
  })

  it('exposes only bounded, database-clock resend readiness for a pending challenge', async () => {
    const { user, session } = await createAuthenticatedSession()
    await expect(
      requestUsernameChange(database, authSecret, session, 'NewName'),
    ).resolves.toMatchObject({ kind: 'challenge_created' })

    const pending = await readUsernameChangeState(database, session)
    expect(pending).toMatchObject({
      kind: 'pending',
      username: user.username,
      proposedUsername: 'NewName',
      resend: { kind: 'cooldown' },
    })
    if (pending.kind !== 'pending' || pending.resend.kind !== 'cooldown') return
    expect(pending.resend.retryAfterMilliseconds).toBeGreaterThan(0)
    expect(pending.resend.retryAfterMilliseconds).toBeLessThanOrEqual(60_000)

    await makeResendEligible(user.id)
    await expect(
      readUsernameChangeState(database, session),
    ).resolves.toMatchObject({
      kind: 'pending',
      resend: { kind: 'available' },
    })
    await database
      .update(usernameChangeChallenges)
      .set({ failedCodeAttempts: 5 })
      .where(eq(usernameChangeChallenges.userId, user.id))
    await expect(
      readUsernameChangeState(database, session),
    ).resolves.toMatchObject({
      kind: 'pending',
      resend: { kind: 'restart_required', reason: 'attempts_exhausted' },
    })
  })

  it('treats an exact username as a no-op without creating a challenge or consuming the allowance', async () => {
    const { user, session } = await createAuthenticatedSession()

    await expect(
      requestUsernameChange(database, authSecret, session, user.username),
    ).resolves.toEqual({ kind: 'no_change' })
    await expect(
      database
        .select()
        .from(usernameChangeChallenges)
        .where(eq(usernameChangeChallenges.userId, user.id)),
    ).resolves.toEqual([])

    await expect(
      requestUsernameChange(database, authSecret, session, 'NewName'),
    ).resolves.toMatchObject({ kind: 'challenge_created' })
  })

  it('applies the request cooldown without superseding or incrementing the current challenge', async () => {
    const { user, session } = await createAuthenticatedSession()
    await expect(
      requestUsernameChange(database, authSecret, session, 'NewName'),
    ).resolves.toMatchObject({ kind: 'challenge_created' })
    const challengeBeforeRetry = await loadChallenge(user.id)

    await expect(
      requestUsernameChange(database, authSecret, session, 'AnotherName'),
    ).resolves.toEqual({ kind: 'resend_cooldown' })
    await expect(loadChallenge(user.id)).resolves.toEqual(challengeBeforeRetry)
    expect(challengeBeforeRetry.sendCount).toBe(1)
  })

  it('rejects every mutation path for an expired authoritative session', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return
    const challengeBeforeExpiry = await loadChallenge(user.id)

    await database
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(sessions.id, session.sessionId))

    await expect(
      requestUsernameChange(database, authSecret, session, 'AnotherName'),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(
      resendUsernameChangeCode(database, authSecret, session),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(cancelUsernameChange(database, session)).resolves.toEqual({
      kind: 'session_invalid',
    })
    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'session_invalid' })
    await expect(loadChallenge(user.id)).resolves.toEqual(challengeBeforeExpiry)
  })

  it('allows a capitalization-only change and writes a permanent record without an old-name reservation', async () => {
    const { user, session } = await createAuthenticatedSession('MediaFan')
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'mediafan',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'changed', username: 'mediafan' })

    const [record] = await database
      .select()
      .from(usernameChangeRecords)
      .where(eq(usernameChangeRecords.userId, user.id))
    expect(record?.previousUsernameIdentityKey).toBeNull()
    expect(record?.previousUsernameReservedUntil).toBeNull()
    await expect(readUsernameChangeState(database, session)).resolves.toEqual({
      kind: 'already_changed',
      username: 'mediafan',
    })
  })

  it('rejects completion from another session while leaving the original session challenge usable', async () => {
    const { session } = await createAuthenticatedSession()
    const otherSession = await createAdditionalSession(session.userId)
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    await expect(
      completeUsernameChange(
        database,
        authSecret,
        otherSession,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'restart_required' })
    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'changed', username: 'NewName' })
  })

  it('locks a challenge after five invalid codes', async () => {
    const { session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        completeUsernameChange(database, authSecret, session, '00000000'),
      ).resolves.toEqual({ kind: 'invalid_code' })
    }
    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'attempts_exhausted' })
  })

  it('permits a resend after code expiry while reauthentication is valid, but requires restart after reauthentication expires', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return
    const now = Date.now()
    await makeResendEligible(user.id, {
      codeExpiresAt: new Date(now - 1_000),
    })

    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'code_expired' })

    await expect(
      resendUsernameChangeCode(database, authSecret, session),
    ).resolves.toMatchObject({ kind: 'challenge_resent' })

    await makeResendEligible(user.id, {
      codeExpiresAt: new Date(now - 2_000),
      reauthenticatedUntil: new Date(now - 1_000),
    })

    await expect(
      completeUsernameChange(database, authSecret, session, '00000000'),
    ).resolves.toEqual({ kind: 'reauthentication_required' })
    await expect(
      resendUsernameChangeCode(database, authSecret, session),
    ).resolves.toEqual({ kind: 'reauthentication_required' })
  })

  it('enforces resend cooldown and the three-send cap without extending the fifteen-minute reauthentication window', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')

    await expect(
      resendUsernameChangeCode(database, authSecret, session),
    ).resolves.toEqual({ kind: 'resend_cooldown' })

    await makeResendEligible(user.id)
    const firstResend = await resendUsernameChangeCode(
      database,
      authSecret,
      session,
    )
    expect(firstResend.kind).toBe('challenge_resent')
    if (firstResend.kind !== 'challenge_resent') return
    expect(firstResend.delivery.expiresAt.getTime()).toBeLessThanOrEqual(
      (await loadChallenge(user.id)).reauthenticatedUntil.getTime(),
    )

    await makeResendEligible(user.id)
    const secondResend = await resendUsernameChangeCode(
      database,
      authSecret,
      session,
    )
    expect(secondResend.kind).toBe('challenge_resent')
    if (secondResend.kind !== 'challenge_resent') return
    await makeResendEligible(user.id)
    await expect(
      resendUsernameChangeCode(database, authSecret, session),
    ).resolves.toEqual({ kind: 'send_limit' })
    await expect(
      readUsernameChangeState(database, session),
    ).resolves.toMatchObject({
      kind: 'pending',
      resend: { kind: 'unavailable', reason: 'send_limit' },
    })
    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        secondResend.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'changed', username: 'NewName' })
  })

  it('keeps a valid newest code completable after the reauthentication resend cutoff', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    const now = Date.now()
    await makeResendEligible(user.id, {
      codeExpiresAt: new Date(now + 4 * 60 * 1000),
      reauthenticatedUntil: new Date(now + 9 * 60 * 1000),
    })
    await expect(
      readUsernameChangeState(database, session),
    ).resolves.toMatchObject({
      kind: 'pending',
      resend: { kind: 'unavailable', reason: 'reauthentication_window' },
    })
    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'changed', username: 'NewName' })
  })

  it('rejects an unverified email address before creating a challenge', async () => {
    const { user, session } = await createAuthenticatedSession()
    await database
      .update(users)
      .set({ emailVerified: false })
      .where(eq(users.id, user.id))

    await expect(
      requestUsernameChange(database, authSecret, session, 'NewName'),
    ).resolves.toEqual({ kind: 'email_unavailable' })
    await expect(
      database
        .select()
        .from(usernameChangeChallenges)
        .where(eq(usernameChangeChallenges.userId, user.id)),
    ).resolves.toEqual([])
  })

  it('rejects a target lost before completion and invalidates the session binding without deleting the session', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'TargetName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return
    await database.insert(users).values({
      username: 'TargetName',
      usernameIdentityKey: 'targetname',
      email: `${randomUUID()}@example.test`,
    })

    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'target_unavailable' })
    expect((await loadChallenge(user.id)).sessionId).toBeNull()
    await expect(
      database
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, session.sessionId)),
    ).resolves.toEqual([{ id: session.sessionId }])
  })

  it('invalidates a stored target that no longer satisfies username policy', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    await database
      .update(usernameChangeChallenges)
      .set({
        proposedUsername: 'Admin',
        proposedUsernameIdentityKey: 'admin',
      })
      .where(eq(usernameChangeChallenges.userId, user.id))

    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'restart_required' })
    expect((await loadChallenge(user.id)).sessionId).toBeNull()
  })

  it('takes the change timestamp after an advisory-lock wait so the reservation remains exactly fourteen days', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    const lockClient = await pool.connect()
    try {
      await lockClient.query('begin')
      await lockClient.query(`select lock_username_identity_key('newname')`)
      const completion = completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      )
      await waitForAdvisoryLockWait()
      const releaseClockResult = await pool.query<{ now: string }>(
        'select clock_timestamp() as now',
      )
      const lockReleaseObservedAt = new Date(releaseClockResult.rows[0]!.now)
      await lockClient.query('commit')

      await expect(completion).resolves.toEqual({
        kind: 'changed',
        username: 'NewName',
      })
      const [record] = await database
        .select()
        .from(usernameChangeRecords)
        .where(eq(usernameChangeRecords.userId, user.id))
      expect(record?.changedAt.getTime()).toBeGreaterThanOrEqual(
        lockReleaseObservedAt.getTime(),
      )
      expect(record?.previousUsernameReservedUntil?.getTime()).toBe(
        record!.changedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
      )
    } finally {
      await lockClient.query('rollback')
      lockClient.release()
    }
  })

  it('serializes duplicate completion attempts for one user into one permanent event', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    const results = await Promise.all([
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ])
    expect(results.map(({ kind }) => kind).sort()).toEqual([
      'changed',
      'restart_required',
    ])
    await expect(
      database
        .select()
        .from(usernameChangeRecords)
        .where(eq(usernameChangeRecords.userId, user.id)),
    ).resolves.toHaveLength(1)
  })

  it('serializes two users competing for one target without deadlock', async () => {
    const first = await createAuthenticatedSession('AlphaUser')
    const second = await createAuthenticatedSession('BravoUser')
    const firstRequest = await requestUsernameChange(
      database,
      authSecret,
      first.session,
      'SharedName',
    )
    const secondRequest = await requestUsernameChange(
      database,
      authSecret,
      second.session,
      'SharedName',
    )
    expect(firstRequest.kind).toBe('challenge_created')
    expect(secondRequest.kind).toBe('challenge_created')
    if (
      firstRequest.kind !== 'challenge_created' ||
      secondRequest.kind !== 'challenge_created'
    ) {
      return
    }

    const results = await Promise.all([
      completeUsernameChange(
        database,
        authSecret,
        first.session,
        firstRequest.delivery.code,
      ),
      completeUsernameChange(
        database,
        authSecret,
        second.session,
        secondRequest.delivery.code,
      ),
    ])
    expect(results.map(({ kind }) => kind).sort()).toEqual([
      'changed',
      'target_unavailable',
    ])
    await expect(
      database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.usernameIdentityKey, 'sharedname')),
    ).resolves.toHaveLength(1)
  })

  it('orders released-key registration behind completion and rejects it through the reservation trigger', async () => {
    const { session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    const lockClient = await pool.connect()
    try {
      await lockClient.query('begin')
      await lockClient.query(`select lock_username_identity_key('newname')`)
      const completion = completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      )
      await waitForAdvisoryLockWait()
      const registration = database
        .insert(users)
        .values({
          username: 'MediaFan',
          usernameIdentityKey: 'mediafan',
          email: `${randomUUID()}@example.test`,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        )
      await waitForAdvisoryLockWait(2)
      await lockClient.query('commit')

      await expect(completion).resolves.toEqual({
        kind: 'changed',
        username: 'NewName',
      })
      const registrationError = await registration
      expect(registrationError).toMatchObject({
        cause: {
          code: '23505',
          constraint: 'username_identity_key_reserved',
        },
      })
    } finally {
      await lockClient.query('rollback')
      lockClient.release()
    }
  })

  it('binds the code to the session, records the change, and reserves the old identity', async () => {
    const { user, session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )

    expect(requested.kind).toBe('challenge_created')
    if (requested.kind !== 'challenge_created') return

    await expect(
      readUsernameChangeState(database, session),
    ).resolves.toMatchObject({
      kind: 'pending',
      username: user.username,
      proposedUsername: 'NewName',
      resend: { kind: 'cooldown' },
    })
    await expect(
      completeUsernameChange(database, authSecret, session, '00000000'),
    ).resolves.toEqual({ kind: 'invalid_code' })
    await expect(
      completeUsernameChange(
        database,
        authSecret,
        session,
        requested.delivery.code,
      ),
    ).resolves.toEqual({ kind: 'changed', username: 'NewName' })

    const [changedUser] = await database
      .select({ username: users.username, key: users.usernameIdentityKey })
      .from(users)
      .where(eq(users.id, user.id))
    expect(changedUser).toEqual({ username: 'NewName', key: 'newname' })

    const [record] = await database
      .select()
      .from(usernameChangeRecords)
      .where(eq(usernameChangeRecords.userId, user.id))
    expect(record?.previousUsernameIdentityKey).toBe('mediafan')
    expect(record?.previousUsernameReservedUntil?.getTime()).toBe(
      record?.changedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
    )
    await expect(
      database
        .update(usernameChangeRecords)
        .set({ changedAt: new Date() })
        .where(eq(usernameChangeRecords.userId, user.id)),
    ).rejects.toMatchObject({
      cause: {
        code: '55000',
        constraint: 'username_change_records_immutable',
      },
    })
    await expect(
      database.insert(users).values({
        username: 'MediaFan',
        usernameIdentityKey: 'mediafan',
        email: `${randomUUID()}@example.test`,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } })
    await expect(
      requestUsernameChange(database, authSecret, session, 'AnotherName'),
    ).resolves.toEqual({ kind: 'already_changed' })
    await expect(
      database
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, session.sessionId)),
    ).resolves.toEqual([{ id: session.sessionId }])
  })

  it('preserves the send window when the bound session is removed', async () => {
    const { session } = await createAuthenticatedSession()
    const requested = await requestUsernameChange(
      database,
      authSecret,
      session,
      'NewName',
    )
    expect(requested.kind).toBe('challenge_created')

    await database.delete(sessions).where(eq(sessions.id, session.sessionId))
    const [orphanedChallenge] = await database
      .select({
        sessionId: usernameChangeChallenges.sessionId,
        sends: usernameChangeChallenges.sendCount,
      })
      .from(usernameChangeChallenges)
      .where(eq(usernameChangeChallenges.userId, session.userId))
    expect(orphanedChallenge).toEqual({ sessionId: null, sends: 1 })
    await makeResendEligible(session.userId)

    const replacementSessionId = randomUUID()
    await database.insert(sessions).values({
      id: replacementSessionId,
      userId: session.userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    await expect(
      requestUsernameChange(
        database,
        authSecret,
        {
          userId: session.userId,
          sessionId: replacementSessionId,
        },
        'AnotherName',
      ),
    ).resolves.toMatchObject({ kind: 'challenge_created' })

    const [reboundChallenge] = await database
      .select({
        sessionId: usernameChangeChallenges.sessionId,
        sends: usernameChangeChallenges.sendCount,
      })
      .from(usernameChangeChallenges)
      .where(eq(usernameChangeChallenges.userId, session.userId))
    expect(reboundChallenge).toEqual({
      sessionId: replacementSessionId,
      sends: 2,
    })
  })
})
