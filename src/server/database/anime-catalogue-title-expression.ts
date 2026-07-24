import 'server-only'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnimeTitleLanguage } from '@/features/settings/domain/catalogue-preferences'
import { animeCatalogueItems } from '@/server/database/schema/catalogue'

export function buildPreferredAnimeTitleExpression(
  titleLanguage: AnimeTitleLanguage,
): SQL<string> {
  switch (titleLanguage) {
    case 'english':
      return sql<string>`coalesce(${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.originalTitle})`
    case 'romaji':
      return sql<string>`coalesce(${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.englishTitle}, ${animeCatalogueItems.originalTitle})`
    case 'original':
      return sql<string>`coalesce(${animeCatalogueItems.originalTitle}, ${animeCatalogueItems.romajiTitle}, ${animeCatalogueItems.englishTitle})`
  }
}
