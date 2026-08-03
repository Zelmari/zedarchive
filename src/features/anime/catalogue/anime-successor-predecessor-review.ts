import { z } from '@/config/zod'
import {
  animeReleaseItemSchema,
  normalizedAnimeReleaseItemSha256,
  sha256Canonical,
  type AnimeReleaseCorpus,
  type AnimeReleaseIndex,
  type AnimeReleaseItem,
  type AnimeReleaseReviewLedger,
} from '@/features/anime/catalogue/anime-release-corpus'
import {
  canonicalJson,
  discoverySha256,
} from '@/features/anime/catalogue/wikidata-anime-discovery'
import {
  wikidataItemValueSchema,
  wikidataMonolingualTextValueSchema,
  wikidataQidSchema,
  wikidataQuantityValueSchema,
  wikidataStatementSchema,
  wikidataTimeValueSchema,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const acceptedDiscoveryCandidateReceiptSha256 =
  'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59'
export const acceptedPredecessorV1FileSha256 = {
  corpus: {
    raw: '0d0e43f9d4022dff87a7b3345de7e628c8f75dd8878e89a6a348ab436c35cc22',
    canonical:
      '0d0e43f9d4022dff87a7b3345de7e628c8f75dd8878e89a6a348ab436c35cc22',
  },
  reviewLedger: {
    raw: 'f539531e81332ee1e2648291bdf0f52597480cbab48e629345f008bb38b4f1f0',
    canonical:
      'f539531e81332ee1e2648291bdf0f52597480cbab48e629345f008bb38b4f1f0',
  },
  index: {
    raw: 'c9cc2b3b36f6ec9607103856612ef91a405874bfc81d23bf3fd14c0ceb7da88d',
    canonical:
      'c9cc2b3b36f6ec9607103856612ef91a405874bfc81d23bf3fd14c0ceb7da88d',
  },
} as const
const uuidSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase())

export const predecessorIdentityCorrection = {
  catalogueItemId: '3ad12706-93ab-496e-9ca8-729fc79342e6',
  qid: 'Q114798266',
  category: 'catalogue_state_identity_scope_hide',
  reason: 'overlapping-multi-season-aggregate',
  projectionSha256:
    'f508650efe1a52b3701ef11e1cfc50058d5a8d7e6d2881397ad5272b73c44d84',
} as const

const identityValueSchema = z.union([
  wikidataQidSchema,
  z.strictObject({ amount: z.string(), unit: z.string() }),
  z.strictObject({
    time: z.string(),
    precision: z.number().int(),
    calendarmodel: z.string(),
  }),
])
const identityStatementSchema = z.strictObject({
  rank: z.enum(['preferred', 'normal']),
  snaktype: z.literal('value'),
  datatype: z.enum(['wikibase-item', 'quantity', 'time']),
  value: identityValueSchema,
})
const identityEntitySchema = z.strictObject({
  qid: wikidataQidSchema,
  label: z.string(),
  claims: z.strictObject({
    P31: z.array(identityStatementSchema),
    P1113: z.array(identityStatementSchema),
    P580: z.array(identityStatementSchema),
    P582: z.array(identityStatementSchema),
    P155: z.array(identityStatementSchema),
    P156: z.array(identityStatementSchema),
  }),
})
export const predecessorIdentityProjectionSchema = z.strictObject({
  version: z.literal('predecessor-identity-projection.v1'),
  entities: z.array(identityEntitySchema).length(3),
})

export const acceptedPredecessorIdentityProjection =
  predecessorIdentityProjectionSchema.parse({
    version: 'predecessor-identity-projection.v1',
    entities: [
      {
        qid: 'Q114798266',
        label: "Masamune-kun's Revenge",
        claims: {
          P31: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'wikibase-item',
              value: 'Q63952888',
            },
          ],
          P1113: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'quantity',
              value: { amount: '+24', unit: '1' },
            },
          ],
          P580: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'time',
              value: {
                time: '+2017-01-05T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
            },
          ],
          P582: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'time',
              value: {
                time: '+2023-09-18T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
            },
          ],
          P155: [],
          P156: [],
        },
      },
      {
        qid: 'Q114798403',
        label: "Masamune-kun's Revenge, season 1",
        claims: {
          P31: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'wikibase-item',
              value: 'Q100269041',
            },
          ],
          P1113: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'quantity',
              value: { amount: '+12', unit: '1' },
            },
          ],
          P580: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'time',
              value: {
                time: '+2017-01-05T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
            },
          ],
          P582: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'time',
              value: {
                time: '+2017-03-23T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
            },
          ],
          P155: [],
          P156: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'wikibase-item',
              value: 'Q114798407',
            },
          ],
        },
      },
      {
        qid: 'Q114798407',
        label: "Masamune-kun's Revenge R",
        claims: {
          P31: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'wikibase-item',
              value: 'Q100269041',
            },
          ],
          P1113: [],
          P580: [],
          P582: [],
          P155: [
            {
              rank: 'normal',
              snaktype: 'value',
              datatype: 'wikibase-item',
              value: 'Q114798403',
            },
          ],
          P156: [],
        },
      },
    ],
  })

export function assertAcceptedIdentityProjection(input: unknown): void {
  const projection = predecessorIdentityProjectionSchema.parse(input)
  if (
    canonicalJson(projection) !==
      canonicalJson(acceptedPredecessorIdentityProjection) ||
    discoverySha256(projection) !==
      predecessorIdentityCorrection.projectionSha256
  )
    throw new Error(
      'Predecessor identity projection changed from Decision 055.',
    )
}

const predecessorIdentityQids = [
  'Q114798266',
  'Q114798403',
  'Q114798407',
] as const
const predecessorIdentityProperties = [
  'P31',
  'P1113',
  'P580',
  'P582',
  'P155',
  'P156',
] as const

export function reconstructPredecessorIdentityProjection(
  entities: Readonly<Record<string, WikidataEntity>>,
) {
  if (
    canonicalJson(Object.keys(entities).sort()) !==
    canonicalJson([...predecessorIdentityQids].sort())
  )
    throw new Error(
      'Decision 055 identity evidence did not contain exactly three QIDs.',
    )
  const projection = predecessorIdentityProjectionSchema.parse({
    version: 'predecessor-identity-projection.v1',
    entities: predecessorIdentityQids.map((qid) => {
      const entity = entities[qid]
      if (
        entity === undefined ||
        entity.id !== qid ||
        entity.type !== 'item' ||
        entity.missing !== undefined ||
        entity.redirect !== undefined ||
        entity.labels.en?.language !== 'en'
      )
        throw new Error(
          'Decision 055 identity entity is unavailable or changed.',
        )
      return {
        qid,
        label: entity.labels.en.value,
        claims: Object.fromEntries(
          predecessorIdentityProperties.map((property) => [
            property,
            (entity.claims[property] ?? []).map((input) => {
              const statement = wikidataStatementSchema.parse(input)
              const { mainsnak } = statement
              if (
                statement.rank === 'deprecated' ||
                mainsnak.property !== property ||
                mainsnak.snaktype !== 'value' ||
                mainsnak.datavalue === undefined ||
                !['wikibase-item', 'quantity', 'time'].includes(
                  mainsnak.datatype ?? '',
                ) ||
                (mainsnak.datatype === 'wikibase-item' &&
                  mainsnak.datavalue.type !== 'wikibase-entityid') ||
                (mainsnak.datatype === 'quantity' &&
                  mainsnak.datavalue.type !== 'quantity') ||
                (mainsnak.datatype === 'time' &&
                  mainsnak.datavalue.type !== 'time')
              )
                throw new Error(
                  'Decision 055 identity statement is deprecated, indirect, or incomplete.',
                )
              const raw = mainsnak.datavalue.value
              const value =
                mainsnak.datatype === 'wikibase-item'
                  ? z.object({ id: wikidataQidSchema }).parse(raw).id
                  : mainsnak.datatype === 'quantity'
                    ? z
                        .object({ amount: z.string(), unit: z.string() })
                        .parse(raw)
                    : z
                        .object({
                          time: z.string(),
                          precision: z.number().int(),
                          calendarmodel: z.string(),
                        })
                        .parse(raw)
              return {
                rank: statement.rank,
                snaktype: 'value',
                datatype: mainsnak.datatype,
                value,
              }
            }),
          ]),
        ),
      }
    }),
  })
  assertAcceptedIdentityProjection(projection)
  return projection
}

