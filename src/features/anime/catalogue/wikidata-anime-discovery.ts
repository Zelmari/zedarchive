import { createHash } from 'node:crypto'
import { z } from '@/config/zod'
import { wikidataQidSchema } from '@/integrations/wikidata/wikidata-entity'

export const discoveryUserAgent =
  'zedarchive-catalogue-discovery/2.0 (+https://github.com/Zelmari/zedarchive)'
export const discoveryWindow = {
  start: '2025-07-01T00:00:00Z',
  end: '2026-06-30T23:59:59Z',
  months: [
    '2025-07',
    '2025-08',
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
  ],
} as const

export const discoveryLimits = {
  minimumEligibleQids: 6_000,
  maximumEligibleQids: 9_000,
  maximumQidsPerActionRequest: 25,
  maximumSuccessfulPageviewRequests: 18_000,
  maximumHttpAttempts: 20_000,
  minimumRequestSpacingMilliseconds: 350,
  requestTimeoutMilliseconds: 10_000,
  maximumAttemptsPerRequest: 3,
  maximumRetryDelayMilliseconds: 30_000,
  maximumWallTimeMilliseconds: 16 * 60 * 60 * 1_000,
} as const

export const discoveryTerminalCategories = [
  'wall-time-limit',
  'http-attempt-limit',
  'pageview-limit',
  'concurrency-stop',
  'request-budget-stop',
  'bounded-stop',
  'unexpected-stop',
] as const

export type DiscoveryTerminalCategory =
  (typeof discoveryTerminalCategories)[number]

export const discoveryRunSpecification = {
  version: 'discovery-run.v2',
  limits: discoveryLimits,
  operationalEvidence: {
    progressEveryCompletedHttpAttempts: 500,
    timeHeartbeat: false,
    commonFields: [
      'elapsedMilliseconds',
      'completedHttpAttempts',
      'successfulPageviewRequests',
      'retries',
      'pacingWaits',
      'pacingDelayMilliseconds',
      'maximumObservedConcurrency',
    ],
    terminalOnlyFields: ['terminalCategory'],
    terminalCategories: discoveryTerminalCategories,
  },
} as const

export const discoveryFormatClasses = {
  tv: ['Q63952888', 'Q100269041'],
  movie: ['Q20650540'],
  ova: ['Q220898', 'Q113687694'],
  ona: ['Q113671041'],
  special: ['Q117209498'],
} as const

export type DiscoveryFormat = keyof typeof discoveryFormatClasses

export const discoveryFormatSentinels: Readonly<
  Record<DiscoveryFormat, number>
> = {
  tv: 6_000,
  movie: 1_500,
  ova: 2_000,
  ona: 300,
  special: 200,
}

export const discoveryCoverageFloors = {
  formats: {
    tv: 2_500,
    movie: 850,
    ova: 250,
    ona: 100,
    special: 35,
  },
  eras: {
    'before-1980': 100,
    '1980-1989': 275,
    '1990-1999': 450,
    '2000-2009': 800,
    '2010-2019': 1_200,
    '2020-2026': 1_200,
  },
} as const

export const discoveryReleaseYearProjection = {
  version: 'discovery-release-year.v2',
  publicationProperty: 'P577',
  fallbackProperty: 'P580',
  minimumTimePrecision: 9,
  reduction: 'earliest-usable-year',
  precedence: 'P577-before-P580',
} as const

export const discoveryEraBucketSpecification = {
  version: 'discovery-era-buckets.v1',
  nullYear: 'unknown',
  buckets: [
    { era: 'before-1980', minimumYear: null, maximumYear: 1979 },
    { era: '1980-1989', minimumYear: 1980, maximumYear: 1989 },
    { era: '1990-1999', minimumYear: 1990, maximumYear: 1999 },
    { era: '2000-2009', minimumYear: 2000, maximumYear: 2009 },
    { era: '2010-2019', minimumYear: 2010, maximumYear: 2019 },
    { era: '2020-2026', minimumYear: 2020, maximumYear: 2026 },
    { era: 'after-2026', minimumYear: 2027, maximumYear: null },
  ],
} as const

