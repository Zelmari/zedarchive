import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  allocateIdentity as allocateIdentityPublic,
  allocateIdentityForFixture as allocateIdentity,
  allocationHistoryEvent,
  allocationHistoryMappings,
  appendAllocationHistoryEvent,
  acceptedCandidateReceiptSha256,
  acceptedSelectionRubricSha256,
  finalIdentitySelectionSha256,
  identityAllocationHistorySha256,
  identityAllocationLedgerSha256,
  parseIdentityAllocationLedger,
  parseFrozenIdentityProposalArtifact,
  parseFrozenIdentityProposalForFixture,
  parsePrimaryIdentityReviewResult,
  parseFinalizedIdentityAllocationHistory,
  terminalAllocationHistoryEvent,
  validateIdentityAllocationHistory,
  validateIdentityAllocationLedger,
  validateFinalIdentityAllocationCorrespondenceForFixture as validateFinalIdentityAllocationCorrespondence,
  type IdentityAllocationHistoryEvent,
  type IdentityAllocationLedgerEntry,
} from '@/features/anime/catalogue/anime-release-v2-identity-allocation'
import {
  appendReplacementLineage,
  deriveIndependentSampleRoundSeed,
  deriveIndependentSampleSeed,
  replacementLineageSha256,
} from '@/features/anime/catalogue/anime-release-v2-lineage'
import { discoverySha256 } from '@/features/anime/catalogue/wikidata-anime-discovery'

const hashes = {
  receipt: acceptedCandidateReceiptSha256,
  projection: '2'.repeat(64),
  proposal: '3'.repeat(64),
  final: '4'.repeat(64),
}

function request(
  qid = 'Q1',
  allocationHistory: readonly IdentityAllocationHistoryEvent[] = [],
  allocationRound = 1,
) {
  const orderedQids = [qid]
  const selectionCore = {
    schema: 'zedarchive.anime-v2-canonical-selection-evidence' as const,
    version: 1 as const,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricSha256,
    finalizedContinuitySha256: '5'.repeat(64),
    orderedSelectedQids: orderedQids,
    orderedSelectedQidsSha256: discoverySha256(orderedQids),
    audienceAnchorQids: orderedQids,
    coverageWitnessQids: orderedQids,
    reasonCodes: orderedQids.map((qid) => ({ qid, reasons: ['audience-en'] })),
    primaryCost: '0',
    tierWeight: '1',
    witnessPartitionsSolved: 1,
  }
  const canonicalSelectionEvidence = {
    ...selectionCore,
    evidenceSha256: discoverySha256(selectionCore),
  }
  const selectionAuthority = {
    kind: 'initial' as const,
    commitmentSha256: canonicalSelectionEvidence.evidenceSha256,
  }
  const proposalAuthority = {
    canonicalSelectionEvidence,
    retainedPredecessorQids: [],
    predecessorCorpusSha256: '7'.repeat(64),
    identityReplacementLineage: [],
  }
  const proposalCore = {
    allocationRound,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricSha256,
    canonicalSelectionEvidenceSha256: canonicalSelectionEvidence.evidenceSha256,
    finalizedContinuitySha256:
      canonicalSelectionEvidence.finalizedContinuitySha256,
    selectionAuthority: {
      kind: selectionAuthority.kind,
      commitmentSha256: selectionAuthority.commitmentSha256,
    },
    orderedQids,
    orderedQidSequenceSha256: discoverySha256(orderedQids),
  }
  const proposal = {
    version: 'identity-proposal.v1' as const,
    ...proposalCore,
    proposalSha256: discoverySha256({
      version: 'identity-proposal.v1',
      ...proposalCore,
    }),
  }
  const reviewCore = {
    version: 'identity-review-input.v1',
    qid,
    proposalSha256: proposal.proposalSha256,
    allocationRound,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    reducedProjectionSha256: hashes.projection,
  }
  const approval = {
    version: 'primary-identity-review-result.v1' as const,
    qid,
    reducedProjectionSha256: hashes.projection,
    proposalSha256: proposal.proposalSha256,
    allocationRound,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    reviewInputSha256: discoverySha256(reviewCore),
    exactWorkIdentity: 'approved' as const,
    mediaScope: 'approved' as const,
    outcome: 'approved-exact-work' as const,
  }
  return {
    proposal,
    proposalAuthority,
    primaryIdentityReviewResult: approval,
    approval,
    allocationHistory,
  }
}

