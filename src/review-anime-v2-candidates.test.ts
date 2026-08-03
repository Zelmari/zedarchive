import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CandidateReviewCommandError,
  SequentialCandidateRequester,
  buildCandidatePreparationArtifacts,
  candidateReviewCanonicalSubphaseResultSchema,
  candidateReviewCanonicalSubphaseSchema,
  candidateReviewLockTerminalPhaseSchema,
  completeCandidateReviewManifestForFixture,
  checkCandidateReviewContract,
  createCandidateTerminalDiagnostic,
  fetchCandidateEntitiesBounded,
  finalizeCandidateReviewForFixture,
  lockCandidateReviewManifestForFixture,
  parseCandidateReviewArguments,
  recoverCandidateReviewRoundTwoForFixture,
  runCandidateReviewCommandForFixture,
  validateCandidateCanonicalRoundStateWithPreloadedContextForFixture,
  verifyCandidateCanonicalSubphase,
  verifyCandidateCanonicalSubphaseForFixture,
  validateCandidateCompletedResultForFixture,
  auditCandidatePredecessorCollisionsForFixture,
  auditActiveCandidateReviewForFixture,
  verifyCandidateRecoveryForFixture,
} from '@/../scripts/review-anime-v2-candidates'
import {
  createLockedCandidateReviewManifest,
  deriveCandidateReviewRoundSha256,
  parseCandidateAcquisitionSourceReceiptForFixture,
} from '@/features/anime/catalogue/anime-v2-candidate-acquisition'
import { deriveCandidatePredecessorExclusionAuthorityForFixture } from '@/features/anime/catalogue/anime-successor-predecessor-review'
import { discoverySha256 } from '@/features/anime/catalogue/wikidata-anime-discovery'
import type { WikidataEntity } from '@/integrations/wikidata/wikidata-entity'

function candidate(qid: string, index: number) {
  return {
    qid,
    format: 'tv' as const,
    releaseYear: 2020,
    era: '2020-2026' as const,
    englishArticle: null,
    japaneseArticle: null,
    englishTotal: null,
    japaneseTotal: null,
    englishBand:
      index === 0 ? ('top-1-percent' as const) : ('remainder' as const),
    japaneseBand: 'unavailable' as const,
    sitelinkCount: 0,
    sitelinkBand: '0-to-4' as const,
    englishMappingInputSha256: '1'.repeat(64),
    japaneseMappingInputSha256: '2'.repeat(64),
  }
}
function byteSha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
function receipt(count = 2) {
  return {
    schema: 'zedarchive.anime-discovery-candidate-receipt' as const,
    version: 1 as const,
    release: 'anime-v2' as const,
    executedAt: '2026-08-01T00:00:00.000Z',
    window: {
      start: '2025-07-01T00:00:00Z' as const,
      end: '2026-06-30T23:59:59Z' as const,
    },
    specificationHashes: {
      query: '0'.repeat(64),
      mapping: '0'.repeat(64),
      aggregation: '0'.repeat(64),
      bands: '0'.repeat(64),
      ordering: '0'.repeat(64),
      reasonCodes: '0'.repeat(64),
    },
    providerResponseSetSha256: '0'.repeat(64),
    requestEvidence: {
      attempts: 0,
      successfulPageviews: 0,
      retries: 0,
      pacingWaits: 0,
      pacingDelayMilliseconds: 0,
      elapsedMilliseconds: 0,
      maximumConcurrency: 1 as const,
    },
    identityBlocked: [],
    candidates: Array.from({ length: count }, (_, index) =>
      candidate(`Q${index + 1}`, index),
    ),
  }
}
function entity(qid: string, revision = 1): WikidataEntity {
  return {
    id: qid,
    type: 'item',
    lastrevid: revision,
    labels: { en: { language: 'en', value: `Title ${qid}` } },
    aliases: {},
    claims: {
      P31: [
        {
          rank: 'normal',
          mainsnak: {
            snaktype: 'value',
            property: 'P31',
            datatype: 'wikibase-item',
            datavalue: {
              type: 'wikibase-entityid',
              value: { id: 'Q63952888', 'entity-type': 'item' },
            },
          },
        },
      ],
      P136: [],
      P1476: [],
      P577: [
        {
          rank: 'normal',
          mainsnak: {
            snaktype: 'value',
            property: 'P577',
            datatype: 'time',
            datavalue: {
              type: 'time',
              value: {
                time: '+2020-01-01T00:00:00Z',
                precision: 11,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
              },
            },
          },
        },
      ],
      P580: [],
      P582: [],
      P1113: [],
      P155: [],
      P156: [],
    },
  }
}
function completedFor(
  manifest: ReturnType<
    typeof buildCandidatePreparationArtifacts
  >['inputs'][number],
  artifacts: ReturnType<typeof buildCandidatePreparationArtifacts>,
) {
  const records = manifest.manifest.qids.map((qid) => {
    const draft = artifacts.drafts[manifest.manifest.ordinal - 1]!.records.find(
      (item) => item.qid === qid,
    )!
    if (!('state' in draft))
      throw new Error('fixture expects a projected candidate')
    const outcome = artifacts.acquisition.outcomes.find(
      (value) => value.qid === qid && value.disposition === 'projected',
    )
    if (outcome === undefined || outcome.disposition !== 'projected')
      throw new Error('fixture expects a projected outcome')
    const { state: _state, ...binding } = draft
    void _state
    return {
      ...binding,
      machineValidation: 'approved' as const,
      exactWorkIdentity: 'approved' as const,
      mediaScope: 'approved' as const,
      title: {
        source: 'label.en' as const,
        valueSha256: outcome.projection.titleCandidates[0]!.valueSha256,
      },
      titleUsability: 'approved' as const,
      adultSignals: [],
      adultPublicationOutcome: 'cleared' as const,
      format: 'approved' as const,
      year: 'approved' as const,
      episode: 'approved' as const,
      status: 'approved' as const,
      maturity: 'approved' as const,
      duplicate: 'approved' as const,
      relationship: 'approved' as const,
      primaryReview: 'approved' as const,
    }
  })
  const core = {
    schema: 'zedarchive.anime-v2-primary-candidate-review-completed' as const,
    version: 2 as const,
    candidateReceiptSha256:
      'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59' as const,
    manifest: manifest.manifest,
    reviewInputSha256: discoverySha256(
      records.map(({ reviewInputSha256 }) => reviewInputSha256),
    ),
    records,
  }
  return { ...core, completedResultSha256: discoverySha256(core) }
}
function verdictFor(
  artifacts: ReturnType<typeof buildCandidatePreparationArtifacts>,
  ordinal = 1,
) {
  const manifest = artifacts.acquisition.manifests[ordinal - 1]!
  return {
    schema: 'zedarchive.anime-v2-candidate-primary-review-verdict',
    version: 1,
    candidateReceiptSha256:
      'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
    manifest,
    records: manifest.qids.map((qid) => {
      const outcome = artifacts.acquisition.outcomes.find(
        (value) => value.qid === qid,
      )!
      if (outcome.disposition === 'machine-rejected')
        return { qid, machineValidation: 'rejected' }
      return {
        qid,
        machineValidation: 'approved',
        exactWorkIdentity: 'rejected',
        mediaScope: 'approved',
        title: {
          source: 'label.en',
          valueSha256: outcome.projection.titleCandidates[0]!.valueSha256,
        },
        titleUsability: 'approved',
        adultPublicationOutcome:
          outcome.projection.adultSignals.length === 0 ? 'cleared' : 'excluded',
        format: 'approved',
        year: 'approved',
        episode: 'approved',
        status: 'approved',
        maturity: 'approved',
        duplicate: 'approved',
        relationship: 'approved',
        primaryReview: 'rejected',
      }
    }),
  }
}

async function writeRoundVerdict(
  directory: string,
  artifacts: ReturnType<typeof buildCandidatePreparationArtifacts>,
  predecessor: ReturnType<
    typeof deriveCandidatePredecessorExclusionAuthorityForFixture
  >,
  roundSha: string,
  ordinal: number,
) {
  await mkdir(join(directory, 'review-round-2', 'verdicts'), {
    recursive: true,
  })
  await writeFile(
    join(
      directory,
      'review-round-2',
      'verdicts',
      `${String(ordinal).padStart(3, '0')}.json`,
    ),
    JSON.stringify({
      ...verdictFor(artifacts, ordinal),
      version: 2,
      predecessorReviewResultSha256: predecessor.predecessorReviewResultSha256,
      retainedPredecessorIdentitySetSha256:
        predecessor.retainedPredecessorIdentitySetSha256,
      predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
      candidateReviewRoundSha256: roundSha,
    }),
  )
}

async function candidateReviewDirectoryEntries(directory: string) {
  const entries = await readdir(directory, { recursive: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry)
        if (!(await lstat(path)).isFile()) return `${entry}/`
        return `${entry}:${byteSha256(await readFile(path, 'utf8'))}`
      }),
    )
  ).sort()
}

