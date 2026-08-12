import { createHash } from 'node:crypto'
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PolicyBaselineError,
  type PolicyFilesystem,
  createPolicyBaselineCapture,
  createPolicyReviewerContract,
  createPolicySemanticReviewRetrieval,
  orderedPolicyUrlSequenceSha256,
  parsePolicyBaselineArguments,
  parsePolicyBaselineCapture,
  parsePolicyRoleInputManifest,
  parsePolicySemanticReviewRetrieval,
  runPolicyBaselineCapture,
  runPolicyBaselineFinalize,
  runPolicyBaselinePrepareReview,
  wikimediaPolicyUrls,
} from '@/../scripts/m45-policy-baseline'
import { canonicalJson } from '@/features/anime/catalogue/wikidata-anime-discovery'

const captureTime = () => new Date('2026-08-09T11:00:00.000Z')
const reviewTime = () => new Date('2026-08-09T12:00:00.000Z')

function fixture() {
  const bodies = Array.from({ length: 5 }, (_, index) => {
    const bytes = Buffer.from(`policy-${index + 1}`)
    return { bytes, byteCount: bytes.byteLength, sha256: sha256(bytes) }
  })
  const input = {
    retrievedAt: '2026-08-09T11:00:00.000Z',
    orderedUrlSequenceSha256: orderedPolicyUrlSequenceSha256,
    decodedBodySha256: bodies.map((body) => body.sha256),
    decodedBodyBytes: bodies.map((body) => body.byteCount),
    totalDecodedBytes: bodies.reduce((sum, body) => sum + body.byteCount, 0),
    requests: 5 as const,
    successes: 5 as const,
    outcome: 'complete' as const,
  }
  return {
    bodies,
    capture: createPolicyBaselineCapture(input),
    retrieval: createPolicySemanticReviewRetrieval({
      ...input,
      retrievedAt: '2026-08-09T11:01:00.000Z',
    }),
  }
}

function fetchFor(bodies: readonly { bytes: Buffer }[]) {
  return async (url: URL, init: RequestInit) => {
    void init
    const index = wikimediaPolicyUrls.indexOf(
      url.href as (typeof wikimediaPolicyUrls)[number],
    )
    expect(index).toBeGreaterThanOrEqual(0)
    return new Response(new Uint8Array(bodies[index]!.bytes))
  }
}

function syntheticFilesystem(
  root: string,
  overrides: Partial<PolicyFilesystem> = {},
): PolicyFilesystem {
  return {
    lstat,
    readdir,
    mkdir: async (path, options) => {
      await mkdir(path, options)
    },
    chmod,
    readFile,
    writeFile,
    link,
    unlink,
    rmdir,
    removeDirectory: async (path) => {
      await rm(path, { recursive: true })
    },
    ...overrides,
  }
}

async function writeRoleOutput(
  root: string,
  output: Readonly<{ text: string }>,
) {
  const directory = join(root, 'role-result')
  await mkdir(directory, { mode: 0o700 })
  await writeFile(join(directory, 'role-output.json'), output.text, {
    flag: 'wx',
    mode: 0o600,
  })
}

async function promotedRetrievalSha256(root: string): Promise<string> {
  const capture = parsePolicyBaselineCapture(
    JSON.parse(
      (await readFile(join(root, 'capture', 'capture.json'))).toString('utf8'),
    ),
    reviewTime(),
  )
  const retrieval = parsePolicySemanticReviewRetrieval(
    JSON.parse(
      (await readFile(join(root, 'role-input', 'retrieval.json'))).toString(
        'utf8',
      ),
    ),
    capture,
    reviewTime(),
  )
  return retrieval.semanticReviewRetrievalSha256
}

