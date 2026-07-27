import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { animeCatalogueStateSchema } from '@/features/anime/catalogue/anime-catalogue-state'
import {
  animeCatalogueItemIdSchema,
  animeCatalogueItemSchema,
  animeFormatValues,
  animeMaturityValues,
  animeReleaseStatusValues,
} from '@/features/anime/domain/anime-catalogue-item'
import { wikidataQidSchema } from '@/integrations/wikidata/wikidata-entity'

export const animeReleaseName = 'anime-v1'
export const animeReleaseVersion = 1
export const animeReleaseItemCount = 500
export const animeReleaseBatchCount = 20
export const animeReleaseBatchSize = 25

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const releaseSourceSchema = z.strictObject({
  sourceKey: z.literal('wikidata'),
  sourceItemId: wikidataQidSchema,
})

const canonicalReleaseItemIdSchema = animeCatalogueItemIdSchema.refine(
  (value) => value === value.toLowerCase(),
  'Release catalogue UUIDs must use canonical lowercase text',
)

export const animeReleaseItemSchema = animeCatalogueItemSchema.extend({
  id: canonicalReleaseItemIdSchema,
  catalogueState: animeCatalogueStateSchema,
  sources: z.array(releaseSourceSchema).length(1),
})

export type AnimeReleaseItem = z.infer<typeof animeReleaseItemSchema>

export const animeReleaseCorpusSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-release-corpus'),
  version: z.literal(animeReleaseVersion),
  release: z.literal(animeReleaseVersion),
  items: z.array(animeReleaseItemSchema).length(animeReleaseItemCount),
})

export type AnimeReleaseCorpus = z.infer<typeof animeReleaseCorpusSchema>

const releaseManifestCandidateSchema = z.strictObject({
  catalogueItemId: canonicalReleaseItemIdSchema,
  sourceItemId: wikidataQidSchema,
  // This is an acquisition drift signal, not a required release title: the
  // approved corpus deliberately includes records without an English title.
  expectedEnglishLabel: z.string().trim().min(1).nullable(),
  intent: z.enum(['create', 'link-existing']),
  catalogueState: animeCatalogueStateSchema,
  overrides: z.strictObject({
    romajiTitle: z.string().trim().min(1).optional(),
    format: animeReleaseItemSchema.shape.format.optional(),
    releaseYear: z.number().int().min(1).max(9999).nullable().optional(),
    episodeCount: z.number().int().positive().nullable().optional(),
    releaseStatus: animeReleaseItemSchema.shape.releaseStatus.optional(),
    maturity: animeReleaseItemSchema.shape.maturity.optional(),
    excludedAlternativeTitles: z.array(z.string().trim().min(1)).optional(),
  }),
})

export const animeReleaseManifestSchema = z
  .strictObject({
    version: z.literal(animeReleaseVersion),
    sourceKey: z.literal('wikidata'),
    release: z.literal(animeReleaseName),
    batch: z.number().int().min(1).max(animeReleaseBatchCount),
    candidates: z
      .array(releaseManifestCandidateSchema)
      .length(animeReleaseBatchSize),
  })
  .superRefine(({ candidates }, context) => {
    const ids = new Set<string>()
    const qids = new Set<string>()

    candidates.forEach((candidate, index) => {
      if (ids.has(candidate.catalogueItemId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'catalogueItemId'],
          message: 'Catalogue item IDs must be unique within a release batch',
        })
      }
      if (qids.has(candidate.sourceItemId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'sourceItemId'],
          message: 'Wikidata QIDs must be unique within a release batch',
        })
      }
      ids.add(candidate.catalogueItemId)
      qids.add(candidate.sourceItemId)
    })
  })

export type AnimeReleaseManifest = z.infer<typeof animeReleaseManifestSchema>

const classificationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .superRefine((value, context) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Expected a canonical calendar date',
      })
    }
  })

const maturityEvidenceBaseSchema = z.strictObject({
  issuer: z.enum(['bbfc', 'australian-classification', 'eirin', 'ifco']),
  territory: z.enum(['GB', 'AU', 'JP', 'IE']),
  ratingCode: z.string(),
  mappedMaturity: z.enum(['safe', 'sensitive', 'adult']),
  scope: z.enum(['exact-work', 'complete-episode-set']),
  coveredEpisodeCount: z.number().int().positive().nullable(),
  evidenceUrl: z.string(),
  classificationDate: classificationDateSchema.nullable(),
  acquisitionReview: z.literal('approved'),
  independentReview: z.literal('approved'),
})

