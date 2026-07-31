import { lstat, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  animeReleaseDescriptors,
  findAnimeReleaseDescriptor,
  loadAnimeReleaseBundleForDescriptor,
  sha256Canonical,
  type AnimeReleaseBundle,
  type AnimeReleaseDescriptor,
  type AnimeReleaseV2Bundle,
  type SupportedAnimeReleaseBundle,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  assertReleaseTarget,
  planAnimeReleaseCatalogue,
  synchronizeAnimeReleaseCatalogue,
  ReleaseAnimeCatalogueLoaderError,
  type ReleaseAnimeCataloguePlanResult,
  type ReleaseAnimeCatalogueCommandMode,
  type ReleaseAnimeCatalogueSyncResult,
} from '@/server/database/release-anime-catalogue-loader'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const releaseUsage =
  'Usage: catalogue:release <check [--release anime-v1|anime-v2]|plan|rehearse [--release anime-v1|anime-v2]|apply --release anime-v1|anime-v2 --sha256 SHA-256>'

type ParsedReleaseAnimeCatalogueCommand = Readonly<{
  mode: ReleaseAnimeCatalogueCommandMode
  release?: string
  sha256?: string
}>

export type LoadedRelease = Readonly<{
  descriptor: AnimeReleaseDescriptor
  bundle: SupportedAnimeReleaseBundle
}>

type ReleaseArtifactPresence = 'present' | 'absent'

export type ReleaseArtifactInventory = Readonly<{
  corpus: ReleaseArtifactPresence
  index: ReleaseArtifactPresence
  reviewLedger: ReleaseArtifactPresence
  discoveryLedger: ReleaseArtifactPresence
  semanticDiff: ReleaseArtifactPresence
  manifestDirectory: ReleaseArtifactPresence
  matchingManifestCount: number
}>

type OpenDatabase = () => Promise<
  Readonly<{
    database: NodePgDatabase
    databaseName: string | undefined
    close: () => Promise<void>
  }>
>

export type ReleaseAnimeCatalogueCommandDependencies = Readonly<{
  loadBundle?: (
    descriptor: AnimeReleaseDescriptor,
  ) => Promise<SupportedAnimeReleaseBundle | undefined>
  openDatabase?: OpenDatabase
  synchronize?: typeof synchronizeAnimeReleaseCatalogue
  environment?: Readonly<Record<string, string | undefined>>
  log?: (message: string) => void
}>

function parseReleaseAnimeCatalogueCommandArguments(
  argumentsToParse: readonly string[],
): ParsedReleaseAnimeCatalogueCommand {
  const [mode, ...rest] = argumentsToParse
  if (mode === 'check' && rest.length === 0) return { mode }
  if (
    (mode === 'check' || mode === 'plan' || mode === 'rehearse') &&
    rest.length === 2 &&
    rest[0] === '--release'
  ) {
    return { mode, release: rest[1] }
  }
  if ((mode === 'plan' || mode === 'rehearse') && rest.length === 0)
    return { mode }
  if (
    mode === 'apply' &&
    rest.length === 4 &&
    rest[0] === '--release' &&
    rest[2] === '--sha256'
  ) {
    return { mode, release: rest[1], sha256: rest[3] }
  }
  throw new ReleaseAnimeCatalogueLoaderError(releaseUsage)
}

function assertSupportedRelease(name: string): AnimeReleaseDescriptor {
  const descriptor = findAnimeReleaseDescriptor(name)
  if (descriptor === undefined)
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release version is not supported.',
    )
  return descriptor
}

function assertReleaseSupportsMode(
  descriptor: AnimeReleaseDescriptor,
  mode: ReleaseAnimeCatalogueCommandMode,
): void {
  if (!descriptor.supportedModes.includes(mode))
    throw new ReleaseAnimeCatalogueLoaderError(
      'Selected release does not support this command mode.',
    )
}

function releaseManifestFilePattern(
  descriptor: AnimeReleaseDescriptor,
): RegExp {
  const { manifestFilePrefix, manifestFileDigits } = descriptor.files
  return new RegExp(
    `^${manifestFilePrefix}[0-9]{${manifestFileDigits}}\\.json$`,
  )
}

async function readArtifactPresence(
  path: string,
): Promise<ReleaseArtifactPresence> {
  try {
    const stats = await lstat(path)
    if (!stats.isFile() || stats.isSymbolicLink())
      throw new ReleaseAnimeCatalogueLoaderError(
        'Release artifacts are inaccessible or invalid.',
      )
    return 'present'
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return 'absent'
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release artifacts are inaccessible or invalid.',
    )
  }
}