export function normalizeLatinCompatibleTitle(value: string): string | null {
  const normalized = value.normalize('NFKC').trim()
  if (!/[\p{Script=Latin}0-9]/u.test(normalized)) return null
  for (const character of normalized) {
    if (/\p{Letter}/u.test(character) && !/\p{Script=Latin}/u.test(character))
      return null
  }
  return normalized
}

export const titleSourceTokens = [
  'label.en',
  'alias.en',
  'claim.P1476.en',
  'label.ja-latn',
  'alias.ja-latn',
  'claim.P1476.ja-latn',
] as const
export type TitleCandidate = Readonly<{
  source: (typeof titleSourceTokens)[number]
  value: string
  valueSha256: string
}>

function usableStatements(entity: WikidataEntity, property: string) {
  return (entity.claims[property] ?? []).flatMap((value) => {
    const parsed = wikidataStatementSchema.safeParse(value)
    return parsed.success &&
      parsed.data.rank !== 'deprecated' &&
      parsed.data.mainsnak.property === property &&
      parsed.data.mainsnak.snaktype === 'value'
      ? [parsed.data]
      : []
  })
}

export function projectTitleCandidates(
  entity: WikidataEntity,
): TitleCandidate[] {
  const inputs: Array<{ source: TitleCandidate['source']; value: string }> = []
  const addLanguage = (language: 'en' | 'ja-latn') => {
    const label =
      language === 'en'
        ? entity.labels.en
        : Object.entries(entity.labels).find(
            ([key]) => key.toLowerCase() === language,
          )?.[1]
    if (label)
      inputs.push({
        source: `label.${language}` as TitleCandidate['source'],
        value: label.value,
      })
    const aliases =
      language === 'en'
        ? entity.aliases.en
        : Object.entries(entity.aliases).find(
            ([key]) => key.toLowerCase() === language,
          )?.[1]
    for (const alias of aliases ?? [])
      inputs.push({
        source: `alias.${language}` as TitleCandidate['source'],
        value: alias.value,
      })
  }
  addLanguage('en')
  addLanguage('ja-latn')
  for (const statement of usableStatements(entity, 'P1476')) {
    const raw = statement.mainsnak.datavalue
    if (
      raw?.type !== 'monolingualtext' ||
      typeof raw.value !== 'object' ||
      raw.value === null
    )
      continue
    const value = raw.value as { language?: unknown; text?: unknown }
    const language =
      typeof value.language === 'string' ? value.language.toLowerCase() : ''
    if (
      (language === 'en' || language === 'ja-latn') &&
      typeof value.text === 'string'
    )
      inputs.push({
        source: `claim.P1476.${language}` as TitleCandidate['source'],
        value: value.text,
      })
  }
  const seen = new Set<string>()
  return inputs.flatMap(({ source, value }) => {
    const normalized = normalizeLatinCompatibleTitle(value)
    if (normalized === null || seen.has(`${source}:${normalized}`)) return []
    seen.add(`${source}:${normalized}`)
    return [
      { source, value: normalized, valueSha256: discoverySha256(normalized) },
    ]
  })
}

export const adultPublicationSignalTokens = [
  'instance-hentai',
  'instance-hentai-genre',
  'instance-pornographic-film',
  'genre-hentai',
  'genre-hentai-genre',
  'genre-pornographic-film',
  'known-predecessor-q125436925',
] as const
const adultValues = ['Q172067', 'Q136926229', 'Q185529'] as const
export function adultPublicationSignals(
  entity: WikidataEntity,
): (typeof adultPublicationSignalTokens)[number][] {
  const found = new Set<(typeof adultPublicationSignalTokens)[number]>()
  for (const property of ['P31', 'P136'] as const)
    for (const statement of usableStatements(entity, property)) {
      const raw = statement.mainsnak.datavalue
      const id =
        raw?.type === 'wikibase-entityid' &&
        typeof raw.value === 'object' &&
        raw.value !== null
          ? (raw.value as { id?: unknown }).id
          : undefined
      const index = adultValues.indexOf(id as never)
      if (index >= 0)
        found.add(
          (property === 'P31'
            ? adultPublicationSignalTokens[index]
            : adultPublicationSignalTokens[index + 3])!,
        )
    }
  if (entity.id === 'Q125436925') found.add('known-predecessor-q125436925')
  return adultPublicationSignalTokens.filter((token) => found.has(token))
}

export function directContinuityQids(entity: WikidataEntity): string[] {
  const qids = new Set<string>()
  for (const property of ['P155', 'P156'] as const)
    for (const statement of usableStatements(entity, property)) {
      const raw = statement.mainsnak.datavalue
      const id =
        raw?.type === 'wikibase-entityid' &&
        typeof raw.value === 'object' &&
        raw.value !== null
          ? (raw.value as { id?: unknown }).id
          : undefined
      if (typeof id === 'string' && wikidataQidSchema.safeParse(id).success)
        qids.add(id)
    }
  const ordered = [...qids].sort((a, b) =>
    Number(BigInt(a.slice(1)) - BigInt(b.slice(1))),
  )
  if (ordered.length > 8)
    throw new PredecessorReductionError(
      'continuity-limit',
      'A predecessor exceeded the direct continuity limit.',
    )
  return ordered
}

const predecessorReductionFailureCategoryAuthority = Object.freeze([
  'entity-state',
  'continuity-limit',
  'statement-shape',
  'claim-value',
  'projection-schema',
  'unexpected-reduction',
] as const)
export const predecessorReductionFailureCategories = Object.freeze([
  ...predecessorReductionFailureCategoryAuthority,
] as const)
export type PredecessorReductionFailureCategory =
  (typeof predecessorReductionFailureCategoryAuthority)[number]

function normalizePredecessorReductionFailureCategory(
  value: unknown,
): PredecessorReductionFailureCategory {
  switch (value) {
    case 'entity-state':
    case 'continuity-limit':
    case 'statement-shape':
    case 'claim-value':
    case 'projection-schema':
    case 'unexpected-reduction':
      return value
    default:
      return 'unexpected-reduction'
  }
}

export class PredecessorReductionError extends Error {
  readonly category: PredecessorReductionFailureCategory

  constructor(category: unknown, message: string) {
    super(message)
    this.name = 'PredecessorReductionError'
    this.category = normalizePredecessorReductionFailureCategory(category)
    Object.defineProperty(this, 'category', {
      value: this.category,
      writable: false,
      configurable: false,
      enumerable: true,
    })
  }
}

export function reductionFailureCategoryFromError(
  error: unknown,
): PredecessorReductionFailureCategory | undefined {
  try {
    if (!(error instanceof PredecessorReductionError)) return undefined
    return normalizePredecessorReductionFailureCategory(error.category)
  } catch {
    return 'unexpected-reduction'
  }
}

export type PredecessorReductionResult =
  | Readonly<{
      success: true
      projection: z.infer<typeof reducedPredecessorProjectionSchema>
    }>
  | Readonly<{
      success: false
      category: PredecessorReductionFailureCategory
    }>

const reducedClaimProperties = [
  'P31',
  'P136',
  'P1476',
  'P577',
  'P580',
  'P582',
  'P1113',
  'P155',
  'P156',
] as const
const reducedClaimValueSchema = z.union([
  wikidataQidSchema,
  z.strictObject({ language: z.string(), text: z.string() }),
  z.strictObject({
    time: z.string(),
    precision: z.number().int(),
    calendarmodel: z.string(),
  }),
  z.strictObject({ amount: z.string(), unit: z.string() }),
])
const reducedClaimSchema = z.strictObject({
  rank: z.enum(['preferred', 'normal']),
  value: reducedClaimValueSchema,
})
const reducedClaimsSchema = z.strictObject({
  P31: z.array(reducedClaimSchema),
  P136: z.array(reducedClaimSchema),
  P1476: z.array(reducedClaimSchema),
  P577: z.array(reducedClaimSchema),
  P580: z.array(reducedClaimSchema),
  P582: z.array(reducedClaimSchema),
  P1113: z.array(reducedClaimSchema),
  P155: z.array(reducedClaimSchema),
  P156: z.array(reducedClaimSchema),
})

const reducedClaimShapeByProperty = {
  P31: { datatype: 'wikibase-item', datavalueType: 'wikibase-entityid' },
  P136: { datatype: 'wikibase-item', datavalueType: 'wikibase-entityid' },
  P1476: { datatype: 'monolingualtext', datavalueType: 'monolingualtext' },
  P577: { datatype: 'time', datavalueType: 'time' },
  P580: { datatype: 'time', datavalueType: 'time' },
  P582: { datatype: 'time', datavalueType: 'time' },
  P1113: { datatype: 'quantity', datavalueType: 'quantity' },
  P155: { datatype: 'wikibase-item', datavalueType: 'wikibase-entityid' },
  P156: { datatype: 'wikibase-item', datavalueType: 'wikibase-entityid' },
} as const