const maturityEvidenceMapping = {
  bbfc: {
    territory: 'GB',
    hostnames: ['www.bbfc.co.uk', 'bbfc.co.uk'],
    codes: {
      U: 'safe',
      PG: 'safe',
      '12A': 'sensitive',
      '12': 'sensitive',
      '15': 'sensitive',
      '18': 'adult',
      R18: 'adult',
    },
  },
  'australian-classification': {
    territory: 'AU',
    hostnames: ['www.classification.gov.au', 'classification.gov.au'],
    codes: {
      G: 'safe',
      PG: 'safe',
      M: 'sensitive',
      'MA15+': 'sensitive',
      'R18+': 'adult',
      'X18+': 'adult',
    },
  },
  eirin: {
    territory: 'JP',
    hostnames: ['www.eirin.jp', 'eirin.jp'],
    codes: {
      G: 'safe',
      PG12: 'sensitive',
      'R15+': 'sensitive',
      'R18+': 'adult',
    },
  },
  ifco: {
    territory: 'IE',
    hostnames: ['www.ifco.ie'],
    codes: {
      '18': 'adult',
    },
  },
} as const

export const animeReleaseMaturityEvidenceSchema =
  maturityEvidenceBaseSchema.superRefine((evidence, context) => {
    const mapping = maturityEvidenceMapping[evidence.issuer]
    const expectedMaturity =
      mapping.codes[evidence.ratingCode as keyof typeof mapping.codes]
    if (
      evidence.territory !== mapping.territory ||
      expectedMaturity === undefined ||
      evidence.mappedMaturity !== expectedMaturity
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Maturity evidence issuer, territory, code, and mapped maturity must agree',
      })
    }
    if (
      (evidence.scope === 'exact-work' &&
        evidence.coveredEpisodeCount !== null) ||
      (evidence.scope === 'complete-episode-set' &&
        evidence.coveredEpisodeCount === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Maturity evidence scope and covered episode count must agree',
      })
    }
    try {
      const url = new URL(evidence.evidenceUrl)
      const rawAuthority =
        /^https:\/\/([^/]+)/.exec(evidence.evidenceUrl)?.[1] ?? ''
      if (
        url.protocol !== 'https:' ||
        !mapping.hostnames.includes(url.hostname as never) ||
        rawAuthority.includes(':') ||
        url.username !== '' ||
        url.password !== '' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.pathname === '/' ||
        // Decision 036 established no canonical exact-record URL shape that
        // version 1 can enforce for either issuer. Recognising their rating
        // mappings must not turn an arbitrary official-site path into evidence.
        evidence.issuer === 'australian-classification' ||
        evidence.issuer === 'eirin' ||
        (evidence.issuer === 'bbfc' &&
          !/^\/release\/[^/]+$/.test(url.pathname)) ||
        (evidence.issuer === 'ifco' &&
          (url.origin !== 'https://www.ifco.ie' ||
            !/^\/en\/ifco\/pages\/[A-F0-9]{16}$/.test(url.pathname))) ||
        url.href !== evidence.evidenceUrl
      ) {
        throw new Error('invalid')
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message:
          'Maturity evidence URL must be a canonical allowlisted HTTPS record URL',
      })
    }
  })

export type AnimeReleaseMaturityEvidence = z.infer<
  typeof animeReleaseMaturityEvidenceSchema
>

const reviewOverrideCommonShape = {
  rationale: z.string().trim().min(1).max(280),
  predecessorNormalizedItemSha256: sha256Schema.optional(),
  normalizedItemSha256: sha256Schema,
}
const reviewTitleValueSchema = z.string().trim().min(1).max(512)
const reviewQidListSchema = z.array(wikidataQidSchema).min(1).max(8)
const reviewReleaseYearValueSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .nullable()
const reviewEpisodeCountValueSchema = z.number().int().positive().nullable()
const reviewStatusTokenListSchema = z
  .array(z.string().trim().min(1).max(64))
  .min(1)
  .max(64)
const reviewTitleListSchema = z.array(reviewTitleValueSchema).min(1).max(32)

// Each override preserves only the projected values needed to audit that
// category. This cannot become a generic container for raw provider prose,
// statements, responses, or unbounded arrays.
const reviewOverrideSchema = z.discriminatedUnion('category', [
  z.strictObject({
    category: z.literal('romaji_title_missing'),
    providerValue: z.null(),
    selectedValue: reviewTitleValueSchema,
    ...reviewOverrideCommonShape,
  }),
  z.strictObject({
    category: z.literal('format_identity_correction'),
    providerValue: reviewQidListSchema,
    selectedValue: z.enum(animeFormatValues),
    ...reviewOverrideCommonShape,
  }),
  z.strictObject({
    category: z.literal('release_year_identity_correction'),
    providerValue: z.array(reviewReleaseYearValueSchema).min(1).max(8),
    selectedValue: reviewReleaseYearValueSchema,
    ...reviewOverrideCommonShape,
  }),
  z.strictObject({
    category: z.literal('episode_scope_correction'),
    providerValue: z.array(reviewEpisodeCountValueSchema).min(1).max(8),
    selectedValue: reviewEpisodeCountValueSchema,
    ...reviewOverrideCommonShape,
  }),
  z.strictObject({
    category: z.literal('release_status_correction'),
    providerValue: reviewStatusTokenListSchema,
    selectedValue: z.enum(animeReleaseStatusValues),
    ...reviewOverrideCommonShape,
  }),
  z.strictObject({
    category: z.literal('maturity_curation'),
    providerValue: z.null(),
    selectedValue: z.enum(['safe', 'sensitive', 'adult']),
    ...reviewOverrideCommonShape,
  }),
  z.strictObject({
    category: z.literal('alternative_title_exclusion'),
    providerValue: reviewTitleListSchema,
    selectedValue: z.tuple([]),
    ...reviewOverrideCommonShape,
  }),
])