export const discoveryWdqsQueries: Readonly<Record<DiscoveryFormat, string>> =
  Object.fromEntries(
    (
      Object.entries(discoveryFormatClasses) as [
        DiscoveryFormat,
        readonly string[],
      ][]
    ).map(([format, classes]) => [
      format,
      `SELECT ?item
       (GROUP_CONCAT(DISTINCT STR(?class); separator=",") AS ?classes)
       (MIN(YEAR(?publicationDate)) AS ?publicationYear)
       (MIN(YEAR(?startDate)) AS ?startYear)
WHERE {
  VALUES ?class { ${classes.map((qid) => `wd:${qid}`).join(' ')} }
  ?item p:P31 ?statement.
  ?statement ps:P31 ?class;
             wikibase:rank ?statementRank.
  FILTER(?statementRank != wikibase:DeprecatedRank)
  OPTIONAL {
    ?item p:P577 ?publicationStatement.
    ?publicationStatement psv:P577 ?publicationValue;
                          wikibase:rank ?publicationRank.
    ?publicationValue wikibase:timeValue ?publicationDate;
                      wikibase:timePrecision ?publicationPrecision.
    FILTER(?publicationRank != wikibase:DeprecatedRank)
    FILTER(?publicationPrecision >= ${discoveryReleaseYearProjection.minimumTimePrecision})
  }
  OPTIONAL {
    ?item p:P580 ?startStatement.
    ?startStatement psv:P580 ?startValue;
                    wikibase:rank ?startRank.
    ?startValue wikibase:timeValue ?startDate;
                wikibase:timePrecision ?startPrecision.
    FILTER(?startRank != wikibase:DeprecatedRank)
    FILTER(?startPrecision >= ${discoveryReleaseYearProjection.minimumTimePrecision})
  }
}
GROUP BY ?item
ORDER BY ?item
LIMIT ${discoveryFormatSentinels[format] + 1}`,
    ]),
  ) as Record<DiscoveryFormat, string>

const formatSchema = z.enum(['tv', 'movie', 'ova', 'ona', 'special'])
const eraSchema = z.enum([
  'before-1980',
  '1980-1989',
  '1990-1999',
  '2000-2009',
  '2010-2019',
  '2020-2026',
  'unknown',
  'after-2026',
])
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const classQids = Object.values(discoveryFormatClasses).flat()
const classQidSchema = z.enum(classQids as [string, ...string[]])

export const discoveryRowSchema = z.strictObject({
  qid: wikidataQidSchema,
  classQid: classQidSchema,
  rank: z.enum(['preferred', 'normal', 'deprecated']),
  releaseYear: z.number().int().min(1).max(9999).nullable(),
})
export type DiscoveryRow = z.infer<typeof discoveryRowSchema>

export const eligibleDiscoveryCandidateSchema = z.strictObject({
  qid: wikidataQidSchema,
  format: formatSchema,
  releaseYear: z.number().int().min(1).max(9999).nullable(),
  era: eraSchema,
})
export type EligibleDiscoveryCandidate = z.infer<
  typeof eligibleDiscoveryCandidateSchema
>

export const identityBlockedDiscoveryCandidateSchema = z.strictObject({
  qid: wikidataQidSchema,
  disposition: z.literal('identity-blocked'),
  dispositionSha256: sha256Schema,
})

export type ReducedDiscoveryRows = Readonly<{
  eligible: readonly EligibleDiscoveryCandidate[]
  identityBlocked: readonly z.infer<
    typeof identityBlockedDiscoveryCandidateSchema
  >[]
  perFormatRows: Readonly<Record<DiscoveryFormat, number>>
}>

export type PageviewBand =
  | 'top-1-percent'
  | 'top-5-percent'
  | 'top-20-percent'
  | 'remainder'
  | 'unavailable'

export type SitelinkBand = '50-plus' | '20-to-49' | '5-to-19' | '0-to-4'

