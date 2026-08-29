import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { StructureItem, MediaCycle, MediaQuote } from '@/types/media';
import type { ThemeId, ReadingGoalConfig, CustomThemePalette } from '@/types/user';

// AUTH TABLES (Better Auth)
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  theme: text('theme').$type<ThemeId>().notNull().default('parchment'),
  customTheme: jsonb('custom_theme').$type<CustomThemePalette | null>(),
  username: text('username').unique(),
  isPublic: boolean('is_public').notNull().default(false),
  bio: text('bio'),
  countryCode: text('country_code').notNull().default('US'),
  readingGoals: jsonb('reading_goals').$type<Record<string, ReadingGoalConfig>>().default({}),
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

// ─── Friends & Groups ─────────────────────────────────────────────────────────

export const friendshipStatusEnum = pgEnum('friendship_status', [
  'pending',
  'accepted',
  'rejected',
]);

export const friendships = pgTable(
  'friendships',
  {
    id: text('id').primaryKey(),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    receiverId: text('receiver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('friendships_sender_idx').on(table.senderId),
    index('friendships_receiver_idx').on(table.receiverId),
    index('friendships_sender_status_idx').on(table.senderId, table.status),
    index('friendships_receiver_status_idx').on(table.receiverId, table.status),
    uniqueIndex('friendships_pair_uidx').on(table.senderId, table.receiverId),
  ],
);

export const groupRoleEnum = pgEnum('group_role', ['owner', 'member']);

export const groups = pgTable(
  'groups',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    image: text('image'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('groups_owner_idx').on(table.ownerId)],
);

export const groupMembers = pgTable(
  'group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: groupRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    index('group_members_group_idx').on(table.groupId),
    index('group_members_user_idx').on(table.userId),
    uniqueIndex('group_members_group_user_uidx').on(table.groupId, table.userId),
  ],
);

export const groupMessages = pgTable(
  'group_messages',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => [
    index('group_messages_group_created_idx').on(table.groupId, table.createdAt.desc()),
    index('group_messages_expires_idx').on(table.expiresAt),
    index('group_messages_group_expires_idx').on(table.groupId, table.expiresAt),
  ],
);

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
    coverImage: text('cover_image'), // Compressed Base64 data URL or asset URL
    sourceId: text('source_id'), // e.g. "tvmaze-1234", "anilist-5678", "gbooks-abc"
    notes: text('notes'),
    quotes: jsonb('quotes').$type<MediaQuote[]>().default([]),
    priorityIndex: integer('priority_index'), // null = not queued; 1, 2, 3... = priority rank in Up Next queue
    /** Whether the entry is hidden from public profile, RSS, and Wrapped views */
    isPrivate: boolean('is_private').notNull().default(false),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('media_entries_user_id_idx').on(table.userId),
    index('media_entries_user_updated_idx').on(table.userId, table.updatedAt.desc()),
    index('media_entries_user_status_idx').on(table.userId, table.status),
    index('media_entries_user_priority_idx').on(table.userId, table.priorityIndex),
    // Phase 3: composite index for public-profile filtering
    index('media_entries_user_public_idx').on(
      table.userId,
      table.isPrivate,
      table.updatedAt.desc(),
    ),
    index('media_entries_group_id_idx').on(table.groupId),
    index('media_entries_group_updated_idx').on(table.groupId, table.updatedAt.desc()),
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

// ─── Phase 2: Normalized Relational Tables ────────────────────────────────────

/**
 * Normalized tag registry per user. Deduplicates tags across media entries.
 * The JSONB `tags` array on `media_entries` remains the primary source for
 * single-entry reads; these tables power cross-archive analytics and tag search.
 */
export const mediaTags = pgTable(
  'media_tags',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('media_tags_user_idx').on(table.userId),
    index('media_tags_user_name_idx').on(table.userId, table.normalizedName),
  ],
);

export const mediaEntryTags = pgTable(
  'media_entry_tags',
  {
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaEntries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => mediaTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('entry_tags_media_idx').on(table.mediaId),
    index('entry_tags_tag_idx').on(table.tagId),
  ],
);

/**
 * Normalized rewatch / reread cycles. The JSONB `cycles` on `media_entries`
 * remains for fast single-entry reads; this table powers historical analytics.
 */
export const mediaCycles = pgTable(
  'media_cycles',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaEntries.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cycleNumber: integer('cycle_number').notNull().default(1),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    rating: integer('rating'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('cycles_media_id_idx').on(table.mediaId),
    index('cycles_user_completed_idx').on(table.userId, table.completedAt.desc()),
  ],
);

/**
 * Normalized quotes repository. The JSONB `quotes` on `media_entries` remains
 * for fast single-entry reads; this table powers the favorites feed.
 */
export const mediaQuotes = pgTable(
  'media_quotes',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaEntries.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    speaker: text('speaker'),
    citation: text('citation'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('quotes_media_id_idx').on(table.mediaId),
    index('quotes_user_favorite_idx').on(table.userId, table.isFavorite),
  ],
);

/**
 * User reading / watching goals by period (year or year-month).
 */
export const userGoals = pgTable(
  'user_goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // '2026' or '2026-08'
    target: integer('target').notNull(),
    category: mediaCategoryEnum('category').notNull().default('book'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('goals_user_period_idx').on(table.userId, table.period)],
);

// ─── Phase 6: External API Cache ─────────────────────────────────────────────

/**
 * PostgreSQL-backed cache for external API responses (TMDB, TVMaze, etc.).
 * Used when Cloudflare KV is unavailable or for fallback persistence.
 */
export const externalApiCache = pgTable('external_api_cache', {
  key: text('key').primaryKey(),
  payload: jsonb('payload').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

// ─── Phase 8.2: Curated Stacks & Anthologies ─────────────────────────────────

export const stacks = pgTable(
  'stacks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    isPublic: boolean('is_public').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('stacks_user_slug_idx').on(table.userId, table.slug)],
);

export const stackItems = pgTable('stack_items', {
  id: text('id').primaryKey(),
  stackId: text('stack_id')
    .notNull()
    .references(() => stacks.id, { onDelete: 'cascade' }),
  mediaId: text('media_id')
    .notNull()
    .references(() => mediaEntries.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull().default(0),
  annotation: text('annotation'), // User essay/note on why this item belongs in the stack
});
