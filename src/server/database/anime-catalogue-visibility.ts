import 'server-only'

import { and, eq, ne, type SQL } from 'drizzle-orm'
import { animeCatalogueItems } from '@/server/database/schema/catalogue'

export function buildPublishedAnimeCatalogueVisibility(
  canViewAdult: boolean,
): SQL {
  const published = eq(animeCatalogueItems.catalogueState, 'published')

  return canViewAdult
    ? published
    : and(published, ne(animeCatalogueItems.maturity, 'adult'))!
}

export const publishedNonAdultAnimeCatalogueVisibility =
  buildPublishedAnimeCatalogueVisibility(false)
