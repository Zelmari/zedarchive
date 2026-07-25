import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  accountDeletionRequests,
  deletionChallenges,
  sessions,
  usernameChangeChallenges,
  users,
} from '@/server/database/schema'
import {
  accountDeletionCodeExpiresInMilliseconds,
  accountDeletionMaximumFailedAttempts,
  accountDeletionMaximumSends,
  accountDeletionReauthenticationMilliseconds,
  accountDeletionResendCooldownMilliseconds,
  accountDeletionSendWindowMilliseconds,
  createAccountDeletionCode,
  createAccountDeletionCodeDigest,
  isAccountDeletionCode,
  verifyAccountDeletionCodeDigest,
} from '@/server/account-lifecycle/account-deletion-code'
import { establishActiveAccount } from '@/server/database/active-account-transaction'

type LifecycleDatabase = NodePgDatabase

export type AccountLifecycleSession = Readonly<{
  userId: string
  sessionId: string
}>

export type AccountDeletionCodeDelivery = Readonly<{
  code: string
  challengeId: string
  expiresAt: Date
  recipient: string
}>

export type StartAccountDeletionChallengeResult =
  | { kind: 'challenge_created'; delivery: AccountDeletionCodeDelivery }
  | { kind: 'account_unavailable' }
  | { kind: 'already_requested'; purgeAfter: Date }
  | { kind: 'session_invalid' }
  | { kind: 'email_unavailable' }
  | { kind: 'resend_cooldown' }
  | { kind: 'send_limit' }

export type ResendAccountDeletionCodeResult =
  | { kind: 'challenge_resent'; delivery: AccountDeletionCodeDelivery }
  | { kind: 'account_unavailable' }
  | { kind: 'restart_required' }
  | { kind: 'reauthentication_required' }
  | { kind: 'attempts_exhausted' }
  | { kind: 'resend_cooldown' }
  | { kind: 'send_limit' }
  | { kind: 'session_invalid' }
  | { kind: 'email_unavailable' }

export type CancelAccountDeletionSetupResult =
  | { kind: 'cancelled' }
  | { kind: 'account_unavailable' }
  | { kind: 'session_invalid' }

export type CompleteAccountDeletionResult =
  | { kind: 'deletion_requested'; recipient: string; purgeAfter: Date }
  | { kind: 'already_requested'; purgeAfter: Date }
  | { kind: 'confirmation_required' }
  | { kind: 'invalid_code' }
  | { kind: 'code_expired' }
  | { kind: 'reauthentication_required' }
  | { kind: 'attempts_exhausted' }
  | { kind: 'restart_required' }
  | { kind: 'account_unavailable' }
  | { kind: 'session_invalid' }
  | { kind: 'email_unavailable' }

export type CancelAccountDeletionResult =
  | { kind: 'deletion_cancelled'; recipient: string; purgeAfter: Date }
  | { kind: 'deletion_due'; purgeAfter: Date }
  | { kind: 'not_requested' }
  | { kind: 'account_unavailable' }
  | { kind: 'session_invalid' }

export type AccountDeletionSetupState =
  | { kind: 'start' }
  | {
      kind: 'pending'
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
  | { kind: 'account_unavailable' }
  | { kind: 'session_invalid' }

const recoveryPeriodMilliseconds = 14 * 24 * 60 * 60 * 1000

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds)
}

async function databaseNow(
  database: LifecycleDatabase,
  userId: string,
): Promise<Date> {
  const [row] = await database
    .select({ now: sql<Date>`clock_timestamp()` })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (row === undefined) {
    throw new Error('Account lifecycle user no longer exists')
  }

  return new Date(row.now)
}

async function loadLockedUser(database: LifecycleDatabase, userId: string) {
  const [user] = await database
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update')
    .limit(1)

  return user
}

async function loadLockedSession(
  database: LifecycleDatabase,
  session: AccountLifecycleSession,
) {
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
    .for('update')
    .limit(1)

  return row
}

async function sessionIsValid(
  database: LifecycleDatabase,
  session: AccountLifecycleSession,
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

async function readDeletionRequest(
  database: LifecycleDatabase,
  userId: string,
  lock = false,
) {
  const query = database
    .select({
      requestedAt: accountDeletionRequests.requestedAt,
      purgeAfter: accountDeletionRequests.purgeAfter,
    })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.userId, userId))

  const [request] = lock
    ? await query.for('update').limit(1)
    : await query.limit(1)
  return request
}

