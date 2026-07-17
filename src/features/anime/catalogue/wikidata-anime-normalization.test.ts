import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  parseWikidataAnimeCandidateManifest,
  reviewWikidataAnimeCandidate,
  type CatalogueSnapshot,
  type ProposedAnimeCatalogueItem,
  type WikidataAnimeImportCandidate,
} from '@/features/anime/catalogue/wikidata-anime-import'
import {
  parseWikidataEntityResponse,
  type WikidataEntity,
} from '@/integrations/wikidata/wikidata-entity'

const catalogueItemId = '2bdfdaf5-e4be-4c6b-9863-a70bf21e1f40'
const otherCatalogueItemId = '0652e18e-9316-43f8-b51f-a971c4cfdde9'
const emptySnapshot: CatalogueSnapshot = { items: [] }

function candidate(
  overrides: WikidataAnimeImportCandidate['overrides'] = {},
  options: {
    sourceItemId?: string
    intent?: WikidataAnimeImportCandidate['intent']
  } = {},
): WikidataAnimeImportCandidate {
  return parseWikidataAnimeCandidateManifest({
    version: 1,
    sourceKey: 'wikidata',
    candidates: [
      {
        catalogueItemId,
        sourceItemId: options.sourceItemId ?? 'Q1',
        expectedEnglishLabel: 'Example anime',
        intent: options.intent ?? 'create',
        overrides,
      },
    ],
  }).candidates[0]!
}

function statement(
  property: string,
  datatype: string,
  type: string,
  value: unknown,
  options: {
    rank?: 'preferred' | 'normal' | 'deprecated'
    snaktype?: 'value' | 'somevalue' | 'novalue'
    declaredProperty?: string
  } = {},
) {
  const snaktype = options.snaktype ?? 'value'

  return {
    rank: options.rank ?? 'normal',
    mainsnak: {
      snaktype,
      property: options.declaredProperty ?? property,
      datatype,
      ...(snaktype === 'value' ? { datavalue: { type, value } } : {}),
    },
  }
}

function itemStatement(
  property: string,
  qid: string,
  options?: Parameters<typeof statement>[4],
) {
  return statement(
    property,
    'wikibase-item',
    'wikibase-entityid',
    { id: qid, 'entity-type': 'item' },
    options,
  )
}

function timeStatement(property: string, year: number) {
  return statement(property, 'time', 'time', {
    time: `+${year}-01-01T00:00:00Z`,
    precision: 9,
    calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
  })
}

function quantityStatement(amount: number) {
  return statement('P1113', 'quantity', 'quantity', {
    amount: `+${amount}`,
    unit: '1',
  })
}

function entity(input: Partial<WikidataEntity> = {}): WikidataEntity {
  return {
    id: 'Q1',
    type: 'item',
    labels: { en: { language: 'en', value: 'Example anime' } },
    aliases: {},
    claims: { P31: [itemStatement('P31', 'Q63952888')] },
    ...input,
  }
}

function snapshotItem(
  proposed: ProposedAnimeCatalogueItem,
  changes: Partial<CatalogueSnapshot['items'][number]> = {},
): CatalogueSnapshot['items'][number] {
  return {
    ...proposed,
    ...changes,
  }
}

let deathBilliardsEntity: WikidataEntity
let conflictingEntity: WikidataEntity
let missingEntity: WikidataEntity

beforeAll(async () => {
  const deathFixture = JSON.parse(
    await readFile(
      resolve(process.cwd(), 'data/fixtures/wikidata/death-billiards.json'),
      'utf8',
    ),
  ) as { response: unknown }
  const conflictFixture = JSON.parse(
    await readFile(
      resolve(
        process.cwd(),
        'data/fixtures/wikidata/unsupported-and-conflicting.json',
      ),
      'utf8',
    ),
  ) as { response: unknown }

  deathBilliardsEntity = parseWikidataEntityResponse(deathFixture.response)
    .entities.Q66205775!
  const conflictEntities = parseWikidataEntityResponse(
    conflictFixture.response,
  ).entities
  conflictingEntity = conflictEntities.Q2!
  missingEntity = conflictEntities.Q3!
})

