import {
  normalizedAnimeReleaseItemSha256,
  type AnimeReleaseCorpus,
} from '@/features/anime/catalogue/anime-release-corpus'

export type AnimeReleaseSemanticChange = Readonly<{
  catalogueItemId: string
  sourceItemId: string
  normalizedItemSha256: string
}>

export type AnimeReleaseSemanticReason =
  'parent-changed' | 'alternatives-changed' | 'source-changed' | 'state-changed'

type ReasonedSemanticChange<Reason extends AnimeReleaseSemanticReason> =
  AnimeReleaseSemanticChange &
    Readonly<{
      reason: Reason
    }>

export type AnimeReleaseSemanticDiff = Readonly<{
  added: readonly AnimeReleaseSemanticChange[]
  parentChanged: readonly ReasonedSemanticChange<'parent-changed'>[]
  alternativesChanged: readonly ReasonedSemanticChange<'alternatives-changed'>[]
  sourceChanged: readonly ReasonedSemanticChange<'source-changed'>[]
  stateChanged: readonly ReasonedSemanticChange<'state-changed'>[]
}>

function parentProjection(item: AnimeReleaseCorpus['items'][number]) {
  return {
    id: item.id,
    titles: { ...item.titles, alternatives: [] },
    format: item.format,
    releaseStatus: item.releaseStatus,
    releaseYear: item.releaseYear,
    episodeCount: item.episodeCount,
    maturity: item.maturity,
  }
}

export function createAnimeReleaseSemanticDiff(
  predecessor: AnimeReleaseCorpus | undefined,
  current: AnimeReleaseCorpus,
): AnimeReleaseSemanticDiff {
  const previousById = new Map(
    predecessor?.items.map((item) => [item.id, item]),
  )
  const diff: {
    added: AnimeReleaseSemanticChange[]
    parentChanged: ReasonedSemanticChange<'parent-changed'>[]
    alternativesChanged: ReasonedSemanticChange<'alternatives-changed'>[]
    sourceChanged: ReasonedSemanticChange<'source-changed'>[]
    stateChanged: ReasonedSemanticChange<'state-changed'>[]
  } = {
    added: [],
    parentChanged: [],
    alternativesChanged: [],
    sourceChanged: [],
    stateChanged: [],
  }
  for (const item of current.items) {
    const change = {
      catalogueItemId: item.id,
      sourceItemId: item.sources[0]!.sourceItemId,
      normalizedItemSha256: normalizedAnimeReleaseItemSha256(item),
    }
    const previous = previousById.get(item.id)
    if (!previous) {
      diff.added.push(change)
      continue
    }
    previousById.delete(item.id)
    if (previous.sources[0]?.sourceItemId !== item.sources[0]?.sourceItemId)
      diff.sourceChanged.push({ ...change, reason: 'source-changed' })
    if (previous.catalogueState !== item.catalogueState)
      diff.stateChanged.push({ ...change, reason: 'state-changed' })
    if (
      JSON.stringify(previous.titles.alternatives) !==
      JSON.stringify(item.titles.alternatives)
    )
      diff.alternativesChanged.push({
        ...change,
        reason: 'alternatives-changed',
      })
    if (
      JSON.stringify(parentProjection(previous)) !==
      JSON.stringify(parentProjection(item))
    )
      diff.parentChanged.push({ ...change, reason: 'parent-changed' })
  }
  if (previousById.size > 0) {
    throw new Error(
      'Release semantic diff refuses an ordinary predecessor item removal.',
    )
  }
  return diff
}