type ReviewOverride = z.infer<typeof reviewOverrideSchema>
export type AnimeReleaseOverrideCategory = ReviewOverride['category']

const reviewItemSchema = z.strictObject({
  catalogueItemId: canonicalReleaseItemIdSchema,
  sourceItemId: wikidataQidSchema,
  normalizedItemSha256: sha256Schema,
  outcome: z.literal('approved'),
  acquisitionReview: z.literal('approved'),
  independentReview: z.literal('approved'),
  maturityClassification: z.literal('zedarchive-curation'),
  maturityEvidence: z.array(animeReleaseMaturityEvidenceSchema),
  overrides: z.array(reviewOverrideSchema),
})

export const animeReleaseReviewLedgerSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-release-review'),
  version: z.literal(animeReleaseVersion),
  release: z.literal(animeReleaseVersion),
  items: z.array(reviewItemSchema).length(animeReleaseItemCount),
})

export type AnimeReleaseReviewLedger = z.infer<
  typeof animeReleaseReviewLedgerSchema
>

export type AnimeReleaseCoverage = {
  items: number
  states: Record<'published' | 'draft' | 'hidden', number>
  formats: Record<(typeof animeFormatValues)[number], number>
  statuses: Record<(typeof animeReleaseStatusValues)[number], number>
  maturities: Record<(typeof animeMaturityValues)[number], number>
  releaseYears: Record<
    'before1980' | '1980s' | '1990s' | '2000s' | '2010s' | '2020s' | 'unknown',
    number
  >
  sparse: Record<
    | 'missingEnglish'
    | 'missingRomaji'
    | 'missingOriginal'
    | 'withAlternatives'
    | 'unknownEpisodes'
    | 'multipleSparse',
    number
  >
}

const coverageSchema = z.strictObject({
  items: z.number().int().nonnegative(),
  states: z.record(
    z.enum(['published', 'draft', 'hidden']),
    z.number().int().nonnegative(),
  ),
  formats: z.record(z.enum(animeFormatValues), z.number().int().nonnegative()),
  statuses: z.record(
    z.enum(animeReleaseStatusValues),
    z.number().int().nonnegative(),
  ),
  maturities: z.record(
    z.enum(animeMaturityValues),
    z.number().int().nonnegative(),
  ),
  releaseYears: z.record(
    z.enum([
      'before1980',
      '1980s',
      '1990s',
      '2000s',
      '2010s',
      '2020s',
      'unknown',
    ]),
    z.number().int().nonnegative(),
  ),
  sparse: z.record(
    z.enum([
      'missingEnglish',
      'missingRomaji',
      'missingOriginal',
      'withAlternatives',
      'unknownEpisodes',
      'multipleSparse',
    ]),
    z.number().int().nonnegative(),
  ),
})

export const animeReleaseIndexSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-release-index'),
  version: z.literal(animeReleaseVersion),
  release: z.literal(animeReleaseVersion),
  corpusSha256: sha256Schema,
  predecessorCorpusSha256: z.null(),
  coverage: coverageSchema,
  manifests: z
    .array(
      z.strictObject({
        path: z
          .string()
          .regex(
            /^data\/imports\/releases\/anime-v1\/batch-(0[1-9]|1[0-9]|20)\.json$/,
          ),
        sha256: sha256Schema,
      }),
    )
    .length(animeReleaseBatchCount),
  reviewLedgerSha256: sha256Schema,
  semanticSummarySha256: sha256Schema,
})

export type AnimeReleaseIndex = z.infer<typeof animeReleaseIndexSchema>

export type AnimeReleaseBundle = Readonly<{
  corpus: AnimeReleaseCorpus
  manifests: readonly AnimeReleaseManifest[]
  reviewLedger: AnimeReleaseReviewLedger
  index: AnimeReleaseIndex
}>

function emptyCounts<const Key extends string>(
  keys: readonly Key[],
): Record<Key, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function canonicalJsonBytes(value: unknown): string {
  return `${canonicalJson(value)}\n`
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')
}

