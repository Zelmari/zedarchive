import type {
  CatalogueSnapshot,
  ProposedAnimeCatalogueItem,
  WikidataAnimeCandidateReview,
  WikidataAnimeImportCandidate,
} from '@/features/anime/catalogue/wikidata-anime-import-contract'

export function animeTitleComparisonKey(title: string): string {
  return title.trim().normalize('NFKC').toLocaleLowerCase('en')
}

function proposedMetadataMatches(
  proposed: ProposedAnimeCatalogueItem,
  stored: CatalogueSnapshot['items'][number],
): boolean {
  return (
    JSON.stringify(proposed.titles) === JSON.stringify(stored.titles) &&
    proposed.format === stored.format &&
    proposed.releaseStatus === stored.releaseStatus &&
    proposed.releaseYear === stored.releaseYear &&
    proposed.episodeCount === stored.episodeCount &&
    proposed.maturity === stored.maturity &&
    proposed.catalogueState === stored.catalogueState
  )
}

export function classifyWikidataAnimeCandidate(
  candidate: WikidataAnimeImportCandidate,
  proposedItem: ProposedAnimeCatalogueItem,
  snapshot: CatalogueSnapshot,
): Pick<WikidataAnimeCandidateReview, 'classification' | 'matches'> {
  const sourceOwner = snapshot.items.find((item) =>
    item.sources.some(
      ({ sourceKey, sourceItemId }) =>
        sourceKey === 'wikidata' && sourceItemId === candidate.sourceItemId,
    ),
  )

  if (sourceOwner !== undefined) {
    if (sourceOwner.id !== candidate.catalogueItemId) {
      return {
        classification: 'blocked-source-conflict',
        matches: [
          {
            catalogueItemId: sourceOwner.id,
            matchedTitles: [],
            reason:
              'The Wikidata QID already belongs to another catalogue item.',
          },
        ],
      }
    }

    return {
      classification: proposedMetadataMatches(proposedItem, sourceOwner)
        ? 'existing-source-no-change'
        : 'existing-source-differs',
      matches: [],
    }
  }

  if (candidate.intent === 'link-existing') {
    const linkTarget = snapshot.items.find(
      ({ id }) => id === candidate.catalogueItemId,
    )

    return linkTarget === undefined
      ? {
          classification: 'blocked-source-conflict',
          matches: [],
        }
      : {
          classification: 'ready-link-existing',
          matches: [
            {
              catalogueItemId: linkTarget.id,
              matchedTitles: [],
              reason:
                'Explicit link target exists; its current metadata would become seed-owned on promotion.',
            },
          ],
        }
  }

  const proposedTitles = [
    proposedItem.titles.english,
    proposedItem.titles.romaji,
    proposedItem.titles.original,
    ...proposedItem.titles.alternatives,
  ].filter((title): title is string => title !== null)
  const proposedTitleKeys = new Set(proposedTitles.map(animeTitleComparisonKey))
  const matches = snapshot.items.flatMap((item) => {
    const storedTitles = [
      item.titles.english,
      item.titles.romaji,
      item.titles.original,
      ...item.titles.alternatives,
    ].filter((title): title is string => title !== null)
    const matchedTitles = storedTitles.filter((title) =>
      proposedTitleKeys.has(animeTitleComparisonKey(title)),
    )
    const compatibleMetadata =
      (item.releaseYear !== null &&
        proposedItem.releaseYear !== null &&
        item.releaseYear === proposedItem.releaseYear) ||
      item.format === proposedItem.format

    return matchedTitles.length > 0 && compatibleMetadata
      ? [
          {
            catalogueItemId: item.id,
            matchedTitles,
            reason:
              'Exact normalized title overlap with compatible release year or format.',
          },
        ]
      : []
  })

  return matches.length > 0
    ? { classification: 'blocked-potential-duplicate', matches }
    : { classification: 'ready-create', matches: [] }
}
