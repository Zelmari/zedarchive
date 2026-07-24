import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  smallint,
  pgTable,
  primaryKey,
  timestamp,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { sessions, users } from '@/server/database/schema/auth'

const timestampConfiguration = {
  withTimezone: true,
  precision: 3,
  mode: 'date',
} as const

/**
 * A permanent product event. Its primary key makes the one-change allowance a
 * database invariant; its optional previous key is the 14-day reservation.
 */
export const usernameChangeRecords = pgTable(
  'username_change_records',
  {
    userId: uuid('user_id').notNull(),
    changedAt: timestamp('changed_at', timestampConfiguration).notNull(),
    previousUsernameIdentityKey: text('previous_username_identity_key'),
    previousUsernameReservedUntil: timestamp(
      'previous_username_reserved_until',
      timestampConfiguration,
    ),
  },
  (table) => [
    primaryKey({
      columns: [table.userId],
      name: 'username_change_records_pkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'username_change_records_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'username_change_records_reservation_pair_check',
      sql`(${table.previousUsernameIdentityKey} is null) = (${table.previousUsernameReservedUntil} is null)`,
    ),
    check(
      'username_change_records_previous_key_check',
      sql`${table.previousUsernameIdentityKey} is null or (${table.previousUsernameIdentityKey} ~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$')`,
    ),
    check(
      'username_change_records_reservation_order_check',
      sql`${table.previousUsernameReservedUntil} is null or ${table.previousUsernameReservedUntil} > ${table.changedAt}`,
    ),
    check(
      'username_change_records_reservation_interval_check',
      sql`${table.previousUsernameReservedUntil} is null or ${table.previousUsernameReservedUntil} = ${table.changedAt} + interval '14 days'`,
    ),
    index('username_change_records_previous_key_reserved_until_idx')
      .on(
        table.previousUsernameIdentityKey,
        table.previousUsernameReservedUntil,
      )
      .where(sql`${table.previousUsernameIdentityKey} is not null`),
  ],
)

/**
 * One current, server-bound authorization challenge per user. Session removal
 * deliberately nulls the binding instead of deleting throttling state.
 */
export const usernameChangeChallenges = pgTable(
  'username_change_challenges',
  {
    userId: uuid('user_id').notNull(),
    sessionId: uuid('session_id'),
    challengeId: uuid('challenge_id').defaultRandom().notNull(),
    proposedUsername: text('proposed_username').notNull(),
    proposedUsernameIdentityKey: text(
      'proposed_username_identity_key',
    ).notNull(),
    codeDigest: text('code_digest').notNull(),
    codeExpiresAt: timestamp(
      'code_expires_at',
      timestampConfiguration,
    ).notNull(),
    reauthenticatedUntil: timestamp(
      'reauthenticated_until',
      timestampConfiguration,
    ).notNull(),
    failedCodeAttempts: smallint('failed_code_attempts').notNull().default(0),
    sendWindowStartedAt: timestamp(
      'send_window_started_at',
      timestampConfiguration,
    ).notNull(),
    sendCount: smallint('send_count').notNull().default(1),
    lastSentAt: timestamp('last_sent_at', timestampConfiguration).notNull(),
    createdAt: timestamp('created_at', timestampConfiguration)
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', timestampConfiguration)
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId],
      name: 'username_change_challenges_pkey',
    }),
    unique('username_change_challenges_challenge_id_key').on(table.challengeId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'username_change_challenges_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sessionId],
      foreignColumns: [sessions.id],
      name: 'username_change_challenges_session_id_fkey',
    }).onDelete('set null'),
    index('username_change_challenges_session_id_idx').on(table.sessionId),
    check(
      'username_change_challenges_proposed_username_check',
      sql`${table.proposedUsername} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,18}[A-Za-z0-9]$'`,
    ),
    check(
      'username_change_challenges_proposed_key_check',
      sql`${table.proposedUsernameIdentityKey} = lower(${table.proposedUsername})`,
    ),
    check(
      'username_change_challenges_digest_check',
      sql`${table.codeDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'username_change_challenges_failed_attempts_check',
      sql`${table.failedCodeAttempts} between 0 and 5`,
    ),
    check(
      'username_change_challenges_send_count_check',
      sql`${table.sendCount} between 1 and 3`,
    ),
    check(
      'username_change_challenges_expiry_check',
      sql`${table.codeExpiresAt} > ${table.lastSentAt} and ${table.codeExpiresAt} <= ${table.reauthenticatedUntil}`,
    ),
    check(
      'username_change_challenges_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt} and ${table.lastSentAt} >= ${table.sendWindowStartedAt}`,
    ),
  ],
)
