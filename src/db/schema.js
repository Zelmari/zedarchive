import { pgTable, text, integer, timestamp, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// AUTH TABLES (Better Auth)
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  issuer: text('issuer'), // Added missing required field
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// MEDIA TRACKER TABLES

export const mediaCategoryEnum = pgEnum('media_category', [
  'show',      // TV Shows, Series
  'book',      // Novels, Physical Books
  'anime',     // Anime Series, OVAs
  'manga'      // Manga, Manhwa, Light Novels
]);

export const mediaEntries = pgTable('media_entries', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: mediaCategoryEnum('category').notNull().default('show'),

  // Primary Units (Seasons, Volumes)
  primaryUnitCurrent: integer('primary_unit_current').notNull().default(1),
  primaryUnitTotal: integer('primary_unit_total').default(1),

  // Secondary Units (Episodes, Chapters)
  secondaryUnitCurrent: integer('secondary_unit_current').notNull().default(0),
  secondaryUnitTotal: integer('secondary_unit_total'), // Max units for CURRENT primary unit

  // Universal structure breakdown
  // Example: [{ "number": 1, "name": "Season 1", "total": 12 }, { "number": 2, "name": "Season 2", "total": 24 }]
  structure: jsonb('structure').$type().default([]),

  // Media & Metadata
  coverImage: text('cover_image'), // Compressed Base64 data URL
  sourceId: text('source_id'),     // e.g. "tvmaze-1234", "anilist-5678", "gbooks-abc"
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});