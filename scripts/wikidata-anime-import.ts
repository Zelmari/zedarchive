import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { ZodError, z } from 'zod'
import { readDatabaseMigrationEnvironment } from '@/config/database-environment'
import { loadAnimeCatalogueSeed } from '@/features/anime/catalogue/anime-catalogue-seed'
import {
  assertApprovedWikidataAnimeCandidateSet,
  createWikidataAnimeReviewArtifact,
  loadWikidataAnimeCandidateManifest,
  sha256,
  type CatalogueSnapshot,
  type WikidataAnimeReviewArtifact,
  type WikidataAnimeCandidateManifest,
} from '@/features/anime/catalogue/wikidata-anime-import'
import { fetchWikidataEntities } from '@/integrations/wikidata/wikidata-client'
import {
  parseWikidataEntityResponse,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'
import {
  readAnimeCatalogueSnapshot,
  writeWikidataAnimeReviewArtifact,
  writeWikidataAnimeReviewMarkdown,
} from '@/server/database/prepare-wikidata-anime-import'

const manifestFilePath = fileURLToPath(
  new URL(
    '../data/imports/wikidata-anime-candidates.development.json',
    import.meta.url,
  ),
)
const seedFilePath = fileURLToPath(
  new URL('../data/seeds/anime-catalogue.development.json', import.meta.url),
)
const artifactFilePath = fileURLToPath(
  new URL('../.local/imports/wikidata-anime-review.json', import.meta.url),
)
const reviewFilePath = fileURLToPath(
  new URL('../.local/imports/wikidata-anime-review.md', import.meta.url),
)
const fixtureFilePaths = [
  fileURLToPath(
    new URL('../data/fixtures/wikidata/frieren-season-1.json', import.meta.url),
  ),
  fileURLToPath(
    new URL('../data/fixtures/wikidata/death-billiards.json', import.meta.url),
  ),
  fileURLToPath(
    new URL(
      '../data/fixtures/wikidata/unsupported-and-conflicting.json',
      import.meta.url,
    ),
  ),
]
const expectedDevelopmentDatabaseName = 'zedarchive_dev'
const usage =
  'Usage: npm run catalogue:import:wikidata -- prepare or npm run catalogue:import:wikidata:check'
const fixtureFileSchema = z.object({ response: z.unknown() })

class PublicImportCommandError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PublicImportCommandError'
  }
}

export class WikidataReviewBlockersError extends PublicImportCommandError {
  constructor(readonly blockers: number) {
    super(
      `Wikidata review artifact contains ${blockers} blocked candidates. Review ${reviewFilePath}.`,
    )
    this.name = 'WikidataReviewBlockersError'
  }
}

export type WikidataImportCommandMode = 'check' | 'prepare'

export function parseWikidataImportCommandArguments(
  argumentsToParse: readonly string[],
): WikidataImportCommandMode {
  if (argumentsToParse.length === 1 && argumentsToParse[0] === 'prepare') {
    return 'prepare'
  }

  if (argumentsToParse.length === 1 && argumentsToParse[0] === 'check') {
    return 'check'
  }

  throw new PublicImportCommandError(usage)
}

export function assertImportDevelopmentDatabaseName(
  databaseName: string | undefined,
): void {
  if (databaseName !== expectedDevelopmentDatabaseName) {
    throw new PublicImportCommandError(
      `Wikidata preparation refused to read "${databaseName ?? 'unknown'}"; expected "${expectedDevelopmentDatabaseName}"`,
    )
  }
}

async function validateFixtures(): Promise<void> {
  for (const fixturePath of fixtureFilePaths) {
    const contents = await readFile(fixturePath, 'utf8')
    const fixture = fixtureFileSchema.parse(JSON.parse(contents) as unknown)
    parseWikidataEntityResponse(fixture.response)
  }
}

async function validateSeedRelationship(
  manifest: WikidataAnimeCandidateManifest,
): Promise<void> {
  const seed = await loadAnimeCatalogueSeed(seedFilePath)
  const candidateById = new Map(
    manifest.candidates.map((candidate) => [
      candidate.catalogueItemId,
      candidate,
    ]),
  )
  const promotedItems = seed.items.filter((item) => candidateById.has(item.id))

  if (promotedItems.length === 0) {
    return
  }

  if (promotedItems.length !== manifest.candidates.length) {
    throw new PublicImportCommandError(
      'The deterministic seed contains only part of the Wikidata candidate batch.',
    )
  }

  for (const item of promotedItems) {
    const candidate = candidateById.get(item.id)
    const hasExpectedSource = item.sources.some(
      ({ sourceKey, sourceItemId }) =>
        sourceKey === 'wikidata' && sourceItemId === candidate?.sourceItemId,
    )

    if (!hasExpectedSource) {
      throw new PublicImportCommandError(
        `Promoted candidate ${item.id} does not retain its manifest Wikidata QID.`,
      )
    }
  }
}

