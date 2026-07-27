import { describe, expect, it } from 'vitest'
import { createAnimeReleaseSemanticDiff } from '@/features/anime/catalogue/anime-release-diff'
import {
  normalizedAnimeReleaseItemSha256,
  type AnimeReleaseCorpus,
  type AnimeReleaseItem,
} from '@/features/anime/catalogue/anime-release-corpus'

const first: AnimeReleaseCorpus = {
  schema: 'zedarchive.anime-release-corpus',
  version: 1,
  release: 1,
  items: [] as never[],
}

function item(changes: Partial<AnimeReleaseItem> = {}): AnimeReleaseItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    titles: {
      english: 'Existing',
      romaji: null,
      original: null,
      alternatives: [],
    },
    format: 'tv',
    releaseStatus: 'finished',
    releaseYear: 2020,
    episodeCount: 12,
    maturity: 'safe',
    catalogueState: 'published',
    sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q1' }],
    ...changes,
  }
}

function corpus(items: AnimeReleaseItem[]): AnimeReleaseCorpus {
  return { ...first, items }
}

function expectedChange(current: AnimeReleaseItem) {
  return {
    catalogueItemId: current.id,
    sourceItemId: current.sources[0]!.sourceItemId,
    normalizedItemSha256: normalizedAnimeReleaseItemSha256(current),
  }
}

describe('createAnimeReleaseSemanticDiff', () => {
  it('records initial records as additions without a correction reason', () => {
    const current = item()
    expect(
      createAnimeReleaseSemanticDiff(undefined, corpus([current])),
    ).toEqual({
      added: [expectedChange(current)],
      parentChanged: [],
      alternativesChanged: [],
      sourceChanged: [],
      stateChanged: [],
    })
  })

  it('returns no changes for an unchanged item', () => {
    const unchanged = item()
    expect(
      createAnimeReleaseSemanticDiff(
        corpus([structuredClone(unchanged)]),
        corpus([unchanged]),
      ),
    ).toEqual({
      added: [],
      parentChanged: [],
      alternativesChanged: [],
      sourceChanged: [],
      stateChanged: [],
    })
  })

  it('records an isolated parent change with its fixed reason', () => {
    const current = item({ releaseYear: 2021 })
    expect(
      createAnimeReleaseSemanticDiff(corpus([item()]), corpus([current])),
    ).toMatchObject({
      parentChanged: [{ ...expectedChange(current), reason: 'parent-changed' }],
      alternativesChanged: [],
      sourceChanged: [],
      stateChanged: [],
    })
  })

  it('records an isolated alternative-title change with its fixed reason', () => {
    const current = item({
      titles: {
        ...item().titles,
        alternatives: ['Reviewed alternative'],
      },
    })
    expect(
      createAnimeReleaseSemanticDiff(corpus([item()]), corpus([current])),
    ).toMatchObject({
      parentChanged: [],
      alternativesChanged: [
        { ...expectedChange(current), reason: 'alternatives-changed' },
      ],
      sourceChanged: [],
      stateChanged: [],
    })
  })

  it('records an isolated source change with its fixed reason', () => {
    const current = item({
      sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q2' }],
    })
    expect(
      createAnimeReleaseSemanticDiff(corpus([item()]), corpus([current])),
    ).toMatchObject({
      parentChanged: [],
      alternativesChanged: [],
      sourceChanged: [{ ...expectedChange(current), reason: 'source-changed' }],
      stateChanged: [],
    })
  })

  it('records a state-only change without also classifying it as a parent change', () => {
    const current = item({ catalogueState: 'hidden' })
    expect(
      createAnimeReleaseSemanticDiff(corpus([item()]), corpus([current])),
    ).toMatchObject({
      parentChanged: [],
      alternativesChanged: [],
      sourceChanged: [],
      stateChanged: [{ ...expectedChange(current), reason: 'state-changed' }],
    })
  })

  it('records every reason for combined semantic changes', () => {
    const current = item({
      releaseYear: 2021,
      titles: {
        ...item().titles,
        alternatives: ['Reviewed alternative'],
      },
      sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q2' }],
      catalogueState: 'hidden',
    })
    const change = expectedChange(current)
    expect(
      createAnimeReleaseSemanticDiff(corpus([item()]), corpus([current])),
    ).toEqual({
      added: [],
      parentChanged: [{ ...change, reason: 'parent-changed' }],
      alternativesChanged: [{ ...change, reason: 'alternatives-changed' }],
      sourceChanged: [{ ...change, reason: 'source-changed' }],
      stateChanged: [{ ...change, reason: 'state-changed' }],
    })
  })

  it('refuses a silent predecessor removal', () => {
    expect(() =>
      createAnimeReleaseSemanticDiff(corpus([item()]), first),
    ).toThrow('ordinary predecessor item removal')
  })
})
