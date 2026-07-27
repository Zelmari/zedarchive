import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { ZodError, z } from 'zod'
import { readDatabaseMigrationEnvironment } from '@/config/database-environment'
import {
  animeReleaseBatchCount,
  animeReleaseManifestSchema,
  animeReleaseName,
  type AnimeReleaseManifest,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  candidateClassificationValues,
  catalogueSnapshotSchema,
  createWikidataAnimeReviewArtifact,
  sha256,
  wikidataAnimeCandidateReviewSchema,
  type CatalogueSnapshot,
  type WikidataAnimeCandidateReview,
} from '@/features/anime/catalogue/wikidata-anime-import'
import { formatWikidataAnimeReviewMarkdown } from '@/features/anime/catalogue/wikidata-anime-review-report'
import {
  fetchWikidataEntities,
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-client'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'
import { readAnimeCatalogueSnapshot } from '@/server/database/prepare-wikidata-anime-import'

const expectedDevelopmentDatabaseName = 'zedarchive_dev'
const usage =
  'Usage: npm run catalogue:release:prepare -- check --batch <01-20> or prepare --batch <01-20>'
const releaseArtifactDirectory = fileURLToPath(
  new URL('../.local/imports/releases/anime-v1', import.meta.url),
)

const releaseReviewArtifactSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-release-preparation'),
  version: z.literal(1),
  release: z.literal(animeReleaseName),
  batch: z.number().int().min(1).max(animeReleaseBatchCount),
  generatedAt: z.iso.datetime(),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  catalogueSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  candidates: z
    .array(
      wikidataAnimeCandidateReviewSchema.extend({
        expectedEnglishLabel: z.string().nullable(),
      }),
    )
    .length(25),
  summary: z.strictObject({
    total: z.literal(25),
    blockers: z.number().int().nonnegative(),
    classifications: z.record(
      z.enum(candidateClassificationValues),
      z.number().int().nonnegative(),
    ),
  }),
})

export type WikidataAnimeReleaseReviewArtifact = z.infer<
  typeof releaseReviewArtifactSchema
>

class PublicReleasePrepareCommandError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PublicReleasePrepareCommandError'
  }
}

export class WikidataReleaseReviewBlockersError extends PublicReleasePrepareCommandError {
  constructor(readonly blockers: number) {
    super(`Release batch review contains ${blockers} blocked candidates.`)
  }
}

export type WikidataReleasePrepareCommand = Readonly<{
  mode: 'check' | 'prepare'
  batch: number
}>

export function parseWikidataReleasePrepareArguments(
  argumentsToParse: readonly string[],
): WikidataReleasePrepareCommand {
  const [mode, flag, requestedBatch] = argumentsToParse

  if (
    argumentsToParse.length !== 3 ||
    (mode !== 'check' && mode !== 'prepare') ||
    flag !== '--batch' ||
    requestedBatch === undefined ||
    !/^(0[1-9]|1[0-9]|20)$/.test(requestedBatch)
  ) {
    throw new PublicReleasePrepareCommandError(usage)
  }

  return { mode, batch: Number(requestedBatch) }
}

export function assertReleasePreparationDevelopmentDatabaseName(
  databaseName: string | undefined,
): void {
  if (databaseName !== expectedDevelopmentDatabaseName) {
    throw new PublicReleasePrepareCommandError(
      'Release preparation refused the configured database target.',
    )
  }
}

function manifestPath(batch: number): string {
  return fileURLToPath(
    new URL(
      `../data/imports/releases/anime-v1/batch-${String(batch).padStart(2, '0')}.json`,
      import.meta.url,
    ),
  )
}

function artifactPaths(
  batch: number,
): Readonly<{ json: string; markdown: string }> {
  const stem = `batch-${String(batch).padStart(2, '0')}.review`

  return {
    json: join(releaseArtifactDirectory, `${stem}.json`),
    markdown: join(releaseArtifactDirectory, `${stem}.md`),
  }
}