function projectReducedClaimValue(
  property: (typeof reducedClaimProperties)[number],
  statement: z.infer<typeof wikidataStatementSchema>,
) {
  const datavalue = statement.mainsnak.datavalue
  const expected = reducedClaimShapeByProperty[property]
  if (
    statement.mainsnak.datatype !== expected.datatype ||
    datavalue === undefined ||
    datavalue.type !== expected.datavalueType
  )
    throw new PredecessorReductionError(
      'claim-value',
      'An approved predecessor claim had an invalid value.',
    )

  if (expected.datatype === 'wikibase-item') {
    const parsed = wikidataItemValueSchema.safeParse(datavalue.value)
    if (!parsed.success)
      throw new PredecessorReductionError(
        'claim-value',
        'An approved predecessor claim had an invalid value.',
      )
    return parsed.data.id
  }
  if (expected.datatype === 'monolingualtext') {
    const parsed = wikidataMonolingualTextValueSchema.safeParse(datavalue.value)
    if (!parsed.success)
      throw new PredecessorReductionError(
        'claim-value',
        'An approved predecessor claim had an invalid value.',
      )
    return { language: parsed.data.language, text: parsed.data.text }
  }
  if (expected.datatype === 'time') {
    const parsed = wikidataTimeValueSchema.safeParse(datavalue.value)
    if (!parsed.success)
      throw new PredecessorReductionError(
        'claim-value',
        'An approved predecessor claim had an invalid value.',
      )
    return {
      time: parsed.data.time,
      precision: parsed.data.precision,
      calendarmodel: parsed.data.calendarmodel,
    }
  }
  const parsed = wikidataQuantityValueSchema.safeParse(datavalue.value)
  if (!parsed.success)
    throw new PredecessorReductionError(
      'claim-value',
      'An approved predecessor claim had an invalid value.',
    )
  return { amount: parsed.data.amount, unit: parsed.data.unit }
}

function projectReducedClaims(entity: WikidataEntity) {
  const result = Object.fromEntries(
    reducedClaimProperties.map((property) => [property, []]),
  ) as unknown as Record<(typeof reducedClaimProperties)[number], unknown[]>
  for (const property of reducedClaimProperties)
    for (const input of entity.claims[property] ?? []) {
      const parsedStatement = wikidataStatementSchema.safeParse(input)
      if (!parsedStatement.success)
        throw new PredecessorReductionError(
          'statement-shape',
          'A projected predecessor statement had an invalid shape.',
        )
      const statement = parsedStatement.data
      if (statement.mainsnak.property !== property)
        throw new PredecessorReductionError(
          'claim-value',
          'An approved predecessor claim had an invalid value.',
        )
      if (
        statement.rank === 'deprecated' ||
        statement.mainsnak.snaktype !== 'value'
      )
        continue
      const value = projectReducedClaimValue(property, statement)
      const parsed = reducedClaimValueSchema.safeParse(value)
      if (!parsed.success)
        throw new PredecessorReductionError(
          'claim-value',
          'An approved predecessor claim had an invalid value.',
        )
      result[property].push({ rank: statement.rank, value: parsed.data })
    }
  return reducedClaimsSchema.parse(result)
}

export const reducedPredecessorProjectionSchema = z
  .strictObject({
    qid: wikidataQidSchema,
    revision: z.number().int().nonnegative().nullable(),
    titleCandidates: z.array(
      z.strictObject({
        source: z.enum(titleSourceTokens),
        value: z.string(),
        valueSha256: sha256Schema,
      }),
    ),
    adultSignals: z.array(z.enum(adultPublicationSignalTokens)),
    continuityQids: z.array(wikidataQidSchema).max(8),
    claims: reducedClaimsSchema,
    projectionSha256: sha256Schema,
  })
  .superRefine(({ projectionSha256, ...projection }, context) => {
    if (projectionSha256 !== discoverySha256(projection))
      context.addIssue({
        code: 'custom',
        path: ['projectionSha256'],
        message: 'Reduced predecessor projection hash does not match',
      })
  })

export function reducePredecessorEntityResult(
  entity: WikidataEntity,
): PredecessorReductionResult {
  try {
    if (
      entity.missing !== undefined ||
      entity.redirect !== undefined ||
      entity.type !== 'item'
    )
      return { success: false, category: 'entity-state' }
    const projection = {
      qid: entity.id,
      revision: entity.lastrevid ?? null,
      titleCandidates: projectTitleCandidates(entity),
      adultSignals: adultPublicationSignals(entity),
      continuityQids: directContinuityQids(entity),
      claims: projectReducedClaims(entity),
    }
    const reduced = reducedPredecessorProjectionSchema.safeParse({
      ...projection,
      projectionSha256: discoverySha256(projection),
    })
    return reduced.success
      ? { success: true, projection: reduced.data }
      : { success: false, category: 'projection-schema' }
  } catch (error) {
    return {
      success: false,
      category:
        reductionFailureCategoryFromError(error) ?? 'unexpected-reduction',
    }
  }
}

export function reducePredecessorEntity(entity: WikidataEntity) {
  const result = reducePredecessorEntityResult(entity)
  if (result.success) return result.projection
  throw new PredecessorReductionError(
    result.category,
    result.category === 'entity-state'
      ? 'Predecessor entity is missing, redirected, or not an item.'
      : `Predecessor reduction failed: ${result.category}.`,
  )
}

export const predecessorCorrectionCategories = [
  'romaji_title_missing',
  'format_identity_correction',
  'release_year_identity_correction',
  'episode_scope_correction',
  'release_status_correction',
  'maturity_curation',
  'alternative_title_exclusion',
  'english_title_correction',
  'romaji_title_correction',
  'catalogue_state_title_usability_hide',
  'catalogue_state_adult_publication_hide',
  'catalogue_state_identity_scope_hide',
] as const

const identityScopeDispositionShape = {
  category: z.literal(predecessorIdentityCorrection.category),
  catalogueItemId: z.literal(predecessorIdentityCorrection.catalogueItemId),
  sourceItemId: z.literal(predecessorIdentityCorrection.qid),
  intent: z.literal('link-existing'),
  predecessorNormalizedItemSha256: sha256Schema,
  normalizedItemSha256: sha256Schema,
  projectionSha256: z.literal(predecessorIdentityCorrection.projectionSha256),
  projection: predecessorIdentityProjectionSchema,
  reason: z.literal(predecessorIdentityCorrection.reason),
  rationale: z.string().trim().min(1).max(280),
  currentState: z.literal('hidden'),
} as const

function addIdentityProjectionIssue(
  projection: z.infer<typeof predecessorIdentityProjectionSchema>,
  context: z.RefinementCtx,
) {
  if (
    canonicalJson(projection) !==
      canonicalJson(acceptedPredecessorIdentityProjection) ||
    discoverySha256(projection) !==
      predecessorIdentityCorrection.projectionSha256
  )
    context.addIssue({
      code: 'custom',
      path: ['projection'],
      message: 'Identity-scope projection changed',
    })
}

export const identityScopeDispositionSchema = z
  .strictObject(identityScopeDispositionShape)
  .superRefine(({ projection }, context) =>
    addIdentityProjectionIssue(projection, context),
  )

export const identityScopeCorrectionSchema = z
  .strictObject({
    ...identityScopeDispositionShape,
    primaryReview: z.literal('approved'),
    independentReview: z.literal('approved'),
  })
  .superRefine(({ projection }, context) =>
    addIdentityProjectionIssue(projection, context),
  )

export function createIdentityScopeDisposition(
  predecessor: AnimeReleaseItem,
  projection: unknown = acceptedPredecessorIdentityProjection,
) {
  if (
    predecessor.id !== predecessorIdentityCorrection.catalogueItemId ||
    predecessor.sources[0]?.sourceItemId !== predecessorIdentityCorrection.qid
  )
    throw new Error(
      'Decision 055 disposition cannot be used for another predecessor.',
    )
  const current = { ...predecessor, catalogueState: 'hidden' as const }
  return identityScopeDispositionSchema.parse({
    category: predecessorIdentityCorrection.category,
    catalogueItemId: predecessor.id,
    sourceItemId: predecessor.sources[0].sourceItemId,
    intent: 'link-existing',
    predecessorNormalizedItemSha256:
      normalizedAnimeReleaseItemSha256(predecessor),
    normalizedItemSha256: normalizedAnimeReleaseItemSha256(current),
    projectionSha256: predecessorIdentityCorrection.projectionSha256,
    projection,
    reason: predecessorIdentityCorrection.reason,
    rationale:
      'Direct structured scope proves this predecessor overlaps the separately represented exact season.',
    currentState: 'hidden',
  })
}

