import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const authTimestamp = {
  withTimezone: true,
  precision: 3,
  mode: 'date',
} as const

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().notNull(),
    username: text('username').notNull(),
    usernameIdentityKey: text('username_identity_key').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', authTimestamp).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', authTimestamp).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'users_pkey',
    }),
    unique('users_username_identity_key_key').on(table.usernameIdentityKey),
    uniqueIndex('users_email_lower_uidx').on(sql`lower(${table.email})`),
    check(
      'users_username_non_blank_check',
      sql`${table.username} ~ '[^[:space:]]'`,
    ),
    check(
      'users_username_length_check',
      sql`char_length(${table.username}) between 3 and 20`,
    ),
    check(
      'users_username_identity_key_non_blank_check',
      sql`${table.usernameIdentityKey} ~ '[^[:space:]]'`,
    ),
    check(
      'users_username_identity_key_length_check',
      sql`char_length(${table.usernameIdentityKey}) between 3 and 20`,
    ),
    check(
      'users_username_identity_key_matches_username_check',
      sql`${table.usernameIdentityKey} = lower(${table.username})`,
    ),
    check('users_email_non_blank_check', sql`${table.email} ~ '[^[:space:]]'`),
    check(
      'users_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', authTimestamp).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', authTimestamp).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', authTimestamp).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'sessions_pkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'sessions_user_id_fkey',
    }).onDelete('cascade'),
    unique('sessions_token_key').on(table.token),
    check(
      'sessions_token_non_blank_check',
      sql`${table.token} ~ '[^[:space:]]'`,
    ),
    check(
      'sessions_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', authTimestamp),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', authTimestamp),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', authTimestamp).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', authTimestamp).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'accounts_pkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'accounts_user_id_fkey',
    }).onDelete('cascade'),
    unique('accounts_provider_id_account_id_key').on(
      table.providerId,
      table.accountId,
    ),
    check(
      'accounts_account_id_non_blank_check',
      sql`${table.accountId} ~ '[^[:space:]]'`,
    ),
    check(
      'accounts_provider_id_non_blank_check',
      sql`${table.providerId} ~ '[^[:space:]]'`,
    ),
    check(
      'accounts_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index('accounts_user_id_idx').on(table.userId),
  ],
)

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').defaultRandom().notNull(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', authTimestamp).notNull(),
    createdAt: timestamp('created_at', authTimestamp).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', authTimestamp).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'verifications_pkey',
    }),
    check(
      'verifications_identifier_non_blank_check',
      sql`${table.identifier} ~ '[^[:space:]]'`,
    ),
    check(
      'verifications_value_non_blank_check',
      sql`${table.value} ~ '[^[:space:]]'`,
    ),
    check(
      'verifications_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index('verifications_identifier_idx').on(table.identifier),
    index('verifications_expires_at_idx').on(table.expiresAt),
  ],
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').defaultRandom().notNull(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'rate_limits_pkey',
    }),
    unique('rate_limits_key_key').on(table.key),
    check(
      'rate_limits_key_non_blank_check',
      sql`${table.key} ~ '[^[:space:]]'`,
    ),
    check('rate_limits_count_non_negative_check', sql`${table.count} >= 0`),
  ],
)