describe('Wikidata anime normalization', () => {
  it('uses preferred Japanese P1476 and P577 from the Death Billiards fixture', () => {
    const review = reviewWikidataAnimeCandidate(
      candidate(
        {
          romajiTitle: 'Death Billiards',
          format: 'special',
          releaseStatus: 'finished',
          maturity: 'sensitive',
        },
        { sourceItemId: 'Q66205775' },
      ),
      deathBilliardsEntity,
      emptySnapshot,
      0,
    )

    expect(review.classification).toBe('ready-create')
    expect(review.proposedItem).toMatchObject({
      titles: { original: 'デス・ビリヤード' },
      format: 'special',
      releaseYear: 2013,
    })
  })

  it('records deprecated, non-value, wrong-datatype, and mismatched-property claims without consuming them', () => {
    const review = reviewWikidataAnimeCandidate(
      candidate({ episodeCount: 12 }),
      entity({
        claims: {
          P31: [
            itemStatement('P31', 'Q63952888', { rank: 'deprecated' }),
            itemStatement('P31', 'Q63952888', { snaktype: 'novalue' }),
            itemStatement('P31', 'Q63952888', {
              declaredProperty: 'P999',
            }),
            statement('P31', 'string', 'string', 'not-an-item'),
            itemStatement('P31', 'Q63952888'),
          ],
          P1113: [
            quantityStatement(12),
            statement('P1113', 'quantity', 'quantity', {
              amount: '+12.5',
              unit: '1',
            }),
            statement('P1113', 'quantity', 'quantity', null, {
              snaktype: 'somevalue',
            }),
          ],
        },
      }),
      emptySnapshot,
      0,
    )

    expect(review.classification).toBe('ready-create')
    expect(review.proposedItem?.episodeCount).toBe(12)
    expect(review.ignoredValues).toEqual(
      expect.arrayContaining([
        'P31 statement 1: deprecated rank',
        'P31 statement 2: novalue',
        'P31 statement 3: property mismatch',
        'P31 statement 4: wrong datatype',
        'P1113 statement 2: invalid quantity value',
        'P1113 statement 3: somevalue',
      ]),
    )
  })

  it('blocks conflicting Japanese titles, formats, years, and episode counts until reviewed overrides resolve them', () => {
    const conflictingClaims = {
      P31: [
        itemStatement('P31', 'Q63952888'),
        itemStatement('P31', 'Q20650540'),
      ],
      P1476: [
        statement('P1476', 'monolingualtext', 'monolingualtext', {
          text: '題名一',
          language: 'ja',
        }),
        statement('P1476', 'monolingualtext', 'monolingualtext', {
          text: '題名二',
          language: 'ja',
        }),
      ],
      P577: [timeStatement('P577', 2020), timeStatement('P577', 2021)],
      P1113: [quantityStatement(12), quantityStatement(13)],
    }
    const review = reviewWikidataAnimeCandidate(
      candidate(),
      entity({ claims: conflictingClaims }),
      emptySnapshot,
      0,
    )

    expect(review.classification).toBe('blocked-ambiguous')
    expect(review.proposedItem).toBeNull()
    expect(review.warnings).toEqual(
      expect.arrayContaining([
        'Multiple Japanese P1476 titles exist at the selected rank.',
        'Conflicting mapped formats: tv, movie.',
        'Multiple release years were reduced to the earliest value: 2020, 2021.',
        'Conflicting provider episode counts were resolved by reviewed override: 12, 13.',
      ]),
    )
  })

  it('uses explicit year and episode overrides to resolve provider conflicts', () => {
    const sourceClaims = structuredClone(conflictingEntity.claims)
    sourceClaims.P31 = [itemStatement('P31', 'Q63952888')]
    sourceClaims.P577 = [
      timeStatement('P577', 2020),
      timeStatement('P577', 2021),
    ]
    const review = reviewWikidataAnimeCandidate(
      candidate({
        format: 'tv',
        releaseYear: 2020,
        episodeCount: 12,
      }),
      entity({ claims: sourceClaims }),
      emptySnapshot,
      0,
    )

    expect(review.classification).toBe('ready-create')
    expect(review.proposedItem).toMatchObject({
      releaseYear: 2020,
      episodeCount: 12,
    })
  })

  it('falls back from unusable P577 values to P580 and leaves optional metadata null when unavailable', () => {
    const review = reviewWikidataAnimeCandidate(
      candidate(),
      entity({
        claims: {
          P31: [itemStatement('P31', 'Q63952888')],
          P577: [
            statement('P577', 'time', 'time', {
              time: '+2020-00-00T00:00:00Z',
              precision: 8,
              calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
            }),
          ],
          P580: [timeStatement('P580', 2021)],
        },
      }),
      emptySnapshot,
      0,
    )

    expect(review.classification).toBe('ready-create')
    expect(review.proposedItem).toMatchObject({
      releaseYear: 2021,
      episodeCount: null,
    })
    expect(review.warnings).toContain('P577 statement 1 had no usable year.')
  })

  it('applies reviewed alternative-title exclusions before seed promotion', () => {
    const review = reviewWikidataAnimeCandidate(
      candidate({
        excludedAlternativeTitles: ['ハワイ県', 'トップ!'],
      }),
      entity({
        aliases: {
          ja: [
            { language: 'ja', value: 'トップをねらえ' },
            { language: 'ja', value: 'ハワイ県' },
            { language: 'ja', value: 'トップ!' },
          ],
        },
      }),
      emptySnapshot,
      0,
    )

    expect(review.proposedItem?.titles.alternatives).toEqual(['トップをねらえ'])
    expect(review.ignoredValues).toEqual(
      expect.arrayContaining([
        'Alias excluded by manifest: "ハワイ県"',
        'Alias excluded by manifest: "トップ!"',
      ]),
    )
  })

  it('blocks missing, redirected, and mismatched provider identities explicitly', () => {
    expect(
      reviewWikidataAnimeCandidate(
        candidate({}, { sourceItemId: 'Q3' }),
        missingEntity,
        emptySnapshot,
        0,
      ).classification,
    ).toBe('blocked-invalid-provider-data')
    expect(
      reviewWikidataAnimeCandidate(
        candidate(),
        entity({ redirect: 'Q2' }),
        emptySnapshot,
        0,
      ).classification,
    ).toBe('blocked-unsupported-identity')
    expect(
      reviewWikidataAnimeCandidate(
        candidate(),
        entity({ id: 'Q2' }),
        emptySnapshot,
        0,
      ).classification,
    ).toBe('blocked-invalid-provider-data')
  })
})

