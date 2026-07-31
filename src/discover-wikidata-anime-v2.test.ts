import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildActionUrl,
  buildPageviewUrl,
  buildWdqsQueries,
  buildWdqsUrl,
  createDiscoveryCommitmentFromCandidateReceipt,
  createSafeDiscoveryAggregate,
  DiscoveryCommandError,
  finalizeDiscoveryReceipt,
  formatDiscoveryCommandError,
  parseActionMappings,
  parseDiscoveryArguments,
  parsePageviewMonths,
  parseWdqsRows,
  publishCandidateReceiptAtomically,
  runDiscovery,
  runDiscoveryCommand,
  SequentialDiscoveryRequester,
  assertDiscoveryRuntimeEnvironment,
  assertDiscoveryOutputVacant,
  type CandidateReceipt,
  type DiscoveryClock,
} from '../scripts/discover-wikidata-anime-v2'
import {
  aggregateMonthlyPageviews,
  discoveryFormatClasses,
  discoveryFormatSentinels,
  discoveryLimits,
  discoveryReleaseYearProjection,
  discoverySpecificationHashes,
  discoveryUserAgent,
  discoveryWindow,
  type DiscoveryFormat,
} from '@/features/anime/catalogue/wikidata-anime-discovery'

function jsonResponse(input: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(input), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function binding(
  qid: string,
  classQid: string,
  publicationYear: number | null,
  startYear: number | null = null,
) {
  return {
    item: { type: 'uri', value: `http://www.wikidata.org/entity/${qid}` },
    classes: {
      type: 'literal',
      value: `http://www.wikidata.org/entity/${classQid}`,
    },
    ...(publicationYear === null
      ? {}
      : {
          publicationYear: {
            type: 'literal',
            value: String(publicationYear),
            datatype: 'http://www.w3.org/2001/XMLSchema#integer',
          },
        }),
    ...(startYear === null
      ? {}
      : {
          startYear: {
            type: 'literal',
            value: String(startYear),
            datatype: 'http://www.w3.org/2001/XMLSchema#integer',
          },
        }),
  }
}

function wdqsBody(rows: readonly ReturnType<typeof binding>[]) {
  return {
    head: {
      vars: ['item', 'classes', 'publicationYear', 'startYear'],
    },
    results: { bindings: rows },
  }
}

function actionBody(
  qids: readonly string[],
  withSitelinks: boolean | readonly string[] = false,
): {
  success: 1
  entities: Record<
    string,
    {
      id: string
      type: 'item'
      sitelinks: Record<
        string,
        { site: string; title: string; badges: string[] }
      >
    }
  >
} {
  return {
    success: 1 as const,
    entities: Object.fromEntries(
      qids.map((qid) => {
        const includeSitelinks =
          withSitelinks === true ||
          (Array.isArray(withSitelinks) && withSitelinks.includes(qid))
        return [
          qid,
          {
            id: qid,
            type: 'item',
            sitelinks: includeSitelinks
              ? {
                  enwiki: {
                    site: 'enwiki',
                    title: `English ${qid}`,
                    badges: [],
                  },
                  ...(withSitelinks === true
                    ? {
                        jawiki: {
                          site: 'jawiki',
                          title: `Japanese ${qid}`,
                          badges: [],
                        },
                        dewiki: {
                          site: 'dewiki',
                          title: `German ${qid}`,
                          badges: [],
                        },
                      }
                    : {}),
                }
              : {},
          },
        ]
      }),
    ),
  }
}

function pageviewBody(
  views = 0,
  project: 'en.wikipedia' | 'ja.wikipedia' = 'en.wikipedia',
  article = 'Example',
) {
  return {
    items: discoveryWindow.months.map((month) => ({
      project,
      article,
      granularity: 'monthly',
      timestamp: `${month.replace('-', '')}0100`,
      access: 'all-access',
      agent: 'user',
      views,
    })),
  }
}

function fakeClock(initial = 0) {
  let now = initial
  const clock: DiscoveryClock = {
    now: () => now,
    setTimeout: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearTimeout: vi.fn(),
  }
  return {
    clock,
    delay: vi.fn(async (milliseconds: number) => {
      now += milliseconds
    }),
    advance(milliseconds: number) {
      now += milliseconds
    },
  }
}

describe('discovery CLI and query contract', () => {
  it('requires an exact explicit check or confirmed live command', () => {
    expect(parseDiscoveryArguments(['check'])).toEqual({ mode: 'check' })
    expect(
      parseDiscoveryArguments(['discover', '--confirm-wikimedia-live']),
    ).toEqual({ mode: 'discover' })
    expect(
      parseDiscoveryArguments(['finalize', '--confirm-dual-review']),
    ).toEqual({ mode: 'finalize' })
    for (const invalid of [
      [],
      ['discover'],
      ['--confirm-wikimedia-live', 'discover'],
      ['check', '--confirm-wikimedia-live'],
    ]) {
      expect(() => parseDiscoveryArguments(invalid)).toThrow('Usage:')
    }
  })

  it('refuses CI, test, hosted and scheduled execution', () => {
    expect(() => assertDiscoveryRuntimeEnvironment({})).not.toThrow()
    for (const environment of [
      { CI: 'true' },
      { CI: '1' },
      { NODE_ENV: 'test' },
      { VERCEL: '1' },
      { VERCEL_ENV: 'production' },
      { GITHUB_ACTIONS: 'true' },
      { ZEDARCHIVE_SCHEDULED_JOB: 'daily' },
    ]) {
      expect(() => assertDiscoveryRuntimeEnvironment(environment)).toThrow(
        'unavailable',
      )
    }
  })

  it('commits direct statement-node queries with exact classes and sentinels', () => {
    const queries = buildWdqsQueries()
    expect(Object.keys(queries)).toEqual([
      'tv',
      'movie',
      'ova',
      'ona',
      'special',
    ])
    for (const [format, query] of Object.entries(queries) as [
      DiscoveryFormat,
      string,
    ][]) {
      expect(query).toContain('?item p:P31 ?statement')
      expect(query).toContain('?statement ps:P31 ?class')
      expect(query).toContain('wikibase:rank')
      expect(query).toContain(
        'FILTER(?statementRank != wikibase:DeprecatedRank)',
      )
      expect(query).toContain('?item p:P577 ?publicationStatement')
      expect(query).toContain(
        '?publicationStatement psv:P577 ?publicationValue',
      )
      expect(query).toContain('?item p:P580 ?startStatement')
      expect(query).toContain('?startStatement psv:P580 ?startValue')
      expect(query).toContain('MIN(YEAR(?publicationDate)) AS ?publicationYear')
      expect(query).toContain('MIN(YEAR(?startDate)) AS ?startYear')
      expect(query).toContain('AS ?publicationYear')
      expect(query).toContain('AS ?startYear')
      expect(query).toContain(
        'FILTER(?publicationRank != wikibase:DeprecatedRank)',
      )
      expect(query).toContain('FILTER(?startRank != wikibase:DeprecatedRank)')
      expect(query).toContain(
        `?publicationPrecision >= ${discoveryReleaseYearProjection.minimumTimePrecision}`,
      )
      expect(query).toContain(
        `?startPrecision >= ${discoveryReleaseYearProjection.minimumTimePrecision}`,
      )
      expect(query).toContain('GROUP_CONCAT(DISTINCT STR(?class)')
      expect(query).toContain('GROUP BY ?item')
      expect(query).toContain(`LIMIT ${discoveryFormatSentinels[format] + 1}`)
      for (const qid of discoveryFormatClasses[format]) {
        expect(query).toContain(`wd:${qid}`)
      }
      expect(query).not.toContain('wdt:P31/wdt:P279')
      expect(query).not.toContain('wdt:P577')
      expect(query).not.toContain('wdt:P580')
      expect(query).not.toContain('COALESCE')
      expect(query).not.toContain('P571')
      expect(query).not.toContain('P136')
    }
  })

  it('validates check mode without network, filesystem or environment reads', async () => {
    const requester = {
      request: vi.fn(),
      responseHashes: [],
      evidence: {
        attempts: 0,
        successfulPageviews: 0,
        retries: 0,
        pacingWaits: 0,
        pacingDelayMilliseconds: 0,
        elapsedMilliseconds: 0,
        maximumConcurrency: 1 as const,
      },
    }
    const readPredecessorQids = vi.fn()
    const assertOutputVacant = vi.fn()
    const publishReceipt = vi.fn()
    const log = vi.fn()
    await runDiscoveryCommand(['check'], {
      requester,
      readPredecessorQids,
      assertOutputVacant,
      publishReceipt,
      environment: { CI: 'true', NODE_ENV: 'test' },
      log,
    })
    expect(log).toHaveBeenCalledWith(
      'Validated the bounded anime-v2 discovery contract.',
    )
    expect(requester.request).not.toHaveBeenCalled()
    expect(readPredecessorQids).not.toHaveBeenCalled()
    expect(assertOutputVacant).not.toHaveBeenCalled()
    expect(publishReceipt).not.toHaveBeenCalled()
  })

  it('builds bounded provider URLs without redirect identity resolution', () => {
    const wdqs = buildWdqsUrl('SELECT ?item WHERE {}')
    expect(wdqs.origin).toBe('https://query.wikidata.org')
    expect(wdqs.searchParams.get('format')).toBe('json')
    const action = buildActionUrl(['Q1', 'Q2'])
    expect(action.searchParams.get('ids')).toBe('Q1|Q2')
    expect(action.searchParams.get('props')).toBe('sitelinks')
    expect(action.searchParams.get('maxlag')).toBe('10')
    expect(action.searchParams.has('redirects')).toBe(false)
    expect(() =>
      buildActionUrl(Array.from({ length: 26 }, (_, index) => `Q${index + 1}`)),
    ).toThrow('group')
    const pageviews = buildPageviewUrl('en', 'Title Part/Two')
    expect(pageviews.pathname).toContain('Title_Part%2FTwo')
    expect(pageviews.pathname).toContain('/all-access/user/')
    expect(pageviews.pathname).toContain('/monthly/2025070100/2026063000')
  })
})

describe('strict provider projections', () => {
  it('parses only exact WDQS QID/class/rank/year rows', () => {
    expect(parseWdqsRows(wdqsBody([binding('Q1', 'Q63952888', 2020)]))).toEqual(
      [
        {
          qid: 'Q1',
          classQid: 'Q63952888',
          rank: 'normal',
          releaseYear: 2020,
        },
      ],
    )
    expect(
      parseWdqsRows(wdqsBody([binding('Q2', 'Q63952888', null, 2021)])),
    ).toEqual([
      {
        qid: 'Q2',
        classQid: 'Q63952888',
        rank: 'normal',
        releaseYear: 2021,
      },
    ])
    expect(
      parseWdqsRows(wdqsBody([binding('Q3', 'Q63952888', 2019, 2021)])),
    ).toEqual([
      {
        qid: 'Q3',
        classQid: 'Q63952888',
        rank: 'normal',
        releaseYear: 2019,
      },
    ])
    expect(
      parseWdqsRows(wdqsBody([binding('Q4', 'Q63952888', null, null)])),
    ).toEqual([
      {
        qid: 'Q4',
        classQid: 'Q63952888',
        rank: 'normal',
        releaseYear: null,
      },
    ])
    expect(() =>
      parseWdqsRows({
        ...wdqsBody([binding('Q1', 'Q63952888', 2020)]),
        rawPayload: true,
      }),
    ).toThrow()
    expect(() =>
      parseWdqsRows(
        wdqsBody([
          {
            ...binding('Q1', 'Q63952888', 2020),
            classes: { type: 'literal', value: 'private-class' },
          },
        ]),
      ),
    ).toThrow('entity URI')
    expect(() =>
      parseWdqsRows(
        wdqsBody([
          {
            ...binding('Q1', 'Q63952888', 2020),
            item: {
              type: 'literal',
              value: 'http://www.wikidata.org/entity/Q1',
            },
          },
        ]),
      ),
    ).toThrow()
    expect(() =>
      parseWdqsRows({
        ...wdqsBody([binding('Q1', 'Q63952888', 2020)]),
        head: {
          vars: ['classes', 'item', 'publicationYear', 'startYear'],
        },
      }),
    ).toThrow()
    expect(() =>
      parseWdqsRows(
        wdqsBody([
          {
            ...binding('Q1', 'Q63952888', 2020),
            publicationYear: {
              type: 'literal',
              value: '2020',
              datatype: 'http://www.w3.org/2001/XMLSchema#string',
            },
          },
        ]),
      ),
    ).toThrow()
  })

  it('requires exact Action entity ownership and detects article ambiguity', () => {
    expect(parseActionMappings(actionBody(['Q1'], true), ['Q1'])).toEqual([
      {
        qid: 'Q1',
        englishTitle: 'English Q1',
        japaneseTitle: 'Japanese Q1',
        sitelinkCount: 3,
      },
    ])
    expect(() => parseActionMappings(actionBody(['Q2']), ['Q1'])).toThrow(
      'omitted or added',
    )
    const ambiguous = actionBody(['Q1', 'Q2'], true)
    ambiguous.entities.Q2!.sitelinks.enwiki!.title = 'English Q1'
    expect(() => parseActionMappings(ambiguous, ['Q1', 'Q2'])).toThrow(
      'multiple candidate',
    )
    expect(() =>
      parseActionMappings(
        {
          ...actionBody(['Q1']),
          redirects: [{ from: 'Q1', to: 'Q2' }],
        },
        ['Q1'],
      ),
    ).toThrow()
    const wrongSite = actionBody(['Q1'], true)
    wrongSite.entities.Q1!.sitelinks.enwiki!.site = 'jawiki'
    expect(() => parseActionMappings(wrongSite, ['Q1'])).toThrow(
      'sitelink mapping',
    )
    const withoutSitelinks = {
      success: 1,
      entities: {
        Q1: {
          id: 'Q1',
          type: 'item',
        },
      },
    }
    expect(() => parseActionMappings(withoutSitelinks, ['Q1'])).toThrow()
    expect(() =>
      parseActionMappings({ ...actionBody(['Q1']), success: 0 }, ['Q1']),
    ).toThrow()
  })

  it('requires the exact monthly Analytics shape and preserves zero', () => {
    const months = parsePageviewMonths(pageviewBody(0))
    expect(aggregateMonthlyPageviews(months)).toBe(0)
    expect(() =>
      parsePageviewMonths({
        items: [
          ...pageviewBody(1).items,
          { ...pageviewBody(1).items[0], timestamp: '2025070100' },
        ],
      }),
    ).toThrow('duplicate')
    expect(() =>
      parsePageviewMonths({
        items: [{ ...pageviewBody(1).items[0], exactRank: 1 }],
      }),
    ).toThrow()
    expect(() =>
      parsePageviewMonths(pageviewBody(1), {
        language: 'ja',
        article: 'Example',
      }),
    ).toThrow('ambiguous article')
  })
})

describe('sequential bounded requester', () => {
  it('uses exact identity, gzip, media type and completion-to-start pacing', async () => {
    const timing = fakeClock()
    const starts: number[] = []
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      starts.push(timing.clock.now())
      expect(init?.headers).toEqual({
        Accept: 'application/sparql-results+json',
        'Accept-Encoding': 'gzip',
        'User-Agent': discoveryUserAgent,
      })
      expect(init?.redirect).toBe('error')
      timing.advance(25)
      return jsonResponse(wdqsBody([]))
    })
    const requester = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: timing.delay,
      clock: timing.clock,
    })
    await requester.request(buildWdqsUrl('one'), 'wdqs')
    await requester.request(buildWdqsUrl('two'), 'wdqs')
    expect(starts).toEqual([0, 375])
    expect(timing.delay).toHaveBeenCalledWith(350)
    expect(requester.evidence).toEqual({
      attempts: 2,
      successfulPageviews: 0,
      retries: 0,
      pacingWaits: 1,
      pacingDelayMilliseconds: 350,
      elapsedMilliseconds: 400,
      maximumConcurrency: 1,
    })
  })

  it('logs count-only progress after each 500 completed attempts without a heartbeat', async () => {
    const timing = fakeClock()
    const logs: string[] = []
    let fetchCalls = 0
    const requester = new SequentialDiscoveryRequester({
      fetch: vi.fn(async () => {
        fetchCalls += 1
        return fetchCalls === 500
          ? new Response(null, { status: 404 })
          : jsonResponse(wdqsBody([]))
      }),
      delay: timing.delay,
      clock: timing.clock,
      log: (message) => logs.push(message),
    })
    const privateRequestUrl = buildWdqsUrl(
      'SELECT Q999 WHERE { BIND("Private title and secret" AS ?private) }',
    )

    for (let completed = 0; completed < 499; completed += 1) {
      await requester.request(privateRequestUrl, 'wdqs')
    }
    expect(logs).toEqual([])

    await requester.request(
      buildPageviewUrl('en', 'Private title Q999 secret'),
      'pageview',
    )
    expect(logs).toEqual([
      `M45 discovery progress: ${JSON.stringify({
        elapsedMilliseconds: 174_650,
        completedHttpAttempts: 500,
        successfulPageviewRequests: 0,
        retries: 0,
        pacingWaits: 499,
        pacingDelayMilliseconds: 174_650,
        maximumObservedConcurrency: 1,
      })}`,
    ])
    expect(logs[0]).not.toContain('Q999')
    expect(logs[0]).not.toContain('Private title')
    expect(logs[0]).not.toContain('secret')

    for (let completed = 500; completed < 999; completed += 1) {
      await requester.request(privateRequestUrl, 'wdqs')
    }
    expect(logs).toHaveLength(1)

    await requester.request(privateRequestUrl, 'wdqs')
    expect(logs[1]).toBe(
      `M45 discovery progress: ${JSON.stringify({
        elapsedMilliseconds: 349_650,
        completedHttpAttempts: 1_000,
        successfulPageviewRequests: 0,
        retries: 0,
        pacingWaits: 999,
        pacingDelayMilliseconds: 349_650,
        maximumObservedConcurrency: 1,
      })}`,
    )
  })

  it('does not emit a time-based heartbeat', () => {
    const timing = fakeClock()
    const logs: string[] = []
    new SequentialDiscoveryRequester({
      fetch: vi.fn(async () => jsonResponse(wdqsBody([]))),
      delay: timing.delay,
      clock: timing.clock,
      log: (message) => logs.push(message),
    })

    timing.advance(discoveryLimits.maximumWallTimeMilliseconds - 1)
    expect(logs).toEqual([])
  })

  it('rejects concurrent calls and keeps concurrency one', async () => {
    const timing = fakeClock()
    let resolveFirst: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst ??= resolve
        }),
    )
    const requester = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: timing.delay,
      clock: timing.clock,
    })
    const first = requester.request(buildWdqsUrl('one'), 'wdqs')
    await expect(
      requester.request(buildWdqsUrl('two'), 'wdqs'),
    ).rejects.toThrow('concurrent')
    resolveFirst?.(jsonResponse(wdqsBody([])))
    await first
  })

  it('retries 429, 503 and maxlag with bounded delays', async () => {
    const timing = fakeClock()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      )
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({
          error: { code: 'maxlag', info: 'provider-private-detail' },
        }),
      )
    const requester = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: timing.delay,
      clock: timing.clock,
    })
    await expect(
      requester.request(buildActionUrl(['Q1']), 'action'),
    ).rejects.toThrow('retry budget')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(timing.delay.mock.calls.flat()).toContain(2_000)
    expect(timing.delay.mock.calls.flat()).toContain(10_000)
  })

  it('aborts excessive Retry-After, oversized bodies and schema-independent 404', async () => {
    const timing = fakeClock()
    const excessive = new SequentialDiscoveryRequester({
      fetch: async () =>
        jsonResponse({}, { status: 429, headers: { 'retry-after': '31' } }),
      delay: timing.delay,
      clock: timing.clock,
    })
    await expect(
      excessive.request(buildActionUrl(['Q1']), 'action'),
    ).rejects.toThrow('Retry-After')

    const oversized = new SequentialDiscoveryRequester({
      fetch: async () =>
        new Response('{}', {
          headers: { 'content-length': String(6 * 1024 * 1024) },
        }),
      delay: timing.delay,
      clock: timing.clock,
    })
    await expect(
      oversized.request(buildWdqsUrl('query'), 'wdqs'),
    ).rejects.toThrow('size limit')

    const chunk = new Uint8Array(600 * 1024)
    const chunked = new SequentialDiscoveryRequester({
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(chunk)
              controller.enqueue(chunk)
              controller.close()
            },
          }),
        ),
      delay: timing.delay,
      clock: timing.clock,
    })
    await expect(
      chunked.request(buildPageviewUrl('en', 'Large'), 'pageview'),
    ).rejects.toThrow('size limit')

    const missing = new SequentialDiscoveryRequester({
      fetch: async () => new Response('private', { status: 404 }),
      delay: timing.delay,
      clock: timing.clock,
    })
    await expect(
      missing.request(buildPageviewUrl('en', 'Missing'), 'pageview'),
    ).resolves.toMatchObject({ availability: 'unavailable' })

    const oversizedMissing = new SequentialDiscoveryRequester({
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(chunk)
              controller.enqueue(chunk)
              controller.close()
            },
          }),
          { status: 404 },
        ),
      delay: timing.delay,
      clock: timing.clock,
    })
    await expect(
      oversizedMissing.request(buildPageviewUrl('en', 'Missing'), 'pageview'),
    ).rejects.toThrow('size limit')
  })

  it('enforces total attempts, pageview successes and wall time before fetch', async () => {
    const timing = fakeClock()
    const fetchMock = vi.fn(async () => jsonResponse(pageviewBody(0)))
    const attempts = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: timing.delay,
      clock: timing.clock,
    })
    ;(
      attempts as unknown as {
        attempts: number
      }
    ).attempts = discoveryLimits.maximumHttpAttempts
    await expect(
      attempts.request(buildWdqsUrl('query'), 'wdqs'),
    ).rejects.toThrow('HTTP-attempt')

    const pageviews = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: timing.delay,
      clock: timing.clock,
    })
    ;(
      pageviews as unknown as {
        successfulPageviews: number
      }
    ).successfulPageviews = discoveryLimits.maximumSuccessfulPageviewRequests
    await expect(
      pageviews.request(buildPageviewUrl('en', 'Example'), 'pageview'),
    ).rejects.toThrow('pageview limit')

    const justBeforeWall = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: timing.delay,
      clock: timing.clock,
    })
    timing.advance(discoveryLimits.maximumWallTimeMilliseconds - 1)
    await expect(
      justBeforeWall.request(buildWdqsUrl('query'), 'wdqs'),
    ).resolves.toMatchObject({ availability: 'available' })

    const wallTiming = fakeClock()
    const wall = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: wallTiming.delay,
      clock: wallTiming.clock,
    })
    wallTiming.advance(discoveryLimits.maximumWallTimeMilliseconds)
    await expect(wall.request(buildWdqsUrl('query'), 'wdqs')).rejects.toThrow(
      'wall-time',
    )
  })

  it('logs only closed count evidence when a discovery run stops', async () => {
    const timing = fakeClock()
    const logs: string[] = []
    const requester = new SequentialDiscoveryRequester({
      fetch: vi.fn(async () => jsonResponse(wdqsBody([]))),
      delay: timing.delay,
      clock: timing.clock,
      log: (message) => logs.push(message),
    })
    timing.advance(discoveryLimits.maximumWallTimeMilliseconds)

    await expect(
      runDiscovery({
        requester,
        environment: {},
        assertOutputVacant: vi.fn(async () => undefined),
        readPredecessorQids: vi.fn(async () => new Set<string>()),
      }),
    ).rejects.toThrow('wall-time')
    expect(logs).toEqual([
      `M45 discovery terminal evidence: ${JSON.stringify({
        terminalCategory: 'wall-time-limit',
        elapsedMilliseconds: 57_600_000,
        completedHttpAttempts: 0,
        successfulPageviewRequests: 0,
        retries: 0,
        pacingWaits: 0,
        pacingDelayMilliseconds: 0,
        maximumObservedConcurrency: 0,
      })}`,
    ])
    expect(logs[0]).not.toContain('query=')
    expect(logs[0]).not.toContain('response')
    expect(logs[0]).not.toContain('sha')
  })

  it('keeps the timeout active and retries a timeout only three times', async () => {
    const clock: DiscoveryClock = {
      now: () => 0,
      setTimeout: (callback) => {
        callback()
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: vi.fn(),
    }
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true)
      throw new DOMException('private timeout detail', 'AbortError')
    })
    const requester = new SequentialDiscoveryRequester({
      fetch: fetchMock,
      delay: async () => undefined,
      clock,
    })
    await expect(
      requester.request(buildWdqsUrl('query'), 'wdqs'),
    ).rejects.toThrow('retry budget')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('redacts dependency and provider details from public failures', () => {
    const secret = 'postgresql://private:secret@example.test/database'
    expect(formatDiscoveryCommandError(new Error(secret))).toBe(
      'Catalogue discovery failed without promoting a candidate receipt.',
    )
    expect(
      formatDiscoveryCommandError(new DiscoveryCommandError('bounded failure')),
    ).toBe('bounded failure')
  })
})