async function readManifestDirectory(
  path: string,
): Promise<readonly string[] | undefined> {
  try {
    const stats = await lstat(path)
    if (!stats.isDirectory() || stats.isSymbolicLink())
      throw new ReleaseAnimeCatalogueLoaderError(
        'Release artifacts are inaccessible or invalid.',
      )
    return await readdir(path)
  } catch (error) {
    if (error instanceof ReleaseAnimeCatalogueLoaderError) throw error
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return undefined
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release artifacts are inaccessible or invalid.',
    )
  }
}

export function assertReleaseArtifactMaterialization(
  descriptor: AnimeReleaseDescriptor,
  inventory: ReleaseArtifactInventory,
): boolean {
  const requiredArtifacts = [
    inventory.corpus,
    inventory.index,
    inventory.reviewLedger,
    ...(descriptor.files.discoveryLedger === undefined
      ? []
      : [inventory.discoveryLedger]),
    ...(descriptor.files.semanticDiff === undefined
      ? []
      : [inventory.semanticDiff]),
  ]
  const noArtifactExists =
    requiredArtifacts.every((presence) => presence === 'absent') &&
    inventory.manifestDirectory === 'absent'
  if (noArtifactExists) return false
  if (
    inventory.corpus !== 'present' ||
    requiredArtifacts.some((presence) => presence !== 'present') ||
    inventory.manifestDirectory !== 'present' ||
    inventory.matchingManifestCount === 0
  )
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release artifacts are incomplete or invalid.',
    )
  return true
}

export async function discoverReleasePathsForDescriptor(
  descriptor: AnimeReleaseDescriptor,
  root: string = repositoryRoot,
): Promise<
  | Readonly<{
      corpus: string
      manifests: readonly string[]
      reviewLedger: string
      index: string
      discoveryLedger?: string
      semanticDiff?: string
    }>
  | undefined
> {
  const corpus = resolve(root, descriptor.files.corpus)
  const index = resolve(root, descriptor.files.index)
  const reviewLedger = resolve(root, descriptor.files.reviewLedger)
  const discoveryLedger =
    descriptor.files.discoveryLedger === undefined
      ? undefined
      : resolve(root, descriptor.files.discoveryLedger)
  const semanticDiff =
    descriptor.files.semanticDiff === undefined
      ? undefined
      : resolve(root, descriptor.files.semanticDiff)
  const manifestDirectory = resolve(root, descriptor.files.manifestDirectory)
  const manifestDirectoryEntries =
    await readManifestDirectory(manifestDirectory)
  if (
    manifestDirectoryEntries !== undefined &&
    manifestDirectoryEntries.some(
      (name) => !releaseManifestFilePattern(descriptor).test(name),
    )
  )
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release artifacts are incomplete or invalid.',
    )
  const manifestNames = manifestDirectoryEntries?.filter((name) =>
    releaseManifestFilePattern(descriptor).test(name),
  )
  const [
    corpusPresence,
    indexPresence,
    reviewLedgerPresence,
    discoveryLedgerPresence,
    semanticDiffPresence,
  ] = await Promise.all([
    readArtifactPresence(corpus),
    readArtifactPresence(index),
    readArtifactPresence(reviewLedger),
    discoveryLedger === undefined
      ? Promise.resolve<ReleaseArtifactPresence>('absent')
      : readArtifactPresence(discoveryLedger),
    semanticDiff === undefined
      ? Promise.resolve<ReleaseArtifactPresence>('absent')
      : readArtifactPresence(semanticDiff),
  ])
  if (
    !assertReleaseArtifactMaterialization(descriptor, {
      corpus: corpusPresence,
      index: indexPresence,
      reviewLedger: reviewLedgerPresence,
      discoveryLedger: discoveryLedgerPresence,
      semanticDiff: semanticDiffPresence,
      manifestDirectory: manifestNames === undefined ? 'absent' : 'present',
      matchingManifestCount: manifestNames?.length ?? 0,
    })
  )
    return undefined
  if (manifestNames === undefined) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release artifacts are incomplete or invalid.',
    )
  }
  const manifestPaths = manifestNames
    .sort((left, right) => left.localeCompare(right))
    .map((name) => resolve(manifestDirectory, name))
  await Promise.all(manifestPaths.map(readArtifactPresence))
  const paths = {
    corpus,
    manifests: manifestPaths,
    reviewLedger,
    index,
    discoveryLedger,
    semanticDiff,
  }
  return paths
}

async function loadMaterializedReleases(
  dependencies: ReleaseAnimeCatalogueCommandDependencies,
): Promise<readonly LoadedRelease[]> {
  const loaded: LoadedRelease[] = []
  for (const descriptor of animeReleaseDescriptors) {
    if (dependencies.loadBundle !== undefined) {
      const bundle = await dependencies.loadBundle(descriptor)
      if (bundle !== undefined) loaded.push({ descriptor, bundle })
      continue
    }
    const paths = await discoverReleasePathsForDescriptor(descriptor)
    if (paths === undefined) continue
    loaded.push({
      descriptor,
      bundle: await loadAnimeReleaseBundleForDescriptor(descriptor, paths),
    })
  }
  assertMaterializedReleaseContracts(loaded)
  return loaded
}