async function loadLockedChallenge(
  database: LifecycleDatabase,
  userId: string,
) {
  const [challenge] = await database
    .select()
    .from(deletionChallenges)
    .where(eq(deletionChallenges.userId, userId))
    .for('update')
    .limit(1)

  return challenge
}

function createDelivery(
  code: string,
  challengeId: string,
  sentAt: Date,
  recipient: string,
): AccountDeletionCodeDelivery {
  return {
    code,
    challengeId,
    expiresAt: addMilliseconds(
      sentAt,
      accountDeletionCodeExpiresInMilliseconds,
    ),
    recipient,
  }
}

export async function readAccountDeletionSetupState(
  database: LifecycleDatabase,
  session: AccountLifecycleSession,
): Promise<AccountDeletionSetupState> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, session.userId))) {
        return { kind: 'account_unavailable' }
      }
      if (!(await sessionIsValid(transaction, session))) {
        return { kind: 'session_invalid' }
      }

      const [challenge] = await transaction
        .select({
          sessionId: deletionChallenges.sessionId,
          reauthenticatedUntil: deletionChallenges.reauthenticatedUntil,
          failedCodeAttempts: deletionChallenges.failedCodeAttempts,
          sendWindowStartedAt: deletionChallenges.sendWindowStartedAt,
          sendCount: deletionChallenges.sendCount,
          lastSentAt: deletionChallenges.lastSentAt,
        })
        .from(deletionChallenges)
        .where(eq(deletionChallenges.userId, session.userId))
        .limit(1)
      if (challenge?.sessionId !== session.sessionId) {
        return { kind: 'start' }
      }

      const now = await databaseNow(transaction, session.userId)
      const invalidChallenge =
        now >= challenge.reauthenticatedUntil ||
        challenge.failedCodeAttempts >= accountDeletionMaximumFailedAttempts
      const reauthenticationCanFitAnotherCode =
        addMilliseconds(now, accountDeletionCodeExpiresInMilliseconds) <=
        challenge.reauthenticatedUntil
      const sendLimitReached =
        challenge.sendCount >= accountDeletionMaximumSends ||
        now.getTime() - challenge.sendWindowStartedAt.getTime() >=
          accountDeletionSendWindowMilliseconds
      const remainingCooldown = Math.min(
        accountDeletionResendCooldownMilliseconds,
        Math.max(
          0,
          accountDeletionResendCooldownMilliseconds -
            (now.getTime() - challenge.lastSentAt.getTime()),
        ),
      )

      return {
        kind: 'pending',
        resend: invalidChallenge
          ? {
              kind: 'restart_required',
              reason:
                now >= challenge.reauthenticatedUntil
                  ? 'reauthentication_expired'
                  : 'attempts_exhausted',
            }
          : sendLimitReached
            ? { kind: 'unavailable', reason: 'send_limit' }
            : !reauthenticationCanFitAnotherCode
              ? { kind: 'unavailable', reason: 'reauthentication_window' }
              : remainingCooldown === 0
                ? { kind: 'available' }
                : {
                    kind: 'cooldown',
                    retryAfterMilliseconds: remainingCooldown,
                  },
      }
    },
    { isolationLevel: 'read committed' },
  )
}

