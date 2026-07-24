import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AnimeTitleLanguage } from '@/features/settings/domain/catalogue-preferences'
import { users } from '@/server/database/schema/auth'

export const userCataloguePreferences = pgTable(
  'user_catalogue_preferences',
  {
    userId: uuid('user_id').notNull(),
    titleLanguage: text('title_language')
      .$type<AnimeTitleLanguage>()
      .default('english')
      .notNull(),
    adultContentEnabled: boolean('adult_content_enabled')
      .default(false)
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
      columns: [table.userId],
      name: 'user_catalogue_preferences_pkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_catalogue_preferences_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'user_catalogue_preferences_title_language_check',
      sql`${table.titleLanguage} in ('english', 'romaji', 'original')`,
    ),
    check(
      'user_catalogue_preferences_timestamp_order_check',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)