const predecessorAcquisitionEvidenceSchema = z
  .strictObject({
    actionGroups: z
      .array(
        z.strictObject({
          position: z.number().int().min(1).max(21),
          requestedQidsSha256: sha256Schema,
          reducedResponseSetSha256: sha256Schema,
          responseRevisionSetSha256: sha256Schema,
        }),
      )
      .length(21),
    retainedEvidenceUrls: z
      .array(
        z.strictObject({
          position: z.number().int().min(1).max(89),
          evidenceUrlSha256: sha256Schema,
          outcome: z.literal('reachable'),
          shape: z.literal('html'),
          outcomeSha256: sha256Schema,
        }),
      )
      .length(89),
  })
  .superRefine(({ actionGroups, retainedEvidenceUrls }, context) => {
    for (const [index, group] of actionGroups.entries())
      if (group.position !== index + 1)
        context.addIssue({
          code: 'custom',
          path: ['actionGroups', index, 'position'],
          message: 'Action evidence positions must be exact and ordered',
        })
    for (const [index, evidence] of retainedEvidenceUrls.entries())
      if (evidence.position !== index + 1)
        context.addIssue({
          code: 'custom',
          path: ['retainedEvidenceUrls', index, 'position'],
          message: 'URL evidence positions must be exact and ordered',
        })
  })

export const predecessorPreparationSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-predecessor-preparation'),
  version: z.literal(1),
  predecessorCorpusSha256: sha256Schema,
  predecessorReviewSha256: sha256Schema,
  predecessorIndexSha256: sha256Schema,
  discoveryCandidateReceiptSha256: sha256Schema,
  preparedAt: z.iso.datetime(),
  records: z
    .array(
      z.strictObject({
        catalogueItemId: uuidSchema,
        sourceItemId: wikidataQidSchema,
        predecessorNormalizedItemSha256: sha256Schema,
        projection: reducedPredecessorProjectionSchema,
      }),
    )
    .length(500),
  corroboratingProjection: reducedPredecessorProjectionSchema,
  acquisitionEvidence: predecessorAcquisitionEvidenceSchema,
  requiredIdentityScopeDisposition: identityScopeDispositionSchema,
})

const predecessorFinalCorrectionCategories = [
  'format_identity_correction',
  'release_year_identity_correction',
  'episode_scope_correction',
  'release_status_correction',
  'maturity_curation',
  'alternative_title_exclusion',
  'english_title_correction',
  'romaji_title_correction',
  'catalogue_state_title_usability_hide',
  'catalogue_state_adult_publication_hide',
] as const
const genericCorrectionSchema = z.strictObject({
  category: z.enum(predecessorFinalCorrectionCategories),
  predecessorNormalizedItemSha256: sha256Schema,
  normalizedItemSha256: sha256Schema,
  rationale: z.string().trim().min(1).max(280),
})
const finalRecordSchema = z.strictObject({
  catalogueItemId: uuidSchema,
  sourceItemId: wikidataQidSchema,
  intent: z.literal('link-existing'),
  predecessorNormalizedItemSha256: sha256Schema,
  predecessorReviewItemSha256: sha256Schema,
  predecessorProjectionSha256: sha256Schema,
  currentItem: animeReleaseItemSchema,
  normalizedItemSha256: sha256Schema,
  titleReview: z.strictObject({
    selectedLanguage: z.enum(['english', 'romaji']).nullable(),
    selectedSource: z.enum(titleSourceTokens).nullable(),
    selectedValueSha256: sha256Schema.nullable(),
  }),
  adultSignals: z.array(z.enum(adultPublicationSignalTokens)),
  adultPublicationOutcome: z.enum(['cleared', 'hidden', 'excluded']),
  corrections: z.array(
    z.union([identityScopeCorrectionSchema, genericCorrectionSchema]),
  ),
  primaryReview: z.literal('approved'),
  independentReview: z.literal('approved'),
})
export const predecessorReviewResultSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-predecessor-review-result'),
  version: z.literal(1),
  predecessorCorpusSha256: sha256Schema,
  predecessorReviewSha256: sha256Schema,
  preparationSha256: sha256Schema,
  records: z.array(finalRecordSchema).length(500),
})

/**
 * Decision 068 pins the accepted final predecessor result before candidate
 * review is allowed to use any retained predecessor identity.  The complete
 * result, rather than a candidate-side list or summary, is the authority.
 */
export const acceptedPredecessorReviewResultSha256 =
  '2e46cd45c652e8303fa63f756d2d9efbcb63c6bcd20fcd564ee43fa2d7fe267c' as const
export const acceptedRetainedPredecessorIdentitySetSha256 =
  'b95511db075d5ff764beb4d273f9b1fad2ef2c418e70b9e624a8c775e71fa645' as const

export const candidatePredecessorExclusionAuthoritySchema = z.strictObject({
  version: z.literal('candidate-predecessor-exclusion-authority.v1'),
  predecessorReviewResultSha256: sha256Schema,
  retainedPredecessorIdentitySetSha256: sha256Schema,
  qids: z.array(wikidataQidSchema).length(500),
  authoritySha256: sha256Schema,
})
export type CandidatePredecessorExclusionAuthority = z.infer<
  typeof candidatePredecessorExclusionAuthoritySchema
>

function predecessorExclusionAuthorityCore(
  predecessorReviewResultSha256: string,
  qids: readonly string[],
) {
  const retainedPredecessorIdentitySetSha256 = discoverySha256({
    version: 'candidate-retained-predecessor-identity-set.v1',
    predecessorReviewResultSha256,
    qids,
  })
  return {
    version: 'candidate-predecessor-exclusion-authority.v1' as const,
    predecessorReviewResultSha256,
    retainedPredecessorIdentitySetSha256,
    qids,
  }
}

/**
 * Re-derives the only live candidate predecessor-exclusion authority.  This
 * deliberately accepts the complete predecessor result, never a QID list or
 * a caller-authored identity-set commitment.
 */
export function deriveCandidatePredecessorExclusionAuthority(
  input: unknown,
): CandidatePredecessorExclusionAuthority {
  const result = predecessorReviewResultSchema.parse(input)
  const predecessorReviewResultSha256 = discoverySha256(result)
  if (predecessorReviewResultSha256 !== acceptedPredecessorReviewResultSha256)
    throw new Error(
      'Candidate predecessor exclusion requires the exact accepted predecessor result.',
    )
  const qids = result.records.map(({ sourceItemId }) => sourceItemId)
  if (new Set(qids).size !== 500)
    throw new Error(
      'Accepted predecessor result must retain exactly 500 unique QIDs.',
    )
  const core = predecessorExclusionAuthorityCore(
    predecessorReviewResultSha256,
    qids,
  )
  if (
    core.retainedPredecessorIdentitySetSha256 !==
    acceptedRetainedPredecessorIdentitySetSha256
  )
    throw new Error(
      'Accepted predecessor result changed its retained identity-set commitment.',
    )
  return candidatePredecessorExclusionAuthoritySchema.parse({
    ...core,
    authoritySha256: discoverySha256(core),
  })
}

/**
 * Test-only seam for bounded synthetic candidate fixtures.  It intentionally
 * cannot create live authority: production callers must supply the complete
 * exact predecessor result to the function above.
 */
export function deriveCandidatePredecessorExclusionAuthorityForFixture(
  qidsInput: unknown,
): CandidatePredecessorExclusionAuthority {
  if (process.env.NODE_ENV !== 'test')
    throw new Error(
      'Fixture predecessor exclusion authority is unavailable to live tooling.',
    )
  const qids = z.array(wikidataQidSchema).length(500).parse(qidsInput)
  if (new Set(qids).size !== qids.length)
    throw new Error('Fixture predecessor exclusion QIDs must be unique.')
  const predecessorReviewResultSha256 = acceptedPredecessorReviewResultSha256
  const core = predecessorExclusionAuthorityCore(
    predecessorReviewResultSha256,
    qids,
  )
  return candidatePredecessorExclusionAuthoritySchema.parse({
    ...core,
    authoritySha256: discoverySha256(core),
  })
}