export async function startAccountDeletionChallenge(
  database: LifecycleDatabase,
  authSecret: string,
  session: AccountLifecycleSession,
): Promise<StartAccountDeletionChallengeResult> {
  return database.transaction(
    async (transaction) => {
      const user = await loadLockedUser(transaction, session.userId)
      if (user === undefined) return { kind: 'account_unavailable' }

      const request = await readDeletionRequest(transaction, user.id)
      if (request !== undefined) {
        return { kind: 'already_requested', purgeAfter: request.purgeAfter }
      }

      if ((await loadLockedSession(transaction, session)) === undefined) {
        return { kind: 'session_invalid' }
      }
      if (!user.emailVerified) return { kind: 'email_unavailable' }

      const now = await databaseNow(transaction, user.id)
      const currentChallenge = await loadLockedChallenge(transaction, user.id)
      const resetWindow =
        currentChallenge === undefined ||
        now.getTime() - currentChallenge.sendWindowStartedAt.getTime() >=
          accountDeletionSendWindowMilliseconds

      if (
        !resetWindow &&
        now.getTime() - currentChallenge.lastSentAt.getTime() <
          accountDeletionResendCooldownMilliseconds
      ) {
        return { kind: 'resend_cooldown' }
      }

      const sendCount = resetWindow ? 1 : currentChallenge.sendCount + 1
      if (!resetWindow && sendCount > accountDeletionMaximumSends) {
        return { kind: 'send_limit' }
      }

      const challengeId = randomUUID()
      const code = createAccountDeletionCode()
      const delivery = createDelivery(code, challengeId, now, user.email)
      const reauthenticatedUntil = addMilliseconds(
        now,
        accountDeletionReauthenticationMilliseconds,
      )
      const codeDigest = createAccountDeletionCodeDigest(
        authSecret,
        user.id,
        session.sessionId,
        challengeId,
        code,
      )

      await transaction
        .insert(deletionChallenges)
        .values({
          userId: user.id,
          sessionId: session.sessionId,
          challengeId,
          codeDigest,
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
          target: deletionChallenges.userId,
          set: {
            sessionId: session.sessionId,
            challengeId,
            codeDigest,
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
    },
    { isolationLevel: 'read committed' },
  )
}

export async function resendAccountDeletionCode(
  database: LifecycleDatabase,
  authSecret: string,
  session: AccountLifecycleSession,
): Promise<ResendAccountDeletionCodeResult> {
  return database.transaction(
    async (transaction) => {
      const user = await loadLockedUser(transaction, session.userId)
      if (user === undefined) return { kind: 'account_unavailable' }
      if ((await readDeletionRequest(transaction, user.id)) !== undefined) {
        return { kind: 'account_unavailable' }
      }
      if ((await loadLockedSession(transaction, session)) === undefined) {
        return { kind: 'session_invalid' }
      }
      if (!user.emailVerified) return { kind: 'email_unavailable' }

      const challenge = await loadLockedChallenge(transaction, user.id)
      if (
        challenge === undefined ||
        challenge.sessionId !== session.sessionId
      ) {
        return { kind: 'restart_required' }
      }

      const now = await databaseNow(transaction, user.id)
      if (now >= challenge.reauthenticatedUntil) {
        return { kind: 'reauthentication_required' }
      }
      if (
        challenge.failedCodeAttempts >= accountDeletionMaximumFailedAttempts
      ) {
        return { kind: 'attempts_exhausted' }
      }
      if (
        addMilliseconds(now, accountDeletionCodeExpiresInMilliseconds) >
        challenge.reauthenticatedUntil
      ) {
        return { kind: 'reauthentication_required' }
      }
      if (
        now.getTime() - challenge.lastSentAt.getTime() <
        accountDeletionResendCooldownMilliseconds
      ) {
        return { kind: 'resend_cooldown' }
      }
      if (
        now.getTime() - challenge.sendWindowStartedAt.getTime() >=
          accountDeletionSendWindowMilliseconds ||
        challenge.sendCount >= accountDeletionMaximumSends
      ) {
        return { kind: 'send_limit' }
      }

      const challengeId = randomUUID()
      const code = createAccountDeletionCode()
      const delivery = createDelivery(code, challengeId, now, user.email)
      await transaction
        .update(deletionChallenges)
        .set({
          challengeId,
          codeDigest: createAccountDeletionCodeDigest(
            authSecret,
            user.id,
            session.sessionId,
            challengeId,
            code,
          ),
          codeExpiresAt: delivery.expiresAt,
          failedCodeAttempts: 0,
          sendCount: challenge.sendCount + 1,
          lastSentAt: now,
          updatedAt: now,
        })
        .where(eq(deletionChallenges.userId, user.id))

      return { kind: 'challenge_resent', delivery }
    },
    { isolationLevel: 'read committed' },
  )
}

export async function cancelAccountDeletionSetup(
  database: LifecycleDatabase,
  session: AccountLifecycleSession,
): Promise<CancelAccountDeletionSetupResult> {
  return database.transaction(
    async (transaction) => {
      const user = await loadLockedUser(transaction, session.userId)
      if (user === undefined) return { kind: 'account_unavailable' }
      if ((await readDeletionRequest(transaction, user.id)) !== undefined) {
        return { kind: 'account_unavailable' }
      }
      if ((await loadLockedSession(transaction, session)) === undefined) {
        return { kind: 'session_invalid' }
      }

      const challenge = await loadLockedChallenge(transaction, user.id)
      if (
        challenge === undefined ||
        challenge.sessionId !== session.sessionId
      ) {
        return { kind: 'cancelled' }
      }

      await transaction
        .update(deletionChallenges)
        .set({
          sessionId: null,
          updatedAt: await databaseNow(transaction, user.id),
        })
        .where(eq(deletionChallenges.userId, user.id))

      return { kind: 'cancelled' }
    },
    { isolationLevel: 'read committed' },
  )
}

export async function completeAccountDeletion(
  database: LifecycleDatabase,
  authSecret: string,
  session: AccountLifecycleSession,
  code: unknown,
  confirmed: boolean,
): Promise<CompleteAccountDeletionResult> {
  if (!confirmed) return { kind: 'confirmation_required' }
  if (!isAccountDeletionCode(code)) return { kind: 'invalid_code' }

  return database.transaction(
    async (transaction) => {
      const user = await loadLockedUser(transaction, session.userId)
      if (user === undefined) return { kind: 'account_unavailable' }

      const existingRequest = await readDeletionRequest(
        transaction,
        user.id,
        true,
      )
      if ((await loadLockedSession(transaction, session)) === undefined) {
        return { kind: 'session_invalid' }
      }
      if (existingRequest !== undefined) {
        return {
          kind: 'already_requested',
          purgeAfter: existingRequest.purgeAfter,
        }
      }
      if (!user.emailVerified) return { kind: 'email_unavailable' }

      const challenge = await loadLockedChallenge(transaction, user.id)
      if (
        challenge === undefined ||
        challenge.sessionId !== session.sessionId
      ) {
        return { kind: 'restart_required' }
      }

      const requestedAt = await databaseNow(transaction, user.id)
      if (requestedAt >= challenge.reauthenticatedUntil) {
        return { kind: 'reauthentication_required' }
      }
      if (
        challenge.failedCodeAttempts >= accountDeletionMaximumFailedAttempts
      ) {
        return { kind: 'attempts_exhausted' }
      }
      if (requestedAt >= challenge.codeExpiresAt) {
        return { kind: 'code_expired' }
      }
      if (
        !verifyAccountDeletionCodeDigest(
          authSecret,
          user.id,
          session.sessionId,
          challenge.challengeId,
          code,
          challenge.codeDigest,
        )
      ) {
        await transaction
          .update(deletionChallenges)
          .set({
            failedCodeAttempts: Math.min(
              accountDeletionMaximumFailedAttempts,
              challenge.failedCodeAttempts + 1,
            ),
            updatedAt: requestedAt,
          })
          .where(eq(deletionChallenges.userId, user.id))
        return { kind: 'invalid_code' }
      }

      const purgeAfter = addMilliseconds(
        requestedAt,
        recoveryPeriodMilliseconds,
      )
      await transaction.insert(accountDeletionRequests).values({
        userId: user.id,
        requestedAt,
        purgeAfter,
      })
      await transaction
        .delete(usernameChangeChallenges)
        .where(eq(usernameChangeChallenges.userId, user.id))
      await transaction
        .delete(sessions)
        .where(
          and(eq(sessions.userId, user.id), ne(sessions.id, session.sessionId)),
        )
      await transaction
        .delete(deletionChallenges)
        .where(eq(deletionChallenges.userId, user.id))

      return {
        kind: 'deletion_requested',
        recipient: user.email,
        purgeAfter,
      }
    },
    { isolationLevel: 'read committed' },
  )
}

export async function cancelAccountDeletion(
  database: LifecycleDatabase,
  session: AccountLifecycleSession,
): Promise<CancelAccountDeletionResult> {
  return database.transaction(
    async (transaction) => {
      const user = await loadLockedUser(transaction, session.userId)
      if (user === undefined) return { kind: 'account_unavailable' }
      const request = await readDeletionRequest(transaction, user.id, true)
      if (request === undefined) return { kind: 'not_requested' }
      if ((await loadLockedSession(transaction, session)) === undefined) {
        return { kind: 'session_invalid' }
      }

      const deleted = await transaction
        .delete(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, user.id),
            sql`clock_timestamp() < ${accountDeletionRequests.purgeAfter}`,
          ),
        )
        .returning({ userId: accountDeletionRequests.userId })

      if (deleted.length === 0) {
        return { kind: 'deletion_due', purgeAfter: request.purgeAfter }
      }

      return {
        kind: 'deletion_cancelled',
        recipient: user.email,
        purgeAfter: request.purgeAfter,
      }
    },
    { isolationLevel: 'read committed' },
  )
}
