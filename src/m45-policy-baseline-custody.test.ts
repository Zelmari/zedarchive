import { createHash } from 'node:crypto'
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PolicyBaselineError,
  type PolicyFilesystem,
  assertPolicyCustodyForFixture,
  createPolicyBaselineCapture,
  createPolicyReviewerLaunch,
  createPolicySemanticReviewRoleResult,
  createPolicySemanticReviewRetrieval,
  orderedPolicyUrlSequenceSha256,
  parsePolicyBaselineArguments,
  runPolicyReviewerForFixture,
  writePolicyCaptureForFixture,
  writePolicyRoleInputForFixture,
} from '@/../scripts/m45-policy-baseline'
import { canonicalJson } from '@/features/anime/catalogue/wikidata-anime-discovery'

const timestamp = '2026-08-08T11:00:00.000Z'
function syntheticFilesystem(
  promoteExclusive: PolicyFilesystem['promoteExclusive'] = async (
    source,
    destination,
  ) => {
    try {
      await lstat(destination)
      throw new Error('destination already exists')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await rename(source, destination)
  },
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
    promoteExclusive,
    rm,
  }
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
function fixture() {
  const bodies = Array.from({ length: 5 }, (_, index) => {
    const bytes = Buffer.from(`policy-${index + 1}`)
    return { bytes, byteCount: bytes.byteLength, sha256: sha256(bytes) }
  })
  const input = {
    retrievedAt: timestamp,
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
      retrievedAt: '2026-08-08T11:01:00.000Z',
    }),
  }
}