const predecessorRoleSchema = z.enum(['primary', 'independent'])
const predecessorRoleInputRecordSchema = z.strictObject({
  catalogueItemId: uuidSchema,
  sourceItemId: wikidataQidSchema,
  predecessorNormalizedItemSha256: sha256Schema,
  projection: reducedPredecessorProjectionSchema,
})
const predecessorRoleInputCommonShape = {
  schema: z.literal('zedarchive.anime-v2-predecessor-review-input'),
  version: z.literal(1),
  preparationSha256: sha256Schema,
  records: z.array(predecessorRoleInputRecordSchema).length(500),
} as const
export const predecessorRoleReviewInputSchema = z.discriminatedUnion('role', [
  z.strictObject({
    ...predecessorRoleInputCommonShape,
    role: z.literal('primary'),
    requiredIdentityScopeDisposition: identityScopeDispositionSchema,
  }),
  z.strictObject({
    ...predecessorRoleInputCommonShape,
    role: z.literal('independent'),
    requiredDecision055Evidence: z.strictObject({
      catalogueItemId: uuidSchema,
      sourceItemId: wikidataQidSchema,
      projection: predecessorIdentityProjectionSchema,
      projectionSha256: sha256Schema,
      requiredState: z.literal('hidden'),
      reason: z.literal(predecessorIdentityCorrection.reason),
    }),
  }),
])

const predecessorRoleApprovedResolutionSchema = z.strictObject({
  currentItem: animeReleaseItemSchema,
  titleReview: finalRecordSchema.shape.titleReview,
  adultSignals: z.array(z.enum(adultPublicationSignalTokens)),
  adultPublicationOutcome: z.enum(['cleared', 'hidden', 'excluded']),
})
const predecessorRoleVerdictBindingShape = {
  catalogueItemId: uuidSchema,
  sourceItemId: wikidataQidSchema,
  predecessorNormalizedItemSha256: sha256Schema,
  predecessorProjectionSha256: sha256Schema,
} as const
const predecessorBlockedReasonSchema = z.enum([
  'identity',
  'title',
  'adult-publication',
  'factual-drift',
  'source-evidence',
  'correction-boundary',
  'unexpected-review',
])
const predecessorRoleVerdictSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    ...predecessorRoleVerdictBindingShape,
    outcome: z.literal('approved'),
    resolution: predecessorRoleApprovedResolutionSchema,
  }),
  z.strictObject({
    ...predecessorRoleVerdictBindingShape,
    outcome: z.literal('blocked'),
    reason: predecessorBlockedReasonSchema,
  }),
])
export const predecessorRoleReviewResultSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-predecessor-role-review-result'),
  version: z.literal(1),
  role: predecessorRoleSchema,
  roleInputSha256: sha256Schema,
  preparationSha256: sha256Schema,
  round: z.number().int().positive(),
  priorRoundDocketSha256: sha256Schema.nullable(),
  records: z.array(predecessorRoleVerdictSchema).length(500),
})
export const predecessorRoleReviewDraftSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-predecessor-role-review-draft'),
  version: z.literal(1),
  role: predecessorRoleSchema,
  roleInputSha256: sha256Schema,
  preparationSha256: sha256Schema,
  round: z.number().int().positive(),
  priorRoundDocketSha256: sha256Schema.nullable(),
  records: z
    .array(
      z.strictObject({
        ...predecessorRoleVerdictBindingShape,
        outcome: z.literal('pending'),
      }),
    )
    .length(500),
})

type PredecessorRoleInput = z.infer<typeof predecessorRoleReviewInputSchema>
export const predecessorReReviewDocketSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-predecessor-re-review-docket'),
  version: z.literal(1),
  round: z.number().int().positive(),
  preparationSha256: sha256Schema,
  primaryRoleResultSha256: sha256Schema,
  independentRoleResultSha256: sha256Schema,
  records: z.literal(500),
})
export const predecessorReReviewGateSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-predecessor-re-review-gate'),
  version: z.literal(1),
  round: z.number().int().positive(),
  preparationSha256: sha256Schema,
  priorRoundDocketSha256: sha256Schema,
})

function assertRoleInputMatchesPreparation(
  input: PredecessorRoleInput,
  preparation: z.infer<typeof predecessorPreparationSchema>,
): void {
  if (input.preparationSha256 !== discoverySha256(preparation))
    throw new Error('Role review input is not bound to the exact preparation.')
  for (const [index, record] of input.records.entries()) {
    const prepared = preparation.records[index]
    if (
      prepared === undefined ||
      record.catalogueItemId !== prepared.catalogueItemId ||
      record.sourceItemId !== prepared.sourceItemId ||
      record.predecessorNormalizedItemSha256 !==
        prepared.predecessorNormalizedItemSha256 ||
      canonicalJson(record.projection) !== canonicalJson(prepared.projection)
    )
      throw new Error('Role review input changed predecessor order or binding.')
  }
  if (
    input.role === 'primary' &&
    canonicalJson(input.requiredIdentityScopeDisposition) !==
      canonicalJson(preparation.requiredIdentityScopeDisposition)
  )
    throw new Error(
      'Primary role input changed the required Decision 055 disposition.',
    )
  if (
    input.role === 'independent' &&
    canonicalJson(input.requiredDecision055Evidence) !==
      canonicalJson({
        catalogueItemId:
          preparation.requiredIdentityScopeDisposition.catalogueItemId,
        sourceItemId: preparation.requiredIdentityScopeDisposition.sourceItemId,
        projection: preparation.requiredIdentityScopeDisposition.projection,
        projectionSha256:
          preparation.requiredIdentityScopeDisposition.projectionSha256,
        requiredState:
          preparation.requiredIdentityScopeDisposition.currentState,
        reason: preparation.requiredIdentityScopeDisposition.reason,
      })
  )
    throw new Error(
      'Independent role input changed the required Decision 055 evidence.',
    )
}

export function createPendingPredecessorRoleReviewDraft(
  roleInput: unknown,
  preparationInput: unknown,
  round = 1,
  priorRoundDocketSha256: string | null = null,
) {
  const input = predecessorRoleReviewInputSchema.parse(roleInput)
  const preparation = predecessorPreparationSchema.parse(preparationInput)
  assertRoleInputMatchesPreparation(input, preparation)
  return predecessorRoleReviewDraftSchema.parse({
    schema: 'zedarchive.anime-v2-predecessor-role-review-draft',
    version: 1,
    role: input.role,
    roleInputSha256: discoverySha256(input),
    preparationSha256: discoverySha256(preparation),
    round,
    priorRoundDocketSha256,
    records: input.records.map((record) => ({
      catalogueItemId: record.catalogueItemId,
      sourceItemId: record.sourceItemId,
      predecessorNormalizedItemSha256: record.predecessorNormalizedItemSha256,
      predecessorProjectionSha256: record.projection.projectionSha256,
      outcome: 'pending',
    })),
  })
}

export function validatePredecessorRoleReviewResult(
  input: unknown,
  roleInput: unknown,
  preparationInput: unknown,
  requiredRole?: 'primary' | 'independent',
  round = 1,
  priorRoundDocketSha256: string | null = null,
) {
  const result = predecessorRoleReviewResultSchema.parse(input)
  const parsedRoleInput = predecessorRoleReviewInputSchema.parse(roleInput)
  const preparation = predecessorPreparationSchema.parse(preparationInput)
  assertRoleInputMatchesPreparation(parsedRoleInput, preparation)
  if (
    (requiredRole !== undefined && result.role !== requiredRole) ||
    result.role !== parsedRoleInput.role ||
    result.roleInputSha256 !== discoverySha256(parsedRoleInput) ||
    result.preparationSha256 !== discoverySha256(preparation) ||
    result.round !== round ||
    result.priorRoundDocketSha256 !== priorRoundDocketSha256
  )
    throw new Error('Role verdict is not bound to its exact role input.')
  for (const [index, verdict] of result.records.entries()) {
    const expected = parsedRoleInput.records[index]
    if (
      expected === undefined ||
      verdict.catalogueItemId !== expected.catalogueItemId ||
      verdict.sourceItemId !== expected.sourceItemId ||
      verdict.predecessorNormalizedItemSha256 !==
        expected.predecessorNormalizedItemSha256 ||
      verdict.predecessorProjectionSha256 !==
        expected.projection.projectionSha256
    )
      throw new Error('Role verdict changed predecessor order or binding.')
    if (
      verdict.outcome === 'approved' &&
      (verdict.resolution.currentItem.id !== verdict.catalogueItemId ||
        verdict.resolution.currentItem.sources[0]?.sourceItemId !==
          verdict.sourceItemId)
    )
      throw new Error('Role verdict resolution changed predecessor ownership.')
  }
  return result
}