export function normalizedAnimeReleaseItemSha256(
  item: AnimeReleaseItem,
): string {
  return sha256Canonical(item)
}

export function createAnimeReleaseCoverage(
  items: readonly AnimeReleaseItem[],
): AnimeReleaseCoverage {
  const coverage: AnimeReleaseCoverage = {
    items: items.length,
    states: emptyCounts(['published', 'draft', 'hidden']),
    formats: emptyCounts(animeFormatValues),
    statuses: emptyCounts(animeReleaseStatusValues),
    maturities: emptyCounts(animeMaturityValues),
    releaseYears: emptyCounts([
      'before1980',
      '1980s',
      '1990s',
      '2000s',
      '2010s',
      '2020s',
      'unknown',
    ]),
    sparse: emptyCounts([
      'missingEnglish',
      'missingRomaji',
      'missingOriginal',
      'withAlternatives',
      'unknownEpisodes',
      'multipleSparse',
    ]),
  }

  for (const item of items) {
    coverage.states[item.catalogueState] += 1
    coverage.formats[item.format] += 1
    coverage.statuses[item.releaseStatus] += 1
    coverage.maturities[item.maturity] += 1
    if (item.releaseYear !== null && item.releaseYear > 2026) {
      throw new Error('Release v1 cannot include a release year after 2026')
    }
    const yearBucket =
      item.releaseYear === null
        ? 'unknown'
        : item.releaseYear < 1980
          ? 'before1980'
          : item.releaseYear < 1990
            ? '1980s'
            : item.releaseYear < 2000
              ? '1990s'
              : item.releaseYear < 2010
                ? '2000s'
                : item.releaseYear < 2020
                  ? '2010s'
                  : '2020s'
    coverage.releaseYears[yearBucket] += 1
    const sparseFields = [
      item.titles.english,
      item.titles.romaji,
      item.titles.original,
      item.episodeCount,
    ].filter((value) => value === null).length
    if (item.titles.english === null) coverage.sparse.missingEnglish += 1
    if (item.titles.romaji === null) coverage.sparse.missingRomaji += 1
    if (item.titles.original === null) coverage.sparse.missingOriginal += 1
    if (item.titles.alternatives.length > 0)
      coverage.sparse.withAlternatives += 1
    if (item.episodeCount === null) coverage.sparse.unknownEpisodes += 1
    if (sparseFields >= 2) coverage.sparse.multipleSparse += 1
  }
  return coverage
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (canonicalJson(actual) !== canonicalJson(expected))
    throw new Error(message)
}

const releaseStatusFreeze = 20260727
const statusEvidenceProperties = ['P577', 'P580', 'P582'] as const
type StatusEvidenceProperty = (typeof statusEvidenceProperties)[number]
type StatusEvidenceDate = {
  lower: number
  upper: number
  token: string
}

function daysInMonth(year: number, month: number): number {
  if ([4, 6, 9, 11].includes(month)) return 30
  if (month !== 2) return 31
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? 29 : 28
}

function calendarDayIsValid(year: number, month: number, day: number): boolean {
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  )
}

function parseStatusEvidenceDate(
  time: string,
  precision: number,
  token: string,
): StatusEvidenceDate | null {
  const match = /^\+([0-9]{4})-([0-9]{2})-([0-9]{2})T00:00:00Z$/.exec(time)
  if (match === null || ![9, 10, 11].includes(precision)) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || year > 9999) return null

  if (precision === 9) {
    if (!((month === 0 && day === 0) || calendarDayIsValid(year, month, day)))
      return null
    return { lower: year * 10000 + 101, upper: year * 10000 + 1231, token }
  }
  if (month < 1 || month > 12) return null
  if (precision === 10) {
    if (day !== 0 && !calendarDayIsValid(year, month, day)) return null
    const finalDay = daysInMonth(year, month)
    return {
      lower: year * 10000 + month * 100 + 1,
      upper: year * 10000 + month * 100 + finalDay,
      token,
    }
  }
  if (!calendarDayIsValid(year, month, day)) return null
  const value = year * 10000 + month * 100 + day
  return { lower: value, upper: value, token }
}

