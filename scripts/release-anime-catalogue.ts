import { fileURLToPath, pathToFileURL } from 'node:url'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  animeReleaseName,
  loadAnimeReleaseBundle,
  sha256Canonical,
  type AnimeReleaseBundle,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  assertReleaseTarget,
  parseReleaseAnimeCatalogueCommandArguments,
  planAnimeReleaseCatalogue,
  synchronizeAnimeReleaseCatalogue,
  ReleaseAnimeCatalogueLoaderError,
  type ParsedReleaseAnimeCatalogueCommand,
  type ReleaseAnimeCataloguePlanResult,
  type ReleaseAnimeCatalogueCommandMode,
  type ReleaseAnimeCatalogueSyncResult,
} from '@/server/database/release-anime-catalogue-loader'

const releasePaths = {
  corpus: fileURLToPath(
    new URL('../data/releases/anime-catalogue.v1.json', import.meta.url),
  ),
  manifests: Array.from({ length: 20 }, (_, index) =>
    fileURLToPath(
      new URL(
        `../data/imports/releases/anime-v1/batch-${String(index + 1).padStart(2, '0')}.json`,
        import.meta.url,
      ),
    ),
  ),
  reviewLedger: fileURLToPath(
    new URL('../data/releases/anime-catalogue.v1.review.json', import.meta.url),
  ),
  index: fileURLToPath(
    new URL('../data/releases/anime-catalogue.v1.index.json', import.meta.url),
  ),
} as const

type OpenDatabase = () => Promise<
  Readonly<{
    database: NodePgDatabase
    databaseName: string | undefined
    close: () => Promise<void>
  }>
>

export type ReleaseAnimeCatalogueCommandDependencies = Readonly<{
  loadBundle?: () => Promise<AnimeReleaseBundle>
  openDatabase?: OpenDatabase
  synchronize?: typeof synchronizeAnimeReleaseCatalogue
  environment?: Readonly<Record<string, string | undefined>>
  log?: (message: string) => void
}>

export function assertReleaseConnectionUrl(
  mode: ReleaseAnimeCatalogueCommandMode,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const value = environment.CATALOGUE_RELEASE_DATABASE_URL
  if (value === undefined || value.trim() !== value) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release database configuration is missing or invalid.',
    )
  }
  try {
    const url = new URL(value)
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname.length === 0 ||
      url.pathname.length <= 1
    )
      throw new Error('invalid')
    if (
      (mode === 'plan' || mode === 'rehearse') &&
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    ) {
      throw new Error('non-local')
    }
  } catch {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release database configuration is missing or invalid.',
    )
  }
  return value
}

async function openDefaultReleaseDatabase(
  environment: Readonly<Record<string, string | undefined>>,
  mode: ReleaseAnimeCatalogueCommandMode,
): Promise<
  Readonly<{
    database: NodePgDatabase
    databaseName: string | undefined
    close: () => Promise<void>
  }>
> {
  // dotenv is deliberately delayed until the corpus contract has passed, so
  // `check` stays database- and environment-independent.
  await import('dotenv/config')
  const connectionString = assertReleaseConnectionUrl(mode, {
    ...process.env,
    ...environment,
  })
  const pool = new Pool({ connectionString })
  try {
    const result = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    return {
      database: drizzle({ client: pool }),
      databaseName: result.rows[0]?.databaseName,
      close: () => pool.end(),
    }
  } catch (error) {
    await pool.end()
    throw error
  }
}

function summarize(
  action: 'validated' | 'planned' | 'synchronized',
  bundle: AnimeReleaseBundle,
  result?: ReleaseAnimeCatalogueSyncResult | ReleaseAnimeCataloguePlanResult,
): string {
  if (!result)
    return `Validated ${bundle.corpus.items.length} release catalogue records.`
  const conflicts =
    'conflicts' in result ? `, ${result.conflicts} conflicts` : ''
  return `${action[0]!.toUpperCase()}${action.slice(1)} ${bundle.corpus.items.length} release catalogue records: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged${conflicts}.`
}

function assertApplyArguments(
  command: ParsedReleaseAnimeCatalogueCommand,
  bundle: AnimeReleaseBundle,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment.CATALOGUE_RELEASE_APPLY_ENABLED !== 'true') {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release apply is disabled until Milestone 43.',
    )
  }
  if (
    command.release !== animeReleaseName ||
    // The operator copies the canonical committed index hash, binding the
    // corpus and every manifest, review, coverage, and semantic-summary hash.
    command.sha256 !== sha256Canonical(bundle.index)
  ) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release apply arguments do not match the approved corpus.',
    )
  }
  const expectedProductionName =
    environment.CATALOGUE_RELEASE_EXPECTED_DATABASE_NAME
  if (
    expectedProductionName === undefined ||
    expectedProductionName.trim() === ''
  ) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release apply target configuration is missing.',
    )
  }
  return expectedProductionName
}

export async function runReleaseAnimeCatalogueCommand(
  argumentsToParse: readonly string[],
  dependencies: ReleaseAnimeCatalogueCommandDependencies = {},
): Promise<void> {
  const command = parseReleaseAnimeCatalogueCommandArguments(argumentsToParse)
  const bundle = await (
    dependencies.loadBundle ?? (() => loadAnimeReleaseBundle(releasePaths))
  )()
  const log = dependencies.log ?? console.log
  if (command.mode === 'check') {
    log(summarize('validated', bundle))
    return
  }
  const environment = dependencies.environment ?? process.env
  const expectedProductionName =
    command.mode === 'apply'
      ? assertApplyArguments(command, bundle, environment)
      : undefined
  const connection = await (
    dependencies.openDatabase ??
    (() => openDefaultReleaseDatabase(environment, command.mode))
  )()
  try {
    assertReleaseTarget(
      command.mode,
      connection.databaseName,
      expectedProductionName,
    )
    if (command.mode === 'plan') {
      log(
        summarize(
          'planned',
          bundle,
          await planAnimeReleaseCatalogue(connection.database, bundle),
        ),
      )
      return
    }
    log(
      summarize(
        'synchronized',
        bundle,
        await (dependencies.synchronize ?? synchronizeAnimeReleaseCatalogue)(
          connection.database,
          bundle,
        ),
      ),
    )
  } finally {
    await connection.close()
  }
}

export function formatReleaseAnimeCatalogueCommandError(
  error: unknown,
): string {
  if (error instanceof ReleaseAnimeCatalogueLoaderError) return error.message
  return 'Release catalogue command failed unexpectedly. Error details were omitted because they may contain sensitive configuration or database information.'
}

function isDirectExecution(entryPath: string | undefined): boolean {
  return (
    entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href
  )
}

if (isDirectExecution(process.argv[1])) {
  runReleaseAnimeCatalogueCommand(process.argv.slice(2)).catch(
    (error: unknown) => {
      console.error(formatReleaseAnimeCatalogueCommandError(error))
      process.exitCode = 1
    },
  )
}