async function validateCommittedInputs(): Promise<WikidataAnimeCandidateManifest> {
  const manifest = await loadWikidataAnimeCandidateManifest(manifestFilePath)
  assertApprovedWikidataAnimeCandidateSet(manifest)
  await validateFixtures()
  await validateSeedRelationship(manifest)
  return manifest
}

async function readDevelopmentCatalogueSnapshot(): Promise<CatalogueSnapshot> {
  await import('dotenv/config')
  let databaseMigrationUrl: string

  try {
    databaseMigrationUrl =
      readDatabaseMigrationEnvironment().databaseMigrationUrl
  } catch (error) {
    throw new PublicImportCommandError(
      'DATABASE_MIGRATION_URL is missing or invalid. Configure the local zedarchive_dev connection before preparing Wikidata data.',
      { cause: error },
    )
  }

  const pool = new Pool({ connectionString: databaseMigrationUrl })

  try {
    const databaseNameResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    assertImportDevelopmentDatabaseName(
      databaseNameResult.rows[0]?.databaseName,
    )
    return await readAnimeCatalogueSnapshot(drizzle({ client: pool }))
  } finally {
    await pool.end()
  }
}

export type WikidataImportCommandDependencies = {
  validateInputs?: () => Promise<WikidataAnimeCandidateManifest>
  readSnapshot?: () => Promise<CatalogueSnapshot>
  fetchEntities?: (
    qids: readonly string[],
  ) => Promise<Record<string, WikidataEntity>>
  readManifestContents?: () => Promise<string>
  writeArtifact?: (artifact: WikidataAnimeReviewArtifact) => Promise<void>
  writeReview?: (artifact: WikidataAnimeReviewArtifact) => Promise<void>
  now?: () => Date
  log?: (message: string) => void
}

export function formatWikidataImportCommandError(error: unknown): string {
  if (error instanceof PublicImportCommandError) {
    return error.message
  }

  if (error instanceof ZodError) {
    return 'Wikidata import validation failed. Correct the committed manifest or fixtures.'
  }

  return 'Wikidata import failed unexpectedly. Error details were omitted because dependency errors may contain sensitive request or database information.'
}

export async function runWikidataImportCommand(
  argumentsToParse: readonly string[],
  dependencies: WikidataImportCommandDependencies = {},
): Promise<void> {
  const mode = parseWikidataImportCommandArguments(argumentsToParse)
  const manifest = await (
    dependencies.validateInputs ?? validateCommittedInputs
  )()
  const log = dependencies.log ?? console.log

  if (mode === 'check') {
    log(
      `Validated ${manifest.candidates.length} Wikidata anime candidates and ${fixtureFilePaths.length} fixture files.`,
    )
    return
  }

  const snapshot = await (
    dependencies.readSnapshot ?? readDevelopmentCatalogueSnapshot
  )()
  const qids = manifest.candidates.map(({ sourceItemId }) => sourceItemId)
  const entities = await (dependencies.fetchEntities ?? fetchWikidataEntities)(
    qids,
  )
  const manifestContents = await (
    dependencies.readManifestContents ??
    (() => readFile(manifestFilePath, 'utf8'))
  )()
  const artifact = createWikidataAnimeReviewArtifact({
    generatedAt: (dependencies.now ?? (() => new Date()))(),
    manifestSha256: sha256(manifestContents),
    snapshot,
    manifest,
    entities,
  })
  await (
    dependencies.writeArtifact ??
    ((artifactToWrite) =>
      writeWikidataAnimeReviewArtifact(artifactFilePath, artifactToWrite))
  )(artifact)
  await (
    dependencies.writeReview ??
    ((artifactToWrite) =>
      writeWikidataAnimeReviewMarkdown(reviewFilePath, artifactToWrite))
  )(artifact)

  log(
    `Prepared ${artifact.summary.total} Wikidata candidates with ${artifact.summary.blockers} blockers. Review ${reviewFilePath}; machine-readable evidence is at ${artifactFilePath}.`,
  )

  if (artifact.summary.blockers > 0) {
    throw new WikidataReviewBlockersError(artifact.summary.blockers)
  }
}

function isDirectExecution(entryPath: string | undefined): boolean {
  return (
    entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href
  )
}

if (isDirectExecution(process.argv[1])) {
  runWikidataImportCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(formatWikidataImportCommandError(error))
    process.exitCode = error instanceof WikidataReviewBlockersError ? 2 : 1
  })
}