describe('M45 policy baseline filesystem custody', () => {
  it('promotes capture then role-input through exact secure inventories', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-custody-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem()
    try {
      await writePolicyCaptureForFixture(root, values.capture, filesystem)
      await assertPolicyCustodyForFixture(root, 'capture', filesystem)
      await writePolicyRoleInputForFixture(root, values, filesystem)
      await assertPolicyCustodyForFixture(root, 'role-input', filesystem)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects unexpected files and stale staging rather than resuming or overwriting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-residue-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem()
    try {
      await writePolicyCaptureForFixture(root, values.capture, filesystem)
      await writeFile(join(root, 'unexpected.json'), '{}', { flag: 'wx' })
      await expect(
        assertPolicyCustodyForFixture(root, 'capture', filesystem),
      ).rejects.toThrow('policy-custody')
      await rm(join(root, 'unexpected.json'))
      await mkdir(join(directory, '.policy-baseline-review.staging'), {
        mode: 0o700,
      })
      await expect(
        writePolicyRoleInputForFixture(root, values, filesystem),
      ).rejects.toThrow('policy-custody')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects symlinked, hard-linked, or mode-drifted custody entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-adversarial-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem()
    try {
      await mkdir(root, { mode: 0o700 })
      await chmod(root, 0o700)
      await symlink(directory, join(root, 'capture'))
      await expect(
        assertPolicyCustodyForFixture(root, 'capture'),
      ).rejects.toThrow('policy-custody')
      await rm(join(root, 'capture'))
      await rm(root, { recursive: true, force: true })
      await writePolicyCaptureForFixture(root, values.capture, filesystem)
      const capture = join(root, 'capture', 'capture.json')
      await link(capture, join(root, 'capture', 'capture-copy.json'))
      await expect(
        assertPolicyCustodyForFixture(root, 'capture', filesystem),
      ).rejects.toThrow('policy-custody')
      await rm(join(root, 'capture', 'capture-copy.json'))

      await chmod(capture, 0o644)
      await expect(
        assertPolicyCustodyForFixture(root, 'capture', filesystem),
      ).rejects.toThrow('policy-custody')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requires the exact prior phase, vacancies, and rehashed body authority', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-prior-'))
    const root = join(directory, 'policy-baseline-review')
    const blocked = join(directory, 'continuity-review')
    const values = fixture()
    const filesystem = syntheticFilesystem()
    try {
      await mkdir(blocked, { mode: 0o700 })
      await expect(
        writePolicyCaptureForFixture(root, values.capture, filesystem, [
          blocked,
        ]),
      ).rejects.toThrow('policy-custody')
      await rm(blocked, { recursive: true, force: true })
      await writePolicyCaptureForFixture(root, values.capture, filesystem, [
        blocked,
      ])

      const mismatchedBodies = values.bodies.map((body, index) =>
        index === 0 ? { ...body, sha256: '0'.repeat(64) } : body,
      )
      await expect(
        writePolicyRoleInputForFixture(
          root,
          { ...values, bodies: mismatchedBodies },
          filesystem,
          [blocked],
        ),
      ).rejects.toThrow('policy-byte-drift')
      await assertPolicyCustodyForFixture(root, 'capture', filesystem)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('stops on an injected destination race without replacing either bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-race-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(async (_source, destination) => {
      await mkdir(destination, { mode: 0o700 })
      throw new Error('synthetic destination race')
    })
    try {
      await expect(
        writePolicyCaptureForFixture(root, values.capture, filesystem),
      ).rejects.toThrow('synthetic destination race')
      await expect(
        assertPolicyCustodyForFixture(root, 'absent', filesystem),
      ).rejects.toThrow('policy-custody')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accepts only closed privacy-safe command grammar', () => {
    expect(parsePolicyBaselineArguments(['check'])).toEqual({ mode: 'check' })
    expect(
      parsePolicyBaselineArguments([
        'capture',
        '--confirm-wikimedia-policy-baseline',
      ]),
    ).toEqual({ mode: 'capture' })
    for (const args of [
      [],
      ['capture'],
      ['capture', '--other'],
      ['prepare-review', 'extra'],
      ['unknown'],
    ])
      expect(() => parsePolicyBaselineArguments(args)).toThrow(
        PolicyBaselineError,
      )
  })

  it('uses an injected, fixed launch plan and kills a failed process group', async () => {
    const values = fixture()
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-reviewer-'))
    const filesystem = syntheticFilesystem()
    const reviewerContractSha256 =
      'aea8bda83abe762e5f243e5604a900a975118fe8d9a3457f3424d9604a8f7d26'
    const exactOutput = canonicalJson({
      schema: 'wikimedia-policy-semantic-review-role-output.v1',
      version: 1,
      captureSha256: values.capture.captureSha256,
      semanticReviewRetrievalSha256:
        values.retrieval.semanticReviewRetrievalSha256,
      reviewerContractSha256,
      outcome: 'no-material-change',
    })
    const expected = createPolicySemanticReviewRoleResult(exactOutput)
    const launch = {
      renderedSandboxProfilePath: join(directory, 'm45-reviewer.sb'),
      outputSchemaPath: join(directory, 'm45-role-output.schema.json'),
      resultPath: join(directory, 'm45-role-output.json'),
      workingDirectory: join(directory, 'm45-staging'),
    }
    let terminated = false
    try {
      const result = await runPolicyReviewerForFixture({
        launch,
        bodies: values.bodies,
        prompt: Buffer.from('review the fixed policy corpus'),
        commitments: {
          captureSha256: values.capture.captureSha256,
          semanticReviewRetrievalSha256:
            values.retrieval.semanticReviewRetrievalSha256,
          reviewerContractSha256,
        },
        filesystem,
        spawn: async (actualLaunch) => {
          expect(actualLaunch).toEqual(createPolicyReviewerLaunch(launch))
          return {
            writeStdin: async (stdin) => {
              expect(Buffer.from(stdin).toString('utf8')).toContain(
                `capture-sha256:${values.capture.captureSha256}`,
              )
            },
            endStdin: async () => undefined,
            wait: async () => {
              await writeFile(launch.resultPath, exactOutput, {
                flag: 'wx',
                mode: 0o600,
              })
              return {
                code: 0,
                groupAlive: false,
                openDescriptors: 0,
              }
            },
            terminateProcessGroup: async () => {
              terminated = true
            },
          }
        },
      })
      expect(result).toEqual(expected)
      expect(terminated).toBe(false)

      await rm(launch.resultPath)
      await expect(
        runPolicyReviewerForFixture({
          launch,
          bodies: values.bodies,
          prompt: Buffer.from('review the fixed policy corpus'),
          commitments: {
            captureSha256: values.capture.captureSha256,
            semanticReviewRetrievalSha256:
              values.retrieval.semanticReviewRetrievalSha256,
            reviewerContractSha256,
          },
          filesystem,
          spawn: async () => ({
            writeStdin: async () => undefined,
            endStdin: async () => undefined,
            wait: async (onDiagnostic) => {
              onDiagnostic('stdout', Buffer.alloc(256 * 1024 + 1))
              return { code: 0, groupAlive: false, openDescriptors: 0 }
            },
            terminateProcessGroup: async () => {
              terminated = true
            },
          }),
        }),
      ).rejects.toThrow('policy-wrapper-output')
      expect(terminated).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('kills on stderr, combined diagnostic, result, exit, child, and descriptor failures', async () => {
    const values = fixture()
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-faults-'))
    const filesystem = syntheticFilesystem()
    const launch = {
      renderedSandboxProfilePath: join(directory, 'm45-reviewer.sb'),
      outputSchemaPath: join(directory, 'm45-role-output.schema.json'),
      resultPath: join(directory, 'm45-role-output.json'),
      workingDirectory: join(directory, 'm45-staging'),
    }
    const commitments = {
      captureSha256: values.capture.captureSha256,
      semanticReviewRetrievalSha256:
        values.retrieval.semanticReviewRetrievalSha256,
      reviewerContractSha256:
        'aea8bda83abe762e5f243e5604a900a975118fe8d9a3457f3424d9604a8f7d26',
    }
    const failures = [
      {
        emit: (
          onDiagnostic: (
            stream: 'stdout' | 'stderr',
            chunk: Uint8Array,
          ) => void,
        ) => onDiagnostic('stderr', Buffer.alloc(256 * 1024 + 1)),
        outcome: { code: 0, groupAlive: false, openDescriptors: 0 },
      },
      {
        emit: (
          onDiagnostic: (
            stream: 'stdout' | 'stderr',
            chunk: Uint8Array,
          ) => void,
        ) => {
          onDiagnostic('stdout', Buffer.alloc(200 * 1024))
          onDiagnostic('stderr', Buffer.alloc(200 * 1024))
        },
        outcome: { code: 0, groupAlive: false, openDescriptors: 0 },
      },
      {
        emit: () => undefined,
        outcome: { code: 1, groupAlive: false, openDescriptors: 0 },
      },
      {
        emit: () => undefined,
        outcome: { code: 0, groupAlive: true, openDescriptors: 0 },
      },
      {
        emit: () => undefined,
        outcome: { code: 0, groupAlive: false, openDescriptors: 1 },
      },
    ]
    try {
      for (const failure of failures) {
        let terminated = false
        await expect(
          runPolicyReviewerForFixture({
            launch,
            bodies: values.bodies,
            prompt: Buffer.from('review'),
            commitments,
            filesystem,
            spawn: async () => ({
              writeStdin: async () => undefined,
              endStdin: async () => undefined,
              wait: async (onDiagnostic) => {
                failure.emit(onDiagnostic)
                return failure.outcome
              },
              terminateProcessGroup: async () => {
                terminated = true
              },
            }),
          }),
        ).rejects.toThrow('policy-wrapper-output')
        expect(terminated).toBe(true)
      }

      let terminated = false
      await expect(
        runPolicyReviewerForFixture({
          launch,
          bodies: values.bodies,
          prompt: Buffer.from('review'),
          commitments,
          filesystem,
          spawn: async () => ({
            writeStdin: async () => undefined,
            endStdin: async () => undefined,
            wait: async () => {
              await writeFile(launch.resultPath, Buffer.alloc(4097), {
                flag: 'wx',
                mode: 0o600,
              })
              return { code: 0, groupAlive: false, openDescriptors: 0 }
            },
            terminateProcessGroup: async () => {
              terminated = true
            },
          }),
        }),
      ).rejects.toThrow('policy-wrapper-output')
      expect(terminated).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