const firstUuid = '00000000-0000-4000-8000-000000000001'
const secondUuid = '00000000-0000-4000-8000-000000000002'

function selectionEvidence(
  orderedSelectedQids: readonly string[],
  audienceAnchorQids: readonly string[],
) {
  const core = {
    schema: 'zedarchive.anime-v2-canonical-selection-evidence' as const,
    version: 1 as const,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricSha256,
    finalizedContinuitySha256: '5'.repeat(64),
    orderedSelectedQids,
    orderedSelectedQidsSha256: discoverySha256(orderedSelectedQids),
    audienceAnchorQids,
    coverageWitnessQids: orderedSelectedQids,
    reasonCodes: orderedSelectedQids.map((qid) => ({
      qid,
      reasons: ['audience-en'],
    })),
    primaryCost: '0',
    tierWeight: '1',
    witnessPartitionsSolved: 1,
  }
  return { ...core, evidenceSha256: discoverySha256(core) }
}

function proposalArtifact(
  input: Readonly<{
    allocationRound: number
    orderedQids: readonly string[]
    selection: ReturnType<typeof selectionEvidence>
    selectionAuthority: Readonly<{
      kind: 'initial' | 'replacement-lineage'
      commitmentSha256: string
    }>
  }>,
) {
  const core = {
    allocationRound: input.allocationRound,
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    selectionRubricSha256: acceptedSelectionRubricSha256,
    canonicalSelectionEvidenceSha256: input.selection.evidenceSha256,
    finalizedContinuitySha256: input.selection.finalizedContinuitySha256,
    selectionAuthority: input.selectionAuthority,
    orderedQids: input.orderedQids,
    orderedQidSequenceSha256: discoverySha256(input.orderedQids),
  }
  return {
    version: 'identity-proposal.v1' as const,
    ...core,
    proposalSha256: discoverySha256({
      version: 'identity-proposal.v1',
      ...core,
    }),
  }
}

function replacementReviewResult(
  input: Readonly<{
    selectionEvidenceSha256: string
    originalSeed: string
    round: number
    previousSelectedQids: readonly string[]
    removedQids: readonly string[]
  }>,
) {
  const roundSeed = deriveIndependentSampleRoundSeed(
    input.originalSeed,
    input.round,
  )
  const reviewInput = {
    version: 'identity-replacement-review-input.v1',
    candidateReceiptSha256: acceptedCandidateReceiptSha256,
    canonicalSelectionEvidenceSha256: input.selectionEvidenceSha256,
    round: input.round,
    previousSelectedQidsSha256: discoverySha256(input.previousSelectedQids),
    roundSeed,
    reviewedQids: input.removedQids,
  }
  const removals = input.removedQids.map((qid) => ({
    qid,
    outcome: 'independent-review-rejected' as const,
  }))
  const resultCore = {
    ...reviewInput,
    schema: 'zedarchive.anime-v2-identity-replacement-review-result' as const,
    version: 1 as const,
    removals,
  }
  return {
    schema: resultCore.schema,
    version: resultCore.version,
    candidateReceiptSha256: resultCore.candidateReceiptSha256,
    canonicalSelectionEvidenceSha256:
      resultCore.canonicalSelectionEvidenceSha256,
    round: resultCore.round,
    previousSelectedQidsSha256: resultCore.previousSelectedQidsSha256,
    roundSeed,
    removals,
    reviewInputSha256: discoverySha256(reviewInput),
    resultSha256: discoverySha256(resultCore),
  }
}