async function writeLegacyManifestArtifacts(
  directory: string,
  input: ReturnType<typeof receipt>,
  entities: Record<string, WikidataEntity>,
  artifactCount: 2 | 3,
) {
  const artifacts = buildCandidatePreparationArtifacts(input, entities)
  const verdict = verdictFor(artifacts)
  const temporaryVerdict = join(directory, 'legacy-verdict.json')
  const temporaryCompleted = join(directory, 'legacy-completed-v3.json')
  await writeFile(temporaryVerdict, JSON.stringify(verdict))
  await completeCandidateReviewManifestForFixture(
    '001',
    temporaryVerdict,
    temporaryCompleted,
    directory,
    input,
  )
  const completedV3 = JSON.parse(
    await readFile(temporaryCompleted, 'utf8'),
  ) as {
    manifest: unknown
    reviewInputSha256: string
    records: unknown
  }
  const completedCore = {
    schema: 'zedarchive.anime-v2-primary-candidate-review-completed',
    version: 2,
    candidateReceiptSha256:
      'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
    manifest: completedV3.manifest,
    reviewInputSha256: completedV3.reviewInputSha256,
    records: completedV3.records,
  }
  const completed = {
    ...completedCore,
    completedResultSha256: discoverySha256(completedCore),
  }
  await mkdir(join(directory, 'verdicts'))
  await mkdir(join(directory, 'completed'))
  await writeFile(
    join(directory, 'verdicts', '001.json'),
    JSON.stringify(verdict),
  )
  await writeFile(
    join(directory, 'completed', '001.json'),
    JSON.stringify(completed),
  )
  if (artifactCount === 3) {
    await mkdir(join(directory, 'locks'))
    const lockCore = {
      schema: 'zedarchive.anime-v2-primary-candidate-review-lock',
      version: 2,
      candidateReceiptSha256:
        'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
      manifest: completed.manifest,
      records: completed.records,
    }
    await writeFile(
      join(directory, 'locks', '001.locked.json'),
      JSON.stringify({
        ...lockCore,
        lockedResultSha256: discoverySha256(lockCore),
      }),
    )
  }
  await rm(temporaryVerdict)
  await rm(temporaryCompleted)
}

