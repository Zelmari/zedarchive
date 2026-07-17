import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { animeCatalogueStateSchema } from '@/features/anime/catalogue/anime-catalogue-state'
import {
  animeCatalogueItemIdSchema,
  animeCatalogueItemSchema,
  animeFormatSchema,
  animeMaturitySchema,
  animeReleaseStatusSchema,
} from '@/features/anime/domain/anime-catalogue-item'
import {
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-constants'
import { wikidataQidSchema } from '@/integrations/wikidata/wikidata-entity'

export { wikidataQidSchema }

const importOverridesSchema = z.strictObject({
  romajiTitle: z.string().trim().min(1).optional(),
  format: animeFormatSchema.optional(),
  releaseYear: z.number().int().min(1).max(9999).nullable().optional(),
  episodeCount: z.number().int().positive().nullable().optional(),
  releaseStatus: animeReleaseStatusSchema.optional(),
  maturity: animeMaturitySchema.optional(),
  excludedAlternativeTitles: z.array(z.string().trim().min(1)).optional(),
})

const importCandidateSchema = z.strictObject({
  catalogueItemId: animeCatalogueItemIdSchema,
  sourceItemId: wikidataQidSchema,
  expectedEnglishLabel: z.string().trim().min(1),
  intent: z.enum(['create', 'link-existing']),
  overrides: importOverridesSchema,
})

export const wikidataAnimeCandidateManifestSchema = z
  .strictObject({
    version: z.literal(1),
    sourceKey: z.literal('wikidata'),
    candidates: z.array(importCandidateSchema).min(1).max(50),
  })
  .superRefine(({ candidates }, context) => {
    const catalogueItemIds = new Set<string>()
    const sourceItemIds = new Set<string>()

    candidates.forEach((candidate, index) => {
      const catalogueItemId = candidate.catalogueItemId.toLowerCase()

      if (catalogueItemIds.has(catalogueItemId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'catalogueItemId'],
          message: 'Catalogue item IDs must be unique within a manifest',
        })
      }

      if (sourceItemIds.has(candidate.sourceItemId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'sourceItemId'],
          message: 'Wikidata QIDs must be unique within a manifest',
        })
      }

      catalogueItemIds.add(catalogueItemId)
      sourceItemIds.add(candidate.sourceItemId)
    })
  })

export type WikidataAnimeCandidateManifest = z.infer<
  typeof wikidataAnimeCandidateManifestSchema
>
export type WikidataAnimeImportCandidate =
  WikidataAnimeCandidateManifest['candidates'][number]

export const approvedWikidataAnimeCandidateQids = [
  'Q130377145',
  'Q130377146',
  'Q437808',
  'Q662',
  'Q20590069',
  'Q53353',
  'Q57390937',
  'Q114009808',
  'Q126598644',
  'Q1905968',
  'Q186572',
  'Q21697406',
  'Q1066948',
  'Q888136',
  'Q20038487',
  'Q1196284',
  'Q116783101',
  'Q47087518',
  'Q66205775',
  'Q113448921',
] as const

export function assertApprovedWikidataAnimeCandidateSet(
  manifest: WikidataAnimeCandidateManifest,
): void {
  const qids = manifest.candidates.map(({ sourceItemId }) => sourceItemId)

  if (
    JSON.stringify(qids) !== JSON.stringify(approvedWikidataAnimeCandidateQids)
  ) {
    throw new Error(
      'The Wikidata manifest does not contain the approved 20-QID order.',
    )
  }

  if (
    manifest.candidates[0]?.sourceItemId ===
    manifest.candidates[1]?.sourceItemId
  ) {
    throw new Error('Frieren seasons 1 and 2 must remain distinct candidates.')
  }
}

export function parseWikidataAnimeCandidateManifest(
  input: unknown,
): WikidataAnimeCandidateManifest {
  return wikidataAnimeCandidateManifestSchema.parse(input)
}

