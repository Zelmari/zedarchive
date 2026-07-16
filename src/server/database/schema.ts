import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type {
  AnimeFormat,
  AnimeMaturity,
  AnimeReleaseStatus,
} from '@/features/anime/domain/anime-catalogue-item'

export const animeCatalogueStateValues = [
  'draft',
  'published',
  'hidden',
] as const

export type AnimeCatalogueState = (typeof animeCatalogueStateValues)[number]

export const animeCatalogueItems = pgTable(
  'anime_catalogue_items',
  {
    id: uuid('id').defaultRandom().notNull(),
    englishTitle: text('english_title'),
    romajiTitle: text('romaji_title'),
    originalTitle: text('original_title'),
    format: text('format').$type<AnimeFormat>().notNull(),
    releaseStatus: text('release_status').$type<AnimeReleaseStatus>().notNull(),
    releaseYear: smallint('release_year'),
    episodeCount: integer('episode_count'),
    maturity: text('maturity').$type<AnimeMaturity>().notNull(),
    catalogueState: text('catalogue_state')
      .$type<AnimeCatalogueState>()
      .default('draft')
      .notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      precision: 3,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      precision: 3,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'anime_catalogue_items_pkey',
    }),
    check(
      'anime_catalogue_items_id_uuid_v4_check',
      sql`substring(${table.id}::text, 15, 1) = '4' and substring(${table.id}::text, 20, 1) in ('8', '9', 'a', 'b')`,
    ),
    check(
      'anime_catalogue_items_primary_title_check',
      sql`${table.englishTitle} is not null or ${table.romajiTitle} is not null or ${table.originalTitle} is not null`,
    ),
    check(
      'anime_catalogue_items_english_title_non_blank_check',
      sql`${table.englishTitle} ~ '[^[:space:]]'`,
    ),
    check(
      'anime_catalogue_items_romaji_title_non_blank_check',
      sql`${table.romajiTitle} ~ '[^[:space:]]'`,
    ),
    check(
      'anime_catalogue_items_original_title_non_blank_check',
      sql`${table.originalTitle} ~ '[^[:space:]]'`,
    ),
    check(
      'anime_catalogue_items_format_check',
      sql`${table.format} in ('tv', 'movie', 'ova', 'ona', 'special', 'unknown')`,
    ),
    check(
      'anime_catalogue_items_release_status_check',
      sql`${table.releaseStatus} in ('upcoming', 'airing', 'finished', 'unknown')`,
    ),
    check(
      'anime_catalogue_items_release_year_check',
      sql`${table.releaseYear} between 1 and 9999`,
    ),
    check(
      'anime_catalogue_items_episode_count_check',
      sql`${table.episodeCount} > 0`,
    ),
    check(
      'anime_catalogue_items_maturity_check',
      sql`${table.maturity} in ('safe', 'sensitive', 'adult', 'unknown')`,
    ),
    check(
      'anime_catalogue_items_catalogue_state_check',
      sql`${table.catalogueState} in ('draft', 'published', 'hidden')`,
    ),
    check(
      'anime_catalogue_items_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const animeAlternativeTitles = pgTable(
  'anime_alternative_titles',
  {
    id: integer('id').generatedAlwaysAsIdentity().notNull(),
    catalogueItemId: uuid('catalogue_item_id').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id],
      name: 'anime_alternative_titles_pkey',
    }),
    foreignKey({
      columns: [table.catalogueItemId],
      foreignColumns: [animeCatalogueItems.id],
      name: 'anime_alternative_titles_catalogue_item_id_fkey',
    }).onDelete('cascade'),
    check(
      'anime_alternative_titles_title_non_blank_check',
      sql`${table.title} ~ '[^[:space:]]'`,
    ),
    check(
      'anime_alternative_titles_position_check',
      sql`${table.position} >= 0`,
    ),
    unique('anime_alternative_titles_catalogue_item_id_title_key').on(
      table.catalogueItemId,
      table.title,
    ),
    unique('anime_alternative_titles_catalogue_item_id_position_key').on(
      table.catalogueItemId,
      table.position,
    ),
  ],
)

export const animeCatalogueSources = pgTable(
  'anime_catalogue_sources',
  {
    catalogueItemId: uuid('catalogue_item_id').notNull(),
    sourceKey: text('source_key').notNull(),
    sourceItemId: text('source_item_id').notNull(),
    firstSeenAt: timestamp('first_seen_at', {
      withTimezone: true,
      precision: 3,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', {
      withTimezone: true,
      precision: 3,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.sourceKey, table.sourceItemId],
      name: 'anime_catalogue_sources_pkey',
    }),
    foreignKey({
      columns: [table.catalogueItemId],
      foreignColumns: [animeCatalogueItems.id],
      name: 'anime_catalogue_sources_catalogue_item_id_fkey',
    }).onDelete('cascade'),
    check(
      'anime_catalogue_sources_source_key_check',
      sql`${table.sourceKey} ~ '^[a-z][a-z0-9_-]{0,49}$'`,
    ),
    check(
      'anime_catalogue_sources_source_item_id_non_blank_check',
      sql`${table.sourceItemId} ~ '[^[:space:]]'`,
    ),
    check(
      'anime_catalogue_sources_timestamp_order_check',
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`,
    ),
    index('anime_catalogue_sources_catalogue_item_id_idx').on(
      table.catalogueItemId,
    ),
  ],
)