async function readReleaseManifestContents(batch: number): Promise<string> {
  try {
    return await readFile(manifestPath(batch), 'utf8')
  } catch (error) {
    throw new PublicReleasePrepareCommandError(
      'Release batch manifest could not be read.',
      { cause: error },
    )
  }
}

function parseReleaseManifest(
  batch: number,
  contents: string,
): AnimeReleaseManifest {
  let input: unknown

  try {
    input = JSON.parse(contents) as unknown
  } catch (error) {
    throw new PublicReleasePrepareCommandError(
      'Release batch manifest contains malformed JSON.',
      { cause: error },
    )
  }

  const manifest = animeReleaseManifestSchema.parse(input)

  if (manifest.batch !== batch) {
    throw new PublicReleasePrepareCommandError(
      'Release batch manifest number does not match the requested batch.',
    )
  }

  return manifest
}

async function readDevelopmentCatalogueSnapshot(): Promise<CatalogueSnapshot> {
  await import('dotenv/config')
  let databaseMigrationUrl: string

  try {
    databaseMigrationUrl =
      readDatabaseMigrationEnvironment().databaseMigrationUrl
  } catch (error) {
    throw new PublicReleasePrepareCommandError(
      'Release preparation requires a valid local development database configuration.',
      { cause: error },
    )
  }

  const pool = new Pool({ connectionString: databaseMigrationUrl })

  try {
    const databaseNameResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    assertReleasePreparationDevelopmentDatabaseName(
      databaseNameResult.rows[0]?.databaseName,
    )
    return await readAnimeCatalogueSnapshot(drizzle({ client: pool }))
  } finally {
    await pool.end()
  }
}

function toImportManifest(manifest: AnimeReleaseManifest) {
  return {
    version: 1 as const,
    sourceKey: 'wikidata' as const,
    candidates: manifest.candidates.map((candidate) => ({
      catalogueItemId: candidate.catalogueItemId,
      sourceItemId: candidate.sourceItemId,
      // A missing expected English label is intentional release sparsity. The
      // QID is a neutral drift-review label and never becomes catalogue data.
      expectedEnglishLabel:
        candidate.expectedEnglishLabel ?? candidate.sourceItemId,
      intent: candidate.intent,
      overrides: candidate.overrides,
    })),
  }
}

function createReleaseArtifact(input: {
  batch: number
  manifest: AnimeReleaseManifest
  manifestContents: string
  snapshot: CatalogueSnapshot
  entities: Record<string, WikidataEntity>
  generatedAt: Date
}): WikidataAnimeReleaseReviewArtifact {
  const importManifest = toImportManifest(input.manifest)
  const reviewed = createWikidataAnimeReviewArtifact({
    generatedAt: input.generatedAt,
    manifestSha256: sha256(input.manifestContents),
    snapshot: input.snapshot,
    manifest: importManifest,
    entities: input.entities,
  })
  const candidates = reviewed.candidates.map((candidate, index) => {
    const releaseCandidate = input.manifest.candidates[index]

    return {
      ...candidate,
      expectedEnglishLabel: releaseCandidate?.expectedEnglishLabel ?? null,
      proposedItem:
        candidate.proposedItem === null || releaseCandidate === undefined
          ? candidate.proposedItem
          : {
              ...candidate.proposedItem,
              catalogueState: releaseCandidate.catalogueState,
            },
    }
  })

  return releaseReviewArtifactSchema.parse({
    schema: 'zedarchive.anime-release-preparation',
    version: 1,
    release: animeReleaseName,
    batch: input.batch,
    generatedAt: reviewed.generatedAt,
    manifestSha256: reviewed.manifestSha256,
    catalogueSnapshotSha256: reviewed.catalogueSnapshotSha256,
    candidates,
    summary: {
      ...reviewed.summary,
      blockers: candidates.filter((candidate) =>
        candidateRequiresBlocker(candidate, input.manifest),
      ).length,
    },
  })
}

