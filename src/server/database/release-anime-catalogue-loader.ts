import { and, asc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  sha256Canonical,
  validateAnimeReleaseBundle,
  type AnimeReleaseBundle,
  type AnimeReleaseItem,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
} from '@/server/database/schema'

type ReleaseTransaction = NodePgDatabase
type StoredParent = typeof animeCatalogueItems.$inferSelect
type StoredAlternative = typeof animeAlternativeTitles.$inferSelect
type StoredSource = typeof animeCatalogueSources.$inferSelect

export type ReleaseAnimeCatalogueSyncResult = Readonly<{
  inserted: number
  updated: number
  unchanged: number
}>

export type ReleaseAnimeCataloguePlanResult = Readonly<
  ReleaseAnimeCatalogueSyncResult & { conflicts: number }
>

export type ReleaseAnimeCatalogueSyncOptions = Readonly<{
  mutationTime?: Date
  failAfterItem?: number
  failFinalFingerprint?: boolean
}>

export class ReleaseAnimeCatalogueLoaderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReleaseAnimeCatalogueLoaderError'
  }
}

export class ReleaseAnimeCatalogueSourceConflictError extends ReleaseAnimeCatalogueLoaderError {
  constructor() {
    super(
      'Release source ownership is inconsistent; no release changes were applied.',
    )
  }
}

function parentValues(item: AnimeReleaseItem) {
  return {
    englishTitle: item.titles.english,
    romajiTitle: item.titles.romaji,
    originalTitle: item.titles.original,
    format: item.format,
    releaseStatus: item.releaseStatus,
    releaseYear: item.releaseYear,
    episodeCount: item.episodeCount,
    maturity: item.maturity,
    catalogueState: item.catalogueState,
  }
}

function parentMatches(parent: StoredParent, item: AnimeReleaseItem): boolean {
  const values = parentValues(item)
  return Object.entries(values).every(
    ([key, value]) => parent[key as keyof typeof values] === value,
  )
}

function alternativesMatch(
  alternatives: readonly StoredAlternative[],
  item: AnimeReleaseItem,
): boolean {
  return (
    alternatives.length === item.titles.alternatives.length &&
    alternatives.every(
      (alternative, position) =>
        alternative.position === position &&
        alternative.title === item.titles.alternatives[position],
    )
  )
}

type ReleaseItemInspection = Readonly<{
  parent: StoredParent | undefined
  alternatives: readonly StoredAlternative[]
  sources: readonly StoredSource[]
}>

async function inspectReleaseItem(
  database: ReleaseTransaction,
  item: AnimeReleaseItem,
  lock: boolean,
): Promise<ReleaseItemInspection> {
  const parentQuery = database
    .select()
    .from(animeCatalogueItems)
    .where(eq(animeCatalogueItems.id, item.id))
    .limit(1)
  const [parent] = lock ? await parentQuery.for('update') : await parentQuery
  const alternatives = parent
    ? await database
        .select()
        .from(animeAlternativeTitles)
        .where(eq(animeAlternativeTitles.catalogueItemId, item.id))
        .orderBy(asc(animeAlternativeTitles.position))
    : []
  const sources = parent
    ? await database
        .select()
        .from(animeCatalogueSources)
        .where(eq(animeCatalogueSources.catalogueItemId, item.id))
        .orderBy(
          asc(animeCatalogueSources.sourceKey),
          asc(animeCatalogueSources.sourceItemId),
        )
    : []
  return { parent, alternatives, sources }
}

function hasSourceOwnershipConflict(
  inspection: ReleaseItemInspection,
  item: AnimeReleaseItem,
  intent: 'create' | 'link-existing',
): boolean {
  const expectedSource = item.sources[0]!
  if (inspection.parent === undefined) {
    return intent === 'link-existing'
  }
  const wikidataSources = inspection.sources.filter(
    (source) => source.sourceKey === 'wikidata',
  )
  if (
    wikidataSources.length !== 1 ||
    wikidataSources[0]?.sourceItemId !== expectedSource.sourceItemId
  ) {
    return true
  }
  // A V1 create manifest is replayable only when it proves the prior complete
  // create finished unchanged. A correction to an existing aggregate requires
  // the reviewed link-existing intent instead.
  if (
    intent === 'create' &&
    (!parentMatches(inspection.parent, item) ||
      !alternativesMatch(inspection.alternatives, item))
  ) {
    return true
  }
  return false
}

async function preflightReleaseSourceOwnership(
  database: ReleaseTransaction,
  bundle: AnimeReleaseBundle,
  lock: boolean,
  collectConflicts: boolean,
): Promise<
  Readonly<{
    inspections: Map<string, ReleaseItemInspection>
    conflictIds: Set<string>
  }>