export function assertMaterializedReleaseContracts(
  releases: readonly LoadedRelease[],
): void {
  const byName = new Map(
    releases.map((release) => [release.descriptor.name, release]),
  )
  const releaseV1 = byName.get('anime-v1')
  if (releaseV1 === undefined)
    throw new ReleaseAnimeCatalogueLoaderError(
      'The required anime-v1 release is not materialized.',
    )
  for (const release of releases) {
    const predecessorName = release.descriptor.expected.predecessor
    if (predecessorName === null) continue
    const predecessor = byName.get(predecessorName)
    if (predecessor === undefined)
      throw new ReleaseAnimeCatalogueLoaderError(
        'Release predecessor artifacts are not materialized.',
      )
    if (release.descriptor.name !== 'anime-v2')
      throw new ReleaseAnimeCatalogueLoaderError(
        'Release predecessor contract is not implemented.',
      )
    const successorIndex = (release.bundle as AnimeReleaseV2Bundle).index
    if (
      successorIndex.predecessorCorpusSha256 !==
        sha256Canonical(predecessor.bundle.corpus) ||
      successorIndex.predecessorReviewLedgerSha256 !==
        sha256Canonical(predecessor.bundle.reviewLedger) ||
      successorIndex.predecessorIndexSha256 !==
        sha256Canonical(predecessor.bundle.index)
    )
      throw new ReleaseAnimeCatalogueLoaderError(
        'Release predecessor bindings do not match the materialized predecessor.',
      )
  }
}

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
  descriptor: AnimeReleaseDescriptor,
  bundle: SupportedAnimeReleaseBundle,
  result?: ReleaseAnimeCatalogueSyncResult | ReleaseAnimeCataloguePlanResult,
): string {
  if (!result)
    return `Validated ${descriptor.name}: ${bundle.corpus.items.length} release catalogue records.`
  const conflicts =
    'conflicts' in result ? `, ${result.conflicts} conflicts` : ''
  return `${action[0]!.toUpperCase()}${action.slice(1)} ${descriptor.name}: ${bundle.corpus.items.length} release catalogue records: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged${conflicts}.`
}

function assertApplyArguments(
  command: ParsedReleaseAnimeCatalogueCommand,
  descriptor: AnimeReleaseDescriptor,
  bundle: SupportedAnimeReleaseBundle,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment.CATALOGUE_RELEASE_APPLY_ENABLED !== 'true') {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release apply is disabled until Milestone 47.',
    )
  }
  if (
    command.release !== descriptor.name ||
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
  const log = dependencies.log ?? console.log
  const materialized = await loadMaterializedReleases(dependencies)
  if (command.mode === 'check') {
    if (command.release !== undefined) {
      const descriptor = assertSupportedRelease(command.release)
      const release = materialized.find(
        ({ descriptor: candidate }) => candidate.name === descriptor.name,
      )
      if (release === undefined)
        throw new ReleaseAnimeCatalogueLoaderError(
          'Selected release is not materialized.',
        )
      log(summarize('validated', release.descriptor, release.bundle))
      return
    }
    for (const release of materialized)
      log(summarize('validated', release.descriptor, release.bundle))
    for (const descriptor of animeReleaseDescriptors) {
      if (
        materialized.some(
          ({ descriptor: loaded }) => loaded.name === descriptor.name,
        )
      )
        continue
      log(
        `Not validated ${descriptor.name}: release files are not materialized.`,
      )
    }
    return
  }
  const selectedRelease =
    command.release === undefined
      ? materialized.length === 1
        ? materialized[0]
        : undefined
      : materialized.find(
          ({ descriptor }) => descriptor.name === command.release,
        )
  if (selectedRelease === undefined) {
    if (command.release !== undefined) assertSupportedRelease(command.release)
    throw new ReleaseAnimeCatalogueLoaderError(
      command.release === undefined
        ? 'Release selection is required when multiple or no releases are materialized.'
        : 'Selected release is not materialized.',
    )
  }
  assertReleaseSupportsMode(selectedRelease.descriptor, command.mode)
  // The descriptor's current database-capable modes are v1 only. M45-09 adds
  // v2 here with its transactional loader; no release is inferred as latest.
  const bundle = selectedRelease.bundle as AnimeReleaseBundle
  const environment = dependencies.environment ?? process.env
  const expectedProductionName =
    command.mode === 'apply'
      ? assertApplyArguments(
          command,
          selectedRelease.descriptor,
          bundle,
          environment,
        )
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
          selectedRelease.descriptor,
          bundle,
          await planAnimeReleaseCatalogue(connection.database, bundle),
        ),
      )
      return
    }
    log(
      summarize(
        'synchronized',
        selectedRelease.descriptor,
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