const pageviewBandSchema = z.enum([
  'top-1-percent',
  'top-5-percent',
  'top-20-percent',
  'remainder',
  'unavailable',
])
const sitelinkBandSchema = z.enum(['50-plus', '20-to-49', '5-to-19', '0-to-4'])
const discoveryReasonSchema = z.enum([
  'predecessor',
  'audience-en',
  'audience-ja',
  'multilingual-coverage',
  'coverage-cell',
  'franchise-continuity',
])
const discoveryReasonOrder = [
  'predecessor',
  'audience-en',
  'audience-ja',
  'multilingual-coverage',
  'coverage-cell',
  'franchise-continuity',
] as const
const reviewOutcomeSchema = z.enum(['pending', 'approved', 'rejected'])

const durableDiscoveryRecordSchema = z
  .strictObject({
    qid: wikidataQidSchema,
    englishAvailable: z.boolean(),
    japaneseAvailable: z.boolean(),
    englishBand: pageviewBandSchema,
    japaneseBand: pageviewBandSchema,
    sitelinkBand: sitelinkBandSchema,
    reasonCodes: z.array(discoveryReasonSchema).min(1),
    englishMappingInputSha256: sha256Schema,
    japaneseMappingInputSha256: sha256Schema,
  })
  .superRefine((record, context) => {
    const expectedReasons = [...new Set(record.reasonCodes)].sort(
      (left, right) =>
        discoveryReasonOrder.indexOf(left) -
        discoveryReasonOrder.indexOf(right),
    )
    if (canonicalJson(expectedReasons) !== canonicalJson(record.reasonCodes)) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCodes'],
        message: 'Discovery reason codes must be unique and canonically sorted',
      })
    }
    if (record.englishAvailable === (record.englishBand === 'unavailable')) {
      context.addIssue({
        code: 'custom',
        path: ['englishBand'],
        message: 'English availability and band disagree',
      })
    }
    if (record.japaneseAvailable === (record.japaneseBand === 'unavailable')) {
      context.addIssue({
        code: 'custom',
        path: ['japaneseBand'],
        message: 'Japanese availability and band disagree',
      })
    }
  })

export const discoveryCommitmentReceiptSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-discovery-commitment'),
  version: z.literal(1),
  release: z.literal('anime-v2'),
  executedAt: z.iso.datetime(),
  window: z.strictObject({
    start: z.literal(discoveryWindow.start),
    end: z.literal(discoveryWindow.end),
  }),
  eligibleQidCount: z
    .number()
    .int()
    .min(discoveryLimits.minimumEligibleQids)
    .max(discoveryLimits.maximumEligibleQids),
  selectedQidCount: z.number().int().min(1).max(5_000),
  eligibleQidUniverseSha256: sha256Schema,
  selectedQidSequenceSha256: sha256Schema,
  querySpecificationSha256: sha256Schema,
  mappingSpecificationSha256: sha256Schema,
  aggregationSpecificationSha256: sha256Schema,
  bandSpecificationSha256: sha256Schema,
  orderingSpecificationSha256: sha256Schema,
  reasonCodeSpecificationSha256: sha256Schema,
  providerResponseSetSha256: sha256Schema,
  ignoredCandidateReceiptSha256: sha256Schema,
  records: z.array(durableDiscoveryRecordSchema),
  reviews: z.strictObject({
    primary: reviewOutcomeSchema,
    independent: reviewOutcomeSchema,
  }),
})
export type DiscoveryCommitmentReceipt = z.infer<
  typeof discoveryCommitmentReceiptSchema
>

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    throw new Error('Canonical JSON cannot contain undefined values.')
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }

  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function discoverySha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function compareDiscoveryQids(left: string, right: string): number {
  const numeric = BigInt(left.slice(1)) - BigInt(right.slice(1))
  return numeric < BigInt(0) ? -1 : numeric > BigInt(0) ? 1 : 0
}

function formatForClass(classQid: string): DiscoveryFormat {
  for (const [format, qids] of Object.entries(discoveryFormatClasses)) {
    if ((qids as readonly string[]).includes(classQid)) {
      return format as DiscoveryFormat
    }
  }

  throw new Error('Discovery row contains an unapproved format class.')
}