> {
  const intentById = new Map(
    bundle.manifests.flatMap((manifest) =>
      manifest.candidates.map(
        (candidate) => [candidate.catalogueItemId, candidate.intent] as const,
      ),
    ),
  )
  const inspections = new Map<string, ReleaseItemInspection>()
  const conflictIds = new Set<string>()
  for (const item of bundle.corpus.items) {
    const expectedSource = item.sources[0]!
    const sourceQuery = database
      .select({ catalogueItemId: animeCatalogueSources.catalogueItemId })
      .from(animeCatalogueSources)
      .where(
        and(
          eq(animeCatalogueSources.sourceKey, expectedSource.sourceKey),
          eq(animeCatalogueSources.sourceItemId, expectedSource.sourceItemId),
        ),
      )
      .limit(1)
    const [sourceOwner] = lock
      ? await sourceQuery.for('update')
      : await sourceQuery
    const inspection = await inspectReleaseItem(database, item, lock)
    const conflict =
      (sourceOwner !== undefined && sourceOwner.catalogueItemId !== item.id) ||
      hasSourceOwnershipConflict(
        inspection,
        item,
        intentById.get(item.id) ?? 'create',
      )
    if (conflict && !collectConflicts)
      throw new ReleaseAnimeCatalogueSourceConflictError()
    if (conflict) conflictIds.add(item.id)
    inspections.set(item.id, inspection)
  }
  return { inspections, conflictIds }
}

function classifyInspection(
  inspection: ReleaseItemInspection,
  item: AnimeReleaseItem,
): 'inserted' | 'updated' | 'unchanged' {
  if (inspection.parent === undefined) return 'inserted'
  return parentMatches(inspection.parent, item) &&
    alternativesMatch(inspection.alternatives, item)
    ? 'unchanged'
    : 'updated'
}