function candidateRequiresBlocker(
  candidate: Pick<WikidataAnimeCandidateReview, 'order' | 'classification'>,
  manifest: AnimeReleaseManifest,
): boolean {
  const releaseCandidate = manifest.candidates[candidate.order]

  if (releaseCandidate === undefined) {
    return true
  }

  if (candidate.classification.startsWith('blocked-')) {
    return true
  }

  if (releaseCandidate.intent === 'create') {
    return candidate.classification !== 'ready-create'
  }

  return !['ready-link-existing', 'existing-source-no-change'].includes(
    candidate.classification,
  )
}

function countMandatoryBlockers(
  artifact: WikidataAnimeReleaseReviewArtifact,
  manifest: AnimeReleaseManifest,
): number {
  return artifact.candidates.filter((candidate) =>
    candidateRequiresBlocker(candidate, manifest),
  ).length
}

function formatReleaseReviewMarkdown(
  artifact: WikidataAnimeReleaseReviewArtifact,
  blockers: number,
): string {
  const markdown = formatWikidataAnimeReviewMarkdown({
    version: 1,
    sourceKey: 'wikidata',
    endpoint: wikidataApiEndpoint,
    generatedAt: artifact.generatedAt,
    manifestSha256: artifact.manifestSha256,
    catalogueSnapshotSha256: artifact.catalogueSnapshotSha256,
    userAgent: wikidataImporterUserAgent,
    candidates: artifact.candidates.map((candidate) => ({
      ...candidate,
      // Markdown needs a heading when the reviewed manifest deliberately has
      // no English drift label. This display fallback is not persisted.
      expectedEnglishLabel:
        candidate.expectedEnglishLabel ?? candidate.sourceItemId,
    })) as WikidataAnimeCandidateReview[],
    summary: {
      ...artifact.summary,
      blockers,
    },
  })

  return markdown.replace(
    '# Wikidata anime import review',
    `# Wikidata anime release batch ${String(artifact.batch).padStart(2, '0')} review`,
  )
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function assertCompleteReleaseArtifactPair(
  paths: Readonly<{ json: string; markdown: string }>,
): Promise<void> {
  const [hasJson, hasMarkdown] = await Promise.all([
    fileExists(paths.json),
    fileExists(paths.markdown),
  ])

  if (hasJson !== hasMarkdown) {
    throw new PublicReleasePrepareCommandError(
      'Release review artifact pair is incomplete; refusing to replace it.',
    )
  }
}

async function writeFileAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' })
  await rename(temporaryPath, filePath)
}