export function eraForReleaseYear(
  releaseYear: number | null,
): z.infer<typeof eraSchema> {
  if (releaseYear === null) return discoveryEraBucketSpecification.nullYear
  const bucket = discoveryEraBucketSpecification.buckets.find(
    ({ minimumYear, maximumYear }) =>
      (minimumYear === null || releaseYear >= minimumYear) &&
      (maximumYear === null || releaseYear <= maximumYear),
  )
  if (bucket === undefined) {
    throw new Error('Discovery release year is outside its bucket contract.')
  }
  return bucket.era
}

export function reduceDiscoveryRows(
  input: readonly unknown[],
  predecessorQids: ReadonlySet<string> = new Set(),
): ReducedDiscoveryRows {
  const rows = input.map((row) => discoveryRowSchema.parse(row))
  const formatsByQid = new Map<string, Set<DiscoveryFormat>>()
  const yearsByQid = new Map<string, Set<number | null>>()
  const perFormatQids: Record<DiscoveryFormat, Set<string>> = {
    tv: new Set(),
    movie: new Set(),
    ova: new Set(),
    ona: new Set(),
    special: new Set(),
  }

  for (const row of rows) {
    if (row.rank === 'deprecated') {
      throw new Error('Discovery returned a deprecated P31 statement.')
    }

    const format = formatForClass(row.classQid)
    perFormatQids[format].add(row.qid)
    const formats = formatsByQid.get(row.qid) ?? new Set<DiscoveryFormat>()
    formats.add(format)
    formatsByQid.set(row.qid, formats)
    const years = yearsByQid.get(row.qid) ?? new Set<number | null>()
    years.add(row.releaseYear)
    yearsByQid.set(row.qid, years)
  }

  for (const format of Object.keys(perFormatQids) as DiscoveryFormat[]) {
    if (perFormatQids[format].size > discoveryFormatSentinels[format]) {
      throw new Error(`Discovery ${format} sentinel was exceeded.`)
    }
  }

  const eligible: EligibleDiscoveryCandidate[] = []
  const identityBlocked: z.infer<
    typeof identityBlockedDiscoveryCandidateSchema
  >[] = []

  for (const qid of [...formatsByQid.keys()].sort(compareDiscoveryQids)) {
    const formats = formatsByQid.get(qid)
    const years = yearsByQid.get(qid)
    if (formats === undefined || years === undefined) continue

    if (formats.size !== 1) {
      if (predecessorQids.has(qid)) {
        throw new Error('A release-v1 predecessor has a discovery collision.')
      }
      identityBlocked.push({
        qid,
        disposition: 'identity-blocked',
        dispositionSha256: discoverySha256({
          qid,
          disposition: 'identity-blocked',
        }),
      })
      continue
    }

    const format = [...formats][0]
    const usableYears = [...years].filter(
      (year): year is number => year !== null,
    )
    const releaseYear =
      usableYears.length === 0 ? null : Math.min(...usableYears)
    if (format === undefined) continue
    eligible.push(
      eligibleDiscoveryCandidateSchema.parse({
        qid,
        format,
        releaseYear,
        era: eraForReleaseYear(releaseYear),
      }),
    )
  }

  return {
    eligible,
    identityBlocked,
    perFormatRows: Object.fromEntries(
      Object.entries(perFormatQids).map(([format, qids]) => [
        format,
        qids.size,
      ]),
    ) as Record<DiscoveryFormat, number>,
  }
}

export function assertEligiblePopulation(count: number): void {
  if (
    !Number.isInteger(count) ||
    count < discoveryLimits.minimumEligibleQids ||
    count > discoveryLimits.maximumEligibleQids
  ) {
    throw new Error('Frozen eligible QID population is outside its limits.')
  }
}