describe('Wikidata catalogue classification', () => {
  it('distinguishes unchanged and differing records that already own the source', () => {
    const importCandidate = candidate({ format: 'tv' })
    const readyReview = reviewWikidataAnimeCandidate(
      importCandidate,
      entity(),
      emptySnapshot,
      0,
    )
    const proposed = readyReview.proposedItem!
    const unchangedSnapshot = {
      items: [snapshotItem(proposed)],
    }
    const changedSnapshot = {
      items: [
        snapshotItem(proposed, {
          titles: { ...proposed.titles, english: 'Curated title' },
        }),
      ],
    }

    expect(
      reviewWikidataAnimeCandidate(
        importCandidate,
        entity(),
        unchangedSnapshot,
        0,
      ).classification,
    ).toBe('existing-source-no-change')
    expect(
      reviewWikidataAnimeCandidate(
        importCandidate,
        entity(),
        changedSnapshot,
        0,
      ).classification,
    ).toBe('existing-source-differs')
  })

  it('blocks a source owned by another item', () => {
    const importCandidate = candidate({ format: 'tv' })
    const proposed = reviewWikidataAnimeCandidate(
      importCandidate,
      entity(),
      emptySnapshot,
      0,
    ).proposedItem!
    const review = reviewWikidataAnimeCandidate(
      importCandidate,
      entity(),
      {
        items: [
          snapshotItem(proposed, {
            id: otherCatalogueItemId,
            sources: [{ sourceKey: 'wikidata', sourceItemId: 'Q1' }],
          }),
        ],
      },
      0,
    )

    expect(review.classification).toBe('blocked-source-conflict')
    expect(review.matches[0]?.catalogueItemId).toBe(otherCatalogueItemId)
  })

  it('permits only an explicit link whose internal target already exists', () => {
    const linkCandidate = candidate(
      { format: 'tv' },
      { intent: 'link-existing' },
    )
    const proposed = reviewWikidataAnimeCandidate(
      linkCandidate,
      entity(),
      emptySnapshot,
      0,
    ).proposedItem!

    expect(
      reviewWikidataAnimeCandidate(
        linkCandidate,
        entity(),
        { items: [snapshotItem(proposed, { sources: [] })] },
        0,
      ).classification,
    ).toBe('ready-link-existing')
    expect(
      reviewWikidataAnimeCandidate(linkCandidate, entity(), emptySnapshot, 0)
        .classification,
    ).toBe('blocked-source-conflict')
  })

  it('does not treat punctuation-only title similarity as an exact duplicate', () => {
    const importCandidate = candidate({ format: 'tv' })
    const proposed = reviewWikidataAnimeCandidate(
      importCandidate,
      entity(),
      emptySnapshot,
      0,
    ).proposedItem!
    const review = reviewWikidataAnimeCandidate(
      importCandidate,
      entity(),
      {
        items: [
          snapshotItem(proposed, {
            id: otherCatalogueItemId,
            titles: {
              english: 'Example anime!',
              romaji: null,
              original: null,
              alternatives: [],
            },
            sources: [],
          }),
        ],
      },
      0,
    )

    expect(review.classification).toBe('ready-create')
  })
})