export function createPredecessorReReviewDocket(
  primaryResult: unknown,
  independentResult: unknown,
  preparationInput: unknown,
  round: number,
) {
  const primary = predecessorRoleReviewResultSchema.parse(primaryResult)
  const independent = predecessorRoleReviewResultSchema.parse(independentResult)
  const preparation = predecessorPreparationSchema.parse(preparationInput)
  if (
    primary.role !== 'primary' ||
    independent.role !== 'independent' ||
    primary.round !== round ||
    independent.round !== round ||
    primary.preparationSha256 !== discoverySha256(preparation) ||
    independent.preparationSha256 !== discoverySha256(preparation)
  )
    throw new Error(
      'A disagreement docket is not bound to one exact review round.',
    )
  const differs = primary.records.some((record, index) => {
    const other = independent.records[index]
    if (other === undefined) return true
    if (record.outcome === 'approved')
      return (
        other.outcome !== 'approved' ||
        canonicalJson(record.resolution) !== canonicalJson(other.resolution)
      )
    return other.outcome !== 'blocked' || record.reason !== other.reason
  })
  if (!differs)
    throw new Error('A re-review docket requires an actual role disagreement.')
  return predecessorReReviewDocketSchema.parse({
    schema: 'zedarchive.anime-v2-predecessor-re-review-docket',
    version: 1,
    round,
    preparationSha256: discoverySha256(preparation),
    primaryRoleResultSha256: discoverySha256(primary),
    independentRoleResultSha256: discoverySha256(independent),
    records: 500,
  })
}

export function validatePredecessorReReviewDocket(
  docketInput: unknown,
  primaryResult: unknown,
  independentResult: unknown,
  primaryInput: unknown,
  independentInput: unknown,
  preparationInput: unknown,
  priorRoundDocketSha256: string | null,
) {
  const docket = predecessorReReviewDocketSchema.parse(docketInput)
  const preparation = predecessorPreparationSchema.parse(preparationInput)
  const primary = validatePredecessorRoleReviewResult(
    primaryResult,
    primaryInput,
    preparation,
    'primary',
    docket.round,
    priorRoundDocketSha256,
  )
  const independent = validatePredecessorRoleReviewResult(
    independentResult,
    independentInput,
    preparation,
    'independent',
    docket.round,
    priorRoundDocketSha256,
  )
  if (
    docket.preparationSha256 !== discoverySha256(preparation) ||
    docket.primaryRoleResultSha256 !== discoverySha256(primary) ||
    docket.independentRoleResultSha256 !== discoverySha256(independent)
  )
    throw new Error(
      'A re-review docket does not match its immutable role locks.',
    )
  const differs = primary.records.some((record, index) => {
    const other = independent.records[index]
    if (other === undefined) return true
    if (record.outcome === 'approved')
      return (
        other.outcome !== 'approved' ||
        canonicalJson(record.resolution) !== canonicalJson(other.resolution)
      )
    return other.outcome !== 'blocked' || record.reason !== other.reason
  })
  if (!differs)
    throw new Error('A re-review docket requires an actual role disagreement.')
  return docket
}

const canonicalCorrectionRationales = {
  format_identity_correction:
    'The reviewed exact-work format differs from release v1.',
  release_year_identity_correction:
    'The reviewed exact-work release year differs from release v1.',
  episode_scope_correction:
    'The reviewed exact-work episode scope differs from release v1.',
  release_status_correction:
    'The reviewed exact-work release status differs from release v1.',
  maturity_curation:
    'The retained exact-scope maturity evidence requires this value.',
  alternative_title_exclusion:
    'The reviewed title set excludes unsupported alternative titles.',
  english_title_correction:
    'The reviewed structured English title is Latin-compatible.',
  romaji_title_correction:
    'The reviewed structured romaji title is Latin-compatible.',
  catalogue_state_title_usability_hide:
    'No permitted reviewed title remained usable.',
  catalogue_state_adult_publication_hide:
    'The finite predecessor signal requires hidden publication state.',
} as const

function derivePredecessorCorrections(
  predecessor: AnimeReleaseItem,
  resolution: z.infer<typeof predecessorRoleApprovedResolutionSchema>,
) {
  const predecessorNormalizedItemSha256 =
    normalizedAnimeReleaseItemSha256(predecessor)
  const normalizedItemSha256 = normalizedAnimeReleaseItemSha256(
    resolution.currentItem,
  )
  if (predecessor.id === predecessorIdentityCorrection.catalogueItemId)
    return [
      identityScopeCorrectionSchema.parse({
        ...createIdentityScopeDisposition(predecessor),
        primaryReview: 'approved',
        independentReview: 'approved',
      }),
    ]
  const categories = [
    [
      'format_identity_correction',
      predecessor.format !== resolution.currentItem.format,
    ],
    [
      'release_year_identity_correction',
      predecessor.releaseYear !== resolution.currentItem.releaseYear,
    ],
    [
      'episode_scope_correction',
      predecessor.episodeCount !== resolution.currentItem.episodeCount,
    ],
    [
      'release_status_correction',
      predecessor.releaseStatus !== resolution.currentItem.releaseStatus,
    ],
    [
      'maturity_curation',
      predecessor.maturity !== resolution.currentItem.maturity,
    ],
    [
      'alternative_title_exclusion',
      canonicalJson(predecessor.titles.alternatives) !==
        canonicalJson(resolution.currentItem.titles.alternatives),
    ],
    [
      'english_title_correction',
      predecessor.titles.english !== resolution.currentItem.titles.english,
    ],
    [
      'romaji_title_correction',
      predecessor.titles.romaji !== resolution.currentItem.titles.romaji,
    ],
  ] as const
  const corrections = categories.flatMap(([category, changed]) =>
    changed
      ? [
          genericCorrectionSchema.parse({
            category,
            predecessorNormalizedItemSha256,
            normalizedItemSha256,
            rationale: canonicalCorrectionRationales[category],
          }),
        ]
      : [],
  )
  if (
    predecessor.catalogueState === 'published' &&
    resolution.currentItem.catalogueState === 'hidden'
  ) {
    const category =
      resolution.adultSignals.length > 0 &&
      resolution.adultPublicationOutcome === 'hidden'
        ? 'catalogue_state_adult_publication_hide'
        : 'catalogue_state_title_usability_hide'
    corrections.push(
      genericCorrectionSchema.parse({
        category,
        predecessorNormalizedItemSha256,
        normalizedItemSha256,
        rationale: canonicalCorrectionRationales[category],
      }),
    )
  }
  return corrections
}

export function reconcilePredecessorRoleReviews(
  primaryInput: unknown,
  independentInput: unknown,
  primaryResult: unknown,
  independentResult: unknown,
  predecessor: AnimeReleaseCorpus,
  originalReview: AnimeReleaseReviewLedger,
  predecessorIndex: AnimeReleaseIndex,
  preparationInput: unknown,
  round = 1,
  priorRoundDocketSha256: string | null = null,
) {
  const preparation = predecessorPreparationSchema.parse(preparationInput)
  const primary = validatePredecessorRoleReviewResult(
    primaryResult,
    primaryInput,
    preparation,
    'primary',
    round,
    priorRoundDocketSha256,
  )
  const independent = validatePredecessorRoleReviewResult(
    independentResult,
    independentInput,
    preparation,
    'independent',
    round,
    priorRoundDocketSha256,
  )
  const reviews = new Map(
    originalReview.items.map((item) => [item.catalogueItemId, item]),
  )
  const records = predecessor.items.map((prior, index) => {
    const primaryVerdict = primary.records[index]
    const independentVerdict = independent.records[index]
    const acquired = preparation.records[index]
    const priorReview = reviews.get(prior.id)
    if (
      primaryVerdict === undefined ||
      independentVerdict === undefined ||
      acquired === undefined ||
      priorReview === undefined ||
      primaryVerdict.outcome !== 'approved' ||
      independentVerdict.outcome !== 'approved'
    )
      throw new Error(
        'A predecessor role review is blocked or missing approval.',
      )
    if (
      canonicalJson(primaryVerdict.resolution) !==
      canonicalJson(independentVerdict.resolution)
    )
      throw new Error(
        'Primary and independent predecessor resolutions disagree.',
      )
    const resolution = primaryVerdict.resolution
    return {
      catalogueItemId: prior.id,
      sourceItemId: prior.sources[0]!.sourceItemId,
      intent: 'link-existing' as const,
      predecessorNormalizedItemSha256: normalizedAnimeReleaseItemSha256(prior),
      predecessorReviewItemSha256: sha256Canonical(priorReview),
      predecessorProjectionSha256: acquired.projection.projectionSha256,
      currentItem: resolution.currentItem,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(
        resolution.currentItem,
      ),
      titleReview: resolution.titleReview,
      adultSignals: resolution.adultSignals,
      adultPublicationOutcome: resolution.adultPublicationOutcome,
      corrections: derivePredecessorCorrections(prior, resolution),
      primaryReview: 'approved' as const,
      independentReview: 'approved' as const,
    }
  })
  const result = {
    schema: 'zedarchive.anime-v2-predecessor-review-result' as const,
    version: 1 as const,
    predecessorCorpusSha256: sha256Canonical(predecessor),
    predecessorReviewSha256: sha256Canonical(originalReview),
    preparationSha256: discoverySha256(preparation),
    records,
  }
  const validated = validatePredecessorReviewResult(
    result,
    predecessor,
    originalReview,
    predecessorIndex,
    preparation,
  )
  return {
    result: validated,
    safeAggregate: {
      schema: 'zedarchive.anime-v2-predecessor-final-safe-aggregate',
      version: 1,
      records: validated.records.length,
      preparationSha256: discoverySha256(preparation),
      primaryRoleResultSha256: discoverySha256(primary),
      independentRoleResultSha256: discoverySha256(independent),
      resultSha256: discoverySha256(validated),
    },
  }
}