function parseReleaseStatusEvidence(
  providerValue: ReviewOverride['providerValue'],
): Record<StatusEvidenceProperty, StatusEvidenceDate[]> {
  const parsedTokens = z.array(z.string()).safeParse(providerValue)
  if (!parsedTokens.success)
    throw new Error('Release status evidence must use canonical date tokens')
  const providerTokens = parsedTokens.data

  const evidence: Record<StatusEvidenceProperty, StatusEvidenceDate[]> = {
    P577: [],
    P580: [],
    P582: [],
  }
  const canonicalTokens: string[] = []

  for (const property of statusEvidenceProperties) {
    const prefix = `${property}|`
    const tokens = providerTokens.filter((token) => token.startsWith(prefix))
    if (tokens.length === 0)
      throw new Error(
        `Release status evidence must represent ${property} explicitly`,
      )
    if (tokens.includes(`${property}|none`)) {
      if (tokens.length !== 1)
        throw new Error(
          `Release status evidence cannot mix ${property} dates with none`,
        )
      canonicalTokens.push(`${property}|none`)
      continue
    }

    for (const token of tokens) {
      const match =
        /^(P577|P580|P582)\|(preferred|normal)\|(\+[0-9]{4}-[0-9]{2}-[0-9]{2}T00:00:00Z)\|(9|10|11)$/.exec(
          token,
        )
      if (match === null || match[1] !== property)
        throw new Error(
          'Release status evidence contains an invalid date token',
        )
      const parsed = parseStatusEvidenceDate(match[3]!, Number(match[4]), token)
      if (parsed === null)
        throw new Error('Release status evidence contains an unusable date')
      evidence[property].push(parsed)
    }
    canonicalTokens.push(...evidence[property].map(({ token }) => token).sort())
  }

  if (
    new Set(providerTokens).size !== providerTokens.length ||
    canonicalJson(providerTokens) !== canonicalJson(canonicalTokens)
  )
    throw new Error(
      'Release status evidence tokens must be unique and canonically ordered',
    )

  return evidence
}

function assertReleaseStatusEvidence(
  item: AnimeReleaseItem,
  manifestStatus: AnimeReleaseItem['releaseStatus'] | undefined,
  reviewOverride: ReviewOverride | undefined,
): void {
  if (item.releaseStatus === 'unknown') {
    if (manifestStatus !== undefined || reviewOverride !== undefined)
      throw new Error(
        `Unknown release status must not have an evidence override for catalogue item ${item.id}`,
      )
    return
  }
  if (
    item.releaseStatus === 'airing' ||
    manifestStatus !== item.releaseStatus ||
    reviewOverride?.selectedValue !== item.releaseStatus
  )
    throw new Error(
      `Release status evidence does not match catalogue item ${item.id}`,
    )

  let evidence: ReturnType<typeof parseReleaseStatusEvidence>
  try {
    evidence = parseReleaseStatusEvidence(reviewOverride.providerValue)
  } catch {
    throw new Error(
      `Release status evidence is invalid for catalogue item ${item.id}`,
    )
  }
  const publicationOrStart = [...evidence.P577, ...evidence.P580]
  const everyDate = [...publicationOrStart, ...evidence.P582]

  if (item.releaseStatus === 'upcoming') {
    if (
      publicationOrStart.length === 0 ||
      evidence.P582.length !== 0 ||
      publicationOrStart.some(({ lower }) => lower <= releaseStatusFreeze)
    )
      throw new Error(
        `Upcoming release status evidence is conflicting or insufficient for catalogue item ${item.id}`,
      )
    return
  }

  const boundedEnd =
    evidence.P582.length > 0 &&
    evidence.P582.every(({ upper }) => upper <= releaseStatusFreeze)
  const exactMoviePublication =
    item.format === 'movie' &&
    evidence.P577.length > 0 &&
    evidence.P577.every(({ upper }) => upper <= releaseStatusFreeze)
  if (
    (!boundedEnd && !exactMoviePublication) ||
    everyDate.some(({ upper }) => upper > releaseStatusFreeze) ||
    (boundedEnd &&
      evidence.P580.some(
        ({ lower }) =>
          lower > Math.max(...evidence.P582.map(({ upper }) => upper)),
      ))
  )
    throw new Error(
      `Finished release status evidence is conflicting or insufficient for catalogue item ${item.id}`,
    )
}

function assertReviewOverrideValueRelationship(
  override: ReviewOverride,
  catalogueItemId: string,
): void {
  if (
    override.category === 'release_year_identity_correction' &&
    !override.providerValue.includes(override.selectedValue)
  )
    throw new Error(
      `Release year override must select a projected value for catalogue item ${catalogueItemId}`,
    )
  if (
    override.category === 'episode_scope_correction' &&
    !override.providerValue.includes(override.selectedValue)
  )
    throw new Error(
      `Episode override must select a projected value for catalogue item ${catalogueItemId}`,
    )
}

