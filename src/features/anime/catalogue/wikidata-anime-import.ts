import { createHash } from 'node:crypto'
import {
  candidateClassificationValues,
  catalogueSnapshotSchema,
  wikidataAnimeReviewArtifactSchema,
  type CandidateClassification,
  type CatalogueSnapshot,
  type WikidataAnimeCandidateManifest,
  type WikidataAnimeReviewArtifact,
} from '@/features/anime/catalogue/wikidata-anime-import-contract'
import { reviewWikidataAnimeCandidate } from '@/features/anime/catalogue/wikidata-anime-normalization'
import {
  wikidataApiEndpoint,
  wikidataImporterUserAgent,
} from '@/integrations/wikidata/wikidata-constants'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

export * from '@/features/anime/catalogue/wikidata-anime-import-contract'
export { reviewWikidataAnimeCandidate } from '@/features/anime/catalogue/wikidata-anime-normalization'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function createWikidataAnimeReviewArtifact(input: {
  generatedAt: Date
  manifestSha256: string
  snapshot: CatalogueSnapshot
  manifest: WikidataAnimeCandidateManifest
  entities: Record<string, WikidataEntity>
}): WikidataAnimeReviewArtifact {
  const snapshot = catalogueSnapshotSchema.parse(input.snapshot)
  const candidates = input.manifest.candidates.map((candidate, order) =>
    reviewWikidataAnimeCandidate(
      candidate,
      input.entities[candidate.sourceItemId] ?? {
        id: candidate.sourceItemId,
        missing: true,
        labels: {},
        aliases: {},
        claims: {},
      },
      snapshot,
      order,
    ),
  )
  const classifications = Object.fromEntries(
    candidateClassificationValues.map((classification) => [
      classification,
      candidates.filter(
        (candidate) => candidate.classification === classification,
      ).length,
    ]),
  ) as Record<CandidateClassification, number>
  const blockers = candidates.filter(({ classification }) =>
    classification.startsWith('blocked-'),
  ).length

  return wikidataAnimeReviewArtifactSchema.parse({
    version: 1,
    sourceKey: 'wikidata',
    endpoint: wikidataApiEndpoint,
    generatedAt: input.generatedAt.toISOString(),
    manifestSha256: input.manifestSha256,
    catalogueSnapshotSha256: sha256(JSON.stringify(snapshot)),
    userAgent: wikidataImporterUserAgent,
    candidates,
    summary: {
      total: candidates.length,
      blockers,
      classifications,
    },
  })
}

export { wikidataImporterUserAgent }
