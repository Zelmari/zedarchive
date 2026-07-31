import { describe, expect, it } from 'vitest'
import {
  aggregateMonthlyPageviews,
  assertCandidateHeadroom,
  assertEligiblePopulation,
  assignPageviewBands,
  canonicalJson,
  compareAudienceCandidates,
  compareDiscoveryQids,
  discoveryCoverageFloors,
  discoveryEraBucketSpecification,
  discoveryFormatClasses,
  discoveryFormatSentinels,
  discoveryLimits,
  discoveryQuerySpecification,
  discoveryReleaseYearProjection,
  discoveryRunSpecification,
  discoverySha256,
  discoverySpecificationHashes,
  discoveryUserAgent,
  discoveryWindow,
  eraForReleaseYear,
  hashQidSequence,
  parseDiscoveryCommitmentReceipt,
  reduceDiscoveryRows,
  toSitelinkBand,
  type DiscoveryCommitmentReceipt,
  type DiscoveryFormat,
  type EligibleDiscoveryCandidate,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

function qid(value: number): string {
  return `Q${value}`
}

function row(
  value: number,
  classQid = 'Q63952888',
  releaseYear: number | null = 2020,
) {
  return {
    qid: qid(value),
    classQid,
    rank: 'normal' as const,
    releaseYear,
  }
}

function completeMonths(value: number | null) {
  return Object.fromEntries(
    discoveryWindow.months.map((month) => [month, value]),
  )
}

function receipt(): DiscoveryCommitmentReceipt {
  const hashes = discoverySpecificationHashes
  return {
    schema: 'zedarchive.anime-discovery-commitment',
    version: 1,
    release: 'anime-v2',
    executedAt: '2026-07-31T12:00:00.000Z',
    window: {
      start: discoveryWindow.start,
      end: discoveryWindow.end,
    },
    eligibleQidCount: 6_000,
    selectedQidCount: 1,
    eligibleQidUniverseSha256: 'a'.repeat(64),
    selectedQidSequenceSha256: hashQidSequence(['Q1']),
    querySpecificationSha256: hashes.query,
    mappingSpecificationSha256: hashes.mapping,
    aggregationSpecificationSha256: hashes.aggregation,
    bandSpecificationSha256: hashes.bands,
    orderingSpecificationSha256: hashes.ordering,
    reasonCodeSpecificationSha256: hashes.reasonCodes,
    providerResponseSetSha256: 'c'.repeat(64),
    ignoredCandidateReceiptSha256: 'd'.repeat(64),
    records: [
      {
        qid: 'Q1',
        englishAvailable: true,
        japaneseAvailable: false,
        englishBand: 'top-1-percent',
        japaneseBand: 'unavailable',
        sitelinkBand: '50-plus',
        reasonCodes: ['audience-en'],
        englishMappingInputSha256: 'e'.repeat(64),
        japaneseMappingInputSha256: 'f'.repeat(64),
      },
    ],
    reviews: { primary: 'pending', independent: 'pending' },
  }
}

describe('M45 discovery constants', () => {
  it('freezes the approved identity, limits, classes, sentinels and floors', () => {
    expect(discoveryUserAgent).toBe(
      'zedarchive-catalogue-discovery/2.0 (+https://github.com/Zelmari/zedarchive)',
    )
    expect(discoveryWindow).toMatchObject({
      start: '2025-07-01T00:00:00Z',
      end: '2026-06-30T23:59:59Z',
    })
    expect(discoveryWindow.months).toHaveLength(12)
    expect(discoveryLimits).toMatchObject({
      minimumEligibleQids: 6_000,
      maximumEligibleQids: 9_000,
      maximumQidsPerActionRequest: 25,
      maximumSuccessfulPageviewRequests: 18_000,
      maximumHttpAttempts: 20_000,
      minimumRequestSpacingMilliseconds: 350,
      requestTimeoutMilliseconds: 10_000,
      maximumAttemptsPerRequest: 3,
      maximumWallTimeMilliseconds: 57_600_000,
    })
    expect(discoveryRunSpecification).toEqual({
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
        terminalCategories: [
          'wall-time-limit',
          'http-attempt-limit',
          'pageview-limit',
          'concurrency-stop',
          'request-budget-stop',
          'bounded-stop',
          'unexpected-stop',
        ],
      },
    })
    expect(discoveryFormatClasses).toEqual({
      tv: ['Q63952888', 'Q100269041'],
      movie: ['Q20650540'],
      ova: ['Q220898', 'Q113687694'],
      ona: ['Q113671041'],
      special: ['Q117209498'],
    })
    expect(discoveryFormatSentinels).toEqual({
      tv: 6_000,
      movie: 1_500,
      ova: 2_000,
      ona: 300,
      special: 200,
    })
    expect(discoveryReleaseYearProjection).toEqual({
      version: 'discovery-release-year.v2',
      publicationProperty: 'P577',
      fallbackProperty: 'P580',
      minimumTimePrecision: 9,
      reduction: 'earliest-usable-year',
      precedence: 'P577-before-P580',
    })
    expect(discoveryEraBucketSpecification).toEqual({
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
    })
    expect(discoveryCoverageFloors).toEqual({
      formats: { tv: 2_500, movie: 850, ova: 250, ona: 100, special: 35 },
      eras: {
        'before-1980': 100,
        '1980-1989': 275,
        '1990-1999': 450,
        '2000-2009': 800,
        '2010-2019': 1_200,
        '2020-2026': 1_200,
      },
    })
  })
})