function assertExactQuota(
  coverage: AnimeReleaseCoverage,
  items: readonly AnimeReleaseItem[],
): void {
  assertEqual(
    coverage.states,
    { published: 460, draft: 25, hidden: 15 },
    'Release state quota is invalid',
  )
  assertEqual(
    coverage.formats,
    { tv: 250, movie: 160, ova: 35, ona: 35, special: 20, unknown: 0 },
    'Release format quota is invalid',
  )
  assertEqual(
    coverage.statuses,
    { finished: 400, airing: 0, upcoming: 25, unknown: 75 },
    'Release status quota is invalid',
  )
  if (
    coverage.maturities.adult !== 14 ||
    coverage.maturities.safe < 25 ||
    coverage.maturities.sensitive < 50
  )
    throw new Error('Release maturity coverage is invalid')
  assertEqual(
    coverage.releaseYears,
    {
      before1980: 20,
      '1980s': 55,
      '1990s': 75,
      '2000s': 100,
      '2010s': 130,
      '2020s': 110,
      unknown: 10,
    },
    'Release year quota is invalid',
  )
  if (
    coverage.sparse.missingEnglish < 25 ||
    coverage.sparse.missingRomaji < 25 ||
    coverage.sparse.missingOriginal < 25 ||
    coverage.sparse.withAlternatives < 150 ||
    coverage.sparse.unknownEpisodes < 100 ||
    coverage.sparse.multipleSparse < 20
  )
    throw new Error('Release sparse-field floor is invalid')
  const adultPublished = items.filter(
    (item) => item.maturity === 'adult' && item.catalogueState === 'published',
  ).length
  const nonAdultPublished = items.filter(
    (item) => item.maturity !== 'adult' && item.catalogueState === 'published',
  ).length
  if (adultPublished !== 14 || nonAdultPublished !== 446)
    throw new Error('Release adult publication quota is invalid')
  if (
    items.some(
      (item) =>
        item.maturity === 'adult' && item.catalogueState !== 'published',
    )
  )
    throw new Error('Adult release records must be published')
}

function parseJson(contents: string, label: string): unknown {
  try {
    return JSON.parse(contents) as unknown
  } catch {
    throw new Error(`${label} contains malformed JSON`)
  }
}