export async function loadWikidataAnimeCandidateManifest(
  filePath: string,
): Promise<WikidataAnimeCandidateManifest> {
  let contents: string

  try {
    contents = await readFile(filePath, 'utf8')
  } catch (error) {
    throw new Error(
      `Unable to read Wikidata candidate manifest at "${filePath}"`,
      { cause: error },
    )
  }

  let input: unknown

  try {
    input = JSON.parse(contents)
  } catch (error) {
    throw new Error(
      `Malformed JSON in Wikidata candidate manifest at "${filePath}"`,
      { cause: error },
    )
  }

  return parseWikidataAnimeCandidateManifest(input)
}

export const proposedAnimeCatalogueItemSchema = animeCatalogueItemSchema.extend(
  {
    catalogueState: animeCatalogueStateSchema,
    sources: z.array(
      z.strictObject({
        sourceKey: z.literal('wikidata'),
        sourceItemId: wikidataQidSchema,
      }),
    ),
  },
)

export type ProposedAnimeCatalogueItem = z.infer<
  typeof proposedAnimeCatalogueItemSchema
>

export const catalogueSnapshotSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: animeCatalogueItemIdSchema,
      titles: animeCatalogueItemSchema.shape.titles,
      format: animeFormatSchema,
      releaseStatus: animeReleaseStatusSchema,
      releaseYear: animeCatalogueItemSchema.shape.releaseYear,
      episodeCount: animeCatalogueItemSchema.shape.episodeCount,
      maturity: animeMaturitySchema,
      catalogueState: animeCatalogueStateSchema,
      sources: z.array(
        z.strictObject({
          sourceKey: z.string(),
          sourceItemId: z.string(),
        }),
      ),
    }),
  ),
})

export type CatalogueSnapshot = z.infer<typeof catalogueSnapshotSchema>

export const candidateClassificationValues = [
  'ready-create',
  'existing-source-no-change',
  'existing-source-differs',
  'ready-link-existing',
  'blocked-potential-duplicate',
  'blocked-source-conflict',
  'blocked-unsupported-identity',
  'blocked-invalid-provider-data',
  'blocked-ambiguous',
] as const

export const candidateClassificationSchema = z.enum(
  candidateClassificationValues,
)
export type CandidateClassification = z.infer<
  typeof candidateClassificationSchema
>

const duplicateMatchSchema = z.strictObject({
  catalogueItemId: animeCatalogueItemIdSchema,
  matchedTitles: z.array(z.string()),
  reason: z.string(),
})

const invalidProjectedValueSchema = z.strictObject({
  invalid: z.literal(true),
})
const projectedItemValueSchema = z.strictObject({
  id: wikidataQidSchema,
  'entity-type': z.literal('item'),
})
const projectedMonolingualTextValueSchema = z.strictObject({
  text: z.string(),
  language: z.string().min(1),
})
const projectedTimeValueSchema = z.strictObject({
  time: z.string(),
  precision: z.number().int(),
})
const projectedQuantityValueSchema = z.strictObject({
  amount: z.string(),
  unit: z.string(),
})
const projectedValueSchema = z.union([
  invalidProjectedValueSchema,
  projectedItemValueSchema,
  projectedMonolingualTextValueSchema,
  projectedTimeValueSchema,
  projectedQuantityValueSchema,
])
const projectedStatementSchema = z.union([
  invalidProjectedValueSchema,
  z.strictObject({
    rank: z.enum(['preferred', 'normal', 'deprecated']),
    mainsnak: z.strictObject({
      snaktype: z.enum(['value', 'somevalue', 'novalue']),
      property: z.string().regex(/^P[1-9][0-9]*$/),
      datatype: z.string().optional(),
      datavalue: z
        .strictObject({
          type: z.string(),
          value: projectedValueSchema,
        })
        .optional(),
    }),
  }),
])