async function publishReleaseReviewPair(
  artifact: WikidataAnimeReleaseReviewArtifact,
  markdown: string,
): Promise<void> {
  const paths = artifactPaths(artifact.batch)
  await mkdir(dirname(paths.json), { recursive: true })
  await assertCompleteReleaseArtifactPair(paths)

  const [hasJson, hasMarkdown] = await Promise.all([
    fileExists(paths.json),
    fileExists(paths.markdown),
  ])
  const [previousJson, previousMarkdown] = await Promise.all([
    hasJson ? readFile(paths.json, 'utf8') : undefined,
    hasMarkdown ? readFile(paths.markdown, 'utf8') : undefined,
  ])
  const stagingDirectory = join(
    dirname(paths.json),
    `.staged-${artifact.batch}-${process.pid}-${randomUUID()}`,
  )
  const stagedJson = join(stagingDirectory, 'artifact.json')
  const stagedMarkdown = join(stagingDirectory, 'review.md')
  let jsonPublished = false

  await mkdir(stagingDirectory, { recursive: true })

  try {
    await Promise.all([
      writeFile(stagedJson, `${JSON.stringify(artifact, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      }),
      writeFile(stagedMarkdown, markdown, { encoding: 'utf8', flag: 'wx' }),
    ])
    await rename(stagedJson, paths.json)
    jsonPublished = true
    await rename(stagedMarkdown, paths.markdown)
  } catch (error) {
    if (jsonPublished) {
      try {
        if (previousJson === undefined) {
          await rm(paths.json, { force: true })
        } else {
          await writeFileAtomically(paths.json, previousJson)
        }
        if (previousMarkdown === undefined) {
          await rm(paths.markdown, { force: true })
        } else {
          await writeFileAtomically(paths.markdown, previousMarkdown)
        }
      } catch {
        throw new PublicReleasePrepareCommandError(
          'Release review artifact pair could not be published safely.',
        )
      }
    }

    throw new PublicReleasePrepareCommandError(
      'Release review artifact pair could not be published safely.',
      { cause: error },
    )
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true })
  }
}

export type WikidataReleasePrepareDependencies = {
  readManifestContents?: (batch: number) => Promise<string>
  readSnapshot?: () => Promise<CatalogueSnapshot>
  fetchEntities?: (
    qids: readonly string[],
  ) => Promise<Record<string, WikidataEntity>>
  createArtifact?: (input: {
    batch: number
    manifest: AnimeReleaseManifest
    manifestContents: string
    snapshot: CatalogueSnapshot
    entities: Record<string, WikidataEntity>
    generatedAt: Date
  }) => WikidataAnimeReleaseReviewArtifact
  publishArtifactPair?: (
    artifact: WikidataAnimeReleaseReviewArtifact,
    markdown: string,
  ) => Promise<void>
  now?: () => Date
  log?: (message: string) => void
}

export function formatWikidataReleasePrepareError(error: unknown): string {
  if (error instanceof PublicReleasePrepareCommandError) {
    return error.message
  }

  if (error instanceof ZodError) {
    return 'Release preparation validation failed. Correct the committed release manifest.'
  }

  return 'Release preparation failed unexpectedly. Error details were omitted because dependency errors may contain sensitive request or database information.'
}

export async function runWikidataReleasePrepareCommand(
  argumentsToParse: readonly string[],
  dependencies: WikidataReleasePrepareDependencies = {},
): Promise<void> {
  const command = parseWikidataReleasePrepareArguments(argumentsToParse)
  const manifestContents = await (
    dependencies.readManifestContents ?? readReleaseManifestContents
  )(command.batch)
  const manifest = parseReleaseManifest(command.batch, manifestContents)

  if (command.mode === 'check') {
    ;(dependencies.log ?? console.log)(
      `Validated release batch ${String(command.batch).padStart(2, '0')} with ${manifest.candidates.length} Wikidata candidates.`,
    )
    return
  }

  // The snapshot dependency returns only after its guarded read pool has
  // closed. Network acquisition therefore cannot overlap a database session.
  const snapshot = await (
    dependencies.readSnapshot ?? readDevelopmentCatalogueSnapshot
  )()
  const entities = await (dependencies.fetchEntities ?? fetchWikidataEntities)(
    manifest.candidates.map(({ sourceItemId }) => sourceItemId),
  )
  const artifact = releaseReviewArtifactSchema.parse(
    (dependencies.createArtifact ?? createReleaseArtifact)({
      batch: command.batch,
      manifest,
      manifestContents,
      snapshot: catalogueSnapshotSchema.parse(snapshot),
      entities,
      generatedAt: (dependencies.now ?? (() => new Date()))(),
    }),
  )
  const blockers = countMandatoryBlockers(artifact, manifest)
  const markdown = formatReleaseReviewMarkdown(artifact, blockers)

  await (dependencies.publishArtifactPair ?? publishReleaseReviewPair)(
    artifact,
    markdown,
  )
  ;(dependencies.log ?? console.log)(
    `Prepared release batch ${String(command.batch).padStart(2, '0')}: ${artifact.candidates.length} candidates, ${blockers} blockers.`,
  )

  if (blockers > 0) {
    throw new WikidataReleaseReviewBlockersError(blockers)
  }
}

function isDirectExecution(entryPath: string | undefined): boolean {
  return (
    entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href
  )
}

if (isDirectExecution(process.argv[1])) {
  runWikidataReleasePrepareCommand(process.argv.slice(2)).catch(
    (error: unknown) => {
      console.error(formatWikidataReleasePrepareError(error))
      process.exitCode =
        error instanceof WikidataReleaseReviewBlockersError ? 2 : 1
    },
  )
}
