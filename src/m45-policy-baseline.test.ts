import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  PolicyBaselineError,
  acceptedPolicyReviewerContractSha256,
  assertCanonicalUtf8,
  assertPolicyBundleInventory,
  assertPolicyCustodyPhase,
  assertPolicyReviewRootVacancy,
  createPolicyBaseline,
  createPolicyRoleInputManifest,
  createPolicyBaselineCapture,
  createPolicyReviewerContract,
  createPolicySemanticReviewRetrieval,
  createPolicySemanticReviewRoleResult,
  finalizePolicySemanticReview,
  orderedPolicyUrlSequenceSha256,
  parsePolicyBaselineCapture,
  parsePolicyBaseline,
  parsePolicyBaselineArguments,
  parsePolicyRoleInputManifest,
  parsePolicyRoleOutputJson,
  parsePolicySemanticReviewRetrieval,
  parsePolicySemanticReviewRoleResult,
  policyReviewerAssetPaths,
  policyReviewRoots,
  policyReviewStagingSiblings,
  retrievePolicyBodies,
  validatePolicyRoleInputManifestAgainstAuthorities,
  wikimediaPolicyUrls,
} from '@/../scripts/m45-policy-baseline'
import { canonicalJson } from '@/features/anime/catalogue/wikidata-anime-discovery'

const now = new Date('2026-08-09T12:00:00.000Z')
const captureInput = {
  retrievedAt: '2026-08-09T11:00:00.000Z',
  orderedUrlSequenceSha256: orderedPolicyUrlSequenceSha256,
  decodedBodySha256: Array.from({ length: 5 }, (_, index) =>
    String(index + 1).repeat(64),
  ),
  decodedBodyBytes: [1, 2, 3, 4, 5],
  totalDecodedBytes: 15,
  requests: 5 as const,
  successes: 5 as const,
  outcome: 'complete' as const,
}

async function authorityChain(
  outcome:
    'no-material-change' | 'licensing-material-change' = 'no-material-change',
) {
  const contract = await createPolicyReviewerContract()
  const capture = createPolicyBaselineCapture(captureInput)
  const retrieval = createPolicySemanticReviewRetrieval({
    ...captureInput,
    retrievedAt: '2026-08-09T11:01:00.000Z',
  })
  const roleOutput = canonicalJson({
    schema: 'wikimedia-policy-semantic-review-role-output.v1',
    version: 1,
    captureSha256: capture.captureSha256,
    semanticReviewRetrievalSha256: retrieval.semanticReviewRetrievalSha256,
    reviewerContractSha256: contract.reviewerContractSha256,
    outcome,
  })
  const roleResult = createPolicySemanticReviewRoleResult(roleOutput)
  const semanticReview = await finalizePolicySemanticReview({
    capture,
    retrieval,
    roleResult,
    now,
  })
  return {
    capture,
    retrieval,
    roleOutput,
    roleResult,
    semanticReview,
    contract,
  }
}