export function assertCandidateHeadroom(
  candidates: readonly EligibleDiscoveryCandidate[],
): void {
  const parsedCandidates = candidates.map((candidate) =>
    eligibleDiscoveryCandidateSchema.parse(candidate),
  )
  if (
    new Set(parsedCandidates.map(({ qid }) => qid)).size !==
    parsedCandidates.length
  ) {
    throw new Error('Eligible discovery candidate QIDs must be unique.')
  }
  const formatCounts = new Map<string, number>()
  const eraCounts = new Map<string, number>()
  for (const candidate of parsedCandidates) {
    formatCounts.set(
      candidate.format,
      (formatCounts.get(candidate.format) ?? 0) + 1,
    )
    eraCounts.set(candidate.era, (eraCounts.get(candidate.era) ?? 0) + 1)
  }

  for (const [format, floor] of Object.entries(
    discoveryCoverageFloors.formats,
  )) {
    if ((formatCounts.get(format) ?? 0) < Math.ceil(floor * 1.25)) {
      throw new Error(`Discovery ${format} candidate headroom is insufficient.`)
    }
  }

  for (const [era, floor] of Object.entries(discoveryCoverageFloors.eras)) {
    if ((eraCounts.get(era) ?? 0) < Math.ceil(floor * 1.25)) {
      throw new Error(`Discovery ${era} candidate headroom is insufficient.`)
    }
  }
}

export type MonthlyPageviews = Readonly<Record<string, number | null>>

export function aggregateMonthlyPageviews(
  monthly: MonthlyPageviews,
): number | null {
  if (
    Object.keys(monthly).length !== discoveryWindow.months.length ||
    !discoveryWindow.months.every((month) =>
      Object.prototype.hasOwnProperty.call(monthly, month),
    )
  ) {
    return null
  }

  let total = 0
  for (const month of discoveryWindow.months) {
    const value = monthly[month]
    if (value === null || !Number.isSafeInteger(value) || value < 0) {
      return null
    }
    total += value
    if (!Number.isSafeInteger(total)) {
      throw new Error('Pageview aggregate exceeds the safe integer range.')
    }
  }
  return total
}

export function assignPageviewBands(
  values: readonly Readonly<{ qid: string; total: number | null }>[],
): ReadonlyMap<string, PageviewBand> {
  const qids = new Set<string>()
  for (const value of values) {
    wikidataQidSchema.parse(value.qid)
    if (qids.has(value.qid)) throw new Error('Pageview QIDs must be unique.')
    if (
      value.total !== null &&
      (!Number.isSafeInteger(value.total) || value.total < 0)
    ) {
      throw new Error('Pageview totals must be non-negative safe integers.')
    }
    qids.add(value.qid)
  }

  const available = values
    .filter(
      (value): value is Readonly<{ qid: string; total: number }> =>
        value.total !== null,
    )
    .sort(
      (left, right) =>
        right.total - left.total || compareDiscoveryQids(left.qid, right.qid),
    )
  const count = available.length
  const topOne = Math.max(1, Math.ceil(count * 0.01))
  const topFive = Math.max(1, Math.ceil(count * 0.05))
  const topTwenty = Math.max(1, Math.ceil(count * 0.2))
  const bands = new Map<string, PageviewBand>()

  available.forEach(({ qid }, index) => {
    const position = index + 1
    bands.set(
      qid,
      position <= topOne
        ? 'top-1-percent'
        : position <= topFive
          ? 'top-5-percent'
          : position <= topTwenty
            ? 'top-20-percent'
            : 'remainder',
    )
  })
  for (const value of values) {
    if (value.total === null) bands.set(value.qid, 'unavailable')
  }
  return bands
}

export function toSitelinkBand(count: number): SitelinkBand {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Sitelink count must be a non-negative integer.')
  }
  if (count >= 50) return '50-plus'
  if (count >= 20) return '20-to-49'
  if (count >= 5) return '5-to-19'
  return '0-to-4'
}

const pageviewBandOrder: readonly PageviewBand[] = [
  'top-1-percent',
  'top-5-percent',
  'top-20-percent',
  'remainder',
  'unavailable',
]
const sitelinkBandOrder: readonly SitelinkBand[] = [
  '50-plus',
  '20-to-49',
  '5-to-19',
  '0-to-4',
]