describe('canonical discovery hashing', () => {
  it('sorts object keys but preserves array and QID order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    )
    expect(discoverySha256({ b: 2, a: 1 })).toBe(
      discoverySha256({ a: 1, b: 2 }),
    )
    expect(hashQidSequence(['Q1', 'Q2'])).not.toBe(
      hashQidSequence(['Q2', 'Q1']),
    )
    expect(() => hashQidSequence(['Q1', 'Q1'])).toThrow('unique')
    for (const hash of Object.values(discoverySpecificationHashes)) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    }
    const changedEraBuckets = {
      ...discoveryQuerySpecification,
      eraBuckets: {
        ...discoveryEraBucketSpecification,
        buckets: discoveryEraBucketSpecification.buckets.map((bucket) =>
          bucket.era === 'before-1980'
            ? { ...bucket, maximumYear: 1978 }
            : bucket,
        ),
      },
    }
    expect(discoverySha256(changedEraBuckets)).not.toBe(
      discoverySpecificationHashes.query,
    )
    expect(
      discoverySha256({
        ...discoveryQuerySpecification,
        run: {
          ...discoveryRunSpecification,
          limits: {
            ...discoveryLimits,
            maximumWallTimeMilliseconds: 28_800_000,
          },
        },
      }),
    ).not.toBe(discoverySpecificationHashes.query)
  })

  it('orders QIDs by numeric identity rather than lexical text', () => {
    expect(['Q10', 'Q2', 'Q1'].sort(compareDiscoveryQids)).toEqual([
      'Q1',
      'Q2',
      'Q10',
    ])
  })
})