describe('identity-proposal.v1 canonical rounds', () => {
  it('accepts audience order and keeps continuity-corrected selection at identity round one', () => {
    const selection = selectionEvidence(['Q1', 'Q2', 'Q10'], ['Q10', 'Q2'])
    const proposal = proposalArtifact({
      allocationRound: 1,
      orderedQids: ['Q2', 'Q10'],
      selection,
      selectionAuthority: {
        kind: 'initial',
        commitmentSha256: selection.evidenceSha256,
      },
    })
    expect(
      parseFrozenIdentityProposalForFixture(proposal, {
        canonicalSelectionEvidence: selection,
        retainedPredecessorQids: ['Q1'],
        predecessorCorpusSha256: '7'.repeat(64),
        identityReplacementLineage: [],
        identityReplacementReviewResults: [],
      }),
    ).toEqual(proposal)
  })

  it('makes round two contain only the latest identity replacements', () => {
    const selection = selectionEvidence(['Q1', 'Q2', 'Q10'], ['Q10', 'Q2'])
    const predecessorCorpusSha256 = '7'.repeat(64)
    const lineageAuthority = {
      originalSeed: deriveIndependentSampleSeed({
        canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
        predecessorCorpusSha256,
        orderedProposedPublishedQidSequenceSha256: discoverySha256(
          selection.orderedSelectedQids,
        ),
      }),
      initialOrderedQids: selection.orderedSelectedQids,
    }
    const lineage = appendReplacementLineage(
      [],
      { removedQids: ['Q2'], addedQids: ['Q3'] },
      lineageAuthority,
    )
    const proposal = proposalArtifact({
      allocationRound: 2,
      orderedQids: ['Q3'],
      selection,
      selectionAuthority: {
        kind: 'replacement-lineage',
        commitmentSha256: replacementLineageSha256(lineage, lineageAuthority),
      },
    })
    const authority = {
      canonicalSelectionEvidence: selection,
      retainedPredecessorQids: ['Q1'],
      predecessorCorpusSha256,
      identityReplacementLineage: lineage,
      identityReplacementReviewResults: [
        replacementReviewResult({
          selectionEvidenceSha256: selection.evidenceSha256,
          originalSeed: lineageAuthority.originalSeed,
          round: 1,
          previousSelectedQids: selection.orderedSelectedQids,
          removedQids: ['Q2'],
        }),
      ],
    }
    expect(parseFrozenIdentityProposalForFixture(proposal, authority)).toEqual(
      proposal,
    )
    expect(() =>
      parseFrozenIdentityProposalForFixture(
        { ...proposal, orderedQids: ['Q2', 'Q3'] },
        authority,
      ),
    ).toThrow()
  })

  it('keeps later proposals limited to only the latest added QIDs', () => {
    const selection = selectionEvidence(['Q1', 'Q2', 'Q10'], ['Q10', 'Q2'])
    const predecessorCorpusSha256 = '7'.repeat(64)
    const lineageAuthority = {
      originalSeed: deriveIndependentSampleSeed({
        canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
        predecessorCorpusSha256,
        orderedProposedPublishedQidSequenceSha256: discoverySha256(
          selection.orderedSelectedQids,
        ),
      }),
      initialOrderedQids: selection.orderedSelectedQids,
    }
    const firstLineage = appendReplacementLineage(
      [],
      { removedQids: ['Q2'], addedQids: ['Q3'] },
      lineageAuthority,
    )
    const lineage = appendReplacementLineage(
      firstLineage,
      { removedQids: ['Q10'], addedQids: ['Q4'] },
      lineageAuthority,
    )
    const proposal = proposalArtifact({
      allocationRound: 3,
      orderedQids: ['Q4'],
      selection,
      selectionAuthority: {
        kind: 'replacement-lineage',
        commitmentSha256: replacementLineageSha256(lineage, lineageAuthority),
      },
    })
    const authority = {
      canonicalSelectionEvidence: selection,
      retainedPredecessorQids: ['Q1'],
      predecessorCorpusSha256,
      identityReplacementLineage: lineage,
      identityReplacementReviewResults: [
        replacementReviewResult({
          selectionEvidenceSha256: selection.evidenceSha256,
          originalSeed: lineageAuthority.originalSeed,
          round: 1,
          previousSelectedQids: selection.orderedSelectedQids,
          removedQids: ['Q2'],
        }),
        replacementReviewResult({
          selectionEvidenceSha256: selection.evidenceSha256,
          originalSeed: lineageAuthority.originalSeed,
          round: 2,
          previousSelectedQids: firstLineage[0]!.currentOrderedQids,
          removedQids: ['Q10'],
        }),
      ],
    }
    expect(parseFrozenIdentityProposalForFixture(proposal, authority)).toEqual(
      proposal,
    )
    expect(() =>
      parseFrozenIdentityProposalForFixture(
        proposalArtifact({
          allocationRound: 3,
          orderedQids: ['Q3', 'Q4'],
          selection,
          selectionAuthority: proposal.selectionAuthority,
        }),
        authority,
      ),
    ).toThrow('separately supplied authority')
  })

  it('rejects forged identity lineage seed and proposal commitment', () => {
    const selection = selectionEvidence(['Q1', 'Q2'], ['Q2', 'Q1'])
    const predecessorCorpusSha256 = '7'.repeat(64)
    const lineageAuthority = {
      originalSeed: deriveIndependentSampleSeed({
        canonicalCandidateReceiptSha256: acceptedCandidateReceiptSha256,
        predecessorCorpusSha256,
        orderedProposedPublishedQidSequenceSha256: discoverySha256(
          selection.orderedSelectedQids,
        ),
      }),
      initialOrderedQids: selection.orderedSelectedQids,
    }
    const validLineage = appendReplacementLineage(
      [],
      { removedQids: ['Q1'], addedQids: ['Q3'] },
      lineageAuthority,
    )
    const authority = {
      canonicalSelectionEvidence: selection,
      retainedPredecessorQids: [],
      predecessorCorpusSha256,
      identityReplacementLineage: [
        {
          version: 'replacement-lineage.v1' as const,
          round: 1,
          removedQids: ['Q1'],
          addedQids: ['Q3'],
          previousOrderedQidSequenceSha256: discoverySha256(['Q1', 'Q2']),
          currentOrderedQids: ['Q2', 'Q3'],
          currentOrderedQidSequenceSha256: discoverySha256(['Q2', 'Q3']),
          roundSeed: '9'.repeat(64),
        },
      ],
      identityReplacementReviewResults: [{}],
    }
    const proposal = proposalArtifact({
      allocationRound: 2,
      orderedQids: ['Q3'],
      selection,
      selectionAuthority: {
        kind: 'replacement-lineage',
        commitmentSha256: '8'.repeat(64),
      },
    })
    expect(() =>
      parseFrozenIdentityProposalForFixture(proposal, authority),
    ).toThrow('round seed')
    expect(() =>
      parseFrozenIdentityProposalForFixture(proposal, {
        ...authority,
        identityReplacementLineage: [
          { ...validLineage[0]!, currentOrderedQids: ['Q1', 'Q3'] },
        ],
        identityReplacementReviewResults: [{}],
      }),
    ).toThrow('current QID sequence')
    expect(() =>
      parseFrozenIdentityProposalForFixture(
        {
          ...proposalArtifact({
            allocationRound: 1,
            orderedQids: ['Q1', 'Q2'],
            selection,
            selectionAuthority: {
              kind: 'initial',
              commitmentSha256: selection.evidenceSha256,
            },
          }),
          selectionAuthority: {
            kind: 'initial',
            commitmentSha256: '8'.repeat(64),
          },
        },
        {
          ...authority,
          identityReplacementLineage: [],
          identityReplacementReviewResults: [],
        },
      ),
    ).toThrow('authority')
  })
})