export function compareAudienceCandidates(
  left: Readonly<{
    qid: string
    englishBand: PageviewBand
    japaneseBand: PageviewBand
    sitelinkBand: SitelinkBand
  }>,
  right: Readonly<{
    qid: string
    englishBand: PageviewBand
    japaneseBand: PageviewBand
    sitelinkBand: SitelinkBand
  }>,
): number {
  const leftLanguages = [
    pageviewBandOrder.indexOf(left.englishBand),
    pageviewBandOrder.indexOf(left.japaneseBand),
  ].sort((a, b) => a - b)
  const rightLanguages = [
    pageviewBandOrder.indexOf(right.englishBand),
    pageviewBandOrder.indexOf(right.japaneseBand),
  ].sort((a, b) => a - b)

  return (
    (leftLanguages[0] ?? 0) - (rightLanguages[0] ?? 0) ||
    (leftLanguages[1] ?? 0) - (rightLanguages[1] ?? 0) ||
    sitelinkBandOrder.indexOf(left.sitelinkBand) -
      sitelinkBandOrder.indexOf(right.sitelinkBand) ||
    compareDiscoveryQids(left.qid, right.qid)
  )
}

export function hashQidSequence(qids: readonly string[]): string {
  qids.forEach((qid) => wikidataQidSchema.parse(qid))
  if (new Set(qids).size !== qids.length) {
    throw new Error('QID sequence must be unique.')
  }
  return discoverySha256(qids)
}

export function parseDiscoveryCommitmentReceipt(
  input: unknown,
): DiscoveryCommitmentReceipt {
  const receipt = discoveryCommitmentReceiptSchema.parse(input)
  if (receipt.records.length !== receipt.selectedQidCount) {
    throw new Error('Selected discovery count does not match its records.')
  }
  if (
    new Set(receipt.records.map(({ qid }) => qid)).size !==
    receipt.records.length
  ) {
    throw new Error('Durable discovery record QIDs must be unique.')
  }
  if (
    receipt.selectedQidSequenceSha256 !==
    hashQidSequence(receipt.records.map(({ qid }) => qid))
  ) {
    throw new Error('Selected discovery QID sequence hash does not match.')
  }
  const expectedSpecificationHashes = {
    querySpecificationSha256: discoverySpecificationHashes.query,
    mappingSpecificationSha256: discoverySpecificationHashes.mapping,
    aggregationSpecificationSha256: discoverySpecificationHashes.aggregation,
    bandSpecificationSha256: discoverySpecificationHashes.bands,
    orderingSpecificationSha256: discoverySpecificationHashes.ordering,
    reasonCodeSpecificationSha256: discoverySpecificationHashes.reasonCodes,
  }
  for (const [key, expected] of Object.entries(expectedSpecificationHashes)) {
    if (receipt[key as keyof typeof receipt] !== expected) {
      throw new Error('Discovery specification hash does not match.')
    }
  }
  return receipt
}

export const discoveryQuerySpecification = {
  version: 'discovery-format-classes.v1',
  classes: discoveryFormatClasses,
  queries: discoveryWdqsQueries,
  sentinels: discoveryFormatSentinels,
  releaseYear: discoveryReleaseYearProjection,
  eraBuckets: discoveryEraBucketSpecification,
  run: discoveryRunSpecification,
  directP31Only: true,
  nonDeprecatedOnly: true,
} as const

export const discoverySpecificationHashes = {
  query: discoverySha256(discoveryQuerySpecification),
  mapping: discoverySha256({
    version: 'wikimedia-sitelink-mapping.v1',
    languages: ['en', 'ja'],
    redirectResolution: false,
  }),
  aggregation: discoverySha256({
    version: 'monthly-pageview-sum.v1',
    window: discoveryWindow,
    traffic: 'user',
    access: 'all-access',
    zeroIsAvailable: true,
    incompleteIsUnavailable: true,
  }),
  bands: discoverySha256({
    version: 'pageview-bands.v1',
    cutoffs: [0.01, 0.05, 0.2],
    tie: 'numeric-qid-ascending',
    unavailableExcluded: true,
  }),
  ordering: discoverySha256({
    version: 'audience-order.v1',
    order: ['better-language', 'other-language', 'sitelinks', 'numeric-qid'],
  }),
  reasonCodes: discoverySha256(discoveryReasonOrder),
} as const
