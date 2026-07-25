import 'server-only'

import { eq, ne, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import {
  animeTitleLanguageSchema,
  defaultUserCataloguePreferences,
  type AnimeTitleLanguage,
  type CataloguePreferenceMutationResult,
  type UserCataloguePreferences,
} from '@/features/settings/domain/catalogue-preferences'
import { userCataloguePreferences } from '@/server/database/schema'
import { establishActiveAccount } from '@/server/database/active-account-transaction'

/**
 * The deliberately small executor contract is implemented by both the root
 * Drizzle database and a Node PostgreSQL transaction. Reads therefore compose
 * into catalogue/archive snapshot transactions without opening nested ones.
 */
export type UserCataloguePreferenceReadExecutor = Pick<NodePgDatabase, 'select'>

function parseStoredPreferences(row: {
  titleLanguage: string
  adultContentEnabled: boolean
}): UserCataloguePreferences {
  return {
    titleLanguage: animeTitleLanguageSchema.parse(row.titleLanguage),
    adultContentEnabled: z.boolean().parse(row.adultContentEnabled),
  }
}

export async function readUserCataloguePreferencesAfterBarrier(
  executor: UserCataloguePreferenceReadExecutor,
  request: { userId: string },
): Promise<UserCataloguePreferences> {
  const [storedPreferences] = await executor
    .select({
      titleLanguage: userCataloguePreferences.titleLanguage,
      adultContentEnabled: userCataloguePreferences.adultContentEnabled,
    })
    .from(userCataloguePreferences)
    .where(eq(userCataloguePreferences.userId, request.userId))
    .limit(1)

  return storedPreferences === undefined
    ? { ...defaultUserCataloguePreferences }
    : parseStoredPreferences(storedPreferences)
}

export async function readUserCataloguePreferences(
  database: NodePgDatabase,
  request: { userId: string },
): Promise<UserCataloguePreferences> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        throw new Error('Catalogue preferences account is unavailable')
      }

      return readUserCataloguePreferencesAfterBarrier(transaction, request)
    },
    { isolationLevel: 'read committed' },
  )
}

/**
 * Acquires the preference row after the caller has locked its entry and
 * catalogue rows. A missing row is the safe adult-off default.
 */
export async function lockAdultContentPreferenceForShare(
  executor: UserCataloguePreferenceReadExecutor,
  userId: string,
): Promise<boolean> {
  const [storedPreferences] = await executor
    .select({
      adultContentEnabled: userCataloguePreferences.adultContentEnabled,
    })
    .from(userCataloguePreferences)
    .where(eq(userCataloguePreferences.userId, userId))
    .for('share')
    .limit(1)

  return (
    storedPreferences !== undefined &&
    z.boolean().parse(storedPreferences.adultContentEnabled)
  )
}

export async function setUserAnimeTitleLanguage(
  database: NodePgDatabase,
  request: { userId: string; titleLanguage: AnimeTitleLanguage },
): Promise<CataloguePreferenceMutationResult> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        throw new Error('Catalogue preferences account is unavailable')
      }
      const updatedRows = await transaction
        .insert(userCataloguePreferences)
        .values({
          userId: request.userId,
          titleLanguage: request.titleLanguage,
        })
        .onConflictDoUpdate({
          target: userCataloguePreferences.userId,
          set: {
            titleLanguage: request.titleLanguage,
            updatedAt: sql`greatest(${userCataloguePreferences.updatedAt}, clock_timestamp())`,
          },
          setWhere: ne(
            userCataloguePreferences.titleLanguage,
            request.titleLanguage,
          ),
        })
        .returning({ userId: userCataloguePreferences.userId })

      return { kind: updatedRows.length === 0 ? 'unchanged' : 'updated' }
    },
    { isolationLevel: 'read committed' },
  )
}

export async function enableUserAdultContent(
  database: NodePgDatabase,
  request: { userId: string },
): Promise<CataloguePreferenceMutationResult> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        throw new Error('Catalogue preferences account is unavailable')
      }
      const updatedRows = await transaction
        .insert(userCataloguePreferences)
        .values({
          userId: request.userId,
          adultContentEnabled: true,
        })
        .onConflictDoUpdate({
          target: userCataloguePreferences.userId,
          set: {
            adultContentEnabled: true,
            updatedAt: sql`greatest(${userCataloguePreferences.updatedAt}, clock_timestamp())`,
          },
          setWhere: eq(userCataloguePreferences.adultContentEnabled, false),
        })
        .returning({ userId: userCataloguePreferences.userId })

      return { kind: updatedRows.length === 0 ? 'unchanged' : 'updated' }
    },
    { isolationLevel: 'read committed' },
  )
}

export async function disableUserAdultContent(
  database: NodePgDatabase,
  request: { userId: string },
): Promise<CataloguePreferenceMutationResult> {
  return database.transaction(
    async (transaction) => {
      if (!(await establishActiveAccount(transaction, request.userId))) {
        throw new Error('Catalogue preferences account is unavailable')
      }
      const updatedRows = await transaction
        .update(userCataloguePreferences)
        .set({
          adultContentEnabled: false,
          updatedAt: sql`greatest(${userCataloguePreferences.updatedAt}, clock_timestamp())`,
        })
        .where(
          sql`${userCataloguePreferences.userId} = ${request.userId} and ${userCataloguePreferences.adultContentEnabled} = true`,
        )
        .returning({ userId: userCataloguePreferences.userId })

      return { kind: updatedRows.length === 0 ? 'unchanged' : 'updated' }
    },
    { isolationLevel: 'read committed' },
  )
}
