import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uuid,
  text,
} from 'drizzle-orm/pg-core'
import { sessions, users } from '@/server/database/schema/auth'

const lifecycleTimestamp = {
  withTimezone: true,
  precision: 3,
  mode: 'date',
} as const

/**
 * One recoverable deletion request per account. The database owns the exact
 * deadline so application clocks cannot shorten or extend recovery.
 */
export const accountDeletionRequests = pgTable(
  'account_deletion_requests',
  {
    userId: uuid('user_id').notNull(),
    requestedAt: timestamp('requested_at', lifecycleTimestamp).notNull(),
    purgeAfter: timestamp('purge_after', lifecycleTimestamp).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId],
      name: 'account_deletion_requests_pkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'account_deletion_requests_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'account_deletion_requests_recovery_interval_check',
      sql`${table.purgeAfter} = ${table.requestedAt} + interval '336 hours'`,
    ),
    index('account_deletion_requests_purge_after_user_id_idx').on(
      table.purgeAfter,
      table.userId,
    ),
  ],
)

/**
 * Deletion authorization remains application-owned and session-bound. Session
 * deletion detaches rather than removes the row so cooldown and send limits
 * survive setup cancellation and sign-out.
 */
export const deletionChallenges = pgTable(
  'deletion_challenges',
  {
    userId: uuid('user_id').notNull(),
    sessionId: uuid('session_id'),
    challengeId: uuid('challenge_id').defaultRandom().notNull(),
    codeDigest: text('code_digest').notNull(),
    codeExpiresAt: timestamp('code_expires_at', lifecycleTimestamp).notNull(),
    reauthenticatedUntil: timestamp(
      'reauthenticated_until',
      lifecycleTimestamp,
    ).notNull(),
    failedCodeAttempts: smallint('failed_code_attempts').default(0).notNull(),
    sendWindowStartedAt: timestamp(
      'send_window_started_at',
      lifecycleTimestamp,
    ).notNull(),
    sendCount: smallint('send_count').default(1).notNull(),
    lastSentAt: timestamp('last_sent_at', lifecycleTimestamp).notNull(),
    createdAt: timestamp('created_at', lifecycleTimestamp)
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', lifecycleTimestamp)
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId],
      name: 'deletion_challenges_pkey',
    }),
    unique('deletion_challenges_challenge_id_key').on(table.challengeId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'deletion_challenges_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sessionId],
      foreignColumns: [sessions.id],
      name: 'deletion_challenges_session_id_fkey',
    }).onDelete('set null'),
    index('deletion_challenges_session_id_idx').on(table.sessionId),
    check(
      'deletion_challenges_digest_check',
      sql`${table.codeDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'deletion_challenges_failed_attempts_check',
      sql`${table.failedCodeAttempts} between 0 and 5`,
    ),
    check(
      'deletion_challenges_send_count_check',
      sql`${table.sendCount} between 1 and 3`,
    ),
    check(
      'deletion_challenges_expiry_check',
      sql`${table.codeExpiresAt} > ${table.lastSentAt} and ${table.codeExpiresAt} <= ${table.reauthenticatedUntil}`,
    ),
    check(
      'deletion_challenges_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt} and ${table.lastSentAt} >= ${table.sendWindowStartedAt}`,
    ),
  ],
)
