import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  normalizeUsernameForIdentity,
  usernameSchema,
} from '@/features/identity/domain/username'
import {
  sessions,
  usernameChangeChallenges,
  usernameChangeRecords,
  users,
} from '@/server/database/schema'
import {
  createUsernameChangeCode,
  createUsernameChangeCodeDigest,
  isUsernameChangeCode,
  usernameChangeCodeExpiresInMilliseconds,
  usernameChangeMaximumFailedAttempts,
  usernameChangeMaximumSends,
  usernameChangeReauthenticationMilliseconds,
  usernameChangeResendCooldownMilliseconds,
  usernameChangeSendWindowMilliseconds,
  verifyUsernameChangeCodeDigest,
} from '@/server/identity/username-change-code'

type IdentityDatabase = NodePgDatabase

type IdentitySession = Readonly<{ userId: string; sessionId: string }>

export type UsernameChangeDelivery = Readonly<{
  code: string
  challengeId: string
  expiresAt: Date
}>

export type UsernameChangeRequestResult =
  | { kind: 'challenge_created'; delivery: UsernameChangeDelivery }
  | { kind: 'invalid_username' }
  | { kind: 'no_change' }
  | { kind: 'already_changed' }
  | { kind: 'target_unavailable' }
  | { kind: 'session_invalid' }
  | { kind: 'email_unavailable' }
  | { kind: 'resend_cooldown' }
  | { kind: 'send_limit' }

/**
 * Read-only eligibility result used before password verification. Challenge
 * creation repeats these checks under a transaction because availability can
 * change between this preflight and the verified request.
 */
export type UsernameChangePreflightResult =
  | { kind: 'ready'; username: string }
  | { kind: 'invalid_username' }
  | { kind: 'no_change' }
  | { kind: 'already_changed' }
  | { kind: 'target_unavailable' }
  | { kind: 'session_invalid' }
  | { kind: 'email_unavailable' }

export type UsernameChangeResendResult =
  | { kind: 'challenge_resent'; delivery: UsernameChangeDelivery }
  | { kind: 'restart_required' }
  | { kind: 'reauthentication_required' }
  | { kind: 'attempts_exhausted' }
  | { kind: 'resend_cooldown' }
  | { kind: 'send_limit' }
  | { kind: 'session_invalid' }

export type UsernameChangeCompletionResult =
  | { kind: 'changed'; username: string }
  | { kind: 'invalid_code' }
  | { kind: 'code_expired' }
  | { kind: 'reauthentication_required' }
  | { kind: 'attempts_exhausted' }
  | { kind: 'restart_required' }
  | { kind: 'target_unavailable' }
  | { kind: 'already_changed' }
  | { kind: 'session_invalid' }

export type UsernameChangeState =
  | { kind: 'available'; username: string }
  | {
      kind: 'pending'
      username: string
      proposedUsername: string
      resend:
        | { kind: 'available' }
        | { kind: 'cooldown'; retryAfterMilliseconds: number }
        | {
            kind: 'unavailable'
            reason: 'send_limit' | 'reauthentication_window'
          }
        | {
            kind: 'restart_required'
            reason: 'reauthentication_expired' | 'attempts_exhausted'
          }
    }
  | { kind: 'already_changed'; username: string }
  | { kind: 'session_invalid' }

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds)
}

async function databaseNow(
  database: IdentityDatabase,
  userId: string,
): Promise<Date> {
  const [row] = await database
    .select({ now: sql<Date>`clock_timestamp()` })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (row === undefined)
    throw new Error('Username change user no longer exists')
  // PostgreSQL returns untyped raw expressions as strings through node-postgres.
  // Convert here so all deadline arithmetic uses the database clock, not app time.
  return new Date(row.now)
}

async function lockIdentityKey(
  database: IdentityDatabase,
  key: string,
): Promise<void> {
  await database.execute(sql`select lock_username_identity_key(${key})`)
}

async function lockIdentityKeys(
  database: IdentityDatabase,
  first: string,
  second: string,
): Promise<void> {
  for (const key of [...new Set([first, second])].sort()) {
    await lockIdentityKey(database, key)
  }
}