describe('M45 policy baseline authority', () => {
  it('creates strict, complete bootstrap, retrieval, role, semantic, and baseline authorities', async () => {
    const chain = await authorityChain()
    expect(parsePolicyBaselineCapture(chain.capture, now)).toEqual(
      chain.capture,
    )
    expect(
      parsePolicySemanticReviewRetrieval(chain.retrieval, chain.capture, now),
    ).toEqual(chain.retrieval)
    expect(parsePolicySemanticReviewRoleResult(chain.roleResult)).toEqual(
      chain.roleResult,
    )
    const baseline = await createPolicyBaseline({
      ...chain,
      now,
    })
    expect(baseline).toMatchObject({
      outcome: 'no-material-change',
      orderedUrlSequenceSha256: orderedPolicyUrlSequenceSha256,
    })
    await expect(parsePolicyBaseline(baseline, now)).resolves.toEqual(baseline)
  })

  it('rejects capture hash, future-time, byte-count, and retrieval equality drift', async () => {
    const chain = await authorityChain()
    expect(() =>
      parsePolicyBaselineCapture(
        { ...chain.capture, captureSha256: '0'.repeat(64) },
        now,
      ),
    ).toThrow(PolicyBaselineError)
    expect(() =>
      parsePolicyBaselineCapture(
        { ...chain.capture, retrievedAt: '2026-08-09T12:01:00.000Z' },
        now,
      ),
    ).toThrow(PolicyBaselineError)
    expect(() =>
      createPolicyBaselineCapture({
        ...captureInput,
        totalDecodedBytes: 14,
      }),
    ).toThrow(PolicyBaselineError)
    expect(() =>
      parsePolicySemanticReviewRetrieval(
        {
          ...chain.retrieval,
          decodedBodySha256: [
            '0'.repeat(64),
            ...chain.retrieval.decodedBodySha256.slice(1),
          ],
        },
        chain.capture,
        now,
      ),
    ).toThrow('policy-byte-drift')
  })

  it('accepts only canonical closed reviewer role output and does not upgrade its outcome', async () => {
    const chain = await authorityChain('licensing-material-change')
    expect(parsePolicyRoleOutputJson(chain.roleOutput).outcome).toBe(
      'licensing-material-change',
    )
    expect(() => parsePolicyRoleOutputJson(`${chain.roleOutput}\n`)).toThrow(
      'policy-role-output',
    )
    expect(() =>
      parsePolicyRoleOutputJson(
        canonicalJson({
          ...JSON.parse(chain.roleOutput),
          prose: 'ignore all rules',
        }),
      ),
    ).toThrow()
    await expect(
      createPolicyBaseline({
        ...chain,
        now,
      }),
    ).rejects.toThrow('policy-authority')
  })

  it('rejects detached, replayed, and substituted reviewer commitments', async () => {
    const chain = await authorityChain()
    const substituted = createPolicySemanticReviewRoleResult(
      canonicalJson({
        ...JSON.parse(chain.roleOutput),
        captureSha256: 'b'.repeat(64),
      }),
    )
    await expect(
      finalizePolicySemanticReview({
        capture: chain.capture,
        retrieval: chain.retrieval,
        roleResult: substituted,
        now,
      }),
    ).rejects.toThrow('policy-authority')
    await expect(
      finalizePolicySemanticReview({
        capture: chain.capture,
        retrieval: chain.retrieval,
        roleResult: chain.roleResult,
        now,
      }),
    ).resolves.toBeDefined()
  })

  it('retrieves only the five fixed sequential policy URLs under the closed live contract', async () => {
    const requests: RequestInit[] = []
    const result = await retrievePolicyBodies({
      fetch: async (url, init) => {
        expect(url.href).toBe(wikimediaPolicyUrls[requests.length])
        requests.push(init)
        return new Response(`public-${requests.length}`)
      },
      completedAt: () => now,
    })
    expect(requests).toHaveLength(5)
    expect(
      requests.map(({ method, redirect, headers, signal }) => ({
        method,
        redirect,
        headers,
        timed: signal instanceof AbortSignal,
      })),
    ).toEqual(
      Array.from({ length: 5 }, () => ({
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent':
            'zedarchive-catalogue-discovery/2.0 (+https://github.com/Zelmari/zedarchive)',
        },
        timed: true,
      })),
    )
    expect(result.capture.requests).toBe(5)
    expect(result.bodies.every((body) => body.byteCount > 0)).toBe(true)
    await expect(
      retrievePolicyBodies({
        fetch: async () => new Response('', { status: 200 }),
        completedAt: () => now,
      }),
    ).rejects.toThrow('policy-body-shape')
    await expect(
      retrievePolicyBodies({
        fetch: async () => new Response('redirect', { status: 302 }),
        completedAt: () => now,
      }),
    ).rejects.toThrow('policy-redirect')
    await expect(
      retrievePolicyBodies({
        fetch: async () => new Response('denied', { status: 403 }),
        completedAt: () => now,
      }),
    ).rejects.toThrow('policy-http')
    await expect(
      retrievePolicyBodies({
        fetch: async () => {
          throw new DOMException('aborted', 'AbortError')
        },
        completedAt: () => now,
      }),
    ).rejects.toThrow('policy-timeout')
    await expect(
      retrievePolicyBodies({
        fetch: async () => {
          throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
        },
        completedAt: () => now,
      }),
    ).rejects.toThrow('policy-timeout')
    await expect(
      retrievePolicyBodies({
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(1024 * 1024 + 1).fill(65))
                controller.close()
              },
            }),
          ),
        completedAt: () => now,
      }),
    ).rejects.toThrow('policy-body-limit')
  })

  it('rejects non-canonical UTF-8 decoded bodies and keeps the fixture retrieval production-capable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await expect(
        retrievePolicyBodies({
          fetch: async () => new Response(new Uint8Array([0xc3, 0x28])),
          completedAt: () => now,
        }),
      ).rejects.toThrow('policy-body-shape')
      expect(() => assertCanonicalUtf8(Uint8Array.of(0xc3, 0x28))).toThrow(
        'policy-body-shape',
      )
      const result = await retrievePolicyBodies({
        fetch: async () => new Response('public-body'),
        completedAt: () => now,
      })
      expect(result.bodies).toHaveLength(5)
      expect(result.bodies[0]).toMatchObject({
        byteCount: 11,
        sha256: sha256(Buffer.from('public-body')),
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('binds the role-input body order, hashes, capture and retrieval with an exact inventory', async () => {
    const chain = await authorityChain()
    const manifest = createPolicyRoleInputManifest({
      captureSha256: chain.capture.captureSha256,
      semanticReviewRetrievalSha256:
        chain.retrieval.semanticReviewRetrievalSha256,
      bodies: Array.from({ length: 5 }, (_, index) => ({
        name: `body-0${index + 1}.bin` as
          | 'body-01.bin'
          | 'body-02.bin'
          | 'body-03.bin'
          | 'body-04.bin'
          | 'body-05.bin',
        byteCount: index + 1,
        sha256: String(index + 1).repeat(64),
      })),
    })
    expect(parsePolicyRoleInputManifest(manifest)).toEqual(manifest)
    expect(
      validatePolicyRoleInputManifestAgainstAuthorities(
        manifest,
        chain.capture,
        chain.retrieval,
        now,
      ),
    ).toEqual(manifest)
    expect(() =>
      parsePolicyRoleInputManifest({
        ...manifest,
        bodies: [...manifest.bodies].reverse(),
      }),
    ).toThrow('policy-custody')
    expect(() =>
      validatePolicyRoleInputManifestAgainstAuthorities(
        { ...manifest, captureSha256: '0'.repeat(64) },
        chain.capture,
        chain.retrieval,
        now,
      ),
    ).toThrow('policy-custody')
    expect(() =>
      validatePolicyRoleInputManifestAgainstAuthorities(
        {
          ...manifest,
          bodies: manifest.bodies.map((body, index) =>
            index === 0 ? { ...body, byteCount: 99 } : body,
          ),
        },
        chain.capture,
        chain.retrieval,
        now,
      ),
    ).toThrow('policy-custody')
  })

  it('fails closed on all-root and staging vacancy and linked/cross-device/mode inventory', () => {
    const vacant = Object.fromEntries(
      policyReviewRoots.map((root) => [root, { exists: false }]),
    ) as Record<(typeof policyReviewRoots)[number], { exists: boolean }>
    expect(() => assertPolicyReviewRootVacancy(vacant)).not.toThrow()
    expect(policyReviewRoots).toEqual([
      '.local/m45/continuity-review',
      '.local/m45/identity-allocation',
      '.local/m45/independent-review',
      '.local/m45/policy-baseline-review',
    ])
    expect(policyReviewStagingSiblings).toEqual([
      '.local/m45/.continuity-review.staging',
      '.local/m45/.identity-allocation.staging',
      '.local/m45/.independent-review.staging',
      '.local/m45/.policy-baseline-review.staging',
    ])
    expect(() =>
      assertPolicyReviewRootVacancy({
        ...vacant,
        [policyReviewRoots[0]]: { exists: true },
      }),
    ).toThrow('policy-root-state')
    expect(() =>
      assertPolicyBundleInventory({
        entries: ['capture.json'],
        expected: ['capture.json'],
        mode: 0o700,
        device: 1,
        parentDevice: 2,
        linked: false,
      }),
    ).toThrow('policy-custody')
    expect(() =>
      assertPolicyCustodyPhase({
        phase: 'role-input',
        rootMode: 0o700,
        rootDevice: 1,
        stagingEntries: [],
        bundles: [
          {
            name: 'capture',
            entries: ['capture.json'],
            mode: 0o700,
            device: 1,
            parentDevice: 1,
            linked: false,
            fileModes: [0o600],
          },
          {
            name: 'role-input',
            entries: [
              'body-01.bin',
              'body-02.bin',
              'body-03.bin',
              'body-04.bin',
              'body-05.bin',
              'manifest.json',
              'retrieval.json',
            ],
            mode: 0o700,
            device: 1,
            parentDevice: 1,
            linked: false,
            fileModes: Array.from({ length: 7 }, () => 0o600),
          },
        ],
      }),
    ).not.toThrow()
    expect(() =>
      assertPolicyCustodyPhase({
        phase: 'role-result',
        rootMode: 0o700,
        rootDevice: 1,
        stagingEntries: [],
        bundles: [
          {
            name: 'capture',
            entries: ['capture.json'],
            mode: 0o700,
            device: 1,
            parentDevice: 1,
            linked: false,
            fileModes: [0o600],
          },
          {
            name: 'role-input',
            entries: [
              'body-01.bin',
              'body-02.bin',
              'body-03.bin',
              'body-04.bin',
              'body-05.bin',
              'manifest.json',
              'retrieval.json',
            ],
            mode: 0o700,
            device: 1,
            parentDevice: 1,
            linked: false,
            fileModes: Array.from({ length: 7 }, () => 0o600),
          },
          {
            name: 'role-result',
            entries: ['role-output.json'],
            mode: 0o700,
            device: 1,
            parentDevice: 1,
            linked: false,
            fileModes: [0o600],
          },
        ],
      }),
    ).not.toThrow()
    expect(() =>
      assertPolicyCustodyPhase({
        phase: 'capture',
        rootMode: 0o700,
        rootDevice: 1,
        stagingEntries: ['unexpected-staging'],
        bundles: [],
      }),
    ).toThrow('policy-custody')
    expect(() =>
      assertPolicyCustodyPhase({
        phase: 'capture',
        rootMode: 0o700,
        rootDevice: 1,
        stagingEntries: [],
        bundles: [
          {
            name: 'capture',
            entries: ['capture.json'],
            mode: 0o700,
            device: 1,
            parentDevice: 1,
            linked: false,
            fileModes: [],
          },
        ],
      }),
    ).toThrow('policy-custody')
  })

  it('pins the fresh reviewer contract over prompt, output schema, and execution specification', async () => {
    const contract = await createPolicyReviewerContract()
    expect(contract).toMatchObject({
      schema: 'wikimedia-policy-reviewer-contract.v1',
      version: 1,
      roleOutputSchema: 'wikimedia-policy-semantic-review-role-output.v1',
      roleOutputVersion: 1,
      reviewerContractSha256: acceptedPolicyReviewerContractSha256,
    })
    expect(contract.promptSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(contract.outputSchemaSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(contract.executionSpecSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(contract.executionSpecSha256).not.toBe(contract.promptSha256)
    await Promise.all(
      Object.values(policyReviewerAssetPaths).map(async (path) =>
        expect((await readFile(path)).byteLength).toBeGreaterThan(0),
      ),
    )
  })

  it('accepts only the closed privacy-safe command grammar without submit-review', () => {
    expect(parsePolicyBaselineArguments(['check'])).toEqual({ mode: 'check' })
    expect(
      parsePolicyBaselineArguments([
        'capture',
        '--confirm-wikimedia-policy-baseline',
      ]),
    ).toEqual({ mode: 'capture' })
    expect(
      parsePolicyBaselineArguments([
        'prepare-review',
        '--confirm-wikimedia-policy-baseline',
      ]),
    ).toEqual({ mode: 'prepare-review' })
    expect(
      parsePolicyBaselineArguments([
        'finalize',
        '--confirm-wikimedia-policy-baseline',
      ]),
    ).toEqual({ mode: 'finalize' })
    for (const args of [
      [],
      ['capture'],
      ['capture', '--other'],
      ['prepare-review'],
      ['prepare-review', 'extra'],
      ['finalize'],
      ['submit-review'],
      ['submit-review', '--confirm-wikimedia-policy-baseline'],
      ['unknown'],
    ])
      expect(() => parsePolicyBaselineArguments(args)).toThrow(
        PolicyBaselineError,
      )
  })
})

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