export function assertAcceptedPredecessorV1Bundle(
  predecessor: AnimeReleaseCorpus,
  originalReview: AnimeReleaseReviewLedger,
  predecessorIndex: AnimeReleaseIndex,
): void {
  if (
    sha256Canonical(predecessor) !==
      acceptedPredecessorV1FileSha256.corpus.canonical ||
    sha256Canonical(originalReview) !==
      acceptedPredecessorV1FileSha256.reviewLedger.canonical ||
    sha256Canonical(predecessorIndex) !==
      acceptedPredecessorV1FileSha256.index.canonical ||
    predecessorIndex.corpusSha256 !==
      acceptedPredecessorV1FileSha256.corpus.raw ||
    predecessorIndex.reviewLedgerSha256 !==
      acceptedPredecessorV1FileSha256.reviewLedger.raw ||
    sha256Canonical(predecessorIndex) !==
      acceptedPredecessorV1FileSha256.index.raw
  )
    throw new Error(
      'Predecessor review is not bound to the accepted raw release-v1 files.',
    )
}

export function validatePredecessorReviewResult(
  input: unknown,
  predecessor: AnimeReleaseCorpus,
  originalReview: AnimeReleaseReviewLedger,
  predecessorIndex: AnimeReleaseIndex,
  preparationInput: unknown,
) {
  assertAcceptedPredecessorV1Bundle(
    predecessor,
    originalReview,
    predecessorIndex,
  )
  const result = predecessorReviewResultSchema.parse(input)
  const preparation = predecessorPreparationSchema.parse(preparationInput)
  if (
    result.predecessorCorpusSha256 !== sha256Canonical(predecessor) ||
    result.predecessorReviewSha256 !== sha256Canonical(originalReview) ||
    preparation.predecessorCorpusSha256 !== sha256Canonical(predecessor) ||
    preparation.predecessorReviewSha256 !== sha256Canonical(originalReview) ||
    preparation.predecessorIndexSha256 !== sha256Canonical(predecessorIndex) ||
    preparation.discoveryCandidateReceiptSha256 !==
      acceptedDiscoveryCandidateReceiptSha256 ||
    result.preparationSha256 !== discoverySha256(preparation)
  )
    throw new Error(
      'Final predecessor review is not bound to release v1 and its exact preparation.',
    )
  const identityPredecessor = predecessor.items.find(
    ({ id }) => id === predecessorIdentityCorrection.catalogueItemId,
  )
  if (
    identityPredecessor === undefined ||
    canonicalJson(preparation.requiredIdentityScopeDisposition) !==
      canonicalJson(createIdentityScopeDisposition(identityPredecessor))
  )
    throw new Error('Preparation changed the exact Decision 055 correction.')
  const corroboratingIdentity =
    preparation.requiredIdentityScopeDisposition.projection.entities.find(
      ({ qid }) => qid === 'Q114798407',
    )
  const corroboratingTitle =
    preparation.corroboratingProjection.titleCandidates.find(
      ({ source }) => source === 'label.en',
    )
  if (
    preparation.corroboratingProjection.qid !== 'Q114798407' ||
    corroboratingIdentity === undefined ||
    corroboratingTitle?.value !== corroboratingIdentity.label ||
    corroboratingTitle.valueSha256 !==
      discoverySha256(corroboratingIdentity.label) ||
    predecessorIdentityProperties.some(
      (property) =>
        canonicalJson(preparation.corroboratingProjection.claims[property]) !==
        canonicalJson(
          corroboratingIdentity.claims[property].map(({ rank, value }) => ({
            rank,
            value,
          })),
        ),
    )
  )
    throw new Error(
      'The corroborating reduced projection disagrees with fresh Decision 055 evidence.',
    )
  const expectedRequestQids = [
    ...predecessor.items.map((item) => item.sources[0]!.sourceItemId),
    'Q114798407',
  ]
  const orderedProjections = [
    ...preparation.records.map(({ projection }) => projection),
    preparation.corroboratingProjection,
  ]
  for (const [
    index,
    evidence,
  ] of preparation.acquisitionEvidence.actionGroups.entries()) {
    const projections = orderedProjections.slice(index * 25, index * 25 + 25)
    if (
      evidence.requestedQidsSha256 !==
        discoverySha256(
          expectedRequestQids.slice(index * 25, index * 25 + 25),
        ) ||
      evidence.reducedResponseSetSha256 !== discoverySha256(projections) ||
      evidence.responseRevisionSetSha256 !==
        discoverySha256(
          projections.map(({ qid, revision }) => ({ qid, revision })),
        )
    )
      throw new Error(
        'Preparation changed an ordered Action request, response, or revision hash.',
      )
  }
  const retainedEvidenceUrls = originalReview.items.flatMap(
    ({ maturityEvidence }) =>
      maturityEvidence.map(({ evidenceUrl }) => evidenceUrl),
  )
  for (const [
    index,
    evidence,
  ] of preparation.acquisitionEvidence.retainedEvidenceUrls.entries()) {
    const evidenceUrlSha256 = discoverySha256(retainedEvidenceUrls[index])
    if (
      evidence.evidenceUrlSha256 !== evidenceUrlSha256 ||
      evidence.outcomeSha256 !==
        discoverySha256({
          evidenceUrlSha256,
          outcome: 'reachable',
          shape: 'html',
        })
    )
      throw new Error('Preparation changed retained URL reachability evidence.')
  }
  const reviews = new Map(
    originalReview.items.map((item) => [item.catalogueItemId, item]),
  )
  for (const [index, prior] of predecessor.items.entries()) {
    const record = result.records[index]
    const acquired = preparation.records[index]
    const priorReview = reviews.get(prior.id)
    if (
      record === undefined ||
      acquired === undefined ||
      priorReview === undefined ||
      acquired.catalogueItemId !== prior.id ||
      acquired.sourceItemId !== prior.sources[0]?.sourceItemId ||
      acquired.predecessorNormalizedItemSha256 !==
        normalizedAnimeReleaseItemSha256(prior) ||
      acquired.projection.qid !== prior.sources[0]?.sourceItemId ||
      record.catalogueItemId !== prior.id ||
      record.sourceItemId !== prior.sources[0]?.sourceItemId ||
      record.currentItem.id !== prior.id ||
      record.currentItem.sources[0]?.sourceItemId !==
        prior.sources[0]?.sourceItemId
    )
      throw new Error(
        'A predecessor was removed, reordered, merged, or remapped.',
      )
    if (
      record.predecessorNormalizedItemSha256 !==
        normalizedAnimeReleaseItemSha256(prior) ||
      record.predecessorReviewItemSha256 !== sha256Canonical(priorReview) ||
      record.predecessorProjectionSha256 !==
        acquired.projection.projectionSha256 ||
      record.normalizedItemSha256 !==
        normalizedAnimeReleaseItemSha256(record.currentItem)
    )
      throw new Error(
        'A predecessor history or current-item hash does not match.',
      )
    for (const correction of record.corrections) {
      if (
        correction.predecessorNormalizedItemSha256 !==
          record.predecessorNormalizedItemSha256 ||
        correction.normalizedItemSha256 !== record.normalizedItemSha256
      )
        throw new Error(
          'A predecessor correction hash does not match its record.',
        )
    }
    const changed =
      record.predecessorNormalizedItemSha256 !== record.normalizedItemSha256
    if (changed !== record.corrections.length > 0)
      throw new Error(
        'Every predecessor change requires a correction and unchanged records cannot carry one.',
      )
    const correctionCategories = record.corrections.map(
      ({ category }) => category,
    )
    if (new Set(correctionCategories).size !== correctionCategories.length)
      throw new Error('A predecessor correction category was duplicated.')
    const identityCorrections = record.corrections.filter(
      ({ category }) => category === predecessorIdentityCorrection.category,
    )
    if (prior.id === predecessorIdentityCorrection.catalogueItemId) {
      if (
        record.currentItem.catalogueState !== 'hidden' ||
        identityCorrections.length !== 1
      )
        throw new Error('Decision 055 exact predecessor correction is missing.')
    } else if (identityCorrections.length !== 0) {
      throw new Error(
        'Decision 055 correction was used for another predecessor.',
      )
    }
    const publicTitle =
      record.currentItem.titles.english ?? record.currentItem.titles.romaji
    const selectedTitle =
      record.titleReview.selectedLanguage === 'english'
        ? record.currentItem.titles.english
        : record.titleReview.selectedLanguage === 'romaji'
          ? record.currentItem.titles.romaji
          : null
    const acquiredTitle = acquired.projection.titleCandidates.some(
      (candidate) =>
        candidate.source === record.titleReview.selectedSource &&
        candidate.valueSha256 === record.titleReview.selectedValueSha256 &&
        candidate.value === selectedTitle,
    )
    if (
      (record.titleReview.selectedLanguage === null) !==
        (record.titleReview.selectedSource === null) ||
      (record.titleReview.selectedLanguage === null) !==
        (record.titleReview.selectedValueSha256 === null) ||
      (selectedTitle !== null &&
        record.titleReview.selectedValueSha256 !==
          discoverySha256(selectedTitle)) ||
      (selectedTitle !== null && !acquiredTitle)
    )
      throw new Error(
        `A predecessor title review is internally inconsistent (${record.sourceItemId}).`,
      )
    if (
      record.titleReview.selectedLanguage === 'english' &&
      !record.titleReview.selectedSource?.endsWith('.en')
    )
      throw new Error('An English predecessor title used a non-English source.')
    if (
      record.titleReview.selectedLanguage === 'romaji' &&
      !record.titleReview.selectedSource?.endsWith('.ja-latn')
    )
      throw new Error('A romaji predecessor title used a non-ja-latn source.')
    if (
      record.currentItem.catalogueState === 'published' &&
      (publicTitle === null ||
        normalizeLatinCompatibleTitle(publicTitle) === null ||
        record.titleReview.selectedSource === null ||
        record.titleReview.selectedValueSha256 === null)
    )
      throw new Error(
        'A published predecessor lacks a reviewed Latin-compatible title.',
      )
    const canonicalSignals = adultPublicationSignalTokens.filter((signal) =>
      acquired.projection.adultSignals.includes(signal),
    )
    if (
      canonicalSignals.length !== acquired.projection.adultSignals.length ||
      canonicalJson(canonicalSignals) !==
        canonicalJson(acquired.projection.adultSignals) ||
      canonicalJson(record.adultSignals) !== canonicalJson(canonicalSignals)
    )
      throw new Error(
        'Adult-publication signals do not match the canonical acquired projection.',
      )
    const retainedMaturityEvidence = priorReview.maturityEvidence.some(
      (evidence) =>
        evidence.mappedMaturity === record.currentItem.maturity &&
        (evidence.scope === 'exact-work' ||
          (evidence.scope === 'complete-episode-set' &&
            evidence.coveredEpisodeCount === record.currentItem.episodeCount)),
    )
    if (
      record.adultSignals.length === 0 &&
      record.adultPublicationOutcome !== 'cleared'
    )
      throw new Error('A predecessor without adult signals was not cleared.')
    if (
      record.adultSignals.length > 0 &&
      record.adultPublicationOutcome === 'cleared' &&
      (record.currentItem.catalogueState !== 'published' ||
        record.currentItem.maturity === 'unknown' ||
        !retainedMaturityEvidence)
    )
      throw new Error(
        'A triggered predecessor lacks retained exact-scope maturity evidence for clearance.',
      )
    if (
      record.adultSignals.length > 0 &&
      record.adultPublicationOutcome === 'hidden' &&
      record.currentItem.catalogueState !== 'hidden'
    )
      throw new Error('A triggered hidden outcome did not retain hidden state.')
    if (
      record.adultSignals.length > 0 &&
      record.adultPublicationOutcome === 'excluded' &&
      record.currentItem.catalogueState !== 'draft'
    )
      throw new Error(
        'A triggered excluded outcome did not retain draft state.',
      )
    const categorySet = new Set(correctionCategories)
    const englishChanged =
      prior.titles.english !== record.currentItem.titles.english
    const romajiChanged =
      prior.titles.romaji !== record.currentItem.titles.romaji
    const alternativesChanged =
      canonicalJson(prior.titles.alternatives) !==
      canonicalJson(record.currentItem.titles.alternatives)
    const stateChanged =
      prior.catalogueState !== record.currentItem.catalogueState
    if (
      prior.id !== record.currentItem.id ||
      canonicalJson(prior.sources) !==
        canonicalJson(record.currentItem.sources) ||
      prior.titles.original !== record.currentItem.titles.original
    )
      throw new Error(
        'A predecessor immutable identity, source, or original title changed.',
      )
    if (
      prior.catalogueState === 'hidden' &&
      record.currentItem.catalogueState === 'published'
    )
      throw new Error('A predecessor state was impermissibly unhidden.')
    if (
      record.currentItem.titles.alternatives.some(
        (title) => !prior.titles.alternatives.includes(title),
      )
    )
      throw new Error('A predecessor alternative title was added.')
    if (
      alternativesChanged &&
      record.currentItem.titles.alternatives.length >=
        prior.titles.alternatives.length
    )
      throw new Error('A predecessor alternative-title change removed none.')
    if (categorySet.has('english_title_correction') !== englishChanged)
      throw new Error('An English title correction does not match its change.')
    if (categorySet.has('romaji_title_correction') !== romajiChanged)
      throw new Error('A romaji title correction does not match its change.')
    const fieldCategoryPairs = [
      [
        'format_identity_correction',
        prior.format !== record.currentItem.format,
      ],
      [
        'release_year_identity_correction',
        prior.releaseYear !== record.currentItem.releaseYear,
      ],
      [
        'episode_scope_correction',
        prior.episodeCount !== record.currentItem.episodeCount,
      ],
      [
        'release_status_correction',
        prior.releaseStatus !== record.currentItem.releaseStatus,
      ],
      ['maturity_curation', prior.maturity !== record.currentItem.maturity],
      ['alternative_title_exclusion', alternativesChanged],
    ] as const
    for (const [category, fieldChanged] of fieldCategoryPairs)
      if (categorySet.has(category) !== fieldChanged)
        throw new Error(
          `A ${category} correction does not match its domain-field change.`,
        )
    const titleHide = categorySet.has('catalogue_state_title_usability_hide')
    const adultHide = categorySet.has('catalogue_state_adult_publication_hide')
    const identityHide = categorySet.has(predecessorIdentityCorrection.category)
    if (
      titleHide &&
      (!stateChanged ||
        prior.catalogueState !== 'published' ||
        record.currentItem.catalogueState !== 'hidden' ||
        publicTitle !== null ||
        acquired.projection.titleCandidates.length !== 0)
    )
      throw new Error('A title-usability hide does not match its change.')
    if (
      adultHide &&
      (!stateChanged ||
        prior.catalogueState !== 'published' ||
        record.currentItem.catalogueState !== 'hidden' ||
        record.adultSignals.length === 0 ||
        record.adultPublicationOutcome !== 'hidden')
    )
      throw new Error('An adult-publication hide does not match its signals.')
    if (stateChanged !== (titleHide || adultHide || identityHide))
      throw new Error(
        'A predecessor catalogue-state change lacks its exact correction category.',
      )
  }
  return result
}
