import { fileURLToPath, pathToFileURL } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { ZodError } from 'zod'
import { readDatabaseMigrationEnvironment } from '@/config/database-environment'
import { loadAnimeCatalogueSeed } from '@/features/anime/catalogue/anime-catalogue-seed'
import type { AnimeCatalogueSeedSyncResult } from '@/server/database/seed-anime-catalogue'

const expectedDevelopmentDatabaseName = 'zedarchive_dev'
const seedFilePath = fileURLToPath(
  new URL('../data/seeds/anime-catalogue.development.json', import.meta.url),
)
const usage = 'Usage: npm run db:seed or npm run db:seed:check'
const unexpectedErrorMessage =
  'Anime catalogue seed failed unexpectedly. No error details were printed because they may contain sensitive database information.'

class PublicSeedCommandError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PublicSeedCommandError'
  }
}

export type SeedCommandMode = 'check' | 'write'

export function parseSeedCommandArguments(
  argumentsToParse: readonly string[],
): SeedCommandMode {
  if (argumentsToParse.length === 0) {
    return 'write'
  }

  if (argumentsToParse.length === 1 && argumentsToParse[0] === '--check') {
    return 'check'
  }

  throw new PublicSeedCommandError(usage)
}

export function assertDevelopmentDatabaseName(
  databaseName: string | undefined,
): void {
  if (databaseName !== expectedDevelopmentDatabaseName) {
    throw new PublicSeedCommandError(
      `Development seed refused to write to "${databaseName ?? 'unknown'}"; expected "${expectedDevelopmentDatabaseName}"`,
    )
  }
}

export function formatSeedSummary(
  validated: number,
  result?: AnimeCatalogueSeedSyncResult,
): string {
  if (result === undefined) {
    return `Validated ${validated} anime catalogue seed items.`
  }

  return [
    `Synchronized ${validated} seed-owned anime catalogue items:`,
    `${result.inserted} inserted,`,
    `${result.updated} updated,`,
    `${result.unchanged} unchanged.`,
  ].join(' ')
}

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  let currentError = error
  const visitedErrors = new Set<object>()

  while (typeof currentError === 'object' && currentError !== null) {
    if (visitedErrors.has(currentError)) {
      return false
    }

    visitedErrors.add(currentError)

    if ('code' in currentError && currentError.code === code) {
      return true
    }

    currentError = 'cause' in currentError ? currentError.cause : undefined
  }

  return false
}

export function formatSeedCommandError(error: unknown): string {
  if (error instanceof PublicSeedCommandError) {
    return error.message
  }

  if (error instanceof ZodError) {
    return 'Anime catalogue seed validation failed. Correct the committed seed and run npm run db:seed:check.'
  }

  return unexpectedErrorMessage
}

export async function runSeedCommand(
  argumentsToParse: readonly string[],
): Promise<void> {
  const mode = parseSeedCommandArguments(argumentsToParse)
  const seed = await loadAnimeCatalogueSeed(seedFilePath)

  if (mode === 'check') {
    console.log(formatSeedSummary(seed.items.length))
    return
  }

  // Loading dotenv only after validation keeps the check path independent of
  // database configuration and prevents invalid data from opening a pool.
  await import('dotenv/config')
  let databaseMigrationUrl: string

  try {
    databaseMigrationUrl =
      readDatabaseMigrationEnvironment().databaseMigrationUrl
  } catch (error) {
    throw new PublicSeedCommandError(
      'DATABASE_MIGRATION_URL is missing or invalid. Configure it with a PostgreSQL connection URL before running npm run db:seed.',
      { cause: error },
    )
  }

  const pool = new Pool({ connectionString: databaseMigrationUrl })

  try {
    const databaseNameResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )

    assertDevelopmentDatabaseName(databaseNameResult.rows[0]?.databaseName)

    const database = drizzle({ client: pool })
    const {
      AnimeCatalogueSeedSourceConflictError,
      synchronizeAnimeCatalogueSeed,
    } = await import('@/server/database/seed-anime-catalogue')

    let result: AnimeCatalogueSeedSyncResult

    try {
      result = await synchronizeAnimeCatalogueSeed(database, seed)
    } catch (error) {
      if (error instanceof AnimeCatalogueSeedSourceConflictError) {
        const sourceIdentity = JSON.stringify(
          `${error.sourceKey}:${error.sourceItemId}`,
        )

        throw new PublicSeedCommandError(
          `Anime catalogue source ${sourceIdentity} already belongs to another catalogue item. No seed changes were applied.`,
          { cause: error },
        )
      }

      if (hasPostgresErrorCode(error, '42P01')) {
        throw new PublicSeedCommandError(
          'Anime catalogue tables are missing. Run npm run db:migrate before npm run db:seed.',
          { cause: error },
        )
      }

      throw error
    }

    console.log(formatSeedSummary(seed.items.length, result))
  } finally {
    await pool.end()
  }
}

function isDirectExecution(entryPath: string | undefined): boolean {
  return (
    entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href
  )
}

if (isDirectExecution(process.argv[1])) {
  runSeedCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(formatSeedCommandError(error))
    process.exitCode = 1
  })
}
