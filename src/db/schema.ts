import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import type { StructureItem, MediaCycle } from '@/types/media';
import type { ThemeId } from '@/types/user';

// AUTH TABLES (Better Auth)
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  theme: text('theme').$type<ThemeId>().notNull().default('parchment'),
  username: text('username').unique(),
  isPublic: boolean('is_public').notNull().default(false),
  bio: text('bio'),
  verificationDismissedAt: timestamp('verification_dismissed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const session = pgTable(
  'session',
  {
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
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
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
    issuer: text('issuer'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

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
  'show', // TV Shows, Series
  'movie', // Movies, Films
  'book', // Novels, Physical Books
  'anime', // Anime Series, OVAs
  'manga', // Manga, Manhwa, Light Novels
]);

export const mediaEntries = pgTable(
  'media_entries',
  {
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
    structure: jsonb('structure').$type<StructureItem[]>().default([]),

    // Media & Metadata
    status: text('status').notNull().default('in_progress'), // 'in_progress' | 'completed' | 'planning' | 'on_hold' | 'dropped'
    dropReason: text('drop_reason'), // Short explanation or preset category (max 500 chars)
    droppedAt: timestamp('dropped_at'), // Exact date/time the title was dropped
    droppedProgressPrimary: integer('dropped_progress_primary'), // Season/Volume when dropped
    droppedProgressSecondary: integer('dropped_progress_secondary'), // Episode/Chapter/Page when dropped
    completedAt: timestamp('completed_at'),
    startedAt: timestamp('started_at'),
    rewatchCount: integer('rewatch_count').notNull().default(0),
    cycles: jsonb('cycles').$type<MediaCycle[]>().default([]),
    rating: integer('rating'), // 1 to 10 scale
    tags: jsonb('tags').$type<string[]>().default([]), // e.g. ["favorites", "cozy", "summer-2026"]
    synopsis: text('synopsis'),
    genres: jsonb('genres').$type<string[]>().default([]),
    coverImage: text('cover_image'), // Compressed Base64 data URL
    sourceId: text('source_id'), // e.g. "tvmaze-1234", "anilist-5678", "gbooks-abc"
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('media_entries_user_id_idx').on(table.userId),
    index('media_entries_user_updated_idx').on(table.userId, table.updatedAt.desc()),
    index('media_entries_user_status_idx').on(table.userId, table.status),
  ],
);

export const mediaActivityLogs = pgTable(
  'media_activity_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaEntries.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(), // 'progress_update' | 'status_change' | 'created' | 'completed' | 'rating' | 'rewatch'
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('activity_user_id_idx').on(table.userId),
    index('activity_created_at_idx').on(table.createdAt),
    index('activity_user_created_idx').on(table.userId, table.createdAt.desc()),
  ],
);

export const profileComments = pgTable(
  'profile_comments',
  {
    id: text('id').primaryKey(),
    profileUserId: text('profile_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(), // createdAt + exactly 7 days
  },
  (table) => [
    index('comments_profile_idx').on(table.profileUserId),
    index('comments_expires_idx').on(table.expiresAt),
    index('comments_profile_expires_idx').on(table.profileUserId, table.expiresAt),
    index('comments_author_created_idx').on(table.authorUserId, table.createdAt.desc()),
  ],
);