export function validateAnimeReleaseBundle(
  bundle: AnimeReleaseBundle,
): AnimeReleaseBundle {
  const corpus = animeReleaseCorpusSchema.parse(bundle.corpus)
  const manifests = bundle.manifests.map((manifest) =>
    animeReleaseManifestSchema.parse(manifest),
  )
  const reviewLedger = animeReleaseReviewLedgerSchema.parse(bundle.reviewLedger)
  const index = animeReleaseIndexSchema.parse(bundle.index)
  if (manifests.length !== animeReleaseBatchCount)
    throw new Error('Release requires exactly 20 manifest batches')
  const expectedBatches = Array.from(
    { length: animeReleaseBatchCount },
    (_, index) => index + 1,
  )
  if (
    canonicalJson(manifests.map(({ batch }) => batch)) !==
    canonicalJson(expectedBatches)
  )
    throw new Error(
      'Release manifest order must match batch positions 1 through 20',
    )
  const itemById = new Map(corpus.items.map((item) => [item.id, item]))
  if (itemById.size !== corpus.items.length)
    throw new Error('Release catalogue UUIDs must be unique')
  const itemQids = corpus.items.map((item) => item.sources[0]!.sourceItemId)
  if (new Set(itemQids).size !== itemQids.length)
    throw new Error('Release Wikidata QIDs must be unique')
  const manifestCandidates = manifests.flatMap(
    (manifest) => manifest.candidates,
  )
  const candidateIds = manifestCandidates.map(
    ({ catalogueItemId }) => catalogueItemId,
  )
  const candidateQids = manifestCandidates.map(
    ({ sourceItemId }) => sourceItemId,
  )
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    new Set(candidateQids).size !== candidateQids.length
  )
    throw new Error(
      'Release manifests duplicate a catalogue UUID or Wikidata QID',
    )
  if (
    candidateIds.length !== animeReleaseItemCount ||
    canonicalJson(candidateIds) !==
      canonicalJson(corpus.items.map(({ id }) => id))
  )
    throw new Error(
      'Release corpus order must match the ordered manifest contributions',
    )
  for (const candidate of manifestCandidates) {
    const item = itemById.get(candidate.catalogueItemId)
    if (
      item?.sources[0]?.sourceItemId !== candidate.sourceItemId ||
      item.catalogueState !== candidate.catalogueState
    )
      throw new Error(
        `Release manifest does not match catalogue item ${candidate.catalogueItemId}`,
      )
  }
  if (
    canonicalJson(
      reviewLedger.items.map(({ catalogueItemId }) => catalogueItemId),
    ) !== canonicalJson(corpus.items.map(({ id }) => id))
  )
    throw new Error('Release review ledger order must match the corpus')
  const reviewById = new Map(
    reviewLedger.items.map((item) => [item.catalogueItemId, item]),
  )
  const maturityEvidenceUrls = new Set<string>()
  if (
    reviewById.size !== reviewLedger.items.length ||
    reviewById.size !== itemById.size
  )
    throw new Error(
      'Release review ledger must contain every catalogue UUID exactly once',
    )
  for (const item of corpus.items) {
    const review = reviewById.get(item.id)
    if (
      review?.sourceItemId !== item.sources[0]?.sourceItemId ||
      review.normalizedItemSha256 !== normalizedAnimeReleaseItemSha256(item)
    )
      throw new Error(
        `Release review ledger does not match catalogue item ${item.id}`,
      )
    if (
      review.overrides.some(
        (override) =>
          override.normalizedItemSha256 !== review.normalizedItemSha256,
      )
    )
      throw new Error(
        `Release review override hash does not match catalogue item ${item.id}`,
      )
    const candidate = manifestCandidates.find(
      ({ catalogueItemId }) => catalogueItemId === item.id,
    )
    const maturityEvidence = review.maturityEvidence
    const mappedMaturitiesByIssuer = new Map<string, Set<string>>()
    for (const evidence of maturityEvidence) {
      if (maturityEvidenceUrls.has(evidence.evidenceUrl))
        throw new Error(
          `Release maturity evidence URL is duplicated across the review ledger for catalogue item ${item.id}`,
        )
      maturityEvidenceUrls.add(evidence.evidenceUrl)
      if (
        evidence.scope === 'complete-episode-set' &&
        item.episodeCount !== null &&
        evidence.coveredEpisodeCount !== item.episodeCount
      )
        throw new Error(
          `Release maturity episode coverage does not match catalogue item ${item.id}`,
        )
      const mappedMaturities =
        mappedMaturitiesByIssuer.get(evidence.issuer) ?? new Set<string>()
      mappedMaturities.add(evidence.mappedMaturity)
      mappedMaturitiesByIssuer.set(evidence.issuer, mappedMaturities)
    }
    if (
      [...mappedMaturitiesByIssuer.values()].some(
        (mappedMaturities) => mappedMaturities.size > 1,
      )
    )
      throw new Error(
        `Release maturity evidence contains a same-issuer contradiction for catalogue item ${item.id}`,
      )
    const evidenceMaturities = maturityEvidence.map(
      ({ mappedMaturity }) => mappedMaturity,
    )
    const evidenceSeverity = { safe: 1, sensitive: 2, adult: 3 } as const
    const evidenceMaturity = evidenceMaturities.reduce<
      'safe' | 'sensitive' | 'adult' | undefined
    >(
      (mostRestrictive, maturity) =>
        mostRestrictive === undefined ||
        evidenceSeverity[maturity] > evidenceSeverity[mostRestrictive]
          ? maturity
          : mostRestrictive,
      undefined,
    )
    if (
      new Set(maturityEvidence.map(({ evidenceUrl }) => evidenceUrl)).size !==
      maturityEvidence.length
    )
      throw new Error(
        `Release maturity evidence URLs must be unique for catalogue item ${item.id}`,
      )
    if (
      (item.maturity === 'unknown' && maturityEvidence.length !== 0) ||
      (item.maturity !== 'unknown' &&
        (maturityEvidence.length === 0 || evidenceMaturity !== item.maturity))
    )
      throw new Error(
        `Release maturity evidence does not match catalogue item ${item.id}`,
      )
    if (
      (item.maturity === 'unknown' &&
        (candidate?.overrides.maturity !== undefined ||
          review.overrides.some(
            ({ category }) => category === 'maturity_curation',
          ))) ||
      (item.maturity !== 'unknown' &&
        (candidate?.overrides.maturity !== item.maturity ||
          !review.overrides.some(
            ({ category, selectedValue }) =>
              category === 'maturity_curation' &&
              selectedValue === item.maturity,
          )))
    )
      throw new Error(
        `Release maturity override does not match evidence for catalogue item ${item.id}`,
      )
    const expectedOverrideCategories = [
      candidate?.overrides.romajiTitle === undefined
        ? undefined
        : 'romaji_title_missing',
      candidate?.overrides.format === undefined
        ? undefined
        : 'format_identity_correction',
      candidate?.overrides.releaseYear === undefined
        ? undefined
        : 'release_year_identity_correction',
      candidate?.overrides.episodeCount === undefined
        ? undefined
        : 'episode_scope_correction',
      candidate?.overrides.releaseStatus === undefined
        ? undefined
        : 'release_status_correction',
      candidate?.overrides.maturity === undefined
        ? undefined
        : 'maturity_curation',
      candidate?.overrides.excludedAlternativeTitles === undefined
        ? undefined
        : 'alternative_title_exclusion',
    ].filter(
      (category): category is AnimeReleaseOverrideCategory =>
        category !== undefined,
    )
    const reviewOverrideCategories = review.overrides.map(
      ({ category }) => category,
    )
    review.overrides.forEach((override) =>
      assertReviewOverrideValueRelationship(override, item.id),
    )
    if (
      new Set(reviewOverrideCategories).size !==
        reviewOverrideCategories.length ||
      canonicalJson([...reviewOverrideCategories].sort()) !==
        canonicalJson([...expectedOverrideCategories].sort())
    )
      throw new Error(
        `Release review overrides do not match manifest overrides for catalogue item ${item.id}`,
      )
    const expectedOverrideValues = new Map<
      AnimeReleaseOverrideCategory,
      string | number | null | string[]
    >()
    const addExpectedOverride = (
      category: AnimeReleaseOverrideCategory,
      value: string | number | null | string[] | undefined,
    ) => {
      if (value !== undefined) expectedOverrideValues.set(category, value)
    }
    addExpectedOverride(
      'romaji_title_missing',
      candidate?.overrides.romajiTitle,
    )
    addExpectedOverride(
      'format_identity_correction',
      candidate?.overrides.format,
    )
    addExpectedOverride(
      'release_year_identity_correction',
      candidate?.overrides.releaseYear,
    )
    addExpectedOverride(
      'episode_scope_correction',
      candidate?.overrides.episodeCount,
    )
    addExpectedOverride(
      'release_status_correction',
      candidate?.overrides.releaseStatus,
    )
    addExpectedOverride('maturity_curation', candidate?.overrides.maturity)
    addExpectedOverride(
      'alternative_title_exclusion',
      candidate?.overrides.excludedAlternativeTitles,
    )
    for (const [category, expectedValue] of expectedOverrideValues) {
      const override = review.overrides.find(
        (candidateOverride) => candidateOverride.category === category,
      )
      const matches =
        override !== undefined &&
        (category === 'alternative_title_exclusion'
          ? canonicalJson(override.providerValue) ===
              canonicalJson(expectedValue) &&
            Array.isArray(override.selectedValue) &&
            override.selectedValue.length === 0
          : canonicalJson(override.selectedValue) ===
            canonicalJson(expectedValue))
      if (!matches)
        throw new Error(
          `Release review override values do not match manifest overrides for catalogue item ${item.id}`,
        )
    }
    assertReleaseStatusEvidence(
      item,
      candidate?.overrides.releaseStatus,
      review.overrides.find(
        ({ category }) => category === 'release_status_correction',
      ),
    )
  }
  const coverage = createAnimeReleaseCoverage(corpus.items)
  assertExactQuota(coverage, corpus.items)
  assertEqual(
    index.coverage,
    coverage,
    'Release index coverage does not match corpus',
  )
  if (index.corpusSha256 !== sha256Canonical(corpus))
    throw new Error('Release index corpus hash does not match corpus')
  if (index.reviewLedgerSha256 !== sha256Canonical(reviewLedger))
    throw new Error('Release index review ledger hash does not match ledger')
  const expectedManifestPaths = expectedBatches.map(
    (batch) =>
      `data/imports/releases/anime-v1/batch-${String(batch).padStart(2, '0')}.json`,
  )
  if (
    canonicalJson(index.manifests.map(({ path }) => path)) !==
    canonicalJson(expectedManifestPaths)
  )
    throw new Error('Release index manifest paths are not canonical')
  for (const [position, manifest] of manifests
    .sort((a, b) => a.batch - b.batch)
    .entries()) {
    if (index.manifests[position]?.sha256 !== sha256Canonical(manifest))
      throw new Error(
        `Release index manifest hash does not match batch ${manifest.batch}`,
      )
  }
  const initialSemanticSummary = {
    added: corpus.items.map((item) => ({
      catalogueItemId: item.id,
      sourceItemId: item.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
    })),
    parentChanged: [],
    alternativesChanged: [],
    sourceChanged: [],
    stateChanged: [],
  }
  if (index.semanticSummarySha256 !== sha256Canonical(initialSemanticSummary))
    throw new Error(
      'Release index semantic summary hash does not match the initial release',
    )
  return { corpus, manifests, reviewLedger, index }
}

export async function loadAnimeReleaseBundle(
  paths: Readonly<{
    corpus: string
    manifests: readonly string[]
    reviewLedger: string
    index: string
  }>,
): Promise<AnimeReleaseBundle> {
  const [corpusContents, manifestContents, reviewContents, indexContents] =
    await Promise.all([
      readFile(paths.corpus, 'utf8'),
      Promise.all(paths.manifests.map((path) => readFile(path, 'utf8'))),
      readFile(paths.reviewLedger, 'utf8'),
      readFile(paths.index, 'utf8'),
    ])
  return validateAnimeReleaseBundle({
    corpus: parseJson(corpusContents, 'Release corpus'),
    manifests: manifestContents.map((contents, index) =>
      parseJson(contents, `Release manifest ${index + 1}`),
    ),
    reviewLedger: parseJson(reviewContents, 'Release review ledger'),
    index: parseJson(indexContents, 'Release index'),
  } as AnimeReleaseBundle)
}