async function assertFinalReleaseFingerprint(
  database: ReleaseTransaction,
  bundle: AnimeReleaseBundle,
): Promise<void> {
  const ids = bundle.corpus.items.map((item) => item.id)
  const parents = await database
    .select()
    .from(animeCatalogueItems)
    .where(inArray(animeCatalogueItems.id, ids))
    .orderBy(asc(animeCatalogueItems.id))
  const alternatives = await database
    .select()
    .from(animeAlternativeTitles)
    .where(inArray(animeAlternativeTitles.catalogueItemId, ids))
    .orderBy(
      asc(animeAlternativeTitles.catalogueItemId),
      asc(animeAlternativeTitles.position),
    )
  const sources = await database
    .select()
    .from(animeCatalogueSources)
    .where(
      and(
        inArray(animeCatalogueSources.catalogueItemId, ids),
        eq(animeCatalogueSources.sourceKey, 'wikidata'),
      ),
    )
    .orderBy(asc(animeCatalogueSources.catalogueItemId))
  if (parents.length !== ids.length || sources.length !== ids.length) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release final aggregate count did not match the approved corpus.',
    )
  }
  const alternativesById = new Map<
    string,
    { title: string; position: number }[]
  >()
  for (const alternative of alternatives) {
    const values = alternativesById.get(alternative.catalogueItemId) ?? []
    values.push({ title: alternative.title, position: alternative.position })
    alternativesById.set(alternative.catalogueItemId, values)
  }
  const sourceById = new Map(
    sources.map((source) => [source.catalogueItemId, source.sourceItemId]),
  )
  const actual = parents
    .map((parent) => ({
      id: parent.id,
      englishTitle: parent.englishTitle,
      romajiTitle: parent.romajiTitle,
      originalTitle: parent.originalTitle,
      format: parent.format,
      releaseStatus: parent.releaseStatus,
      releaseYear: parent.releaseYear,
      episodeCount: parent.episodeCount,
      maturity: parent.maturity,
      catalogueState: parent.catalogueState,
      alternatives: alternativesById.get(parent.id) ?? [],
      sourceItemId: sourceById.get(parent.id),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const expected = bundle.corpus.items
    .map((item) => ({
      id: item.id,
      englishTitle: item.titles.english,
      romajiTitle: item.titles.romaji,
      originalTitle: item.titles.original,
      format: item.format,
      releaseStatus: item.releaseStatus,
      releaseYear: item.releaseYear,
      episodeCount: item.episodeCount,
      maturity: item.maturity,
      catalogueState: item.catalogueState,
      alternatives: item.titles.alternatives.map((title, position) => ({
        title,
        position,
      })),
      sourceItemId: item.sources[0]!.sourceItemId,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (sha256Canonical(actual) !== sha256Canonical(expected)) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release final aggregate fingerprint did not match the approved corpus.',
    )
  }
}

/**
 * Synchronizes only listed release UUID aggregates. Its preflight intentionally
 * fails closed for missing or extra Wikidata source ownership; unrelated
 * sources and all unlisted rows stay outside the release's authority.
 */
export async function synchronizeAnimeReleaseCatalogue(
  database: NodePgDatabase,
  input: AnimeReleaseBundle,
  options: ReleaseAnimeCatalogueSyncOptions = {},
): Promise<ReleaseAnimeCatalogueSyncResult> {
  const bundle = validateAnimeReleaseBundle(input)
  const mutationTime = options.mutationTime ?? new Date()
  return database.transaction(async (transaction) => {
    const { inspections } = await preflightReleaseSourceOwnership(
      transaction,
      bundle,
      true,
      false,
    )
    const result = { inserted: 0, updated: 0, unchanged: 0 }
    let processed = 0
    for (const item of bundle.corpus.items) {
      const inspection = inspections.get(item.id)
      if (!inspection)
        throw new ReleaseAnimeCatalogueLoaderError(
          'Release preflight did not inspect every catalogue item.',
        )
      const classification = classifyInspection(inspection, item)
      if (classification === 'unchanged') {
        result.unchanged += 1
        continue
      }
      if (classification === 'inserted') {
        await transaction.insert(animeCatalogueItems).values({
          id: item.id,
          ...parentValues(item),
          createdAt: mutationTime,
          updatedAt: mutationTime,
        })
        if (item.titles.alternatives.length > 0) {
          await transaction.insert(animeAlternativeTitles).values(
            item.titles.alternatives.map((title, position) => ({
              catalogueItemId: item.id,
              title,
              position,
            })),
          )
        }
        await transaction.insert(animeCatalogueSources).values({
          catalogueItemId: item.id,
          sourceKey: 'wikidata',
          sourceItemId: item.sources[0]!.sourceItemId,
          firstSeenAt: mutationTime,
          lastSeenAt: mutationTime,
        })
        result.inserted += 1
      } else {
        const parentChanged = !parentMatches(inspection.parent!, item)
        const alternativesChanged = !alternativesMatch(
          inspection.alternatives,
          item,
        )
        if (parentChanged || alternativesChanged) {
          // A changed aggregate has exactly one mutation time; an exact replay
          // does not touch its parent timestamp or child row identities.
          await transaction
            .update(animeCatalogueItems)
            .set({ ...parentValues(item), updatedAt: mutationTime })
            .where(eq(animeCatalogueItems.id, item.id))
        }
        if (alternativesChanged) {
          await transaction
            .delete(animeAlternativeTitles)
            .where(eq(animeAlternativeTitles.catalogueItemId, item.id))
          if (item.titles.alternatives.length > 0) {
            await transaction.insert(animeAlternativeTitles).values(
              item.titles.alternatives.map((title, position) => ({
                catalogueItemId: item.id,
                title,
                position,
              })),
            )
          }
        }
        result.updated += 1
      }
      processed += 1
      if (
        options.failAfterItem !== undefined &&
        processed >= options.failAfterItem
      ) {
        throw new ReleaseAnimeCatalogueLoaderError(
          'Injected release synchronization failure.',
        )
      }
    }
    if (options.failFinalFingerprint) {
      throw new ReleaseAnimeCatalogueLoaderError(
        'Injected release final fingerprint failure.',
      )
    }
    await assertFinalReleaseFingerprint(transaction, bundle)
    return result
  })
}

export async function planAnimeReleaseCatalogue(
  database: NodePgDatabase,
  input: AnimeReleaseBundle,
): Promise<ReleaseAnimeCataloguePlanResult> {
  const bundle = validateAnimeReleaseBundle(input)
  const { inspections, conflictIds } = await preflightReleaseSourceOwnership(
    database,
    bundle,
    false,
    true,
  )
  const result = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    conflicts: conflictIds.size,
  }
  for (const item of bundle.corpus.items) {
    if (conflictIds.has(item.id)) continue
    const classification = classifyInspection(inspections.get(item.id)!, item)
    result[classification] += 1
  }
  return result
}

export type ReleaseAnimeCatalogueCommandMode =
  'check' | 'plan' | 'rehearse' | 'apply'

export type ParsedReleaseAnimeCatalogueCommand = Readonly<{
  mode: ReleaseAnimeCatalogueCommandMode
  release?: string
  sha256?: string
}>

const releaseUsage =
  'Usage: catalogue:release <check|plan|rehearse|apply --release anime-v1 --sha256 SHA-256>'

export function parseReleaseAnimeCatalogueCommandArguments(
  argumentsToParse: readonly string[],
): ParsedReleaseAnimeCatalogueCommand {
  const [mode, ...rest] = argumentsToParse
  if (mode === 'check' || mode === 'plan' || mode === 'rehearse') {
    if (rest.length === 0) return { mode }
    throw new ReleaseAnimeCatalogueLoaderError(releaseUsage)
  }
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

export function assertReleaseTarget(
  mode: Exclude<ReleaseAnimeCatalogueCommandMode, 'check'>,
  databaseName: string | undefined,
  expectedProductionName?: string,
): void {
  if (mode === 'plan' || mode === 'rehearse') {
    if (databaseName !== 'zedarchive_release_rehearsal') {
      throw new ReleaseAnimeCatalogueLoaderError(
        'Release plan and rehearsal require the exact disposable rehearsal target.',
      )
    }
    return
  }
  if (
    expectedProductionName === undefined ||
    databaseName !== expectedProductionName ||
    /(?:^|_)(?:dev|test|rehearsal)(?:_|$)/.test(databaseName ?? '')
  ) {
    throw new ReleaseAnimeCatalogueLoaderError(
      'Release apply target is not the configured production target.',
    )
  }
}