const providerProjectionSchema = z.strictObject({
  labels: z.strictObject({
    en: z.string().nullable(),
    ja: z.string().nullable(),
  }),
  aliases: z.strictObject({
    en: z.array(z.string()),
    ja: z.array(z.string()),
  }),
  claims: z.strictObject({
    P31: z.array(projectedStatementSchema).optional(),
    P1476: z.array(projectedStatementSchema).optional(),
    P577: z.array(projectedStatementSchema).optional(),
    P580: z.array(projectedStatementSchema).optional(),
    P582: z.array(projectedStatementSchema).optional(),
    P1113: z.array(projectedStatementSchema).optional(),
  }),
})

export const wikidataAnimeCandidateReviewSchema = z.strictObject({
  order: z.number().int().nonnegative(),
  sourceItemId: wikidataQidSchema,
  catalogueItemId: animeCatalogueItemIdSchema,
  expectedEnglishLabel: z.string(),
  providerRevisionId: z.number().int().nonnegative().nullable(),
  providerProjection: providerProjectionSchema,
  overrides: importOverridesSchema,
  proposedItem: proposedAnimeCatalogueItemSchema.nullable(),
  warnings: z.array(z.string()),
  ignoredValues: z.array(z.string()),
  matches: z.array(duplicateMatchSchema),
  classification: candidateClassificationSchema,
})

export type WikidataAnimeCandidateReview = z.infer<
  typeof wikidataAnimeCandidateReviewSchema
>

export const wikidataAnimeReviewArtifactSchema = z
  .strictObject({
    version: z.literal(1),
    sourceKey: z.literal('wikidata'),
    endpoint: z.literal(wikidataApiEndpoint),
    generatedAt: z.iso.datetime(),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    catalogueSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
    userAgent: z.literal(wikidataImporterUserAgent),
    candidates: z.array(wikidataAnimeCandidateReviewSchema),
    summary: z.strictObject({
      total: z.number().int().nonnegative(),
      blockers: z.number().int().nonnegative(),
      classifications: z.record(
        candidateClassificationSchema,
        z.number().int().nonnegative(),
      ),
    }),
  })
  .superRefine(({ candidates, summary }, context) => {
    const catalogueItemIds = new Set<string>()
    const sourceItemIds = new Set<string>()

    if (summary.total !== candidates.length) {
      context.addIssue({
        code: 'custom',
        path: ['summary', 'total'],
        message: 'Artifact summary total must match the candidate count',
      })
    }

    const blockers = candidates.filter(({ classification }) =>
      classification.startsWith('blocked-'),
    ).length

    if (summary.blockers !== blockers) {
      context.addIssue({
        code: 'custom',
        path: ['summary', 'blockers'],
        message: 'Artifact blocker count must match candidate classifications',
      })
    }

    candidateClassificationValues.forEach((classification) => {
      const count = candidates.filter(
        (candidate) => candidate.classification === classification,
      ).length

      if (summary.classifications[classification] !== count) {
        context.addIssue({
          code: 'custom',
          path: ['summary', 'classifications', classification],
          message: `Artifact ${classification} count must match candidates`,
        })
      }
    })

    candidates.forEach((candidate, index) => {
      if (candidate.order !== index) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'order'],
          message: 'Artifact candidate order must be contiguous and preserved',
        })
      }

      if (catalogueItemIds.has(candidate.catalogueItemId.toLowerCase())) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'catalogueItemId'],
          message: 'Artifact catalogue item IDs must be unique',
        })
      }

      if (sourceItemIds.has(candidate.sourceItemId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidates', index, 'sourceItemId'],
          message: 'Artifact Wikidata QIDs must be unique',
        })
      }

      catalogueItemIds.add(candidate.catalogueItemId.toLowerCase())
      sourceItemIds.add(candidate.sourceItemId)
    })
  })

export type WikidataAnimeReviewArtifact = z.infer<
  typeof wikidataAnimeReviewArtifactSchema
>