describe('structural candidate reduction', () => {
  it('deduplicates same-format classes and emits canonical eligible rows', () => {
    expect(
      reduceDiscoveryRows([
        row(10, 'Q100269041', 2021),
        row(2, 'Q63952888', 1999),
        row(10, 'Q63952888', 2021),
      ]),
    ).toEqual({
      eligible: [
        { qid: 'Q2', format: 'tv', releaseYear: 1999, era: '1990-1999' },
        { qid: 'Q10', format: 'tv', releaseYear: 2021, era: '2020-2026' },
      ],
      identityBlocked: [],
      perFormatRows: { tv: 2, movie: 0, ova: 0, ona: 0, special: 0 },
    })
  })

  it('blocks cross-format identities and chooses the earliest direct year', () => {
    const reduced = reduceDiscoveryRows([
      row(1, 'Q63952888', 2020),
      row(1, 'Q20650540', 2020),
      row(2, 'Q63952888', 2020),
      row(2, 'Q63952888', 2021),
    ])
    expect(reduced.eligible).toEqual([
      { qid: 'Q2', format: 'tv', releaseYear: 2020, era: '2020-2026' },
    ])
    expect(reduced.identityBlocked.map(({ qid }) => qid)).toEqual(['Q1'])
    expect(reduced.identityBlocked[0]).toEqual({
      qid: 'Q1',
      disposition: 'identity-blocked',
      dispositionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(reduced.identityBlocked)).not.toContain('Q20650540')
  })

  it('stops on predecessor collisions, deprecated statements and schema drift', () => {
    expect(() =>
      reduceDiscoveryRows([row(1), row(1, 'Q20650540')], new Set(['Q1'])),
    ).toThrow('release-v1 predecessor')
    expect(() =>
      reduceDiscoveryRows([{ ...row(1), rank: 'deprecated' }]),
    ).toThrow('deprecated')
    expect(() =>
      reduceDiscoveryRows([{ ...row(1), unexpected: 'raw-provider-field' }]),
    ).toThrow()
    expect(() => reduceDiscoveryRows([row(1, 'Q11424')])).toThrow()
  })

  it('stops one unique row beyond every format sentinel', () => {
    const classByFormat: Record<DiscoveryFormat, string> = {
      tv: 'Q63952888',
      movie: 'Q20650540',
      ova: 'Q220898',
      ona: 'Q113671041',
      special: 'Q117209498',
    }
    for (const [format, limit] of Object.entries(discoveryFormatSentinels) as [
      DiscoveryFormat,
      number,
    ][]) {
      expect(() =>
        reduceDiscoveryRows(
          Array.from({ length: limit + 1 }, (_, index) =>
            row(index + 1, classByFormat[format]),
          ),
        ),
      ).toThrow(`${format} sentinel`)
    }
  })
})

describe('population and coverage headroom', () => {
  it('accepts only the closed 6,000 to 9,000 population', () => {
    expect(() => assertEligiblePopulation(6_000)).not.toThrow()
    expect(() => assertEligiblePopulation(9_000)).not.toThrow()
    expect(() => assertEligiblePopulation(5_999)).toThrow()
    expect(() => assertEligiblePopulation(9_001)).toThrow()
    expect(() => assertEligiblePopulation(6_000.5)).toThrow()
  })

  it('requires 125 percent of every revised format and era floor', () => {
    let nextQid = 1
    const candidates: EligibleDiscoveryCandidate[] = []
    for (const [format, floor] of Object.entries(
      discoveryCoverageFloors.formats,
    ) as [DiscoveryFormat, number][]) {
      for (let index = 0; index < Math.ceil(floor * 1.25); index += 1) {
        candidates.push({
          qid: qid(nextQid++),
          format,
          releaseYear: null,
          era: 'unknown',
        })
      }
    }
    const eraYears = {
      'before-1980': 1970,
      '1980-1989': 1985,
      '1990-1999': 1995,
      '2000-2009': 2005,
      '2010-2019': 2015,
      '2020-2026': 2025,
    } as const
    for (const [era, floor] of Object.entries(discoveryCoverageFloors.eras)) {
      for (let index = 0; index < Math.ceil(floor * 1.25); index += 1) {
        candidates.push({
          qid: qid(nextQid++),
          format: 'tv',
          releaseYear: eraYears[era as keyof typeof eraYears],
          era: era as EligibleDiscoveryCandidate['era'],
        })
      }
    }
    expect(() => assertCandidateHeadroom(candidates)).not.toThrow()
    expect(() =>
      assertCandidateHeadroom(
        candidates.filter(({ era }) => era !== '1990-1999'),
      ),
    ).toThrow('1990-1999')
    expect(() =>
      assertCandidateHeadroom(
        candidates.filter(({ format }) => format !== 'special'),
      ),
    ).toThrow('special')
  })

  it('uses the exact closed era buckets', () => {
    expect(
      [
        1979,
        1980,
        1989,
        1990,
        1999,
        2000,
        2009,
        2010,
        2019,
        2020,
        2026,
        2027,
        null,
      ].map(eraForReleaseYear),
    ).toEqual([
      'before-1980',
      '1980-1989',
      '1980-1989',
      '1990-1999',
      '1990-1999',
      '2000-2009',
      '2000-2009',
      '2010-2019',
      '2010-2019',
      '2020-2026',
      '2020-2026',
      'after-2026',
      'unknown',
    ])
  })
})

describe('pageview aggregation and bands', () => {
  it('distinguishes complete zero from unavailable or incomplete', () => {
    expect(aggregateMonthlyPageviews(completeMonths(0))).toBe(0)
    expect(aggregateMonthlyPageviews(completeMonths(2))).toBe(24)
    expect(
      aggregateMonthlyPageviews({ ...completeMonths(1), '2026-06': null }),
    ).toBeNull()
    const incomplete = completeMonths(1)
    delete incomplete['2026-06']
    expect(aggregateMonthlyPageviews(incomplete)).toBeNull()
    expect(
      aggregateMonthlyPageviews({ ...completeMonths(1), extra: 1 }),
    ).toBeNull()
  })

  it('proves N=100 cutoffs, zero availability and QID tie ordering', () => {
    const values = Array.from({ length: 100 }, (_, index) => ({
      qid: qid(index + 1),
      total: 100 - index,
    }))
    values[0]!.total = 100
    values[1]!.total = 100
    const bands = assignPageviewBands(values)
    expect(bands.get('Q1')).toBe('top-1-percent')
    expect(bands.get('Q2')).toBe('top-5-percent')
    expect(bands.get('Q5')).toBe('top-5-percent')
    expect(bands.get('Q6')).toBe('top-20-percent')
    expect(bands.get('Q20')).toBe('top-20-percent')
    expect(bands.get('Q21')).toBe('remainder')
    expect(assignPageviewBands([{ qid: 'Q1', total: 0 }]).get('Q1')).toBe(
      'top-1-percent',
    )
    expect(assignPageviewBands([{ qid: 'Q1', total: null }]).get('Q1')).toBe(
      'unavailable',
    )
  })

  it('rejects duplicates and invalid transient totals', () => {
    expect(() =>
      assignPageviewBands([
        { qid: 'Q1', total: 1 },
        { qid: 'Q1', total: 2 },
      ]),
    ).toThrow('unique')
    expect(() => assignPageviewBands([{ qid: 'Q1', total: -1 }])).toThrow()
  })
})

describe('audience ordering and durable receipt', () => {
  it('uses better language, other language, sitelinks then numeric QID', () => {
    const rows = [
      {
        qid: 'Q10',
        englishBand: 'top-5-percent' as const,
        japaneseBand: 'top-20-percent' as const,
        sitelinkBand: '50-plus' as const,
      },
      {
        qid: 'Q2',
        englishBand: 'top-20-percent' as const,
        japaneseBand: 'top-5-percent' as const,
        sitelinkBand: '50-plus' as const,
      },
      {
        qid: 'Q1',
        englishBand: 'top-1-percent' as const,
        japaneseBand: 'unavailable' as const,
        sitelinkBand: '0-to-4' as const,
      },
    ]
    expect(rows.sort(compareAudienceCandidates).map(({ qid }) => qid)).toEqual([
      'Q1',
      'Q2',
      'Q10',
    ])
    expect([0, 4, 5, 19, 20, 49, 50].map(toSitelinkBand)).toEqual([
      '0-to-4',
      '0-to-4',
      '5-to-19',
      '5-to-19',
      '20-to-49',
      '20-to-49',
      '50-plus',
    ])
  })

  it('accepts only the reduced durable commitment shape', () => {
    expect(parseDiscoveryCommitmentReceipt(receipt())).toEqual(receipt())
    expect(() =>
      parseDiscoveryCommitmentReceipt({
        ...receipt(),
        rawPayload: { provider: 'forbidden' },
      }),
    ).toThrow()
    expect(() =>
      parseDiscoveryCommitmentReceipt({
        ...receipt(),
        records: [{ ...receipt().records[0], exactPageviews: 100 }],
      }),
    ).toThrow()
    expect(() =>
      parseDiscoveryCommitmentReceipt({
        ...receipt(),
        records: [receipt().records[0], receipt().records[0]],
        selectedQidCount: 2,
      }),
    ).toThrow('unique')
    expect(() =>
      parseDiscoveryCommitmentReceipt({
        ...receipt(),
        selectedQidCount: 2,
      }),
    ).toThrow('does not match')
    expect(() =>
      parseDiscoveryCommitmentReceipt({
        ...receipt(),
        querySpecificationSha256: '0'.repeat(64),
      }),
    ).toThrow('specification hash')
    expect(() =>
      parseDiscoveryCommitmentReceipt({
        ...receipt(),
        records: [
          {
            ...receipt().records[0],
            reasonCodes: ['audience-en', 'audience-en'],
          },
        ],
      }),
    ).toThrow('canonically sorted')
  })
})