async function sessionBelongsToUser(
  database: IdentityDatabase,
  session: IdentitySession,
): Promise<boolean> {
  const [row] = await database
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, session.sessionId),
        eq(sessions.userId, session.userId),
        sql`${sessions.expiresAt} > clock_timestamp()`,
      ),
    )
    .limit(1)

  return row !== undefined
}

async function targetIsAvailable(
  database: IdentityDatabase,
  currentUserId: string,
  currentIdentityKey: string,
  proposedIdentityKey: string,
  now: Date,
): Promise<boolean> {
  if (currentIdentityKey === proposedIdentityKey) return true

  const [[activeUser], [reservation]] = await Promise.all([
    database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.usernameIdentityKey, proposedIdentityKey),
          ne(users.id, currentUserId),
        ),
      )
      .limit(1),
    database
      .select({ userId: usernameChangeRecords.userId })
      .from(usernameChangeRecords)
      .where(
        and(
          eq(
            usernameChangeRecords.previousUsernameIdentityKey,
            proposedIdentityKey,
          ),
          sql`${usernameChangeRecords.previousUsernameReservedUntil} > ${now}`,
        ),
      )
      .limit(1),
  ])

  return activeUser === undefined && reservation === undefined
}

async function loadLockedUser(database: IdentityDatabase, userId: string) {
  const [user] = await database
    .select({
      id: users.id,
      username: users.username,
      usernameIdentityKey: users.usernameIdentityKey,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update')
    .limit(1)

  return user
}

async function hasChangeRecord(database: IdentityDatabase, userId: string) {
  const [record] = await database
    .select({ userId: usernameChangeRecords.userId })
    .from(usernameChangeRecords)
    .where(eq(usernameChangeRecords.userId, userId))
    .limit(1)

  return record !== undefined
}

async function loadLockedChallenge(database: IdentityDatabase, userId: string) {
  const [challenge] = await database
    .select()
    .from(usernameChangeChallenges)
    .where(eq(usernameChangeChallenges.userId, userId))
    .for('update')
    .limit(1)

  return challenge
}

function parseProposedUsername(
  value: unknown,
):
  | { kind: 'valid'; username: string; identityKey: string }
  | { kind: 'invalid' } {
  if (typeof value !== 'string') return { kind: 'invalid' }
  const parsed = usernameSchema.safeParse(value.trim())
  if (!parsed.success) return { kind: 'invalid' }
  return {
    kind: 'valid',
    username: parsed.data,
    identityKey: normalizeUsernameForIdentity(parsed.data),
  }
}

function createDelivery(
  code: string,
  challengeId: string,
  sentAt: Date,
): UsernameChangeDelivery {
  return {
    code,
    challengeId,
    expiresAt: addMilliseconds(sentAt, usernameChangeCodeExpiresInMilliseconds),
  }
}

/**
 * Performs the non-secret, owner-aware eligibility check required before a
 * user is asked to re-enter their password. It does not reserve a name and
 * must not be treated as authoritative by the subsequent write path.
 */
export async function preflightUsernameChange(
  database: IdentityDatabase,
  session: IdentitySession,
  proposedValue: unknown,
): Promise<UsernameChangePreflightResult> {
  const proposed = parseProposedUsername(proposedValue)
  if (proposed.kind === 'invalid') return { kind: 'invalid_username' }

  const [user] = await database
    .select({
      id: users.id,
      username: users.username,
      usernameIdentityKey: users.usernameIdentityKey,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
  if (user === undefined || !(await sessionBelongsToUser(database, session))) {
    return { kind: 'session_invalid' }
  }
  if (user.username === proposed.username) return { kind: 'no_change' }
  if (await hasChangeRecord(database, user.id))
    return { kind: 'already_changed' }
  if (!user.emailVerified) return { kind: 'email_unavailable' }

  const now = await databaseNow(database, user.id)
  if (
    !(await targetIsAvailable(
      database,
      user.id,
      user.usernameIdentityKey,
      proposed.identityKey,
      now,
    ))
  ) {
    return { kind: 'target_unavailable' }
  }
  return { kind: 'ready', username: proposed.username }
}

export async function requestUsernameChange(
  database: IdentityDatabase,
  authSecret: string,
  session: IdentitySession,
  proposedValue: unknown,
): Promise<UsernameChangeRequestResult> {
  const proposed = parseProposedUsername(proposedValue)
  if (proposed.kind === 'invalid') return { kind: 'invalid_username' }

  return database.transaction(async (transaction) => {
    const user = await loadLockedUser(transaction, session.userId)
    if (
      user === undefined ||
      !(await sessionBelongsToUser(transaction, session))
    ) {
      return { kind: 'session_invalid' }
    }
    if (!user.emailVerified) return { kind: 'email_unavailable' }
    if (user.username === proposed.username) return { kind: 'no_change' }
    if (await hasChangeRecord(transaction, session.userId)) {
      return { kind: 'already_changed' }
    }

    const now = await databaseNow(transaction, session.userId)
    const currentChallenge = await loadLockedChallenge(
      transaction,
      session.userId,
    )
    const resetWindow =
      currentChallenge === undefined ||
      now.getTime() - currentChallenge.sendWindowStartedAt.getTime() >=
        usernameChangeSendWindowMilliseconds
    if (
      !resetWindow &&
      now.getTime() - currentChallenge.lastSentAt.getTime() <
        usernameChangeResendCooldownMilliseconds
    ) {
      return { kind: 'resend_cooldown' }
    }
    const sendCount = resetWindow ? 1 : currentChallenge.sendCount + 1
    if (!resetWindow && sendCount > usernameChangeMaximumSends) {
      return { kind: 'send_limit' }
    }

    await lockIdentityKeys(
      transaction,
      user.usernameIdentityKey,
      proposed.identityKey,
    )
    if (
      !(await targetIsAvailable(
        transaction,
        user.id,
        user.usernameIdentityKey,
        proposed.identityKey,
        now,
      ))
    ) {
      return { kind: 'target_unavailable' }
    }

    const challengeId = randomUUID()
    const code = createUsernameChangeCode()
    const delivery = createDelivery(code, challengeId, now)
    const reauthenticatedUntil = addMilliseconds(
      now,
      usernameChangeReauthenticationMilliseconds,
    )

    await transaction
      .insert(usernameChangeChallenges)
      .values({
        userId: user.id,
        sessionId: session.sessionId,
        challengeId,
        proposedUsername: proposed.username,
        proposedUsernameIdentityKey: proposed.identityKey,
        codeDigest: createUsernameChangeCodeDigest(
          authSecret,
          challengeId,
          code,
        ),
        codeExpiresAt: delivery.expiresAt,
        reauthenticatedUntil,
        failedCodeAttempts: 0,
        sendWindowStartedAt: resetWindow
          ? now
          : currentChallenge!.sendWindowStartedAt,
        sendCount,
        lastSentAt: now,
        createdAt: currentChallenge?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: usernameChangeChallenges.userId,
        set: {
          sessionId: session.sessionId,
          challengeId,
          proposedUsername: proposed.username,
          proposedUsernameIdentityKey: proposed.identityKey,
          codeDigest: createUsernameChangeCodeDigest(
            authSecret,
            challengeId,
            code,
          ),
          codeExpiresAt: delivery.expiresAt,
          reauthenticatedUntil,
          failedCodeAttempts: 0,
          sendWindowStartedAt: resetWindow
            ? now
            : currentChallenge!.sendWindowStartedAt,
          sendCount,
          lastSentAt: now,
          updatedAt: now,
        },
      })

    return { kind: 'challenge_created', delivery }
  })
}

export async function resendUsernameChangeCode(
  database: IdentityDatabase,
  authSecret: string,
  session: IdentitySession,
): Promise<UsernameChangeResendResult> {
  return database.transaction(async (transaction) => {
    const user = await loadLockedUser(transaction, session.userId)
    if (
      user === undefined ||
      !(await sessionBelongsToUser(transaction, session))
    ) {
      return { kind: 'session_invalid' }
    }
    const challenge = await loadLockedChallenge(transaction, session.userId)
    if (challenge === undefined || challenge.sessionId !== session.sessionId) {
      return { kind: 'restart_required' }
    }
    const now = await databaseNow(transaction, user.id)
    if (now >= challenge.reauthenticatedUntil) {
      return { kind: 'reauthentication_required' }
    }
    if (challenge.failedCodeAttempts >= usernameChangeMaximumFailedAttempts) {
      return { kind: 'attempts_exhausted' }
    }
    if (
      addMilliseconds(now, usernameChangeCodeExpiresInMilliseconds) >
      challenge.reauthenticatedUntil
    ) {
      return { kind: 'reauthentication_required' }
    }
    if (
      now.getTime() - challenge.lastSentAt.getTime() <
      usernameChangeResendCooldownMilliseconds
    ) {
      return { kind: 'resend_cooldown' }
    }
    if (
      now.getTime() - challenge.sendWindowStartedAt.getTime() >=
        usernameChangeSendWindowMilliseconds ||
      challenge.sendCount >= usernameChangeMaximumSends
    ) {
      return { kind: 'send_limit' }
    }

    const challengeId = randomUUID()
    const code = createUsernameChangeCode()
    const delivery = createDelivery(code, challengeId, now)
    await transaction
      .update(usernameChangeChallenges)
      .set({
        challengeId,
        codeDigest: createUsernameChangeCodeDigest(
          authSecret,
          challengeId,
          code,
        ),
        codeExpiresAt: delivery.expiresAt,
        failedCodeAttempts: 0,
        sendCount: challenge.sendCount + 1,
        lastSentAt: now,
        updatedAt: now,
      })
      .where(eq(usernameChangeChallenges.userId, user.id))

    return { kind: 'challenge_resent', delivery }
  })
}

export async function cancelUsernameChange(
  database: IdentityDatabase,
  session: IdentitySession,
): Promise<{ kind: 'cancelled' } | { kind: 'session_invalid' }> {
  return database.transaction(async (transaction) => {
    if (!(await sessionBelongsToUser(transaction, session))) {
      return { kind: 'session_invalid' }
    }
    const challenge = await loadLockedChallenge(transaction, session.userId)
    if (challenge === undefined || challenge.sessionId !== session.sessionId) {
      return { kind: 'cancelled' }
    }
    await transaction
      .update(usernameChangeChallenges)
      .set({
        sessionId: null,
        updatedAt: await databaseNow(transaction, session.userId),
      })
      .where(eq(usernameChangeChallenges.userId, session.userId))
    return { kind: 'cancelled' }
  })
}

export async function completeUsernameChange(
  database: IdentityDatabase,
  authSecret: string,
  session: IdentitySession,
  code: unknown,
): Promise<UsernameChangeCompletionResult> {
  if (!isUsernameChangeCode(code)) return { kind: 'invalid_code' }

  return database.transaction(async (transaction) => {
    const user = await loadLockedUser(transaction, session.userId)
    if (
      user === undefined ||
      !(await sessionBelongsToUser(transaction, session))
    ) {
      return { kind: 'session_invalid' }
    }
    const challenge = await loadLockedChallenge(transaction, user.id)
    if (challenge === undefined || challenge.sessionId !== session.sessionId) {
      return { kind: 'restart_required' }
    }
    const authorizationCheckedAt = await databaseNow(transaction, user.id)
    if (authorizationCheckedAt >= challenge.reauthenticatedUntil) {
      return { kind: 'reauthentication_required' }
    }
    if (challenge.failedCodeAttempts >= usernameChangeMaximumFailedAttempts) {
      return { kind: 'attempts_exhausted' }
    }
    if (authorizationCheckedAt >= challenge.codeExpiresAt) {
      return { kind: 'code_expired' }
    }
    if (
      !verifyUsernameChangeCodeDigest(
        authSecret,
        challenge.challengeId,
        code,
        challenge.codeDigest,
      )
    ) {
      await transaction
        .update(usernameChangeChallenges)
        .set({
          failedCodeAttempts: challenge.failedCodeAttempts + 1,
          updatedAt: authorizationCheckedAt,
        })
        .where(eq(usernameChangeChallenges.userId, user.id))
      return { kind: 'invalid_code' }
    }
    if (await hasChangeRecord(transaction, user.id)) {
      return { kind: 'already_changed' }
    }
    const parsed = usernameSchema.safeParse(challenge.proposedUsername)
    const proposedIdentityKey = parsed.success
      ? normalizeUsernameForIdentity(parsed.data)
      : undefined
    if (
      !parsed.success ||
      proposedIdentityKey !== challenge.proposedUsernameIdentityKey
    ) {
      await transaction
        .update(usernameChangeChallenges)
        .set({ sessionId: null, updatedAt: authorizationCheckedAt })
        .where(eq(usernameChangeChallenges.userId, user.id))
      return { kind: 'restart_required' }
    }

    await lockIdentityKeys(
      transaction,
      user.usernameIdentityKey,
      proposedIdentityKey,
    )
    const changedAt = await databaseNow(transaction, user.id)
    if (
      !(await targetIsAvailable(
        transaction,
        user.id,
        user.usernameIdentityKey,
        proposedIdentityKey,
        changedAt,
      ))
    ) {
      await transaction
        .update(usernameChangeChallenges)
        .set({ sessionId: null, updatedAt: changedAt })
        .where(eq(usernameChangeChallenges.userId, user.id))
      return { kind: 'target_unavailable' }
    }

    const identityChanged = user.usernameIdentityKey !== proposedIdentityKey
    await transaction
      .update(users)
      .set({
        username: parsed.data,
        usernameIdentityKey: proposedIdentityKey,
        updatedAt: changedAt,
      })
      .where(eq(users.id, user.id))
    await transaction.insert(usernameChangeRecords).values({
      userId: user.id,
      changedAt,
      previousUsernameIdentityKey: identityChanged
        ? user.usernameIdentityKey
        : null,
      previousUsernameReservedUntil: identityChanged
        ? addMilliseconds(changedAt, 14 * 24 * 60 * 60 * 1000)
        : null,
    })
    await transaction
      .delete(usernameChangeChallenges)
      .where(eq(usernameChangeChallenges.userId, user.id))

    return { kind: 'changed', username: parsed.data }
  })
}

export async function readUsernameChangeState(
  database: IdentityDatabase,
  session: IdentitySession,
): Promise<UsernameChangeState> {
  const [user] = await database
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
  if (user === undefined || !(await sessionBelongsToUser(database, session))) {
    return { kind: 'session_invalid' }
  }
  if (await hasChangeRecord(database, session.userId)) {
    return { kind: 'already_changed', username: user.username }
  }
  const [challenge] = await database
    .select({
      sessionId: usernameChangeChallenges.sessionId,
      proposedUsername: usernameChangeChallenges.proposedUsername,
      reauthenticatedUntil: usernameChangeChallenges.reauthenticatedUntil,
      failedCodeAttempts: usernameChangeChallenges.failedCodeAttempts,
      sendCount: usernameChangeChallenges.sendCount,
      sendWindowStartedAt: usernameChangeChallenges.sendWindowStartedAt,
      lastSentAt: usernameChangeChallenges.lastSentAt,
    })
    .from(usernameChangeChallenges)
    .where(eq(usernameChangeChallenges.userId, session.userId))
    .limit(1)
  if (challenge?.sessionId === session.sessionId) {
    const now = await databaseNow(database, session.userId)
    const reauthenticationCanFitAnotherCode =
      addMilliseconds(now, usernameChangeCodeExpiresInMilliseconds) <=
      challenge.reauthenticatedUntil
    const invalidChallenge =
      now >= challenge.reauthenticatedUntil ||
      challenge.failedCodeAttempts >= usernameChangeMaximumFailedAttempts
    const sendLimitReached =
      challenge.sendCount >= usernameChangeMaximumSends ||
      now.getTime() - challenge.sendWindowStartedAt.getTime() >=
        usernameChangeSendWindowMilliseconds
    const resendUnavailableReason = sendLimitReached
      ? 'send_limit'
      : !reauthenticationCanFitAnotherCode
        ? 'reauthentication_window'
        : undefined
    const remainingCooldown = Math.min(
      usernameChangeResendCooldownMilliseconds,
      Math.max(
        0,
        usernameChangeResendCooldownMilliseconds -
          (now.getTime() - challenge.lastSentAt.getTime()),
      ),
    )
    return {
      kind: 'pending',
      username: user.username,
      proposedUsername: challenge.proposedUsername,
      resend: invalidChallenge
        ? {
            kind: 'restart_required',
            reason:
              now >= challenge.reauthenticatedUntil
                ? 'reauthentication_expired'
                : 'attempts_exhausted',
          }
        : resendUnavailableReason !== undefined
          ? { kind: 'unavailable', reason: resendUnavailableReason }
          : remainingCooldown === 0
            ? { kind: 'available' }
            : { kind: 'cooldown', retryAfterMilliseconds: remainingCooldown },
    }
  }
  return { kind: 'available', username: user.username }
}