describe('complete fixture-only discovery and atomic promotion', () => {
  it('freezes 6,000 candidates without network or database access', async () => {
    const totals: Record<DiscoveryFormat, number> = {
      tv: 4_458,
      movie: 1_063,
      ova: 313,
      ona: 125,
      special: 44,
    }
    const eraAllocations: [number, number][] = [
      [125, 1970],
      [344, 1985],
      [563, 1995],
      [1_000, 2005],
      [1_500, 2015],
      [1_500, 2025],
    ]
    const years: (number | null)[] = eraAllocations.flatMap(([count, year]) =>
      Array.from({ length: count }, () => year),
    )
    while (years.length < 6_003) years.push(null)
    let next = 1
    const rowsByFormat = new Map<
      DiscoveryFormat,
      ReturnType<typeof binding>[]
    >()
    for (const [format, total] of Object.entries(totals) as [
      DiscoveryFormat,
      number,
    ][]) {
      const classQid = discoveryFormatClasses[format][0]
      rowsByFormat.set(
        format,
        Array.from({ length: total }, () => {
          const current = next
          next += 1
          return binding(`Q${current}`, classQid, years[current - 1] ?? null)
        }),
      )
    }
    let wdqsIndex = 0
    const assertWithinWallTime = vi.fn()
    const requester = {
      responseHashes: ['a'.repeat(64)],
      evidence: {
        attempts: 247,
        successfulPageviews: 1,
        retries: 0,
        pacingWaits: 246,
        pacingDelayMilliseconds: 86_100,
        elapsedMilliseconds: 90_000,
        maximumConcurrency: 1 as const,
      },
      assertWithinWallTime,
      request: vi.fn(async (url: URL, kind: string) => {
        if (kind === 'wdqs') {
          const format = (
            Object.keys(discoveryFormatClasses) as DiscoveryFormat[]
          )[wdqsIndex++]
          return {
            availability: 'available' as const,
            json: wdqsBody(rowsByFormat.get(format!) ?? []),
            responseSha256: 'a'.repeat(64),
          }
        }
        if (kind === 'action') {
          const qids = url.searchParams.get('ids')?.split('|') ?? []
          return {
            availability: 'available' as const,
            json: actionBody(qids, ['Q1']),
            responseSha256: 'b'.repeat(64),
          }
        }
        if (kind === 'pageview') {
          return {
            availability: 'available' as const,
            json: pageviewBody(1, 'en.wikipedia', 'English_Q1'),
            responseSha256: 'c'.repeat(64),
          }
        }
        throw new Error('Unexpected fixture request')
      }),
    }
    const publishReceipt = vi.fn(async () => '/ignored/frozen-run')
    const result = await runDiscovery({
      requester,
      environment: {},
      assertOutputVacant: async () => undefined,
      readPredecessorQids: async () => new Set(),
      publishReceipt,
      now: () => new Date('2026-07-31T12:00:00.000Z'),
    })
    expect(result.receipt.candidates).toHaveLength(6_003)
    expect(result.receipt.identityBlocked).toEqual([])
    expect(result.receipt.specificationHashes).toEqual(
      discoverySpecificationHashes,
    )
    expect(requester.request).toHaveBeenCalledTimes(
      5 + Math.ceil(6_003 / 25) + 1,
    )
    expect(
      requester.request.mock.calls.some((call) => call[1] === 'pageview'),
    ).toBe(true)
    expect(assertWithinWallTime).toHaveBeenCalledOnce()
    expect(publishReceipt).toHaveBeenCalledOnce()
    expect(JSON.stringify(result.receipt)).not.toContain('rawPayload')

    const selected = [
      {
        qid: result.receipt.candidates[0]!.qid,
        reasonCodes: ['audience-en'] as const,
      },
    ]
    const commitment = createDiscoveryCommitmentFromCandidateReceipt(
      result.receipt,
      selected,
      { primary: 'approved', independent: 'approved' },
    )
    expect(commitment.selectedQidCount).toBe(1)
    expect(commitment.records[0]?.qid).toBe(selected[0]!.qid)
    expect(JSON.stringify(commitment)).not.toContain('englishArticle')
    expect(JSON.stringify(commitment)).not.toContain('englishTotal')
    expect(() =>
      createDiscoveryCommitmentFromCandidateReceipt(
        result.receipt,
        [{ qid: 'Q99999999', reasonCodes: ['audience-en'] }],
        { primary: 'approved', independent: 'approved' },
      ),
    ).toThrow('absent')

    const finalizationDirectory = await mkdtemp(
      join(tmpdir(), 'zedarchive-m45-finalization-'),
    )
    const frozenDirectory = join(finalizationDirectory, 'frozen-run')
    await mkdir(frozenDirectory)
    try {
      await writeFile(
        join(frozenDirectory, 'candidate-receipt.json'),
        JSON.stringify(result.receipt),
      )
      const reviewedSelection = {
        schema: 'zedarchive.anime-discovery-reviewed-selection',
        version: 1,
        candidateReceiptSha256: createSafeDiscoveryAggregate(result.receipt)
          .candidateReceiptSha256,
        selected: result.receipt.candidates
          .slice(0, 5_000)
          .map(({ qid }) => ({ qid, reasonCodes: ['coverage-cell'] })),
        reviews: {
          primary: 'approved',
          independent: 'approved',
        } as const,
      }
      await writeFile(
        join(frozenDirectory, 'reviewed-selection.json'),
        JSON.stringify({
          ...reviewedSelection,
          candidateReceiptSha256: '0'.repeat(64),
        }),
      )
      await expect(
        finalizeDiscoveryReceipt(finalizationDirectory),
      ).rejects.toThrow('does not match')
      await writeFile(
        join(frozenDirectory, 'reviewed-selection.json'),
        JSON.stringify({
          ...reviewedSelection,
          reviews: { primary: 'approved', independent: 'pending' },
        }),
      )
      await expect(
        finalizeDiscoveryReceipt(finalizationDirectory),
      ).rejects.toThrow()
      await expect(
        readFile(join(frozenDirectory, 'candidate-receipt.json'), 'utf8'),
      ).resolves.toBeTruthy()
      await writeFile(
        join(frozenDirectory, 'reviewed-selection.json'),
        JSON.stringify(reviewedSelection),
      )
      await expect(
        finalizeDiscoveryReceipt(finalizationDirectory, {
          removeCandidate: async () => {
            throw new Error('injected candidate cleanup failure')
          },
        }),
      ).rejects.toThrow('injected candidate cleanup failure')
      await expect(
        readFile(join(frozenDirectory, 'discovery-commitment.json'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        readFile(join(frozenDirectory, 'candidate-receipt.json'), 'utf8'),
      ).resolves.toBeTruthy()

      const durablePath = await finalizeDiscoveryReceipt(finalizationDirectory)
      const durable = await readFile(durablePath, 'utf8')
      expect(JSON.parse(durable)).toMatchObject({
        selectedQidCount: 5_000,
        reviews: { primary: 'approved', independent: 'approved' },
      })
      await expect(
        readFile(join(frozenDirectory, 'candidate-receipt.json'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(durable).not.toContain('englishArticle')
      expect(durable).not.toContain('englishTotal')
      expect(
        (await readdir(frozenDirectory)).filter((name) =>
          name.startsWith('.commitment-staging-'),
        ),
      ).toEqual([])
    } finally {
      await rm(finalizationDirectory, { force: true, recursive: true })
    }

    const recoveryDirectory = await mkdtemp(
      join(tmpdir(), 'zedarchive-m45-finalization-recovery-'),
    )
    const recoveryFrozenDirectory = join(recoveryDirectory, 'frozen-run')
    await mkdir(recoveryFrozenDirectory)
    const recoverySelection = {
      schema: 'zedarchive.anime-discovery-reviewed-selection',
      version: 1,
      candidateReceiptSha256: createSafeDiscoveryAggregate(result.receipt)
        .candidateReceiptSha256,
      selected: result.receipt.candidates
        .slice(0, 5_000)
        .map(({ qid }) => ({ qid, reasonCodes: ['coverage-cell'] })),
      reviews: {
        primary: 'approved',
        independent: 'approved',
      } as const,
    }
    const expectedCommitment = createDiscoveryCommitmentFromCandidateReceipt(
      result.receipt,
      recoverySelection.selected,
      recoverySelection.reviews,
    )
    try {
      await writeFile(
        join(recoveryFrozenDirectory, 'candidate-receipt.json'),
        JSON.stringify(result.receipt),
      )
      await writeFile(
        join(recoveryFrozenDirectory, 'reviewed-selection.json'),
        JSON.stringify(recoverySelection),
      )
      await writeFile(
        join(recoveryFrozenDirectory, 'discovery-commitment.json'),
        JSON.stringify({
          ...expectedCommitment,
          providerResponseSetSha256: '0'.repeat(64),
        }),
      )
      await expect(finalizeDiscoveryReceipt(recoveryDirectory)).rejects.toThrow(
        'does not match',
      )
      await expect(
        readFile(
          join(recoveryFrozenDirectory, 'candidate-receipt.json'),
          'utf8',
        ),
      ).resolves.toBeTruthy()

      await writeFile(
        join(recoveryFrozenDirectory, 'discovery-commitment.json'),
        JSON.stringify(expectedCommitment),
      )
      await writeFile(
        join(recoveryFrozenDirectory, '.commitment-staging-crash'),
        JSON.stringify(expectedCommitment),
      )
      await expect(finalizeDiscoveryReceipt(recoveryDirectory)).resolves.toBe(
        join(recoveryFrozenDirectory, 'discovery-commitment.json'),
      )
      expect(
        (await readdir(recoveryFrozenDirectory)).filter((name) =>
          name.startsWith('.commitment-staging-'),
        ),
      ).toEqual([])
      await expect(
        readFile(
          join(recoveryFrozenDirectory, 'candidate-receipt.json'),
          'utf8',
        ),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(recoveryDirectory, { force: true, recursive: true })
    }
  })

  it('atomically promotes once and refuses overwrite without staging residue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zedarchive-m45-discovery-'))
    const minimalReceipt: CandidateReceipt = {
      schema: 'zedarchive.anime-discovery-candidate-receipt',
      version: 1,
      release: 'anime-v2',
      executedAt: '2026-07-31T12:00:00.000Z',
      window: {
        start: discoveryWindow.start,
        end: discoveryWindow.end,
      },
      specificationHashes: discoverySpecificationHashes,
      providerResponseSetSha256: 'a'.repeat(64),
      requestEvidence: {
        attempts: 0,
        successfulPageviews: 0,
        retries: 0,
        pacingWaits: 0,
        pacingDelayMilliseconds: 0,
        elapsedMilliseconds: 0,
        maximumConcurrency: 1,
      },
      identityBlocked: [],
      candidates: [],
    }
    try {
      const staleStaging = join(directory, '.staging-interrupted')
      await mkdir(staleStaging)
      await expect(assertDiscoveryOutputVacant(directory)).rejects.toThrow(
        'interrupted run',
      )
      await rm(staleStaging, { recursive: true })
      await expect(
        assertDiscoveryOutputVacant(directory),
      ).resolves.toBeUndefined()

      const promoted = await publishCandidateReceiptAtomically(
        minimalReceipt,
        directory,
      )
      expect(promoted).toBe(join(directory, 'frozen-run'))
      expect(
        JSON.parse(
          await readFile(join(promoted, 'candidate-receipt.json'), 'utf8'),
        ),
      ).toEqual(minimalReceipt)
      const safeAggregate = JSON.parse(
        await readFile(join(promoted, 'safe-aggregate.json'), 'utf8'),
      ) as unknown
      expect(safeAggregate).toEqual(
        createSafeDiscoveryAggregate(minimalReceipt),
      )
      expect(JSON.stringify(safeAggregate)).not.toContain('englishArticle')
      expect(JSON.stringify(safeAggregate)).not.toContain('englishTotal')
      expect(JSON.stringify(safeAggregate)).not.toContain('pageview')
      await expect(
        publishCandidateReceiptAtomically(minimalReceipt, directory),
      ).rejects.toThrow('no resume or overwrite')
      expect(
        (await readdir(directory)).filter((name) =>
          name.startsWith('.staging-'),
        ),
      ).toEqual([])
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