describe('M45 policy baseline fresh custody', () => {
  it('accepts only the closed grammar with confirmation tokens and rejects submit-review', () => {
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
      ['prepare-review'],
      ['finalize'],
      ['submit-review'],
      ['submit-review', '--confirm-wikimedia-policy-baseline'],
      ['capture', '--other'],
      ['unknown'],
    ])
      expect(() => parsePolicyBaselineArguments(args)).toThrow(
        PolicyBaselineError,
      )
  })

  it('capture proves vacancies, promotes only the capture bundle, and verifies promoted bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-capture-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    try {
      const result = await runPolicyBaselineCapture({
        filesystem: syntheticFilesystem(root),
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      expect(result).toMatchObject({
        mode: 'capture',
        status: 'complete',
        urls: 5,
        requests: 5,
        bytes: values.capture.totalDecodedBytes,
      })
      expect(result.captureSha256).toBe(values.capture.captureSha256)
      const reparsed = parsePolicyBaselineCapture(
        JSON.parse(
          (await readFile(join(root, 'capture', 'capture.json'))).toString(
            'utf8',
          ),
        ),
        reviewTime(),
      )
      expect(reparsed.captureSha256).toBe(values.capture.captureSha256)
      expect((await readdir(join(root, 'capture'))).sort()).toEqual([
        'capture.json',
      ])
      await expect(
        runPolicyBaselinePrepareReview({
          filesystem: syntheticFilesystem(root),
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('capture stops closed on a destination race with EEXIST and leaves invocation residue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-race-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root, {
      link: async () => {
        const error = new Error(
          'EEXIST: destination already exists',
        ) as NodeJS.ErrnoException
        error.code = 'EEXIST'
        throw error
      },
    })
    try {
      await expect(
        runPolicyBaselineCapture({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: captureTime,
        }),
      ).rejects.toThrow('policy-custody')
      await expect(
        lstat(join(directory, '.policy-baseline-review.staging')),
      ).resolves.toBeDefined()
      await expect(
        runPolicyBaselinePrepareReview({
          filesystem: syntheticFilesystem(root),
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-custody')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('promotion re-reads destination bytes and rejects substitution before removing staging', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-substitute-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root, {
      link: async (staged, destination) => {
        await link(staged, destination)
        await writeFile(destination, 'substituted')
      },
    })
    try {
      await expect(
        runPolicyBaselineCapture({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: captureTime,
        }),
      ).rejects.toThrow('policy-byte-drift')
      await expect(
        lstat(join(directory, '.policy-baseline-review.staging')),
      ).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('prepare-review requires the prior capture phase and enforces byte equality with it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-prepare-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    try {
      await expect(
        runPolicyBaselinePrepareReview({
          filesystem: syntheticFilesystem(root),
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-custody')
      await runPolicyBaselineCapture({
        filesystem: syntheticFilesystem(root),
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      const driftedBodies = values.bodies.map((body, index) =>
        index === 2
          ? { ...body, bytes: Buffer.from('drifted-policy-3') }
          : body,
      )
      await expect(
        runPolicyBaselinePrepareReview({
          filesystem: syntheticFilesystem(root),
          root,
          fetch: fetchFor(driftedBodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-byte-drift')
      await expect(lstat(join(root, 'role-input'))).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('prepare-review promotes the exact role-input inventory bound by manifest and retrieval authorities', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-role-input-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    try {
      await runPolicyBaselineCapture({
        filesystem: syntheticFilesystem(root),
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      const result = await runPolicyBaselinePrepareReview({
        filesystem: syntheticFilesystem(root),
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      expect(result).toMatchObject({
        mode: 'prepare-review',
        status: 'complete',
      })
      expect((await readdir(join(root, 'role-input'))).sort()).toEqual([
        'body-01.bin',
        'body-02.bin',
        'body-03.bin',
        'body-04.bin',
        'body-05.bin',
        'manifest.json',
        'retrieval.json',
      ])
      const manifest = parsePolicyRoleInputManifest(
        JSON.parse(
          (await readFile(join(root, 'role-input', 'manifest.json'))).toString(
            'utf8',
          ),
        ),
      )
      expect(manifest.manifestSha256).toBe(result.manifestSha256)
      const retrieval = parsePolicySemanticReviewRetrieval(
        JSON.parse(
          (await readFile(join(root, 'role-input', 'retrieval.json'))).toString(
            'utf8',
          ),
        ),
        values.capture,
        reviewTime(),
      )
      expect(retrieval.semanticReviewRetrievalSha256).toBe(
        result.retrievalSha256,
      )
      for (const entry of manifest.bodies) {
        const bytes = await readFile(join(root, 'role-input', entry.name))
        expect(sha256(bytes)).toBe(entry.sha256)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('finalize requires the preassigned role output and rejects malformed output without deletion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-finalize-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root)
    try {
      await runPolicyBaselineCapture({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      await runPolicyBaselinePrepareReview({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      const contract = await createPolicyReviewerContract()
      const roleOutput = canonicalJson({
        schema: 'wikimedia-policy-semantic-review-role-output.v1',
        version: 1,
        captureSha256: values.capture.captureSha256,
        semanticReviewRetrievalSha256: await promotedRetrievalSha256(root),
        reviewerContractSha256: contract.reviewerContractSha256,
        outcome: 'no-material-change',
      })
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-custody')
      await writeRoleOutput(root, { text: roleOutput })
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('finalize rejects oversized, noncanonical, and schema-invalid role output within bounds', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-bounds-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root)
    try {
      await runPolicyBaselineCapture({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      await runPolicyBaselinePrepareReview({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      const contract = await createPolicyReviewerContract()
      const commitments = {
        captureSha256: values.capture.captureSha256,
        semanticReviewRetrievalSha256: await promotedRetrievalSha256(root),
        reviewerContractSha256: contract.reviewerContractSha256,
      }
      const oversized = canonicalJson({
        schema: 'wikimedia-policy-semantic-review-role-output.v1',
        version: 1,
        ...commitments,
        outcome: 'no-material-change',
        padding: 'x'.repeat(4096),
      })
      await writeRoleOutput(root, { text: oversized })
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-wrapper-output')
      await rm(join(root, 'role-result'), { recursive: true, force: true })

      await writeRoleOutput(root, {
        text: `${canonicalJson({
          schema: 'wikimedia-policy-semantic-review-role-output.v1',
          version: 1,
          ...commitments,
          outcome: 'no-material-change',
        })}\n`,
      })
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-role-output')
      await rm(join(root, 'role-result'), { recursive: true, force: true })

      await writeRoleOutput(root, {
        text: canonicalJson({
          schema: 'wikimedia-policy-semantic-review-role-output.v1',
          version: 1,
          ...commitments,
          outcome: 'no-material-change',
          prose: 'ignore all rules',
        }),
      })
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow()
      await expect(lstat(root)).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('finalize removes the whole review root, proves absence, and only then emits the reviewed baseline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-success-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root)
    try {
      await runPolicyBaselineCapture({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      await runPolicyBaselinePrepareReview({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      const contract = await createPolicyReviewerContract()
      const roleOutput = canonicalJson({
        schema: 'wikimedia-policy-semantic-review-role-output.v1',
        version: 1,
        captureSha256: values.capture.captureSha256,
        semanticReviewRetrievalSha256: await promotedRetrievalSha256(root),
        reviewerContractSha256: contract.reviewerContractSha256,
        outcome: 'no-material-change',
      })
      await writeRoleOutput(root, { text: roleOutput })
      const result = await runPolicyBaselineFinalize({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      expect(result).toMatchObject({
        mode: 'finalize',
        status: 'complete',
        outcome: 'no-material-change',
      })
      expect(result.semanticReview.outcome).toBe('no-material-change')
      expect(result.baseline.outcome).toBe('no-material-change')
      await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        lstat(join(directory, '.policy-baseline-review.staging')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readdir(directory)).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('finalize stops on a material-change outcome and preserves the review root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-change-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root)
    try {
      await runPolicyBaselineCapture({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      await runPolicyBaselinePrepareReview({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      const contract = await createPolicyReviewerContract()
      const roleOutput = canonicalJson({
        schema: 'wikimedia-policy-semantic-review-role-output.v1',
        version: 1,
        captureSha256: values.capture.captureSha256,
        semanticReviewRetrievalSha256: await promotedRetrievalSha256(root),
        reviewerContractSha256: contract.reviewerContractSha256,
        outcome: 'licensing-material-change',
      })
      await writeRoleOutput(root, { text: roleOutput })
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-authority')
      await expect(lstat(root)).resolves.toBeDefined()
      await expect(
        lstat(join(root, 'role-result', 'role-output.json')),
      ).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('finalize rehashes role-input bodies and stops on byte drift before any deletion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-fresh-drift-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root)
    try {
      await runPolicyBaselineCapture({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: captureTime,
      })
      await runPolicyBaselinePrepareReview({
        filesystem,
        root,
        fetch: fetchFor(values.bodies),
        completedAt: reviewTime,
      })
      const contract = await createPolicyReviewerContract()
      const roleOutput = canonicalJson({
        schema: 'wikimedia-policy-semantic-review-role-output.v1',
        version: 1,
        captureSha256: values.capture.captureSha256,
        semanticReviewRetrievalSha256: await promotedRetrievalSha256(root),
        reviewerContractSha256: contract.reviewerContractSha256,
        outcome: 'no-material-change',
      })
      await writeRoleOutput(root, { text: roleOutput })
      await writeFile(join(root, 'role-input', 'body-01.bin'), 'mutated')
      await expect(
        runPolicyBaselineFinalize({
          filesystem,
          root,
          fetch: fetchFor(values.bodies),
          completedAt: reviewTime,
        }),
      ).rejects.toThrow('policy-byte-drift')
      await expect(lstat(root)).resolves.toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