describe('identity-allocation.v1 append-only ledger', () => {
  it('keeps the validated-evidence allocator seam unavailable to live tooling', () => {
    const forged = request()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() =>
        allocateIdentity(
          [],
          {
            proposal: forged.proposal,
            approval: forged.primaryIdentityReviewResult,
            allocationHistory: [],
          },
          () => firstUuid,
        ),
      ).toThrow('unavailable to live tooling')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps forged shaped proposal and review evidence out of public allocation', () => {
    const forged = request()
    expect(() =>
      allocateIdentityPublic([], {
        proposal: forged.proposal,
        proposalAuthority: forged.proposalAuthority as never,
        primaryIdentityReviewResult: forged.primaryIdentityReviewResult,
        allocationHistory: [],
      }),
    ).toThrow()
  })

  it('keeps the live allocator platform-generated and preserves fixture replay', () => {
    expectTypeOf<Parameters<typeof allocateIdentityPublic>>().toEqualTypeOf<
      [
        readonly IdentityAllocationLedgerEntry[],
        Parameters<typeof allocateIdentityPublic>[1],
      ]
    >()

    const forged = request()
    const injectedGenerator = vi.fn(() => firstUuid)
    const publicAllocatorWithUnexpectedGenerator =
      allocateIdentityPublic as unknown as (
        ledger: readonly IdentityAllocationLedgerEntry[],
        request: Parameters<typeof allocateIdentityPublic>[1],
        uuidGenerator: () => string,
      ) => ReturnType<typeof allocateIdentityPublic>
    expect(() =>
      publicAllocatorWithUnexpectedGenerator(
        [],
        {
          proposal: forged.proposal,
          proposalAuthority: forged.proposalAuthority as never,
          primaryIdentityReviewResult: forged.primaryIdentityReviewResult,
          allocationHistory: [],
        },
        injectedGenerator,
      ),
    ).toThrow()
    expect(injectedGenerator).not.toHaveBeenCalled()

    let fixtureCalls = 0
    const allocated = allocateIdentity([], request(), () => {
      fixtureCalls += 1
      return firstUuid
    })
    const replayed = allocateIdentity(
      allocated.ledger,
      request('Q1', [allocationHistoryEvent(allocated.entry)]),
      () => {
        fixtureCalls += 1
        return secondUuid
      },
    )
    expect(replayed).toMatchObject({
      appended: false,
      entry: { catalogueItemId: firstUuid },
    })
    expect(fixtureCalls).toBe(1)
  })

  it('allocates a lowercase UUID v4 once and replays without regeneration', () => {
    let calls = 0
    const allocated = allocateIdentity([], request(), () => {
      calls += 1
      return firstUuid
    })
    expect(allocated).toMatchObject({
      appended: true,
      entry: { qid: 'Q1', catalogueItemId: firstUuid },
    })
    const replayed = allocateIdentity(
      allocated.ledger,
      request('Q1', [allocationHistoryEvent(allocated.entry)]),
      () => {
        calls += 1
        return secondUuid
      },
    )
    expect(replayed).toMatchObject({
      appended: false,
      entry: { catalogueItemId: firstUuid },
    })
    expect(() =>
      allocateIdentity(allocated.ledger, request(), () => secondUuid),
    ).toThrow('same allocated mappings')
    expect(calls).toBe(1)
    expect(identityAllocationLedgerSha256(allocated.ledger)).toMatch(
      /^[a-f0-9]{64}$/,
    )
  })

  it('rejects a fixture projection substitution before its UUID generator runs', () => {
    const forged = request()
    const generator = vi.fn(() => firstUuid)
    expect(() =>
      allocateIdentity(
        [],
        {
          proposal: forged.proposal,
          approval: forged.approval,
          allocationHistory: [],
          expectedProjectionSha256: 'f'.repeat(64),
        },
        generator,
      ),
    ).toThrow('substituted')
    expect(generator).not.toHaveBeenCalled()
  })

  it('stops allocation outside exact parsed proposal approval or with invalid UUID output', () => {
    const q1 = request('Q1')
    const q2 = request('Q2')
    expect(() =>
      allocateIdentity([], { ...q1, proposal: q2.proposal }, () => firstUuid),
    ).toThrow('bound')
    expect(() =>
      allocateIdentity(
        [],
        request(),
        () => '00000000-0000-5000-8000-000000000001',
      ),
    ).toThrow('UUID v4')
    expect(() =>
      allocateIdentity([], request(), () =>
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase(),
      ),
    ).toThrow('lowercase UUID v4')
  })

  it('rejects replay rewrites, duplicate QIDs and reused UUIDs', () => {
    const allocated = allocateIdentity([], request(), () => firstUuid)
    const history = [allocationHistoryEvent(allocated.entry)]
    const rewritten = request('Q1', history)
    const rewrittenProjection = '9'.repeat(64)
    const rewrittenReview = {
      ...rewritten.primaryIdentityReviewResult,
      reducedProjectionSha256: rewrittenProjection,
      reviewInputSha256: discoverySha256({
        version: 'identity-review-input.v1',
        qid: 'Q1',
        proposalSha256: rewritten.proposal.proposalSha256,
        allocationRound: 1,
        candidateReceiptSha256: acceptedCandidateReceiptSha256,
        reducedProjectionSha256: rewrittenProjection,
      }),
    }
    expect(() =>
      allocateIdentity(
        allocated.ledger,
        {
          ...rewritten,
          approval: rewrittenReview,
        },
        () => secondUuid,
      ),
    ).toThrow('rewrite')
    const duplicateQid = [
      ...allocated.ledger,
      { ...allocated.entry, catalogueItemId: secondUuid },
    ]
    expect(() => validateIdentityAllocationLedger(duplicateQid)).toThrow('QID')
    const duplicateUuid = [
      ...allocated.ledger,
      { ...allocated.entry, qid: 'Q2' },
    ]
    expect(() => validateIdentityAllocationLedger(duplicateUuid)).toThrow(
      'UUID',
    )

    const retiredHistory = [
      allocationHistoryEvent(allocated.entry),
      terminalAllocationHistoryEvent(allocated.entry, {
        state: 'retired',
        finalSelectionSha256: hashes.final,
        reason: 'independent-review-rejected',
      }),
    ]
    expect(() =>
      allocateIdentity(
        allocated.ledger,
        request('Q1', retiredHistory),
        () => secondUuid,
      ),
    ).toThrow('cannot be reactivated')
  })

  it('strictly parses ignored allocation-ledger replay input', () => {
    const ledger = allocateIdentity([], request(), () => firstUuid).ledger
    expect(
      parseIdentityAllocationLedger(JSON.parse(JSON.stringify(ledger))),
    ).toEqual(ledger)
    expect(() =>
      parseIdentityAllocationLedger([
        { ...ledger[0]!, rawProjection: { forbidden: true } },
      ]),
    ).toThrow('unknown fields')
    expect(() =>
      parseIdentityAllocationLedger([
        {
          ...ledger[0]!,
          canonicalCandidateReceiptSha256: '1'.repeat(64),
        },
      ]),
    ).toThrow('fixed candidate receipt')
    const missingRound = Object.fromEntries(
      Object.entries(ledger[0]!).filter(([key]) => key !== 'allocationRound'),
    )
    expect(() => parseIdentityAllocationLedger([missingRound])).toThrow(
      'missing',
    )
    for (const [field, adversarial] of [
      ['qid', 1],
      ['catalogueItemId', { uuid: firstUuid }],
      ['canonicalCandidateReceiptSha256', ['1'.repeat(64)]],
      ['reducedProjectionSha256', { hash: '2'.repeat(64) }],
      ['proposedSelectionSha256', 3],
      ['allocationRound', '1'],
    ] as const) {
      expect(() =>
        parseIdentityAllocationLedger([
          { ...ledger[0]!, [field]: adversarial },
        ]),
      ).toThrow()
    }
  })

  it('keeps public proposal authority closed and parses review evidence without coercion', () => {
    const valid = request()
    expect(() =>
      parseFrozenIdentityProposalArtifact(
        JSON.parse(JSON.stringify(valid.proposal)),
        valid.proposalAuthority as never,
      ),
    ).toThrow()
    expect(
      parsePrimaryIdentityReviewResult(
        JSON.parse(JSON.stringify(valid.primaryIdentityReviewResult)),
        valid.proposal,
      ),
    ).toEqual(valid.primaryIdentityReviewResult)
    for (const adversarial of [123, ['Q1'], { value: 'Q1' }]) {
      expect(() =>
        parsePrimaryIdentityReviewResult(
          { ...valid.primaryIdentityReviewResult, qid: adversarial },
          valid.proposal,
        ),
      ).toThrow('QIDs')
      expect(() =>
        parseFrozenIdentityProposalArtifact(
          { ...valid.proposal, candidateReceiptSha256: adversarial },
          valid.proposalAuthority as never,
        ),
      ).toThrow()
    }
    expect(() =>
      parseIdentityAllocationLedger([
        {
          ...allocateIdentity([], valid, () => firstUuid).entry,
          catalogueItemId: ['00000000-0000-4000-8000-000000000001'],
        },
      ]),
    ).toThrow('UUID v4')
  })
})