describe('candidate acquisition runner', () => {
  it('accepts an absent optional prepared directory during the offline contract check', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-check-'))
    try {
      await expect(
        checkCandidateReviewContract(directory),
      ).resolves.toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops every normal review operation while recovery residue exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-residue-'))
    try {
      await writeFile(
        join(directory, '.decision-068-recovery-journal.json'),
        '{"fixture":true}\n',
      )
      const input = receipt(1)
      await expect(
        completeCandidateReviewManifestForFixture('001', directory, input),
      ).rejects.toThrow('complete:recovery-residue')
      await expect(
        lockCandidateReviewManifestForFixture('001', directory, {
          receipt: input,
          predecessorMetrics: {
            qids: [],
            retainedQids: [],
            formatCounts: {},
            eraCounts: {},
            unknown: 0,
            audience: 0,
          },
          reserve: {
            publishedTarget: 0,
            audienceAnchorCount: 0,
            unknownYearMaximum: 0,
            formatFloors: {},
            eraFloors: {},
          },
        }),
      ).rejects.toThrow('lock:recovery-residue')
      await expect(
        finalizeCandidateReviewForFixture(directory, input),
      ).rejects.toThrow('finalize:recovery-residue')
      await expect(
        auditActiveCandidateReviewForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('audit:recovery-residue')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requires the exact narrow command forms', () => {
    expect(parseCandidateReviewArguments(['check'])).toEqual({ mode: 'check' })
    expect(
      parseCandidateReviewArguments(['prepare', '--confirm-wikimedia-live']),
    ).toEqual({ mode: 'prepare' })
    expect(
      parseCandidateReviewArguments(['recover', '--confirm-decision-068']),
    ).toEqual({ mode: 'recover' })
    expect(parseCandidateReviewArguments(['audit-active'])).toEqual({
      mode: 'audit-active',
    })
    expect(parseCandidateReviewArguments(['verify-recovery'])).toEqual({
      mode: 'verify-recovery',
    })
    expect(() => parseCandidateReviewArguments(['prepare'])).toThrow(
      CandidateReviewCommandError,
    )
    expect(() => parseCandidateReviewArguments(['lock', '1', 'x'])).toThrow(
      CandidateReviewCommandError,
    )
  })

  it('partitions contiguously and stops the complete acquisition on a non-positive revision', () => {
    const input = receipt(51)
    const entities = Object.fromEntries(
      input.candidates.map((row, index) => [
        row.qid,
        index === 50 ? { ...entity(row.qid), lastrevid: 0 } : entity(row.qid),
      ]),
    )
    expect(() => buildCandidatePreparationArtifacts(input, entities)).toThrow(
      'positive provider revision',
    )
  })

  it('uses exact serial Action requests with the provider contract and exact returned QIDs', async () => {
    const seen: URL[] = []
    let active = 0
    let maximum = 0
    const requester = new SequentialCandidateRequester(async (url) => {
      active += 1
      maximum = Math.max(maximum, active)
      seen.push(new URL(url.toString()))
      active -= 1
      const ids = new URL(url.toString()).searchParams.get('ids')!.split('|')
      return new Response(
        JSON.stringify({
          entities: Object.fromEntries(
            ids.map((qid, index) => [qid, entity(qid, index + 1)]),
          ),
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    })
    const qids = Array.from({ length: 26 }, (_, index) => `Q${index + 1}`)
    await expect(
      fetchCandidateEntitiesBounded(qids, requester),
    ).resolves.toHaveProperty('Q26')
    expect(maximum).toBe(1)
    expect(seen).toHaveLength(2)
    expect(seen[0]!.searchParams.get('languages')).toBe('en|ja-latn')
    expect(seen[0]!.searchParams.get('maxlag')).toBe('10')
    expect(seen[0]!.searchParams.get('props')).toBe(
      'labels|aliases|claims|info',
    )
  })

  it('enforces retry, bounded Retry-After and the per-run request cap surface', async () => {
    let calls = 0
    const delays: number[] = []
    let now = 1_000
    const requester = new SequentialCandidateRequester(
      async () => {
        calls += 1
        return new Response(
          calls === 1
            ? 'busy'
            : JSON.stringify({ entities: { Q1: entity('Q1') } }),
          {
            status: calls === 1 ? 503 : 200,
            headers: calls === 1 ? { 'retry-after': '2' } : {},
          },
        )
      },
      {
        now: () => now,
        delay: async (milliseconds) => {
          delays.push(milliseconds)
          now += milliseconds
        },
        setTimeout,
        clearTimeout,
      },
    )
    await fetchCandidateEntitiesBounded(['Q1'], requester)
    expect(calls).toBe(2)
    expect(delays).toContain(2_000)
  })

  it('retains one privacy-safe witness for every recovered attempt without a retained body', async () => {
    let calls = 0
    const requester = new SequentialCandidateRequester(async () => {
      calls += 1
      if (calls === 1) throw new TypeError('transport unavailable')
      return new Response(JSON.stringify({ entities: { Q1: entity('Q1') } }))
    })
    const entities = await fetchCandidateEntitiesBounded(['Q1'], requester)
    const artifacts = buildCandidatePreparationArtifacts(
      receipt(1),
      entities,
      requester.sourceEvidence(),
    )
    const evidence = requester.sourceEvidence()
    expect(evidence.requestEvidence.attempts).toBe(2)
    expect(evidence.rawAttemptSha256).toHaveLength(2)
    expect(
      parseCandidateAcquisitionSourceReceiptForFixture(
        artifacts.acquisition.sourceReceipt,
        receipt(1),
        'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
      ),
    ).toEqual(artifacts.acquisition.sourceReceipt)
    expect(JSON.stringify(evidence)).not.toMatch(/transport|unavailable|Q1/i)
  })

  it('uses the same neutral witness when a received response exceeds the body limit', async () => {
    const requester = new SequentialCandidateRequester(
      async () =>
        new Response('ignored', {
          headers: { 'content-length': String(5 * 1024 * 1024 + 1) },
        }),
    )
    await expect(
      fetchCandidateEntitiesBounded(['Q1'], requester),
    ).rejects.toThrow('body-limit')
    const evidence = requester.sourceEvidence()
    expect(evidence.rawAttemptSha256).toEqual([
      discoverySha256({
        version: 'candidate-no-retained-body-attempt-witness.v1',
        attemptOrdinal: 1,
      }),
    ])
    expect(JSON.stringify(evidence)).not.toMatch(/content-length|ignored|Q1/i)
  })

  it('paces a zero-origin serial clock and records only the supplemental delay', async () => {
    let now = 0
    const requester = new SequentialCandidateRequester(
      async (url) => {
        const ids = new URL(url.toString()).searchParams.get('ids')!.split('|')
        return new Response(
          JSON.stringify({
            entities: Object.fromEntries(ids.map((qid) => [qid, entity(qid)])),
          }),
        )
      },
      {
        now: () => now,
        delay: async (milliseconds) => {
          now += milliseconds
        },
        setTimeout,
        clearTimeout,
      },
    )
    await fetchCandidateEntitiesBounded(
      Array.from({ length: 26 }, (_, index) => `Q${index + 1}`),
      requester,
    )
    expect(requester.sourceEvidence().requestEvidence).toMatchObject({
      attempts: 2,
      pacingWaits: 1,
      pacingDelayMilliseconds: 350,
    })
  })

  it.each([429, 500, 502, 503, 504])(
    'retries the approved transient status %i',
    async (status) => {
      let calls = 0
      const requester = new SequentialCandidateRequester(async () => {
        calls += 1
        return new Response(
          calls === 1
            ? 'transient'
            : JSON.stringify({ entities: { Q1: entity('Q1') } }),
          { status: calls === 1 ? status : 200 },
        )
      })
      await fetchCandidateEntitiesBounded(['Q1'], requester)
      expect(calls).toBe(2)
    },
  )

  it('stops at retry exhaustion, invalid Retry-After, and the sixteen-hour wall-time boundary', async () => {
    let transientNow = 0
    const alwaysTransient = new SequentialCandidateRequester(
      async () => new Response('transient', { status: 500 }),
      {
        now: () => transientNow,
        delay: async (milliseconds) => {
          transientNow += milliseconds
        },
        setTimeout,
        clearTimeout,
      },
    )
    await expect(
      fetchCandidateEntitiesBounded(['Q1'], alwaysTransient),
    ).rejects.toThrow('retry-exhausted')
    const invalidRetryAfter = new SequentialCandidateRequester(
      async () =>
        new Response('busy', { status: 429, headers: { 'retry-after': '31' } }),
    )
    await expect(
      fetchCandidateEntitiesBounded(['Q1'], invalidRetryAfter),
    ).rejects.toThrow('retry-after')
    let now = 0
    const wallTime = new SequentialCandidateRequester(
      async () => {
        now = 57_600_000
        return new Response('busy', { status: 503 })
      },
      {
        now: () => now,
        delay: async (milliseconds) => {
          now += milliseconds
        },
        setTimeout,
        clearTimeout,
      },
    )
    await expect(
      fetchCandidateEntitiesBounded(['Q1'], wallTime),
    ).rejects.toThrow('wall-time')
  })

  it('creates privacy-safe terminal diagnostics containing only stage, counts, timing, and commitments', () => {
    const diagnostic = createCandidateTerminalDiagnostic({
      stage: 'acquisition',
      outcome: 'completed',
      candidates: 7_958,
      manifests: 160,
      sourceReceiptSha256: 'a'.repeat(64),
      acquisitionSha256: 'b'.repeat(64),
      rawAttemptSetCommitmentSha256: 'c'.repeat(64),
      requestEvidence: {
        requestGroupCount: 319,
        successfulResponseGroupCount: 319,
        attempts: 320,
        retries: 1,
        pacingWaits: 319,
        pacingDelayMilliseconds: 111_650,
        elapsedMilliseconds: 112_000,
        maximumConcurrency: 1,
      },
    })
    const output = JSON.stringify(diagnostic)
    expect(diagnostic.schema).toBe(
      'zedarchive.anime-v2-candidate-review-terminal-diagnostic',
    )
    expect(output).not.toMatch(/Q[1-9]|Title|https?:|exception|stack|email/i)
  })

  it('verifies closed canonical subphases read-only with fixture-only observation', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-canonical-subphases-'),
    )
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const predecessorQids = Array.from(
        { length: 500 },
        (_, index) => `Q${900_000 + index}`,
      )
      const predecessor =
        deriveCandidatePredecessorExclusionAuthorityForFixture(predecessorQids)
      const roundSha = deriveCandidateReviewRoundSha256({
        candidateReceiptSha256:
          'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
        predecessorReviewResultSha256:
          predecessor.predecessorReviewResultSha256,
        retainedPredecessorIdentitySetSha256:
          predecessor.retainedPredecessorIdentitySetSha256,
        predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
      })
      await recoverCandidateReviewRoundTwoForFixture(
        directory,
        input,
        predecessorQids,
      )
      const artifacts = buildCandidatePreparationArtifacts(input, entities)
      const verify = async (
        manifest: string,
        subphaseObserver?: (subphase: string) => void,
      ) => {
        const before = await candidateReviewDirectoryEntries(directory)
        const result = await verifyCandidateCanonicalSubphaseForFixture(
          manifest,
          directory,
          {
            receipt: input,
            predecessorReviewResult: predecessorQids,
            subphaseObserver,
          },
        )
        expect(await candidateReviewDirectoryEntries(directory)).toEqual(before)
        return result
      }

      const vacancyPhases: string[] = []
      const observedVacancy = await verify('001', (phase) =>
        vacancyPhases.push(phase),
      )
      expect(observedVacancy).toEqual({
        outcome: 'completed',
        subphase: 'fresh-vacancy',
      })
      await expect(verify('001')).resolves.toEqual(observedVacancy)
      expect([...new Set(vacancyPhases)]).toEqual([
        'persisted-revalidations',
        'fresh-vacancy',
      ])

      await writeRoundVerdict(directory, artifacts, predecessor, roundSha, 1)
      const verdict = await verify('002')
      expect(verdict).toEqual({
        outcome: 'stopped',
        subphase: 'fresh-verdict',
      })
      expect(JSON.stringify(verdict)).not.toMatch(
        /Q[1-9]|https?:|exception|stack|path|title|error|env|email|contact/i,
      )
      await rm(join(directory, 'review-round-2', 'verdicts', '001.json'))

      await writeRoundVerdict(directory, artifacts, predecessor, roundSha, 2)
      await completeCandidateReviewManifestForFixture(
        '002',
        directory,
        input,
        predecessorQids,
      )
      await expect(verify('002')).resolves.toEqual({
        outcome: 'completed',
        subphase: 'fresh-completed',
      })
      const completedSnapshot = await candidateReviewDirectoryEntries(directory)
      await expect(
        validateCandidateCanonicalRoundStateWithPreloadedContextForFixture(
          '002',
          directory,
          {
            receipt: input,
            predecessorReviewResult: predecessorQids,
          },
        ),
      ).resolves.toBeUndefined()
      expect(await candidateReviewDirectoryEntries(directory)).toEqual(
        completedSnapshot,
      )

      await runCandidateReviewCommandForFixture(['lock', '002'], {
        directory,
        receipt: input,
        predecessorReviewResult: predecessorQids,
      })
      const lockPhases: string[] = []
      const locked = await verify('002', (phase) => lockPhases.push(phase))
      expect(locked).toEqual({ outcome: 'completed', subphase: 'fresh-lock' })
      expect(JSON.stringify(locked)).not.toMatch(
        /Q[1-9]|https?:|exception|stack|path|title|error|env|email|contact/i,
      )
      expect([...new Set(lockPhases)]).toEqual(
        candidateReviewCanonicalSubphaseSchema.options,
      )
      const lockedSnapshot = await candidateReviewDirectoryEntries(directory)
      await expect(
        validateCandidateCanonicalRoundStateWithPreloadedContextForFixture(
          '002',
          directory,
          {
            receipt: input,
            predecessorReviewResult: predecessorQids,
          },
        ),
      ).resolves.toBeUndefined()
      expect(await candidateReviewDirectoryEntries(directory)).toEqual(
        lockedSnapshot,
      )
      expect(
        candidateReviewCanonicalSubphaseResultSchema.parse(locked),
      ).toEqual(locked)
      expect(() =>
        candidateReviewCanonicalSubphaseResultSchema.parse({
          outcome: 'completed',
          subphase: 'open-ended-detail',
        }),
      ).toThrow()
      expect(() =>
        candidateReviewCanonicalSubphaseResultSchema.parse({
          outcome: 'completed',
          subphase: 'fresh-lock',
          path: 'forbidden',
        }),
      ).toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps canonical verification target and fixture authority closed', async () => {
    expect(verifyCandidateCanonicalSubphase).toHaveLength(1)
    expect(parseCandidateReviewArguments(['verify-canonical', '001'])).toEqual({
      mode: 'verify-canonical',
      manifest: '001',
    })
    expect(() =>
      parseCandidateReviewArguments(['verify-canonical', '1']),
    ).toThrow(CandidateReviewCommandError)
    await expect(
      verifyCandidateCanonicalSubphaseForFixture('1', '/fixture-only', {
        receipt: receipt(1),
      }),
    ).rejects.toThrow(CandidateReviewCommandError)
    const originalNodeEnv = process.env.NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      enumerable: true,
      writable: true,
    })
    try {
      await expect(
        verifyCandidateCanonicalSubphaseForFixture('001', '/fixture-only', {
          receipt: receipt(1),
        }),
      ).rejects.toThrow('unavailable to live tooling')
      await expect(
        validateCandidateCanonicalRoundStateWithPreloadedContextForFixture(
          '001',
          '/fixture-only',
          { receipt: receipt(1) },
        ),
      ).rejects.toThrow('unavailable to live tooling')
    } finally {
      if (originalNodeEnv === undefined)
        Reflect.deleteProperty(process.env, 'NODE_ENV')
      else
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: originalNodeEnv,
          configurable: true,
          enumerable: true,
          writable: true,
        })
    }
  })

  it('keeps Decision-074 lock terminal phases closed and privacy-safe', () => {
    expect(candidateReviewLockTerminalPhaseSchema.options).toEqual([
      'recovery-clean',
      'prepared-authority',
      'predecessor-authority',
      'recovery-audit',
      'round-scaffold',
      'canonical-round-state',
      'target-admission',
      'verdict-materialization',
      'completed-canonical',
      'lock-construction',
      'existing-locks',
      'predecessor-reserve',
      'reserve-feasibility',
      'atomic-lock-write',
    ])
    const completed = createCandidateTerminalDiagnostic({
      stage: 'lock',
      outcome: 'completed',
      phase: 'atomic-lock-write',
    })
    const stopped = createCandidateTerminalDiagnostic({
      stage: 'lock',
      outcome: 'stopped',
      phase: 'prepared-authority',
    })
    expect(completed).toEqual({
      schema: 'zedarchive.anime-v2-candidate-review-terminal-diagnostic',
      version: 2,
      stage: 'lock',
      outcome: 'completed',
      phase: 'atomic-lock-write',
    })
    expect(JSON.stringify(stopped)).not.toMatch(
      /Q[1-9]|https?:|exception|stack|path|title|error|env|email|contact/i,
    )
    expect(() =>
      createCandidateTerminalDiagnostic({
        stage: 'lock',
        outcome: 'stopped',
        phase: 'unbounded-lock-detail' as never,
      }),
    ).toThrow()
  })

  it('emits the exact closed phase for a stopped fixture lock without changing lock state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-lock-phase-'))
    try {
      const diagnostics: unknown[] = []
      await expect(
        runCandidateReviewCommandForFixture(['lock', '001'], {
          directory,
          receipt: receipt(1),
          terminalDiagnosticSink: (diagnostic) => diagnostics.push(diagnostic),
        }),
      ).rejects.toThrow()
      expect(diagnostics).toEqual([
        {
          schema: 'zedarchive.anime-v2-candidate-review-terminal-diagnostic',
          version: 2,
          stage: 'lock',
          outcome: 'stopped',
          phase: 'prepared-authority',
        },
      ])
      expect(JSON.stringify(diagnostics[0])).not.toMatch(
        /Q[1-9]|https?:|exception|stack|path|title|error|env|email|contact/i,
      )
      expect(await readdir(directory)).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects forged completed-role hashes and impossible auto approval', () => {
    const input = receipt()
    const artifacts = buildCandidatePreparationArtifacts(
      input,
      Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      ),
    )
    const completed = completedFor(artifacts.inputs[0]!, artifacts)
    expect(
      validateCandidateCompletedResultForFixture(
        completed,
        artifacts.acquisition.manifests[0]!,
      ),
    ).toBeDefined()
    expect(() =>
      validateCandidateCompletedResultForFixture(
        { ...completed, completedResultSha256: '0'.repeat(64) },
        artifacts.acquisition.manifests[0]!,
      ),
    ).toThrow(CandidateReviewCommandError)
    const foreignManifest = {
      ...completed,
      manifest: {
        ...completed.manifest,
        manifestSha256: 'f'.repeat(64),
      },
    }
    foreignManifest.completedResultSha256 = discoverySha256({
      schema: foreignManifest.schema,
      version: foreignManifest.version,
      candidateReceiptSha256: foreignManifest.candidateReceiptSha256,
      manifest: foreignManifest.manifest,
      reviewInputSha256: foreignManifest.reviewInputSha256,
      records: foreignManifest.records,
    })
    expect(() =>
      validateCandidateCompletedResultForFixture(
        foreignManifest,
        artifacts.acquisition.manifests[0]!,
      ),
    ).toThrow(CandidateReviewCommandError)
    const forged = {
      ...completed,
      records: completed.records.map((record) => ({
        ...record,
        machineValidation: 'rejected' as const,
      })),
    }
    forged.completedResultSha256 = discoverySha256({
      schema: forged.schema,
      version: forged.version,
      candidateReceiptSha256: forged.candidateReceiptSha256,
      manifest: forged.manifest,
      reviewInputSha256: forged.reviewInputSha256,
      records: forged.records,
    })
    expect(() =>
      validateCandidateCompletedResultForFixture(
        forged,
        artifacts.acquisition.manifests[0]!,
      ),
    ).toThrow(CandidateReviewCommandError)
  })

  it('promotes preparation atomically and refuses a second run without a network request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-runner-'))
    try {
      const input = receipt()
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await expect(
        readFile(join(directory, 'prepared', 'safe-aggregate.json'), 'utf8'),
      ).resolves.toContain('machineRejected')
      await expect(
        runCandidateReviewCommandForFixture(
          ['prepare', '--confirm-wikimedia-live'],
          { directory, receipt: input, entities },
        ),
      ).rejects.toThrow('no resume or overwrite')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('audits every manifest through the canonical inventory and stops on unknown files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-audit-'))
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const audit = await auditCandidatePredecessorCollisionsForFixture(
        directory,
        input,
        { fixture: true },
      )
      expect(audit.manifests).toBe(2)
      expect(audit.records).toBe(51)
      expect(audit.classifications).toEqual({
        missing: 2,
        valid: 0,
        requiresQuarantine: 0,
      })
      await mkdir(join(directory, 'completed'))
      await writeFile(join(directory, 'completed', 'unknown.txt'), 'x')
      await expect(
        auditCandidatePredecessorCollisionsForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('unknown-file')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('audits the complete 7,958-record, 160-manifest collision population without retaining QIDs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-audit-full-'))
    try {
      const input = receipt(7_958)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const collisionQids: string[] = []
      for (let ordinal = 0; ordinal < 154; ordinal += 1)
        collisionQids.push(`Q${ordinal * 50 + 1}`)
      for (let index = 1; collisionQids.length < 499; index += 1) {
        const qid = `Q${index}`
        if (!collisionQids.includes(qid)) collisionQids.push(qid)
      }
      collisionQids.push('Q900000')
      const audit = await auditCandidatePredecessorCollisionsForFixture(
        directory,
        input,
        collisionQids,
      )
      expect(audit.records).toBe(7_958)
      expect(audit.manifests).toBe(160)
      expect(audit.collisionRecords).toBe(499)
      expect(audit.collisionManifests).toBe(154)
      expect(JSON.stringify(audit)).not.toMatch(/Q[1-9]|Title|https?:/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('revalidates a clean legacy tuple into the isolated round-two root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-recover-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await recoverCandidateReviewRoundTwoForFixture(directory, input, {
        fixture: true,
      })
      await expect(
        readFile(
          join(directory, 'review-round-2', 'locks', '001.locked.json'),
          'utf8',
        ),
      ).resolves.toContain('"version": 3')
      await expect(
        readFile(
          join(directory, 'review-round-2', 'revalidations', '001.json'),
          'utf8',
        ),
      ).resolves.toContain('legacyLockByteSha256')
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, { fixture: true }),
      ).resolves.toMatchObject({
        records: 1,
        revalidated: 1,
        quarantined: 0,
        missing: 0,
      })
      const active = await auditActiveCandidateReviewForFixture(
        directory,
        input,
        { fixture: true },
      )
      expect(active).toMatchObject({
        records: 1,
        revalidatedLockCount: 1,
        freshLockCount: 0,
        violationCount: 0,
      })
      const lockPath = join(
        directory,
        'review-round-2',
        'locks',
        '001.locked.json',
      )
      const revalidationPath = join(
        directory,
        'review-round-2',
        'revalidations',
        '001.json',
      )
      const existingLock = JSON.parse(await readFile(lockPath, 'utf8')) as {
        lockedResultSha256: string
        [key: string]: unknown
      }
      const { lockedResultSha256: _oldLockHash, ...lockCore } = existingLock
      void _oldLockHash
      const alteredLock = createLockedCandidateReviewManifest({
        ...lockCore,
        verdictSha256: '0'.repeat(64),
      } as Parameters<typeof createLockedCandidateReviewManifest>[0])
      const existingRevalidation = JSON.parse(
        await readFile(revalidationPath, 'utf8'),
      ) as { revalidationSha256: string; [key: string]: unknown }
      const { revalidationSha256: _oldRevalidationHash, ...revalidationCore } =
        existingRevalidation
      void _oldRevalidationHash
      const alteredRevalidationCore = {
        ...revalidationCore,
        v3LockedResultSha256: alteredLock.lockedResultSha256,
      }
      const alteredRevalidation = {
        ...alteredRevalidationCore,
        revalidationSha256: discoverySha256(alteredRevalidationCore),
      }
      const alteredLockText = `${JSON.stringify(alteredLock, null, 2)}\n`
      const alteredRevalidationText = `${JSON.stringify(alteredRevalidation, null, 2)}\n`
      await writeFile(lockPath, alteredLockText)
      await writeFile(revalidationPath, alteredRevalidationText)
      const planPath = join(directory, 'review-round-2', 'recovery-plan.json')
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
        files: { path: string; sha256: string; bytes: number }[]
        promotionPlanSha256: string
        [key: string]: unknown
      }
      const { promotionPlanSha256: _oldPlanHash, ...planCore } = plan
      void _oldPlanHash
      const alteredPlanCore = {
        ...planCore,
        files: plan.files.map((file) =>
          file.path === 'locks/001.locked.json'
            ? {
                ...file,
                sha256: byteSha256(alteredLockText),
                bytes: Buffer.byteLength(alteredLockText),
              }
            : {
                ...file,
                sha256: byteSha256(alteredRevalidationText),
                bytes: Buffer.byteLength(alteredRevalidationText),
              },
        ),
      }
      await writeFile(
        planPath,
        `${JSON.stringify(
          {
            ...alteredPlanCore,
            promotionPlanSha256: discoverySha256(alteredPlanCore),
          },
          null,
          2,
        )}\n`,
      )
      await expect(
        auditActiveCandidateReviewForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('audit:revalidation')
      await writeFile(
        join(directory, 'review-round-2', 'locks', '001.locked.json'),
        '{"forged":true}\n',
      )
      await expect(
        auditActiveCandidateReviewForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('audit:recovery-plan')
      await expect(
        finalizeCandidateReviewForFixture(directory, input, { fixture: true }),
      ).rejects.toThrow('active-collision-audit')
      await expect(
        readdir(
          join(directory, 'quarantine', 'retained-predecessor-collision'),
        ),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('cleans non-authoritative active-audit staging after an interrupted write', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-active-stage-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await recoverCandidateReviewRoundTwoForFixture(directory, input, {
        fixture: true,
      })
      await expect(
        auditActiveCandidateReviewForFixture(
          directory,
          input,
          { fixture: true },
          async () => {
            throw new Error('fixture active audit interruption')
          },
        ),
      ).rejects.toThrow('fixture active audit interruption')
      await expect(
        finalizeCandidateReviewForFixture(directory, input, { fixture: true }),
      ).rejects.toThrow('finalize:recovery-residue')
      await writeFile(
        join(
          directory,
          'review-round-2',
          '.active-collision-audit.v1.staging.json',
        ),
        '{"forged":true}\n',
      )
      await expect(
        auditActiveCandidateReviewForFixture(directory, input, {
          fixture: true,
        }),
      ).resolves.toMatchObject({ records: 1, violationCount: 0 })
      await expect(
        readFile(
          join(
            directory,
            'review-round-2',
            '.active-collision-audit.v1.staging.json',
          ),
        ),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a prior non-target completed-but-unlocked fresh tuple', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-round-state-'),
    )
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const predecessorQids = Array.from(
        { length: 500 },
        (_, index) => `Q${900_000 + index}`,
      )
      const predecessor =
        deriveCandidatePredecessorExclusionAuthorityForFixture(predecessorQids)
      const roundSha = deriveCandidateReviewRoundSha256({
        candidateReceiptSha256:
          'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
        predecessorReviewResultSha256:
          predecessor.predecessorReviewResultSha256,
        retainedPredecessorIdentitySetSha256:
          predecessor.retainedPredecessorIdentitySetSha256,
        predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
      })
      await recoverCandidateReviewRoundTwoForFixture(
        directory,
        input,
        predecessorQids,
      )
      const artifacts = buildCandidatePreparationArtifacts(input, entities)
      await mkdir(join(directory, 'review-round-2', 'verdicts'), {
        recursive: true,
      })
      await writeFile(
        join(directory, 'review-round-2', 'verdicts', '002.json'),
        JSON.stringify({
          ...verdictFor(artifacts, 2),
          version: 2,
          predecessorReviewResultSha256:
            predecessor.predecessorReviewResultSha256,
          retainedPredecessorIdentitySetSha256:
            predecessor.retainedPredecessorIdentitySetSha256,
          predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
          candidateReviewRoundSha256: roundSha,
        }),
      )
      await completeCandidateReviewManifestForFixture(
        '002',
        directory,
        input,
        predecessorQids,
      )
      await writeFile(
        join(directory, 'review-round-2', 'verdicts', '001.json'),
        JSON.stringify({
          ...verdictFor(artifacts, 1),
          version: 2,
          predecessorReviewResultSha256:
            predecessor.predecessorReviewResultSha256,
          retainedPredecessorIdentitySetSha256:
            predecessor.retainedPredecessorIdentitySetSha256,
          predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
          candidateReviewRoundSha256: roundSha,
        }),
      )
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          directory,
          input,
          predecessorQids,
        ),
      ).rejects.toThrow('complete:round-state')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('moves partial legacy evidence into immutable manifest custody instead of an active root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-custody-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 2)
      await recoverCandidateReviewRoundTwoForFixture(directory, input, {
        fixture: true,
      })
      const custodyRoot = join(
        directory,
        'quarantine',
        'retained-predecessor-collision',
      )
      const [bundle] = await readdir(custodyRoot)
      expect(bundle).toMatch(/^001-[a-f0-9]{64}$/)
      expect((await readdir(join(custodyRoot, bundle!))).sort()).toEqual([
        'completed.json',
        'custody-ledger.json',
        'verdict.json',
      ])
      await expect(
        readFile(join(directory, 'completed', '001.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        readFile(join(directory, 'review-round-2', 'locks', '001.locked.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('verifies custody bytes and rejects residual quarantined sources read-only', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-verify-custody-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      const predecessorQids = [
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${900_000 + index}`),
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 2)
      await recoverCandidateReviewRoundTwoForFixture(
        directory,
        input,
        predecessorQids,
      )
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, predecessorQids),
      ).resolves.toMatchObject({ quarantined: 1 })
      const custodyRoot = join(
        directory,
        'quarantine',
        'retained-predecessor-collision',
      )
      const [bundle] = await readdir(custodyRoot)
      const ledgerPath = join(custodyRoot, bundle!, 'custody-ledger.json')
      const ledger = await readFile(ledgerPath, 'utf8')
      const payloadPath = join(custodyRoot, bundle!, 'completed.json')
      const payload = await readFile(payloadPath, 'utf8')
      await writeFile(payloadPath, '{"forged":true}\n')
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, predecessorQids),
      ).rejects.toThrow('recovery:verification')
      await writeFile(payloadPath, payload)
      await writeFile(ledgerPath, '{"forged":true}\n')
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, predecessorQids),
      ).rejects.toThrow('recovery:verification')
      await writeFile(ledgerPath, ledger)
      await mkdir(join(directory, 'verdicts'), { recursive: true })
      await writeFile(join(directory, 'verdicts', '001.json'), '{}')
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, predecessorQids),
      ).rejects.toThrow('recovery:verification')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects missing-source, extra fresh-lock, root-entry, and finalization residue', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-verify-vacancy-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await recoverCandidateReviewRoundTwoForFixture(directory, input, {
        fixture: true,
      })
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, { fixture: true }),
      ).resolves.toMatchObject({ missing: 1 })
      await mkdir(join(directory, 'verdicts'), { recursive: true })
      await writeFile(join(directory, 'verdicts', '001.json'), '{}')
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, { fixture: true }),
      ).rejects.toThrow('recovery:verification')
      await rm(join(directory, 'verdicts'), { recursive: true, force: true })
      await mkdir(join(directory, 'review-round-2', 'locks'), {
        recursive: true,
      })
      await writeFile(
        join(directory, 'review-round-2', 'locks', '001.locked.json'),
        '{}',
      )
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, { fixture: true }),
      ).rejects.toThrow('recovery:verification')
      await rm(join(directory, 'review-round-2', 'locks'), {
        recursive: true,
        force: true,
      })
      await mkdir(join(directory, 'review-round-2', 'unexpected'))
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, { fixture: true }),
      ).rejects.toThrow('recovery:verification')
      await rm(join(directory, 'review-round-2', 'unexpected'), {
        recursive: true,
        force: true,
      })
      await mkdir(join(directory, '.finalize-staging'))
      await expect(
        verifyCandidateRecoveryForFixture(directory, input, { fixture: true }),
      ).rejects.toThrow('recovery:verification')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('resumes an exact between-file custody interruption and rejects an altered staged byte', async () => {
    const createInterruptedCustody = async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'm45-candidate-custody-mid-'),
      )
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 2)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          undefined,
          undefined,
          undefined,
          async (_ordinal, name) => {
            if (name === 'verdict')
              throw new Error('fixture mid-custody interruption')
          },
        ),
      ).rejects.toThrow('fixture mid-custody interruption')
      return { directory, input }
    }
    const first = await createInterruptedCustody()
    try {
      await expect(
        readFile(
          join(
            first.directory,
            '.decision-068-recovery-staging',
            'custody-001',
            'verdict.json',
          ),
        ),
      ).resolves.toBeDefined()
      await recoverCandidateReviewRoundTwoForFixture(
        first.directory,
        first.input,
        { fixture: true },
      )
    } finally {
      await rm(first.directory, { recursive: true, force: true })
    }
    const second = await createInterruptedCustody()
    try {
      await writeFile(
        join(
          second.directory,
          '.decision-068-recovery-staging',
          'custody-001',
          'verdict.json',
        ),
        '{"forged":true}\n',
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          second.directory,
          second.input,
          { fixture: true },
        ),
      ).rejects.toThrow('frozen-plan')
    } finally {
      await rm(second.directory, { recursive: true, force: true })
    }
  })

  it('stops when frozen custody sources change after the journal is written', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-frozen-source-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 2)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          undefined,
          undefined,
          async () => {
            await writeFile(
              join(directory, 'completed', '001.json'),
              '{"changed":true}\n',
            )
          },
        ),
      ).rejects.toThrow('frozen-plan')
      await expect(
        readFile(
          join(directory, '.decision-068-recovery-journal.json'),
          'utf8',
        ),
      ).resolves.toContain('custody')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops when a frozen recovery journal plan is altered', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-journal-forge-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          async () => {
            throw new Error('fixture frozen journal interruption')
          },
        ),
      ).rejects.toThrow('fixture frozen journal interruption')
      const journalPath = join(directory, '.decision-068-recovery-journal.json')
      const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        journalSha256: string
      }
      await writeFile(
        journalPath,
        JSON.stringify({ ...journal, journalSha256: '0'.repeat(64) }),
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('frozen-plan')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('quarantines all three legacy manifest artifacts when a retained collision is invalid', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-custody-full-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      const predecessorQids = [
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${900_000 + index}`),
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await recoverCandidateReviewRoundTwoForFixture(
        directory,
        input,
        predecessorQids,
      )
      const [bundle] = await readdir(
        join(directory, 'quarantine', 'retained-predecessor-collision'),
      )
      expect(
        (
          await readdir(
            join(
              directory,
              'quarantine',
              'retained-predecessor-collision',
              bundle!,
            ),
          )
        ).sort(),
      ).toEqual([
        'completed.json',
        'custody-ledger.json',
        'lock.json',
        'verdict.json',
      ])
      await expect(
        readFile(join(directory, 'review-round-2', 'locks', '001.locked.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('resumes from an already-promoted custody bundle after an invalid-collision crash', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-custody-resume-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      const predecessorQids = [
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${900_000 + index}`),
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          predecessorQids,
          async () => {
            throw new Error('fixture after-custody interruption')
          },
        ),
      ).rejects.toThrow('fixture after-custody interruption')
      await recoverCandidateReviewRoundTwoForFixture(
        directory,
        input,
        predecessorQids,
      )
      await expect(
        readFile(join(directory, '.decision-068-recovery-journal.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        readFile(join(directory, 'review-round-2', 'locks', '001.locked.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops on altered or duplicate frozen custody bundles', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-custody-forge-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      const predecessorQids = [
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${900_000 + index}`),
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          predecessorQids,
          async () => {
            throw new Error('fixture custody interruption')
          },
        ),
      ).rejects.toThrow('fixture custody interruption')
      const custodyRoot = join(
        directory,
        'quarantine',
        'retained-predecessor-collision',
      )
      const [bundle] = await readdir(custodyRoot)
      await writeFile(
        join(custodyRoot, bundle!, 'completed.json'),
        '{"forged":true}',
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          predecessorQids,
        ),
      ).rejects.toThrow('frozen-plan')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }

    const duplicateDirectory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-custody-duplicate-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      const predecessorQids = [
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${900_000 + index}`),
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory: duplicateDirectory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(duplicateDirectory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          duplicateDirectory,
          input,
          predecessorQids,
          async () => {
            throw new Error('fixture custody interruption')
          },
        ),
      ).rejects.toThrow('fixture custody interruption')
      await mkdir(
        join(
          duplicateDirectory,
          'quarantine',
          'retained-predecessor-collision',
          '001-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          duplicateDirectory,
          input,
          predecessorQids,
        ),
      ).rejects.toThrow('frozen-plan')
    } finally {
      await rm(duplicateDirectory, { recursive: true, force: true })
    }
  })

  it('resumes only the frozen recovery plan after a pre-promotion crash', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-crash-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          async () => {
            throw new Error('fixture promotion interruption')
          },
        ),
      ).rejects.toThrow('fixture promotion interruption')
      await expect(
        readFile(
          join(directory, '.decision-068-recovery-journal.json'),
          'utf8',
        ),
      ).resolves.toContain('auditSha256')
      await expect(
        readdir(join(directory, 'review-round-2')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await recoverCandidateReviewRoundTwoForFixture(directory, input, {
        fixture: true,
      })
      await expect(
        readFile(
          join(directory, 'review-round-2', 'locks', '001.locked.json'),
          'utf8',
        ),
      ).resolves.toContain('"version": 3')
      await expect(
        readFile(join(directory, '.decision-068-recovery-journal.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('cleans up before a frozen recovery plan is persisted', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-preflight-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          async () => {
            throw new Error('fixture preflight failure')
          },
        ),
      ).rejects.toThrow('fixture preflight failure')
      await expect(
        readFile(join(directory, '.decision-068-recovery-journal.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        readdir(join(directory, '.decision-068-recovery-staging')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('cleans only an exact promoted round-two root after a post-promotion crash', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-promoted-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          undefined,
          async () => {
            throw new Error('fixture post-promotion interruption')
          },
        ),
      ).rejects.toThrow('fixture post-promotion interruption')
      await expect(
        readFile(join(directory, '.decision-068-recovery-journal.json')),
      ).resolves.toBeDefined()
      await recoverCandidateReviewRoundTwoForFixture(directory, input, {
        fixture: true,
      })
      await expect(
        readFile(join(directory, '.decision-068-recovery-journal.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        readdir(join(directory, '.decision-068-recovery-staging')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a coordinated self-consistent promoted journal and plan rewrite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-plan-forge-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          undefined,
          async () => {
            throw new Error('fixture post-promotion interruption')
          },
        ),
      ).rejects.toThrow('fixture post-promotion interruption')
      const journalPath = join(directory, '.decision-068-recovery-journal.json')
      const planPath = join(directory, 'review-round-2', 'recovery-plan.json')
      const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        revalidations: { lockSha256: string }[]
        journalSha256: string
      }
      const rewrittenJournalCore = {
        ...journal,
        revalidations: journal.revalidations.map((value) => ({
          ...value,
          lockSha256: 'a'.repeat(64),
        })),
      }
      delete (rewrittenJournalCore as { journalSha256?: string }).journalSha256
      await writeFile(
        journalPath,
        JSON.stringify({
          ...rewrittenJournalCore,
          journalSha256: discoverySha256(rewrittenJournalCore),
        }),
      )
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
        files: { path: string; sha256: string; bytes: number }[]
        promotionPlanSha256: string
      }
      const rewrittenPlanCore = {
        ...plan,
        files: plan.files.map((value) =>
          value.path.startsWith('locks/')
            ? { ...value, sha256: 'a'.repeat(64) }
            : value,
        ),
      }
      delete (rewrittenPlanCore as { promotionPlanSha256?: string })
        .promotionPlanSha256
      await writeFile(
        planPath,
        JSON.stringify({
          ...rewrittenPlanCore,
          promotionPlanSha256: discoverySha256(rewrittenPlanCore),
        }),
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('frozen-plan')
      await expect(readFile(journalPath)).resolves.toBeDefined()
      await expect(readFile(planPath)).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops on changed persisted audit and restores only an absent audit after post-promotion interruption', async () => {
    const createPromotedInterruption = async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'm45-candidate-audit-resume-'),
      )
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          undefined,
          async () => {
            throw new Error('fixture post-promotion interruption')
          },
        ),
      ).rejects.toThrow('fixture post-promotion interruption')
      return {
        directory,
        input,
        audit: await readFile(
          join(directory, 'candidate-predecessor-collision-audit.v1.json'),
          'utf8',
        ),
      }
    }
    const changed = await createPromotedInterruption()
    try {
      const auditPath = join(
        changed.directory,
        'candidate-predecessor-collision-audit.v1.json',
      )
      await writeFile(auditPath, '{"changed":true}\n')
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          changed.directory,
          changed.input,
          {
            fixture: true,
          },
        ),
      ).rejects.toThrow('recovery:recovery-audit')
      await expect(
        readFile(
          join(changed.directory, '.decision-068-recovery-journal.json'),
        ),
      ).resolves.toBeDefined()
      await expect(
        readdir(join(changed.directory, '.decision-068-recovery-staging')),
      ).resolves.toBeDefined()
    } finally {
      await rm(changed.directory, { recursive: true, force: true })
    }
    const absent = await createPromotedInterruption()
    try {
      const auditPath = join(
        absent.directory,
        'candidate-predecessor-collision-audit.v1.json',
      )
      await rm(auditPath)
      await recoverCandidateReviewRoundTwoForFixture(
        absent.directory,
        absent.input,
        {
          fixture: true,
        },
      )
      await expect(readFile(auditPath, 'utf8')).resolves.toBe(absent.audit)
      await expect(
        readFile(join(absent.directory, '.decision-068-recovery-journal.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(absent.directory, { recursive: true, force: true })
    }
  })

  it('never recreates a missing promoted custody bundle during post-promotion cleanup', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-custody-post-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      const predecessorQids = [
        'Q1',
        ...Array.from({ length: 499 }, (_, index) => `Q${900_000 + index}`),
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          predecessorQids,
          undefined,
          undefined,
          async () => {
            throw new Error('fixture post-promotion interruption')
          },
        ),
      ).rejects.toThrow('fixture post-promotion interruption')
      const custodyRoot = join(
        directory,
        'quarantine',
        'retained-predecessor-collision',
      )
      const [bundle] = await readdir(custodyRoot)
      await rm(join(custodyRoot, bundle!), { recursive: true, force: true })
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          predecessorQids,
        ),
      ).rejects.toThrow('recovery:verification')
      await expect(
        readFile(join(directory, '.decision-068-recovery-journal.json')),
      ).resolves.toBeDefined()
      await expect(
        readdir(join(directory, '.decision-068-recovery-staging')),
      ).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops malformed and cross-manifest partial legacy tuples before custody', async () => {
    const malformed = await mkdtemp(join(tmpdir(), 'm45-candidate-partial-'))
    try {
      const input = receipt(1)
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        {
          directory: malformed,
          receipt: input,
          entities: { Q1: entity('Q1') },
        },
      )
      await mkdir(join(malformed, 'completed'))
      await writeFile(join(malformed, 'completed', '001.json'), '{}')
      await expect(
        recoverCandidateReviewRoundTwoForFixture(malformed, input, {
          fixture: true,
        }),
      ).rejects.toThrow('audit:legacy-partial')
      await expect(
        readdir(
          join(malformed, 'quarantine', 'retained-predecessor-collision'),
        ),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(malformed, { recursive: true, force: true })
    }

    const crossManifest = await mkdtemp(
      join(tmpdir(), 'm45-candidate-cross-manifest-'),
    )
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory: crossManifest, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(crossManifest, input, entities, 3)
      for (const [folder, suffix] of [
        ['verdicts', '.json'],
        ['completed', '.json'],
        ['locks', '.locked.json'],
      ] as const)
        await writeFile(
          join(crossManifest, folder, `002${suffix}`),
          await readFile(join(crossManifest, folder, `001${suffix}`)),
        )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(crossManifest, input, {
          fixture: true,
        }),
      ).rejects.toThrow('audit:legacy-manifest')
      await expect(
        readdir(
          join(crossManifest, 'quarantine', 'retained-predecessor-collision'),
        ),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(crossManifest, { recursive: true, force: true })
    }
  })

  it('rejects substituted fresh and prior locks before canonical round admission', async () => {
    const prior = await mkdtemp(join(tmpdir(), 'm45-candidate-prior-lock-'))
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory: prior, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(prior, input, entities, 3)
      await recoverCandidateReviewRoundTwoForFixture(prior, input, {
        fixture: true,
      })
      const lockPath = join(prior, 'review-round-2', 'locks', '001.locked.json')
      const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
        records: unknown[]
        lockedResultSha256: string
      }
      const forgedCore = { ...lock, records: [...lock.records].reverse() }
      delete (forgedCore as { lockedResultSha256?: string }).lockedResultSha256
      await writeFile(
        lockPath,
        `${JSON.stringify({
          ...forgedCore,
          lockedResultSha256: discoverySha256(forgedCore),
        })}\n`,
      )
      const planPath = join(prior, 'review-round-2', 'recovery-plan.json')
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
        files: { path: string; sha256: string; bytes: number }[]
        promotionPlanSha256: string
      }
      const forgedLockText = await readFile(lockPath, 'utf8')
      const forgedPlanCore = {
        ...plan,
        files: plan.files.map((file) =>
          file.path === 'locks/001.locked.json'
            ? {
                ...file,
                sha256: byteSha256(forgedLockText),
                bytes: Buffer.byteLength(forgedLockText),
              }
            : file,
        ),
      }
      delete (forgedPlanCore as { promotionPlanSha256?: string })
        .promotionPlanSha256
      await writeFile(
        planPath,
        `${JSON.stringify({
          ...forgedPlanCore,
          promotionPlanSha256: discoverySha256(forgedPlanCore),
        })}\n`,
      )
      await expect(
        completeCandidateReviewManifestForFixture('002', prior, input, {
          fixture: true,
        }),
      ).rejects.toThrow('complete:revalidation')
    } finally {
      await rm(prior, { recursive: true, force: true })
    }

    const fresh = await mkdtemp(join(tmpdir(), 'm45-candidate-fresh-lock-'))
    const unobserved = await mkdtemp(
      join(tmpdir(), 'm45-candidate-unobserved-lock-'),
    )
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory: fresh, receipt: input, entities },
      )
      const predecessorQids = Array.from(
        { length: 500 },
        (_, index) => `Q${900_000 + index}`,
      )
      const predecessor =
        deriveCandidatePredecessorExclusionAuthorityForFixture(predecessorQids)
      const roundSha = deriveCandidateReviewRoundSha256({
        candidateReceiptSha256:
          'fa126f87e53ef4babfec7f0a5924c153e84aa03a638052157656537e71002c59',
        predecessorReviewResultSha256:
          predecessor.predecessorReviewResultSha256,
        retainedPredecessorIdentitySetSha256:
          predecessor.retainedPredecessorIdentitySetSha256,
        predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
      })
      await recoverCandidateReviewRoundTwoForFixture(
        fresh,
        input,
        predecessorQids,
      )
      const artifacts = buildCandidatePreparationArtifacts(input, entities)
      await mkdir(join(fresh, 'review-round-2', 'verdicts'), {
        recursive: true,
      })
      await writeFile(
        join(fresh, 'review-round-2', 'verdicts', '001.json'),
        JSON.stringify({
          ...verdictFor(artifacts, 1),
          version: 2,
          predecessorReviewResultSha256:
            predecessor.predecessorReviewResultSha256,
          retainedPredecessorIdentitySetSha256:
            predecessor.retainedPredecessorIdentitySetSha256,
          predecessorExclusionAuthoritySha256: predecessor.authoritySha256,
          candidateReviewRoundSha256: roundSha,
        }),
      )
      await completeCandidateReviewManifestForFixture(
        '001',
        fresh,
        input,
        predecessorQids,
      )
      await cp(fresh, unobserved, { recursive: true })
      const lockDiagnostics: unknown[] = []
      const lockPhases: string[] = []
      await runCandidateReviewCommandForFixture(['lock', '001'], {
        directory: fresh,
        receipt: input,
        predecessorReviewResult: predecessorQids,
        lockPhaseObserver: (phase) => lockPhases.push(phase),
        terminalDiagnosticSink: (diagnostic) =>
          lockDiagnostics.push(diagnostic),
      })
      expect(lockPhases).toEqual([
        'recovery-clean',
        'prepared-authority',
        'target-admission',
        'predecessor-authority',
        'recovery-audit',
        'round-scaffold',
        'canonical-round-state',
        'target-admission',
        'existing-locks',
        'verdict-materialization',
        'completed-canonical',
        'lock-construction',
        'existing-locks',
        'predecessor-reserve',
        'reserve-feasibility',
        'atomic-lock-write',
      ])
      expect([...new Set(lockPhases)].sort()).toEqual(
        [...candidateReviewLockTerminalPhaseSchema.options].sort(),
      )
      expect(lockDiagnostics).toEqual([
        {
          schema: 'zedarchive.anime-v2-candidate-review-terminal-diagnostic',
          version: 2,
          stage: 'lock',
          outcome: 'completed',
          phase: 'atomic-lock-write',
        },
      ])
      const lockPath = join(fresh, 'review-round-2', 'locks', '001.locked.json')
      await lockCandidateReviewManifestForFixture('001', unobserved, {
        receipt: input,
        predecessorReviewResult: predecessorQids,
        predecessorMetrics: {
          qids: [],
          retainedQids: predecessorQids,
          formatCounts: {},
          eraCounts: {},
          unknown: 0,
          audience: 0,
        },
        reserve: {
          publishedTarget: 0,
          audienceAnchorCount: 0,
          unknownYearMaximum: 51,
          formatFloors: {},
          eraFloors: {},
        },
      })
      expect(await readFile(lockPath, 'utf8')).toBe(
        await readFile(
          join(unobserved, 'review-round-2', 'locks', '001.locked.json'),
          'utf8',
        ),
      )
      const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
        records: unknown[]
        lockedResultSha256: string
      }
      const forgedCore = { ...lock, records: [...lock.records].reverse() }
      delete (forgedCore as { lockedResultSha256?: string }).lockedResultSha256
      await writeFile(
        lockPath,
        `${JSON.stringify({
          ...forgedCore,
          lockedResultSha256: discoverySha256(forgedCore),
        })}\n`,
      )
      await expect(
        completeCandidateReviewManifestForFixture(
          '002',
          fresh,
          input,
          predecessorQids,
        ),
      ).rejects.toThrow('complete:round-state')
    } finally {
      await rm(fresh, { recursive: true, force: true })
      await rm(unobserved, { recursive: true, force: true })
    }
  })

  it('stops if a promoted round-two file changes before frozen cleanup', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-promoted-forge-'),
    )
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      await writeLegacyManifestArtifacts(directory, input, entities, 3)
      await expect(
        recoverCandidateReviewRoundTwoForFixture(
          directory,
          input,
          { fixture: true },
          undefined,
          undefined,
          async () => {
            throw new Error('fixture post-promotion interruption')
          },
        ),
      ).rejects.toThrow('fixture post-promotion interruption')
      await writeFile(
        join(directory, 'review-round-2', 'locks', '001.locked.json'),
        '{"forged":true}',
      )
      await expect(
        recoverCandidateReviewRoundTwoForFixture(directory, input, {
          fixture: true,
        }),
      ).rejects.toThrow('frozen-plan')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refuses a manually created round-two root before recovery scaffolding exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-canonical-'))
    try {
      const input = receipt(1)
      const entities = { Q1: entity('Q1') }
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const artifacts = buildCandidatePreparationArtifacts(input, entities)
      const verdict = {
        ...verdictFor(artifacts),
        version: 2,
      }
      await mkdir(join(directory, 'review-round-2', 'verdicts'), {
        recursive: true,
      })
      await writeFile(
        join(directory, 'review-round-2', 'verdicts', '001.json'),
        JSON.stringify(verdict),
      )
      await expect(
        completeCandidateReviewManifestForFixture('001', directory, input),
      ).rejects.toThrow('complete:recovery-audit')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('materializes explicit verdicts once without creating a lock or defaulting approval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-complete-'))
    try {
      const input = receipt()
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const verdict = verdictFor(
        buildCandidatePreparationArtifacts(input, entities),
      )
      const verdictPath = join(directory, 'verdict.json')
      const completedPath = join(directory, 'completed.json')
      await writeFile(verdictPath, JSON.stringify(verdict))
      await completeCandidateReviewManifestForFixture(
        '001',
        verdictPath,
        completedPath,
        directory,
        input,
      )
      const completed = JSON.parse(await readFile(completedPath, 'utf8')) as {
        records: { primaryReview: string }[]
      }
      expect(
        completed.records.every(
          (record) => record.primaryReview === 'rejected',
        ),
      ).toBe(true)
      await expect(readdir(join(directory, 'locks'))).rejects.toMatchObject({
        code: 'ENOENT',
      })
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          verdictPath,
          completedPath,
          directory,
          input,
        ),
      ).rejects.toMatchObject({ code: 'EEXIST' })
      const badTitle = {
        ...verdict,
        records: verdict.records.map((record, index) =>
          index === 0 && record.machineValidation === 'approved'
            ? {
                ...record,
                title: { source: 'label.en', valueSha256: 'f'.repeat(64) },
              }
            : record,
        ),
      }
      const badPath = join(directory, 'bad.json')
      await writeFile(badPath, JSON.stringify(badTitle))
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          badPath,
          join(directory, 'bad-completed.json'),
          directory,
          input,
        ),
      ).rejects.toThrow('title')
      const missing = {
        ...verdict,
        records: verdict.records.map((record, index) => {
          if (index !== 0 || record.machineValidation !== 'approved')
            return record
          const { exactWorkIdentity: _missing, ...partial } = record
          void _missing
          return partial
        }),
      }
      await writeFile(join(directory, 'missing.json'), JSON.stringify(missing))
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          join(directory, 'missing.json'),
          join(directory, 'missing-completed.json'),
          directory,
          input,
        ),
      ).rejects.toThrow()
      await writeFile(
        join(directory, 'unknown.json'),
        JSON.stringify({ ...verdict, reviewerIdentity: 'forbidden' }),
      )
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          join(directory, 'unknown.json'),
          join(directory, 'unknown-completed.json'),
          directory,
          input,
        ),
      ).rejects.toThrow()
      const suppliedSignals = {
        ...verdict,
        records: verdict.records.map((record, index) =>
          index === 0 ? { ...record, adultSignals: [] } : record,
        ),
      }
      await writeFile(
        join(directory, 'signals.json'),
        JSON.stringify(suppliedSignals),
      )
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          join(directory, 'signals.json'),
          join(directory, 'signals-completed.json'),
          directory,
          input,
        ),
      ).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requires the explicit D065 adult outcome and preserves machine-rejected prefill', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'm45-candidate-verdict-policy-'),
    )
    try {
      const input = receipt(1)
      const signalled = entity('Q1')
      signalled.claims.P136 = [
        {
          rank: 'normal',
          mainsnak: {
            snaktype: 'value',
            property: 'P136',
            datatype: 'wikibase-item',
            datavalue: {
              type: 'wikibase-entityid',
              value: { id: 'Q172067', 'entity-type': 'item' },
            },
          },
        },
      ]
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities: { Q1: signalled } },
      )
      const verdict = verdictFor(
        buildCandidatePreparationArtifacts(input, { Q1: signalled }),
      )
      const cleared = {
        ...verdict,
        records: verdict.records.map((record) =>
          record.machineValidation === 'approved'
            ? { ...record, adultPublicationOutcome: 'cleared' }
            : record,
        ),
      }
      await writeFile(join(directory, 'cleared.json'), JSON.stringify(cleared))
      await expect(
        completeCandidateReviewManifestForFixture(
          '001',
          join(directory, 'cleared.json'),
          join(directory, 'cleared-completed.json'),
          directory,
          input,
        ),
      ).rejects.toThrow('adult')

      const machineDirectory = await mkdtemp(
        join(tmpdir(), 'm45-candidate-machine-'),
      )
      try {
        const rejected = entity('Q1')
        rejected.claims.P1113 = [
          {
            rank: 'normal',
            mainsnak: {
              snaktype: 'value',
              property: 'P1113',
              datatype: 'quantity',
              datavalue: {
                type: 'quantity',
                value: { amount: '+12', unit: 'Q1' },
              },
            },
          },
        ]
        await runCandidateReviewCommandForFixture(
          ['prepare', '--confirm-wikimedia-live'],
          {
            directory: machineDirectory,
            receipt: input,
            entities: { Q1: rejected },
          },
        )
        const machineVerdict = verdictFor(
          buildCandidatePreparationArtifacts(input, { Q1: rejected }),
        )
        await writeFile(
          join(machineDirectory, 'machine.json'),
          JSON.stringify(machineVerdict),
        )
        await completeCandidateReviewManifestForFixture(
          '001',
          join(machineDirectory, 'machine.json'),
          join(machineDirectory, 'machine-completed.json'),
          machineDirectory,
          input,
        )
        const override = {
          ...machineVerdict,
          records: [
            {
              qid: 'Q1',
              machineValidation: 'rejected',
              primaryReview: 'approved',
            },
          ],
        }
        await writeFile(
          join(machineDirectory, 'override.json'),
          JSON.stringify(override),
        )
        await expect(
          completeCandidateReviewManifestForFixture(
            '001',
            join(machineDirectory, 'override.json'),
            join(machineDirectory, 'override-completed.json'),
            machineDirectory,
            input,
          ),
        ).rejects.toThrow()
      } finally {
        await rm(machineDirectory, { recursive: true, force: true })
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('emits exactly one privacy-safe stopped acquisition diagnostic without promotion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-stopped-'))
    try {
      const diagnostics: unknown[] = []
      const requester = new SequentialCandidateRequester(
        async () =>
          new Response('busy', {
            status: 429,
            headers: { 'retry-after': '31' },
          }),
      )
      await expect(
        runCandidateReviewCommandForFixture(
          ['prepare', '--confirm-wikimedia-live'],
          {
            directory,
            receipt: receipt(1),
            requester,
            terminalDiagnosticSink: (diagnostic) =>
              diagnostics.push(diagnostic),
          },
        ),
      ).rejects.toThrow('retry-after')
      expect(diagnostics).toHaveLength(1)
      const diagnostic = diagnostics[0] as Record<string, unknown>
      expect(diagnostic).toMatchObject({
        schema: 'zedarchive.anime-v2-candidate-review-terminal-diagnostic',
        version: 2,
        stage: 'acquisition',
        outcome: 'stopped',
        candidates: 1,
        manifests: 1,
        requestEvidence: {
          attempts: 1,
          retries: 1,
          pacingWaits: 0,
          pacingDelayMilliseconds: 0,
          maximumConcurrency: 1,
        },
      })
      expect(JSON.stringify(diagnostic)).toMatch(/"elapsedMilliseconds":\d+/)
      expect(JSON.stringify(diagnostic)).toMatch(
        /rawAttemptSetCommitmentSha256/,
      )
      expect(JSON.stringify(diagnostic)).not.toMatch(
        /Q1|busy|https?:|title|error|stack|env|email|contact/i,
      )
      expect(await readdir(directory)).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a prepared acquisition artifact with an extra provider field before finalization', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-strict-'))
    try {
      const input = receipt()
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const path = join(directory, 'prepared', 'acquisition.json')
      const acquisition = JSON.parse(await readFile(path, 'utf8')) as Record<
        string,
        unknown
      >
      acquisition.rawProviderPayload = 'forbidden'
      await writeFile(path, JSON.stringify(acquisition))
      await expect(
        finalizeCandidateReviewForFixture(directory, input),
      ).rejects.toThrow('acquisition-schema')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('locks only valid bounded manifests and requires a collision audit before v3 finalization', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-lock-'))
    try {
      const input = receipt(51)
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const artifacts = buildCandidatePreparationArtifacts(input, entities)
      const metrics = {
        qids: [],
        formatCounts: {},
        eraCounts: {},
        unknown: 0,
        audience: 0,
      }
      const reserve = {
        publishedTarget: 51,
        audienceAnchorCount: 0,
        unknownYearMaximum: 51,
        formatFloors: {},
        eraFloors: {},
      }
      const one = completedFor(artifacts.inputs[0]!, artifacts)
      const two = completedFor(artifacts.inputs[1]!, artifacts)
      const onePath = join(directory, 'one.json')
      const twoPath = join(directory, 'two.json')
      await writeFile(onePath, JSON.stringify(one))
      await writeFile(twoPath, JSON.stringify(two))
      await lockCandidateReviewManifestForFixture('001', onePath, directory, {
        receipt: input,
        predecessorMetrics: metrics,
        reserve,
      })
      await expect(
        finalizeCandidateReviewForFixture(directory, input),
      ).rejects.toThrow('incomplete-locks')
      await expect(
        lockCandidateReviewManifestForFixture('001', onePath, directory, {
          receipt: input,
          predecessorMetrics: metrics,
          reserve,
        }),
      ).rejects.toThrow('no overwrite')
      await lockCandidateReviewManifestForFixture('002', twoPath, directory, {
        receipt: input,
        predecessorMetrics: metrics,
        reserve,
      })
      await expect(
        finalizeCandidateReviewForFixture(directory, input),
      ).rejects.toThrow('active-collision-audit')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a reserve failure before promoting the lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-candidate-reserve-'))
    try {
      const input = receipt()
      const entities = Object.fromEntries(
        input.candidates.map((row) => [row.qid, entity(row.qid)]),
      )
      await runCandidateReviewCommandForFixture(
        ['prepare', '--confirm-wikimedia-live'],
        { directory, receipt: input, entities },
      )
      const artifacts = buildCandidatePreparationArtifacts(input, entities)
      const completed = completedFor(artifacts.inputs[0]!, artifacts)
      const path = join(directory, 'result.json')
      await writeFile(path, JSON.stringify(completed))
      await expect(
        lockCandidateReviewManifestForFixture('001', path, directory, {
          receipt: input,
          predecessorMetrics: {
            qids: [],
            formatCounts: {},
            eraCounts: {},
            unknown: 0,
            audience: 0,
          },
          reserve: {
            publishedTarget: 3,
            audienceAnchorCount: 0,
            unknownYearMaximum: 3,
            formatFloors: {},
            eraFloors: {},
          },
        }),
      ).rejects.toThrow('published target')
      await expect(
        readFile(join(directory, 'locks', '001.locked.json'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('contains no database, environment, UUID allocation, or live invocation path', async () => {
    const source = await readFile(
      new URL('../scripts/review-anime-v2-candidates.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/randomUUID|DATABASE_URL|from ['\"]pg['\"]/)
    expect(source).toMatch(/process\.env\.NODE_ENV !== 'test'/)
  })

  it('pins the recorded Decision-068 41/74/45 live audit classification', async () => {
    const source = await readFile(
      new URL('../scripts/review-anime-v2-candidates.ts', import.meta.url),
      'utf8',
    )
    expect(source).toMatch(/summary\.valid !== 41/)
    expect(source).toMatch(/summary\.requiresQuarantine !== 74/)
    expect(source).toMatch(/summary\.missing !== 45/)
  })
})
