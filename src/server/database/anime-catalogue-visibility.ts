import 'server-only'

import { and, eq, ne } from 'drizzle-orm'
import { animeCatalogueItems } from '@/server/database/schema/catalogue'

export const publishedNonAdultAnimeCatalogueVisibility = and(
  eq(animeCatalogueItems.catalogueState, 'published'),
  ne(animeCatalogueItems.maturity, 'adult'),
)
