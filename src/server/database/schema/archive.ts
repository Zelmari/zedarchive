import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type { EntryStatus } from '@/features/archive/domain/entry-status'
import { episodeProgressMaximum } from '@/features/archive/domain/episode-progress'
import { users } from '@/server/database/schema/auth'
import { animeCatalogueItems } from '@/server/database/schema/catalogue'

export const animeEntries = pgTable(
  'anime_entries',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    catalogueItemId: uuid('catalogue_item_id').notNull(),
    status: text('status').$type<EntryStatus>().notNull(),
    episodeProgress: bigint('episode_progress', { mode: 'number' })
      .default(0)
      .notNull(),
    episodeTotalOverride: bigint('episode_total_override', { mode: 'number' }),
    rating: numeric('rating', { mode: 'number' }),
    isFavourite: boolean('is_favourite').default(false).notNull(),
    startDate: date('start_date', { mode: 'string' }),
    finishDate: date('finish_date', { mode: 'string' }),
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
      name: 'anime_entries_pkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'anime_entries_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.catalogueItemId],
      foreignColumns: [animeCatalogueItems.id],
      name: 'anime_entries_catalogue_item_id_fkey',
    }).onDelete('restrict'),
    unique('anime_entries_user_id_catalogue_item_id_key').on(
      table.userId,
      table.catalogueItemId,
    ),
    check(
      'anime_entries_id_uuid_v4_check',
      sql`substring(${table.id}::text, 15, 1) = '4' and substring(${table.id}::text, 20, 1) in ('8', '9', 'a', 'b')`,
    ),
    check(
      'anime_entries_status_check',
      sql`${table.status} in ('planned', 'in_progress', 'on_hold', 'dropped', 'completed')`,
    ),
    check(
      'anime_entries_episode_progress_check',
      sql`${table.episodeProgress} between 0 and ${sql.raw(String(episodeProgressMaximum))}`,
    ),
    check(
      'anime_entries_episode_total_override_check',
      sql`${table.episodeTotalOverride} is null or ${table.episodeTotalOverride} between 1 and ${sql.raw(String(episodeProgressMaximum))}`,
    ),
    check(
      'anime_entries_rating_check',
      sql`${table.rating} is null or (${table.rating} between 1 and 10 and ${table.rating} * 10 = trunc(${table.rating} * 10))`,
    ),
    check(
      'anime_entries_date_range_check',
      sql`(${table.startDate} is null or isfinite(${table.startDate})) and (${table.finishDate} is null or isfinite(${table.finishDate})) and (${table.startDate} is null or ${table.finishDate} is null or ${table.finishDate} >= ${table.startDate})`,
    ),
    check(
      'anime_entries_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index('anime_entries_catalogue_item_id_idx').on(table.catalogueItemId),
  ],
)