describe('identity-allocation-history.v1', () => {
  function allocations(): readonly IdentityAllocationLedgerEntry[] {
    const firstResult = allocateIdentity([], request('Q10'), () => firstUuid)
    return allocateIdentity(
      firstResult.ledger,
      request('Q2', [allocationHistoryEvent(firstResult.entry)], 2),
      () => secondUuid,
    ).ledger
  }

  it('keeps each allocation append-only and terminally active or retired', () => {
    const [first, second] = allocations()
    let history = appendAllocationHistoryEvent(
      [],
      allocationHistoryEvent(first!),
    )
    history = appendAllocationHistoryEvent(
      history,
      terminalAllocationHistoryEvent(first!, {
        state: 'active',
        finalSelectionSha256: hashes.final,
      }),
    )
    history = appendAllocationHistoryEvent(
      history,
      allocationHistoryEvent(second!),
    )
    history = appendAllocationHistoryEvent(
      history,
      terminalAllocationHistoryEvent(second!, {
        state: 'retired',
        finalSelectionSha256: hashes.final,
        reason: 'independent-review-rejected',
      }),
    )
    validateIdentityAllocationHistory(history, { requireTerminalState: true })
    expect(allocationHistoryMappings(history)).toEqual({
      active: [{ qid: 'Q10', catalogueItemId: firstUuid }],
      retired: [{ qid: 'Q2', catalogueItemId: secondUuid }],
    })
    expect(identityAllocationHistorySha256(history)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects transition-before-allocation, reactivation, evidence drift and open histories', () => {
    const [first] = allocations()
    const allocated = allocationHistoryEvent(first!)
    const active = terminalAllocationHistoryEvent(first!, {
      state: 'active',
      finalSelectionSha256: hashes.final,
    })
    expect(() => validateIdentityAllocationHistory([active])).toThrow(
      'before allocation',
    )
    expect(() =>
      validateIdentityAllocationHistory([
        allocated,
        active,
        { ...active, event: 'retired', reason: 'independent-review-rejected' },
      ]),
    ).toThrow('terminal')
    expect(() =>
      validateIdentityAllocationHistory([
        allocated,
        { ...active, proposalSha256: '8'.repeat(64) },
      ]),
    ).toThrow('evidence')
    expect(() =>
      validateIdentityAllocationHistory([allocated], {
        requireTerminalState: true,
      }),
    ).toThrow('end active or retired')
  })

  it('strictly parses finalized tracked history and refuses unknown fields/reasons', () => {
    const [first] = allocations()
    const history = [
      allocationHistoryEvent(first!),
      terminalAllocationHistoryEvent(first!, {
        state: 'retired',
        finalSelectionSha256: hashes.final,
        reason: 'selection-recomputed-after-correction',
      }),
    ]
    expect(
      parseFinalizedIdentityAllocationHistory(
        JSON.parse(JSON.stringify(history)),
      ),
    ).toEqual(history)
    expect(() =>
      parseFinalizedIdentityAllocationHistory([
        { ...history[0]!, rawProviderResponse: {} },
        history[1],
      ]),
    ).toThrow('unknown fields')
    expect(() =>
      parseFinalizedIdentityAllocationHistory([
        history[0],
        { ...history[1]!, reason: 'reviewer-choice' },
      ]),
    ).toThrow('reason')
    for (const [field, adversarial] of [
      ['qid', ['Q10']],
      ['catalogueItemId', 10],
      ['proposalSha256', { hash: '3'.repeat(64) }],
      ['reviewRound', '1'],
      ['reducedProjectionSha256', ['2'.repeat(64)]],
    ] as const) {
      expect(() =>
        parseFinalizedIdentityAllocationHistory([
          { ...history[0]!, [field]: adversarial },
          history[1],
        ]),
      ).toThrow()
    }
  })

  it('proves finalized ledger/history active and retired representation correspondence', () => {
    const [activeAllocation, retiredAllocation] = allocations()
    const representation = [
      {
        qid: 'Q10',
        catalogueItemId: firstUuid,
        state: 'published' as const,
        intent: 'create' as const,
      },
      {
        qid: 'Q99',
        catalogueItemId: '00000000-0000-4000-8000-000000000099',
        state: 'published' as const,
        intent: 'link-existing' as const,
      },
    ]
    const finalSelectionSha256 = finalIdentitySelectionSha256(representation)
    const history = [
      allocationHistoryEvent(activeAllocation!),
      terminalAllocationHistoryEvent(activeAllocation!, {
        state: 'active',
        finalSelectionSha256,
      }),
      allocationHistoryEvent(retiredAllocation!),
      terminalAllocationHistoryEvent(retiredAllocation!, {
        state: 'retired',
        finalSelectionSha256,
        reason: 'selection-recomputed-after-correction',
      }),
    ]
    expect(() =>
      validateFinalIdentityAllocationCorrespondence({
        ledger: [activeAllocation!, retiredAllocation!],
        history,
        finalRepresentation: representation,
        retainedPredecessorQids: [],
      }),
    ).not.toThrow()
    expect(() =>
      validateFinalIdentityAllocationCorrespondence({
        ledger: [activeAllocation!, retiredAllocation!],
        history,
        finalRepresentation: representation.slice(1),
        retainedPredecessorQids: [],
      }),
    ).toThrow()
    expect(() =>
      validateFinalIdentityAllocationCorrespondence({
        ledger: [activeAllocation!, retiredAllocation!],
        history,
        finalRepresentation: representation,
        retainedPredecessorQids: ['Q10'],
      }),
    ).toThrow('retained predecessor')
    expect(() =>
      validateFinalIdentityAllocationCorrespondence({
        ledger: [activeAllocation!, retiredAllocation!],
        history,
        finalRepresentation: representation,
        retainedPredecessorQids: [retiredAllocation!.qid],
      }),
    ).toThrow('retained predecessor')
    expect(() =>
      validateIdentityAllocationHistory(
        [
          ...history.slice(0, 3),
          {
            ...(history[3]! as Extract<
              IdentityAllocationHistoryEvent,
              { event: 'retired' }
            >),
            finalSelectionSha256: '9'.repeat(64),
          },
        ],
        { requireTerminalState: true },
      ),
    ).toThrow('one final selection hash')
  })

  it('keeps caller-supplied retained identity sets unavailable to live tooling', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() =>
        validateFinalIdentityAllocationCorrespondence({
          ledger: [],
          history: [],
          finalRepresentation: [],
          retainedPredecessorQids: [],
        }),
      ).toThrow('unavailable to live tooling')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
