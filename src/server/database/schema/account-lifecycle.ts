import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  integer,
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

/**
 * The purge worker keeps only one aggregate, identity-free execution record.
 * It is deliberately not a per-account deletion audit trail.
 */
export const accountPurgeRunHeartbeats = pgTable(
  'account_purge_run_heartbeats',
  {
    singleton: boolean('singleton').primaryKey(),
    runId: uuid('run_id'),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at', lifecycleTimestamp),
    completedAt: timestamp('completed_at', lifecycleTimestamp),
    resultCategory: text('result_category').notNull(),
    examinedCount: integer('examined_count').notNull(),
    purgedCount: integer('purged_count').notNull(),
    skippedCount: integer('skipped_count').notNull(),
    failedCount: integer('failed_count').notNull(),
  },
  (table) => [
    check(
      'account_purge_run_heartbeats_singleton_check',
      sql`${table.singleton}`,
    ),
    check(
      'account_purge_run_heartbeats_revision_check',
      sql`${table.revision} >= 0`,
    ),
    check(
      'account_purge_run_heartbeats_result_category_check',
      sql`${table.resultCategory} in ('never_started', 'running', 'completed', 'completed_backlog', 'completed_with_failures', 'time_budget_exhausted', 'fatal_failure')`,
    ),
    check(
      'account_purge_run_heartbeats_count_check',
      sql`${table.examinedCount} >= 0 and ${table.purgedCount} >= 0 and ${table.skippedCount} >= 0 and ${table.failedCount} >= 0`,
    ),
    check(
      'account_purge_run_heartbeats_state_check',
      sql`
        (
          ${table.resultCategory} = 'never_started'
          and ${table.revision} = 0
          and ${table.runId} is null
          and ${table.startedAt} is null
          and ${table.completedAt} is null
          and ${table.examinedCount} = 0
          and ${table.purgedCount} = 0
          and ${table.skippedCount} = 0
          and ${table.failedCount} = 0
        )
        or (
          ${table.resultCategory} = 'running'
          and ${table.runId} is not null
          and ${table.startedAt} is not null
          and ${table.completedAt} is null
          and ${table.examinedCount} = 0
          and ${table.purgedCount} = 0
          and ${table.skippedCount} = 0
          and ${table.failedCount} = 0
        )
        or (
          ${table.resultCategory} in ('completed', 'completed_backlog', 'completed_with_failures', 'time_budget_exhausted', 'fatal_failure')
          and ${table.runId} is not null
          and ${table.startedAt} is not null
          and ${table.completedAt} is not null
          and ${table.completedAt} >= ${table.startedAt}
          and ${table.examinedCount} = ${table.purgedCount} + ${table.skippedCount} + ${table.failedCount}
        )
      `,
    ),
  ],
)
