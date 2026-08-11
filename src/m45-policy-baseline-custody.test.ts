import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'

const execFileAsync = promisify(execFile)
import {
  PolicyBaselineError,
  type PolicyFilesystem,
  assertPolicyExclusivePromotionBuildInventory,
  assertPolicyExclusivePromotionParentEvidence,
  assertPolicyExclusivePromotionPreflight,
  assertPolicyExclusivePromotionProvenanceAccepted,
  assertPolicyCustodyForFixture,
  assertPolicyDeleteEntryTransitionForFixture,
  assertPolicyPromotionAcceptanceBuild,
  assertPolicyPromotionBootstrapBoundary,
  cleanupPolicyExclusivePromotionBuildForFixture,
  classifyPolicyTerminalBuildStateForFixture,
  createAcceptedPolicyPromotionLiterals,
  createPolicyBaselineCapture,
  createPolicyExclusivePromotionInvocationForFixture,
  createPolicyExclusivePromotionPreflightAuthorityForFixture,
  createPolicyExclusivePromotionToolchainPlanForFixture,
  createPolicyDeleteEntryInvocationForFixture,
  createPolicyLockPreflightLaunchForFixture,
  createPolicyMetadataInvocationForFixture,
  createPolicyNativeFdMapForFixture,
  createPolicyPromotionProvenanceCandidate,
  createPolicyPromotionPackage,
  createPolicyToolchainAuthorityForFixture,
  deletePolicyHeldFileForFixture,
  createPolicyReviewerLaunch,
  createPolicySemanticReviewRoleResult,
  createPolicySemanticReviewRetrieval,
  inspectPolicyExclusivePromotionSource,
  inspectPolicyLockPreflightWorker,
  inspectPolicyNativeLaunchSources,
  mapPolicyExclusivePromotionHelperResult,
  orderedPolicyUrlSequenceSha256,
  openPolicyNativeFillersForFixture,
  parsePolicyBaselineArguments,
  parsePolicyPromotionPackage,
  parsePolicyToolchainAuthority,
  policyExclusivePromotionBuildContract,
  policyExclusivePromotionLaunchContract,
  policyExclusivePromotionPendingProvenance,
  policyExclusivePromotionRoots,
  policyLockPreflightWorkerPath,
  policyNativeLaunchContractPath,
  policyNativeAuthorityPath,
  policyNativeLauncherPath,
  policyCommandLockOpenContract,
  policyDarwinFileFlags,
  policyDeleteEntryRoles,
  policyDeleteEntryTransitions,
  policyMetadataRoles,
  policyPreflightFixtureTable,
  policyProductionBuildCleanupSequence,
  readPolicyHeldFileForFixture,
  runPolicyNativeProcessForFixture,
  runPolicyReviewerForFixture,
  snapshotPolicyExclusivePromotionSourceForFixture,
  writePolicyCaptureForFixture,
  writePolicyRoleInputForFixture,
} from '@/../scripts/m45-policy-baseline'
import {
  createPolicyCompilerCapability,
  createPolicyCompilerDiagnosticCapability,
  createPolicyFdAdmissionProbeCapability,
  createPolicyFdAdmissionProbeCompilerCapability,
  createPolicyFdAdmissionProbeCompilerPlan,
  createPolicyFdAdmissionProbePlan,
  createPolicyCompilerPlan,
  createPolicyCompilerResourcePlan,
  createPolicyHelperCapability,
  createPolicyLockPreflightPlan,
  createPolicyNativeHelperPlan,
  createPolicyXcrunPlan,
} from '@/../scripts/m45-policy-baseline-native-launch-contract'
import {
  assertPolicyFdMapRecoveryDirectorySnapshotForFixture,
  assertPolicyFdMapRecoveryRequestShapeForFixture,
  assertPolicyFdMapRecoveryScratchIdentityForFixture,
  assertPolicyFdAdmissionProbeFileSnapshotForFixture,
  assertPolicyFdAdmissionProbeScratchSnapshotForFixture,
  finalizePolicyFdAdmissionProbeScratchForFixture,
  inspectPolicyDiagnosticControlStateForFixture,
  inspectPolicyProvisionalABuildResidueForFixture,
  inspectPolicyProvisionalABuildResidueReadsForFixture,
  policyBCleanupCheckpointIds,
  runPolicyCAcceptedFailureLifecycleForFixture,
  runPolicyBCandidateLifecycleForFixture,
  reopenPolicyBCandidateCheckpointForFixture,
  recoverPolicyFdMapScratchForFixture,
  runPolicyBCandidateFailureLifecycleForFixture,
  runPolicyNativeChildFdLifecycleForFixture,
  runPolicyNativePositioningForFixture,
  runPolicyProvisionalABuildResidueLifecycleForFixture,
} from '@/../scripts/m45-policy-baseline-native-authority'
import { canonicalJson } from '@/features/anime/catalogue/wikidata-anime-discovery'

const timestamp = '2026-08-08T11:00:00.000Z'
const syntheticPreflightAuthority = async (device = '7') => {
  const worker = await inspectPolicyLockPreflightWorker()
  const fixtureMetadata = (inode: string) => ({
    uid: '501',
    device,
    inode,
    links: '1',
    mode: '384',
    size: '1',
  })
  const digest = (value: unknown) =>
    createHash('sha256').update(canonicalJson(value)).digest('hex')
  const observed = (targets: readonly number[], argvCount = 8) => ({
    fillerParentFds: targets.length === 4 ? [7, 8, 9, 10] : [4, 5, 6],
    authorityParentFds: targets.map((_, index) => 11 + index),
    commandLockParentFd: 20,
    childTargets: [...targets],
    argvCount,
    stdoutBytes: 0 as const,
    stderrBytes: 0 as const,
    processGroupAbsent: true as const,
    streamsClosed: true as const,
  })
  const lifecycle = (targets: readonly number[], argvCount = 8) => ({
    exitCode: 0 as const,
    ...observed(targets, argvCount),
  })
  const deleteRows = [
    [
      'preflight-success-destination-promotion',
      'promotion',
      ['fixture.bin', 'promotion'],
      ['fixture.bin'],
    ],
    [
      'preflight-collision-source-promotion',
      'promotion',
      ['fixture.bin', 'promotion'],
      ['fixture.bin'],
    ],
    [
      'preflight-collision-destination-promotion',
      'promotion',
      ['fixture.bin', 'promotion'],
      ['fixture.bin'],
    ],
    ['preflight-success-source-file', 'fixture.bin', ['fixture.bin'], []],
    ['preflight-success-destination-file', 'fixture.bin', ['fixture.bin'], []],
    ['preflight-collision-source-file', 'fixture.bin', ['fixture.bin'], []],
    [
      'preflight-collision-destination-file',
      'fixture.bin',
      ['fixture.bin'],
      [],
    ],
    [
      'preflight-success-source-directory',
      'success-source',
      [
        'acl-fixture',
        'collision-destination',
        'collision-source',
        'success-destination',
        'success-source',
      ],
      [
        'acl-fixture',
        'collision-destination',
        'collision-source',
        'success-destination',
      ],
    ],
    [
      'preflight-success-destination-directory',
      'success-destination',
      [
        'acl-fixture',
        'collision-destination',
        'collision-source',
        'success-destination',
      ],
      ['acl-fixture', 'collision-destination', 'collision-source'],
    ],
    [
      'preflight-collision-source-directory',
      'collision-source',
      ['acl-fixture', 'collision-destination', 'collision-source'],
      ['acl-fixture', 'collision-destination'],
    ],
    [
      'preflight-collision-destination-directory',
      'collision-destination',
      ['acl-fixture', 'collision-destination'],
      ['acl-fixture'],
    ],
    ['preflight-acl-fixture-directory', 'acl-fixture', ['acl-fixture'], []],
    [
      'preflight-root',
      '.policy-exclusive-promotion-preflight',
      [
        '.policy-exclusive-promotion-build',
        '.policy-exclusive-promotion-preflight',
        '.policy-exclusive-promotion.lock',
      ],
      ['.policy-exclusive-promotion-build', '.policy-exclusive-promotion.lock'],
    ],
    [
      'build-source',
      'exclusive-promotion-helper.c',
      ['exclusive-promotion-helper', 'exclusive-promotion-helper.c', 'tmp'],
      ['exclusive-promotion-helper', 'tmp'],
    ],
    [
      'build-tmp',
      'tmp',
      ['exclusive-promotion-helper', 'tmp'],
      ['exclusive-promotion-helper'],
    ],
  ] as const
  const deletionRecords = deleteRows.map(
    ([role, childName, before, after], index) => {
      const child = fixtureMetadata(String(700 + index))
      return {
        role,
        childName,
        parentBeforeInventory: [...before],
        parentBeforeInventorySha256: digest(before),
        parentBeforeLinks: 2 + before.length,
        parentAfterInventory: [...after],
        parentAfterInventorySha256: digest(after),
        parentAfterLinks: 2 + after.length,
        child,
        childIdentitySha256: digest(child),
        lifecycle: lifecycle([3, 4, 5]),
      }
    },
  )
  return createPolicyExclusivePromotionPreflightAuthorityForFixture({
    schema: 'policy-exclusive-promotion-preflight.v1',
    version: 1,
    platform: 'darwin',
    device,
    volumeCapability: {
      validRenameExclusive: 1,
      supportedRenameExclusive: 1,
    },
    metadataRoleResults: Object.keys(policyMetadataRoles)
      .filter((role) => role !== 'custody-file')
      .map((role) => ({
        role,
        exitCode: 0 as const,
      })) as never,
    fdPreflight: {
      singleAuthorityTargets: [3],
      doubleAuthorityTargets: [3, 4],
      tripleAuthorityTargets: [3, 4, 5],
      quadAuthorityTargets: [3, 4, 5, 6],
      unexpectedDescriptorCount: 0,
    },
    aclFixture: {
      installExitCode: 0,
      metadataRejectExitCode: 15,
      removeExitCode: 0,
    },
    promotion: {
      successExitCode: 0,
      collisionExitCode: 10,
      collisionSourceBeforeSha256: 'b'.repeat(64),
      collisionSourceAfterSha256: 'b'.repeat(64),
      collisionDestinationBeforeSha256: 'c'.repeat(64),
      collisionDestinationAfterSha256: 'c'.repeat(64),
    },
    apfsRegularFileDelete: {
      beforeEntryCount: 1,
      beforeLinks: 3,
      afterEntryCount: 0,
      afterLinks: 2,
    },
    apfsDirectoryDelete: {
      beforeEntryCount: 1,
      beforeLinks: 3,
      afterEntryCount: 0,
      afterLinks: 2,
    },
    commandLock: {
      workerSha256: worker.sha256,
      before: { device, inode: '503', mode: 0o600, links: 1, bytes: 0 },
      heldContender: {
        exitCode: 20,
        stdoutBytes: 0,
        stderrBytes: 0,
        processGroupAbsent: true,
        streamsClosed: true,
      },
      releasedContender: {
        exitCode: 0,
        stdoutBytes: 0,
        stderrBytes: 0,
        processGroupAbsent: true,
        streamsClosed: true,
      },
      after: { device, inode: '503', mode: 0o600, links: 1, bytes: 0 },
      retentionIntervals: [
        'held-through-contender-close',
        'held-through-terminal-custody-decision',
      ],
    },
    cleanup: { remainingEntryCount: 0, rootAbsent: true },
    capabilityProbe: {
      derivationHeldContender: {
        before: { device, inode: '503', mode: 0o600, links: 1, bytes: 0 },
        heldExitCode: 20,
        releasedExitCode: 0,
        after: { device, inode: '503', mode: 0o600, links: 1, bytes: 0 },
      },
      metadata: Object.keys(policyMetadataRoles)
        .filter((role) => role !== 'custody-file')
        .map((role, index) => ({
          role,
          exitCode: 0 as const,
          evidenceSha256: `${String(index + 1).repeat(64)}`,
        })) as never,
      fdMaps: [
        {
          mode: 'metadata',
          fillerTargets: [3, 4, 5],
          authorityTargets: [3],
          highestTarget: 3,
          observed: observed([3]),
        },
        {
          mode: 'acl-fixture',
          fillerTargets: [3, 4, 5],
          authorityTargets: [3],
          highestTarget: 3,
          observed: observed([3]),
        },
        {
          mode: 'promotion',
          fillerTargets: [3, 4, 5, 6],
          authorityTargets: [3, 4, 5, 6],
          highestTarget: 6,
          observed: observed([3, 4, 5, 6], 17),
        },
        {
          mode: 'delete-entry',
          fillerTargets: [3, 4, 5],
          authorityTargets: [3, 4, 5],
          highestTarget: 3,
          observed: observed([3, 4, 5]),
        },
        {
          mode: 'terminal',
          fillerTargets: [3, 4, 5, 6],
          authorityTargets: [3, 4, 5, 6],
          highestTarget: 6,
          observed: observed([3, 4, 5, 6]),
        },
      ],
      aclFixture: {
        identitySha256: 'd'.repeat(64),
        installExitCode: 0,
        rejectExitCode: 15,
        removeExitCode: 0,
        reopenExitCode: 0,
      },
      promotion: {
        success: {
          exitCode: 0,
          sourceBeforeSha256: '1'.repeat(64),
          sourceAfterSha256: '1'.repeat(64),
          destinationBeforeSha256: '2'.repeat(64),
          destinationAfterSha256: '2'.repeat(64),
          sourceBeforeInventory: ['fixture.bin', 'promotion'],
          sourceAfterInventory: ['fixture.bin'],
          destinationBeforeInventory: ['fixture.bin'],
          destinationAfterInventory: ['fixture.bin', 'promotion'],
          sourceParent: {
            ...fixtureMetadata('801'),
            links: '4',
            mode: '448',
            size: 'na',
          },
          destinationParent: {
            ...fixtureMetadata('802'),
            links: '3',
            mode: '448',
            size: 'na',
          },
          sourcePromotion: {
            ...fixtureMetadata('803'),
            links: '2',
            mode: '448',
            size: 'na',
          },
          collisionDestination: null,
          lifecycle: lifecycle([3, 4, 5, 6], 17),
        },
        collision: {
          exitCode: 10,
          sourceBeforeSha256: 'b'.repeat(64),
          sourceAfterSha256: 'b'.repeat(64),
          destinationBeforeSha256: 'c'.repeat(64),
          destinationAfterSha256: 'c'.repeat(64),
          sourceBeforeInventory: ['fixture.bin', 'promotion'],
          sourceAfterInventory: ['fixture.bin', 'promotion'],
          destinationBeforeInventory: ['fixture.bin', 'promotion'],
          destinationAfterInventory: ['fixture.bin', 'promotion'],
          sourceParent: {
            ...fixtureMetadata('811'),
            links: '4',
            mode: '448',
            size: 'na',
          },
          destinationParent: {
            ...fixtureMetadata('812'),
            links: '4',
            mode: '448',
            size: 'na',
          },
          sourcePromotion: {
            ...fixtureMetadata('813'),
            links: '2',
            mode: '448',
            size: 'na',
          },
          collisionDestination: {
            ...fixtureMetadata('814'),
            links: '2',
            mode: '448',
            size: 'na',
          },
          lifecycle: lifecycle([3, 4, 5, 6], 17),
        },
      },
      deletionRecords,
      apfsDeleteRows: [
        ['R01s', 2, 4, 1, 3],
        ['R02', 2, 4, 1, 3],
        ['R03', 2, 4, 1, 3],
        ['R04', 1, 3, 0, 2],
        ['R05', 1, 3, 0, 2],
        ['R06', 1, 3, 0, 2],
        ['R07', 1, 3, 0, 2],
        ['R08', 5, 7, 4, 6],
        ['R09', 4, 6, 3, 5],
        ['R10', 3, 5, 2, 4],
        ['R11', 2, 4, 1, 3],
        ['R12', 1, 3, 0, 2],
        ['R13', 3, 5, 2, 4],
        ['R14', 3, 5, 2, 4],
        ['R15', 2, 4, 1, 3],
      ].map(
        ([
          row,
          beforeEntryCount,
          beforeLinks,
          afterEntryCount,
          afterLinks,
        ]) => ({
          row,
          beforeEntryCount,
          beforeLinks,
          afterEntryCount,
          afterLinks,
        }),
      ) as never,
      cleanupAbsence: {
        buildAbsent: true,
        preflightAbsent: true,
        trackedSourceSha256: '4'.repeat(64),
        trackedContractSha256: '5'.repeat(64),
        trackedLauncherSha256: '6'.repeat(64),
        trackedAuthoritySha256: '7'.repeat(64),
        trackedWorkerSha256: worker.sha256,
      },
    },
  })
}
const syntheticToolchainAuthority = async () => {
  const [source, launch, worker] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
  ])
  return createPolicyToolchainAuthorityForFixture({
    schema: 'policy-toolchain-authority.v1',
    version: 1,
    compilerPath: '/Applications/Xcode.app/Contents/Developer/usr/bin/clang',
    sdkRoot:
      '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk',
    xcrunSha256: '1'.repeat(64),
    xcrunDevice: '7',
    xcrunInode: '100',
    sourceSha256: source.sha256,
    compilerSha256: '2'.repeat(64),
    compilerDevice: '7',
    compilerInode: '101',
    sdkIdentitySha256: '3'.repeat(64),
    sdkDevice: '7',
    sdkInode: '102',
    compilerResourceRoot:
      '/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/clang/18',
    compilerResourceIdentitySha256: '4'.repeat(64),
    compilerResourceDevice: '7',
    compilerResourceInode: '103',
    headerSetSha256: '4'.repeat(64),
    diagnosticSha256: '5'.repeat(64),
    diagnosticSemanticSha256: '6'.repeat(64),
    linkerPath: '/Applications/Xcode.app/Contents/Developer/usr/bin/ld',
    linkerIdentitySha256: '7'.repeat(64),
    linkerSha256: '7'.repeat(64),
    linkerDevice: '7',
    linkerInode: '104',
    compileContractSha256: '6'.repeat(64),
    launchContractSha256: launch.launchContractSha256,
    launcherSha256: launch.launcherSha256,
    nativeAuthoritySha256: launch.nativeAuthoritySha256,
    lockPreflightWorkerSha256: worker.sha256,
  })
}
const syntheticHelperCapability = async (
  repositoryRoot: string,
  bytes: Buffer,
  provenancePackage: unknown,
) => {
  const helperPath = `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper`
  const helperSha256 = createHash('sha256').update(bytes).digest('hex')
  return createPolicyHelperCapability({
    repositoryRoot,
    helperPath,
    device: '7',
    inode: '8',
    byteCount: bytes.byteLength,
    provenancePackage,
    heldEvidenceSha256: createHash('sha256')
      .update(
        canonicalJson({
          helperPath,
          helperSha256,
          device: '7',
          inode: '8',
          byteCount: bytes.byteLength,
        }),
      )
      .digest('hex'),
  })
}
function syntheticFilesystem(
  root: string,
  promoteExclusive: PolicyFilesystem['promoteExclusive'] = async (request) => {
    const source = join(root, '..', '.policy-baseline-review.staging')
    const destination = join(root, request.phase)
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
    const filesystem = syntheticFilesystem(root)
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
    const filesystem = syntheticFilesystem(root)
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
    const filesystem = syntheticFilesystem(root)
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
    const filesystem = syntheticFilesystem(root)
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
    const filesystem = syntheticFilesystem(root, async (request) => {
      const destination = join(root, request.phase)
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

  it('rehashes promoted bytes and rejects post-promotion substitution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-substitute-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const filesystem = syntheticFilesystem(root, async (request) => {
      expect(Object.keys(request).sort()).toEqual(['files', 'phase'])
      expect(request).toMatchObject({
        phase: 'capture',
        files: [{ name: 'capture.json' }],
      })
      const source = join(directory, '.policy-baseline-review.staging')
      const destination = join(root, request.phase)
      await rename(source, destination)
      await writeFile(join(destination, 'capture.json'), 'substituted')
    })
    try {
      await expect(
        writePolicyCaptureForFixture(root, values.capture, filesystem),
      ).rejects.toThrow('policy-byte-drift')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a non-regular file shape before reading custody bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-stat-race-'))
    const root = join(directory, 'policy-baseline-review')
    const values = fixture()
    const base = syntheticFilesystem(root)
    const filesystem: PolicyFilesystem = {
      ...base,
      lstat: async (path) => {
        const stat = await lstat(path)
        if (!path.endsWith('capture.json')) return stat
        return {
          isDirectory: () => false,
          isFile: () => false,
          isSymbolicLink: () => false,
          uid: stat.uid,
          ino: stat.ino,
          nlink: stat.nlink,
          dev: stat.dev,
          mode: stat.mode,
          size: stat.size,
        }
      },
    }
    try {
      await expect(
        writePolicyCaptureForFixture(root, values.capture, filesystem),
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

  it('pins the reviewed Darwin source, build, launch, preflight, and fail-closed provenance contracts', async () => {
    const source = await inspectPolicyExclusivePromotionSource()
    const text = source.bytes.toString('utf8')
    expect(text.startsWith('#define _DARWIN_C_SOURCE 1\n')).toBe(true)
    for (const required of [
      'RENAME_EXCL == 0x00000004',
      'RENAME_NOFOLLOW_ANY == 0x00000010',
      'RENAME_RESOLVE_BENEATH == 0x00000020',
      'fgetattrlist(',
      'ATTR_VOL_INFO | ATTR_VOL_CAPABILITIES',
      'acl_get_fd_np(',
      'acl_get_entry(',
      'entry_status == -1 && entry_errno == EINVAL',
      'acl_free(',
      'metadata-check',
      'acl-fixture',
      'acl_set_fd_np(',
      '0x7a, 0x65, 0x64, 0x61',
      'argc != 12',
      'argc != 9',
      'argc != 6',
      'argc != 15',
      'argc != 18',
      'argc != 20',
      'AT_SYMLINK_NOFOLLOW',
      'O_NOFOLLOW == 0x00000100',
      'O_CLOEXEC == 0x01000000',
      'O_EXLOCK == 0x00000020',
      'exact_child_fd_map',
      'delete-entry',
      'delete-build-terminal',
      'preflight-promotion',
      'preflight-success-destination-promotion',
      'preflight-success-source-promotion',
      'preflight-collision-source-promotion',
      'preflight-collision-destination-promotion',
      'exact_child_fd_map(6)',
      'flock(source_parent_fd, LOCK_EX | LOCK_NB)',
      'unlinkat(',
      'exact_directory_inventory',
      '2 + deletion_inventory(role, false).count',
      'parent_after.st_nlink + 1 != parent_before.st_nlink',
      'HELPER_TERMINAL_UNCLASSIFIABLE',
      '!exact_lock(3, parent_expected.device)',
      '!exact_lock(source_parent_fd, parent_before.st_dev)',
    ])
      expect(text).toContain(required)
    expect(
      text.indexOf('unlinkat(5, "exclusive-promotion-helper", 0)'),
    ).toBeLessThan(
      text.indexOf(
        'unlinkat(4, ".policy-exclusive-promotion-build", AT_REMOVEDIR)',
      ),
    )
    for (const forbidden of [
      'printf(',
      'fprintf(',
      'system(',
      'exec',
      'unlink(',
      'remove(',
      'rename(',
    ])
      expect(text).not.toContain(forbidden)
    expect(text).not.toContain('acl_is_trivial_np')
    expect(text).not.toContain('acl_get_fd(')
    expect(source.sha256).toMatch(/^[a-f0-9]{64}$/u)
    const worker = await inspectPolicyLockPreflightWorker()
    expect(worker.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(worker.byteCount).toBeGreaterThan(500)
    const launcherCommitment = await inspectPolicyNativeLaunchSources()
    expect(launcherCommitment.launchContractSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(launcherCommitment.launcherSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(launcherCommitment.launchContractSha256).not.toBe(
      launcherCommitment.launcherSha256,
    )
    const launcherSource = await readFile(policyNativeLauncherPath, 'utf8')
    const launchContractSource = await readFile(
      policyNativeLaunchContractPath,
      'utf8',
    )
    expect(launcherSource).toContain("from 'node:child_process'")
    expect(launcherSource).not.toContain("from './m45-policy-baseline'")
    expect(launchContractSource).not.toContain('node:child_process')
    const lockLaunch = await createPolicyLockPreflightLaunchForFixture(
      '/Users/fixture/zedarchive',
    )
    expect(lockLaunch).toMatchObject({
      command: [
        process.execPath,
        expect.stringContaining('lock-preflight-worker.mjs'),
        'lock-preflight',
        '/Users/fixture/zedarchive',
      ],
      environment: {},
      stdoutByteLimit: 0,
      stderrByteLimit: 0,
    })
    const repositoryRoot = '/Users/fixture/zedarchive'
    const lockPlan = createPolicyLockPreflightPlan(
      { repositoryRoot, workerSha256: worker.sha256 },
      {
        executable: process.execPath,
        workerPath: policyLockPreflightWorkerPath,
        acceptedWorkerSha256: worker.sha256,
      },
    )
    expect(lockPlan).toMatchObject({
      executable: process.execPath,
      arguments: [
        policyLockPreflightWorkerPath,
        'lock-preflight',
        repositoryRoot,
      ],
      cwd: repositoryRoot,
      environment: {},
      stdio: ['ignore', 'pipe', 'pipe'],
      acceptedExitCodes: [0, 20],
    })
    expect(createPolicyXcrunPlan('sdk-path', { repositoryRoot })).toMatchObject(
      {
        executable: '/usr/bin/xcrun',
        arguments: ['--sdk', 'macosx', '--show-sdk-path'],
        cwd: repositoryRoot,
        environment: {},
      },
    )
    const toolchainAuthority = await syntheticToolchainAuthority()
    const { compilerPath } = toolchainAuthority
    const compilerCapability = createPolicyCompilerCapability({
      repositoryRoot,
      compilerPath: toolchainAuthority.compilerPath,
      sdkRoot: toolchainAuthority.sdkRoot,
      compilerResourceRoot: toolchainAuthority.compilerResourceRoot,
      authorityPackage: toolchainAuthority,
    })
    const diagnosticCore = {
      schema: 'policy-compiler-diagnostic-capability.v1',
      version: 1,
      repositoryRoot,
      compilerPath: toolchainAuthority.compilerPath,
      sdkRoot: toolchainAuthority.sdkRoot,
      compilerResourceRoot: toolchainAuthority.compilerResourceRoot,
      compilerSha256: toolchainAuthority.compilerSha256,
      compilerDevice: toolchainAuthority.compilerDevice,
      compilerInode: toolchainAuthority.compilerInode,
      sdkIdentitySha256: toolchainAuthority.sdkIdentitySha256,
      sdkDevice: toolchainAuthority.sdkDevice,
      sdkInode: toolchainAuthority.sdkInode,
      compilerResourceIdentitySha256:
        toolchainAuthority.compilerResourceIdentitySha256,
      compilerResourceDevice: toolchainAuthority.compilerResourceDevice,
      compilerResourceInode: toolchainAuthority.compilerResourceInode,
      headerSetSha256: toolchainAuthority.headerSetSha256,
      compileContractSha256: toolchainAuthority.compileContractSha256,
      launchContractSha256: toolchainAuthority.launchContractSha256,
      launcherSha256: toolchainAuthority.launcherSha256,
      nativeAuthoritySha256: toolchainAuthority.nativeAuthoritySha256,
      lockPreflightWorkerSha256: toolchainAuthority.lockPreflightWorkerSha256,
    } as const
    const diagnosticCapability = createPolicyCompilerDiagnosticCapability({
      repositoryRoot,
      diagnosticCapability: {
        ...diagnosticCore,
        diagnosticCapabilitySha256: createHash('sha256')
          .update(canonicalJson(diagnosticCore))
          .digest('hex'),
      },
    })
    expect(() =>
      createPolicyCompilerDiagnosticCapability({
        repositoryRoot,
        diagnosticCapability: {
          ...diagnosticCore,
          diagnosticCapabilitySha256: '0'.repeat(64),
        },
      }),
    ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyCompilerDiagnosticCapability({
        repositoryRoot: '/Users/fixture/other',
        diagnosticCapability: {
          ...diagnosticCore,
          diagnosticCapabilitySha256: createHash('sha256')
            .update(canonicalJson(diagnosticCore))
            .digest('hex'),
        },
      }),
    ).toThrow('policy-native-launch-contract')
    const compilerPlan = createPolicyCompilerPlan(
      'diagnostic',
      diagnosticCapability,
    )
    expect(compilerPlan).toMatchObject({
      executable: compilerPath,
      cwd: repositoryRoot,
      environment: {
        TMPDIR: `${repositoryRoot}/.local/m45/policy-native-derivation`,
      },
      acceptedExitCodes: [0],
    })
    expect(compilerPlan.arguments).toContain('-###')
    expect(compilerPlan.arguments).toContain(
      `${repositoryRoot}/.local/m45/policy-native-derivation/.policy-compiler-diagnostic-output`,
    )
    expect(compilerPlan.arguments.at(-1)).toBe(
      `${repositoryRoot}/scripts/policy-baseline-review/exclusive-promotion-helper.c`,
    )
    const buildPlan = createPolicyCompilerPlan('build', compilerCapability)
    expect(buildPlan.arguments.at(-1)).toBe(
      `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper.c`,
    )
    expect(buildPlan.environment).toEqual({
      TMPDIR: `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/tmp`,
    })
    expect(buildPlan.arguments).toContain(
      `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper`,
    )
    const resourceResolverCore = {
      schema: 'policy-compiler-resource-resolver.v1',
      version: 1,
      repositoryRoot,
      compilerPath,
      compilerSha256: toolchainAuthority.compilerSha256,
      compilerDevice: toolchainAuthority.compilerDevice,
      compilerInode: toolchainAuthority.compilerInode,
    } as const
    const resourceResolverInput = {
      ...resourceResolverCore,
      compilerEvidenceSha256: createHash('sha256')
        .update(canonicalJson(resourceResolverCore))
        .digest('hex'),
    } as const
    expect(
      createPolicyCompilerResourcePlan(resourceResolverInput),
    ).toMatchObject({
      executable: compilerPath,
      arguments: ['-print-resource-dir'],
      cwd: repositoryRoot,
      environment: {},
      stdio: ['ignore', 'pipe', 'pipe'],
      timeoutMilliseconds: 30_000,
      stdoutByteLimit: 64 * 1024,
      stderrByteLimit: 64 * 1024,
      combinedOutputByteLimit: 96 * 1024,
      outputMode: 'diagnostic',
      acceptedExitCodes: [0],
    })
    expect(() =>
      createPolicyCompilerResourcePlan({
        ...resourceResolverInput,
        callerSelectedResourceRoot: '/fixture/forbidden',
      }),
    ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyCompilerResourcePlan({
        ...resourceResolverInput,
        compilerEvidenceSha256: '0'.repeat(64),
      }),
    ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyCompilerCapability({
        repositoryRoot,
        compilerPath: toolchainAuthority.compilerPath,
        sdkRoot: toolchainAuthority.sdkRoot,
        compilerResourceRoot: '/Applications/Xcode.app/forbidden',
        authorityPackage: toolchainAuthority,
      }),
    ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyCompilerCapability({
        repositoryRoot,
        compilerPath: toolchainAuthority.compilerPath,
        sdkRoot: toolchainAuthority.sdkRoot,
        compilerResourceRoot: toolchainAuthority.compilerResourceRoot,
        authorityPackage: {
          ...toolchainAuthority,
          diagnosticSemanticSha256: '0'.repeat(64),
        },
      }),
    ).toThrow('policy-native-launch-contract')
    const currentOnlyAuthorityKeys = new Set([
      'compilerResourceRoot',
      'compilerResourceIdentitySha256',
      'compilerResourceDevice',
      'compilerResourceInode',
      'diagnosticSemanticSha256',
      'linkerPath',
      'linkerIdentitySha256',
      'linkerSha256',
      'linkerDevice',
      'linkerInode',
      'authorityPackageSha256',
    ])
    const legacyAuthorityCore = Object.fromEntries(
      Object.entries(toolchainAuthority).filter(
        ([key]) => !currentOnlyAuthorityKeys.has(key),
      ),
    )
    expect(() =>
      parsePolicyToolchainAuthority({
        ...legacyAuthorityCore,
        authorityPackageSha256: createHash('sha256')
          .update(canonicalJson(legacyAuthorityCore))
          .digest('hex'),
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
    expect(() =>
      createPolicyCompilerPlan('build', {
        ...compilerCapability,
        inheritedEnvironment: true,
      }),
    ).toThrow('policy-native-launch-contract')
    const helperBytes = Buffer.from('synthetic accepted helper')
    const helperPackage = await createPolicyPromotionPackage({
      stage: 'B',
      rootIdentitySha256: 'b'.repeat(64),
      toolchainAuthority,
      helperBytes,
      preflightAuthority: await syntheticPreflightAuthority(),
      reviewAuthoritySha256: null,
    })
    expect(helperPackage.material).toMatchObject({
      compilerResourceIdentitySha256:
        toolchainAuthority.compilerResourceIdentitySha256,
      compilerResourceDevice: toolchainAuthority.compilerResourceDevice,
      compilerResourceInode: toolchainAuthority.compilerResourceInode,
      headerSetSha256: toolchainAuthority.headerSetSha256,
      diagnosticSemanticSha256: toolchainAuthority.diagnosticSemanticSha256,
      linkerIdentitySha256: toolchainAuthority.linkerIdentitySha256,
      linkerSha256: toolchainAuthority.linkerSha256,
      linkerDevice: toolchainAuthority.linkerDevice,
      linkerInode: toolchainAuthority.linkerInode,
    })
    const currentOnlyMaterialKeys = new Set([
      'compilerResourceIdentitySha256',
      'compilerResourceDevice',
      'compilerResourceInode',
      'diagnosticSemanticSha256',
      'linkerIdentitySha256',
      'linkerSha256',
      'linkerDevice',
      'linkerInode',
    ])
    const legacyMaterial = Object.fromEntries(
      Object.entries(helperPackage.material).filter(
        ([key]) => !currentOnlyMaterialKeys.has(key),
      ),
    )
    const legacyPackageCore = {
      schema: helperPackage.schema,
      version: helperPackage.version,
      stage: helperPackage.stage,
      rootIdentitySha256: helperPackage.rootIdentitySha256,
      material: legacyMaterial,
      preflightAuthoritySha256: helperPackage.preflightAuthoritySha256,
      reviewAuthoritySha256: helperPackage.reviewAuthoritySha256,
      cleanupProved: helperPackage.cleanupProved,
    }
    expect(() =>
      parsePolicyPromotionPackage({
        ...legacyPackageCore,
        packageSha256: createHash('sha256')
          .update(canonicalJson(legacyPackageCore))
          .digest('hex'),
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
    const helperCapability = await syntheticHelperCapability(
      repositoryRoot,
      helperBytes,
      helperPackage,
    )
    expect(
      createPolicyNativeHelperPlan(helperCapability, {
        kind: 'metadata-check',
        role: 'command-lock',
        evidence: {
          uid: '501',
          device: '7',
          inode: '9',
          links: '1',
          mode: String(0o600),
          size: '0',
        },
        authorityFd: 9,
      }),
    ).toMatchObject({
      executable: helperCapability.helperPath,
      cwd: repositoryRoot,
      environment: {},
      stdio: ['ignore', 'pipe', 'pipe', 9],
      acceptedExitCodes: [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    })
    const fdProbeCapability = createPolicyFdAdmissionProbeCapability({
      repositoryRoot,
      probePath: '/private/tmp/zedarchive-m45-fd-admission-probe/probe',
      probeSha256: 'a'.repeat(64),
    })
    expect(createPolicyFdAdmissionProbePlan(fdProbeCapability, 9)).toEqual(
      expect.objectContaining({
        executable: '/private/tmp/zedarchive-m45-fd-admission-probe/probe',
        arguments: [],
        cwd: repositoryRoot,
        environment: {},
        stdio: ['ignore', 'pipe', 'pipe', 9],
        outputMode: 'zero',
        acceptedExitCodes: [0, 21, 23, 24, 25],
      }),
    )
    expect(() =>
      createPolicyFdAdmissionProbePlan(fdProbeCapability, 3),
    ).toThrow('policy-native-launch-contract')
    expect(
      createPolicyNativeHelperPlan(helperCapability, {
        kind: 'acl-fixture',
        action: 'install',
        uid: '501',
        device: '7',
        inode: '9',
        authorityFd: 9,
      }),
    ).toMatchObject({
      arguments: ['acl-fixture', 'install', '501', '7', '9'],
      stdio: ['ignore', 'pipe', 'pipe', 9],
    })
    expect(
      createPolicyNativeHelperPlan(helperCapability, {
        kind: 'promotion',
        phase: 'capture',
        sourceParent: { device: '7', inode: '10', links: '8' },
        destinationParent: { device: '7', inode: '11', links: '2' },
        staging: { device: '7', inode: '12' },
        sourceParentFd: 9,
        destinationParentFd: 10,
      }),
    ).toMatchObject({
      arguments: [
        'capture',
        '.policy-baseline-review.staging',
        'capture',
        '7',
        '10',
        '8',
        '7',
        '11',
        '2',
        '7',
        '12',
      ],
      stdio: ['ignore', 'pipe', 'pipe', 9, 10],
    })
    expect(
      createPolicyNativeHelperPlan(helperCapability, {
        kind: 'preflight-promotion',
        outcome: 'success',
        sourceParent: {
          device: '7',
          inode: '30',
          beforeLinks: '4',
          afterLinks: '3',
        },
        destinationParent: {
          device: '7',
          inode: '31',
          beforeLinks: '3',
          afterLinks: '4',
        },
        sourcePromotion: { device: '7', inode: '32', links: '2' },
        collisionDestination: { device: '0', inode: '0', links: '0' },
        commonDevice: '7',
        commandLockFd: 9,
        sourceParentFd: 10,
        destinationParentFd: 11,
        sourcePromotionFd: 12,
      }),
    ).toMatchObject({
      arguments: [
        'preflight-promotion',
        'success',
        '7',
        '30',
        '4',
        '3',
        '7',
        '31',
        '3',
        '4',
        '7',
        '32',
        '2',
        '0',
        '0',
        '0',
        '7',
      ],
      stdio: ['ignore', 'pipe', 'pipe', 9, 10, 11, 12],
    })
    expect(
      createPolicyNativeHelperPlan(helperCapability, {
        kind: 'delete-entry',
        role: 'preflight-success-source-file',
        parent: {
          uid: '501',
          device: '7',
          inode: '20',
          links: '3',
          mode: String(0o700),
          size: 'na',
        },
        child: {
          uid: '501',
          device: '7',
          inode: '21',
          links: '1',
          mode: String(0o600),
          size: '43',
        },
        commandLockFd: 9,
        parentFd: 10,
        childFd: 11,
      }),
    ).toMatchObject({
      arguments: [
        'delete-entry',
        'preflight-success-source-file',
        '501',
        '7',
        '20',
        '3',
        String(0o700),
        'na',
        '501',
        '7',
        '21',
        '1',
        String(0o600),
        '43',
      ],
      stdio: ['ignore', 'pipe', 'pipe', 9, 10, 11],
    })
    const terminalOperation = {
      kind: 'delete-build-terminal' as const,
      parent: {
        uid: '501',
        device: '7',
        inode: '30',
        links: '4',
        mode: String(0o700),
        size: 'na',
      },
      buildRoot: {
        uid: '501',
        device: '7',
        inode: '31',
        links: '3',
        mode: String(0o700),
        size: 'na',
      },
      helper: {
        uid: '501',
        device: '7',
        inode: '32',
        links: '1',
        mode: String(0o500),
        size: String(helperBytes.byteLength),
      },
      commandLockFd: 9,
      parentFd: 10,
      buildRootFd: 11,
      helperFd: 12,
    }
    expect(
      createPolicyNativeHelperPlan(helperCapability, terminalOperation),
    ).toMatchObject({
      arguments: [
        'delete-build-terminal',
        '501',
        '7',
        '30',
        '4',
        String(0o700),
        'na',
        '501',
        '7',
        '31',
        '3',
        String(0o700),
        'na',
        '501',
        '7',
        '32',
        '1',
        String(0o500),
        String(helperBytes.byteLength),
      ],
      stdio: ['ignore', 'pipe', 'pipe', 9, 10, 11, 12],
    })
    expect(() =>
      createPolicyNativeHelperPlan(helperCapability, {
        ...terminalOperation,
        helperFd: 6,
      }),
    ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyNativeHelperPlan(
        { ...helperCapability, helperPath: '/tmp/arbitrary-helper' },
        {
          kind: 'metadata-check',
          role: 'command-lock',
          evidence: {
            uid: '501',
            device: '7',
            inode: '9',
            links: '1',
            mode: String(0o600),
            size: '0',
          },
          authorityFd: 9,
        },
      ),
    ).toThrow('policy-native-launch-contract')
    expect(policyDarwinFileFlags).toEqual({
      noFollow: 0x00000100,
      closeOnExec: 0x01000000,
      exclusiveLock: 0x00000020,
      nonblocking: 0x00000004,
    })
    expect(policyCommandLockOpenContract).toMatchObject({
      mode: 0o600,
      writesPermitted: false,
      persistent: true,
    })
    expect(policyExclusivePromotionRoots).toEqual([
      '.local/m45/.policy-exclusive-promotion-build',
      '.local/m45/.policy-exclusive-promotion-preflight',
    ])
    expect(policyExclusivePromotionBuildContract).toMatchObject({
      resolver: '/usr/bin/xcrun',
      compilerResolverCommand: ['/usr/bin/xcrun', '--find', 'clang'],
      sdkResolverCommand: [
        '/usr/bin/xcrun',
        '--sdk',
        'macosx',
        '--show-sdk-path',
      ],
    })
    expect(
      policyExclusivePromotionBuildContract.fixedCompilerArguments,
    ).toEqual(['-std=c17', '-Wall', '-Wextra', '-Werror', '-Wpedantic', '-O2'])
    expect(policyExclusivePromotionBuildContract).toMatchObject({
      timeoutMilliseconds: 30_000,
      stdoutByteLimit: 65_536,
      stderrByteLimit: 65_536,
      combinedOutputByteLimit: 98_304,
      shell: false,
    })
    const toolchain = createPolicyExclusivePromotionToolchainPlanForFixture({
      compiler: '/Applications/Xcode.app/Contents/Developer/usr/bin/clang',
      sdkRoot:
        '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk',
    })
    expect(toolchain.compile).toEqual(
      expect.arrayContaining([
        '-isysroot',
        '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk',
        '-o',
      ]),
    )
    expect(toolchain.diagnostic).toContain('-###')
    expect(policyExclusivePromotionLaunchContract).toMatchObject({
      sourceParentFd: 3,
      destinationParentFd: 4,
      timeoutMilliseconds: 5_000,
      stdoutByteLimit: 0,
      stderrByteLimit: 0,
    })
    expect(
      createPolicyMetadataInvocationForFixture('command-lock', {
        uid: '501',
        device: '7',
        inode: '9',
        links: '1',
        mode: String(0o600),
        size: '0',
      }),
    ).toEqual({
      arguments: [
        'metadata-check',
        'command-lock',
        '501',
        '7',
        '9',
        '1',
        String(0o600),
        '0',
      ],
      highestChildFd: 3,
    })
    expect(() =>
      createPolicyMetadataInvocationForFixture('command-lock', {
        uid: '501',
        device: '7',
        inode: '9',
        links: '1',
        mode: String(0o600),
        size: '1',
      }),
    ).toThrow('policy-custody')
    for (const [role, contract] of Object.entries(policyMetadataRoles)) {
      const links = typeof contract.links === 'number' ? contract.links : 2
      const size =
        contract.size === 'na' ? 'na' : contract.size === 'zero' ? '0' : '1'
      expect(
        createPolicyMetadataInvocationForFixture(role as never, {
          uid: '501',
          device: '7',
          inode: '9',
          links: String(links),
          mode: String(contract.mode),
          size,
        }).arguments[1],
      ).toBe(role)
    }
    const fillers = [10, 11, 12].map((fd) => ({
      fd,
      kind: 'character-device' as const,
      distinctIdentity: 'fixed-dev-null',
    }))
    expect(
      createPolicyNativeFdMapForFixture('delete-entry', fillers, [
        { fd: 13, kind: 'file', distinctIdentity: 'lock' },
        { fd: 14, kind: 'directory', distinctIdentity: 'parent' },
        { fd: 15, kind: 'file', distinctIdentity: 'child' },
      ]),
    ).toEqual(['ignore', 'pipe', 'pipe', 13, 14, 15])
    expect(() =>
      createPolicyNativeFdMapForFixture('promotion', fillers, [
        { fd: 4, kind: 'directory', distinctIdentity: 'source' },
        { fd: 14, kind: 'directory', distinctIdentity: 'destination' },
      ]),
    ).toThrow('policy-custody')
    expect(() =>
      createPolicyNativeFdMapForFixture('delete-entry', fillers, [
        { fd: 13, kind: 'directory', distinctIdentity: 'not-lock' },
        { fd: 14, kind: 'directory', distinctIdentity: 'parent' },
        { fd: 15, kind: 'file', distinctIdentity: 'child' },
      ]),
    ).toThrow('policy-custody')
    expect(() =>
      createPolicyNativeFdMapForFixture('acl-fixture', fillers, [
        { fd: 10, kind: 'directory', distinctIdentity: 'acl-fixture' },
      ]),
    ).toThrow('policy-custody')
    expect(policyDeleteEntryRoles).toEqual([
      'build-source',
      'build-helper',
      'build-tmp',
      'build-root',
      'preflight-success-source-file',
      'preflight-success-destination-file',
      'preflight-collision-source-file',
      'preflight-collision-destination-file',
      'preflight-success-destination-promotion',
      'preflight-success-source-promotion',
      'preflight-collision-source-promotion',
      'preflight-collision-destination-promotion',
      'preflight-success-source-directory',
      'preflight-success-destination-directory',
      'preflight-collision-source-directory',
      'preflight-collision-destination-directory',
      'preflight-acl-fixture-directory',
      'preflight-root',
    ])
    const preflightAuthority = await syntheticPreflightAuthority()
    expect(preflightAuthority.commandLock).toMatchObject({
      workerSha256: (await inspectPolicyLockPreflightWorker()).sha256,
      heldContender: { exitCode: 20, processGroupAbsent: true },
      releasedContender: { exitCode: 0, processGroupAbsent: true },
      retentionIntervals: [
        'held-through-contender-close',
        'held-through-terminal-custody-decision',
      ],
    })
    expect(() =>
      assertPolicyExclusivePromotionPreflight({
        ...preflightAuthority,
        commandLock: {
          ...preflightAuthority.commandLock,
          releasedContender: {
            ...preflightAuthority.commandLock.releasedContender,
            exitCode: 20,
          },
        },
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
    // Every retained capability-probe branch is covered by the authority
    // hash. These are deliberately independent mutations, not a substitute
    // aggregate digest: a future producer cannot omit one transient probe
    // fact and still pass the production parser.
    const probeMutations: readonly ((
      value: typeof preflightAuthority,
    ) => unknown)[] = [
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          derivationHeldContender: {
            ...value.capabilityProbe.derivationHeldContender,
            releasedExitCode: 20,
          },
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          metadata: value.capabilityProbe.metadata.map((entry, index) =>
            index === 0 ? { ...entry, exitCode: 15 } : entry,
          ),
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          fdMaps: value.capabilityProbe.fdMaps.map((entry, index) =>
            index === 2 ? { ...entry, authorityTargets: [3, 4, 5] } : entry,
          ),
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          aclFixture: {
            ...value.capabilityProbe.aclFixture,
            reopenExitCode: 15,
          },
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          promotion: {
            ...value.capabilityProbe.promotion,
            collision: {
              ...value.capabilityProbe.promotion.collision,
              sourceAfterSha256: 'f'.repeat(64),
            },
          },
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          apfsDeleteRows: [
            ...value.capabilityProbe.apfsDeleteRows.slice(0, 14),
            { ...value.capabilityProbe.apfsDeleteRows[14], row: 'R16' },
          ],
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          cleanupAbsence: {
            ...value.capabilityProbe.cleanupAbsence,
            trackedWorkerSha256: 'e'.repeat(64),
          },
        },
      }),
    ]
    for (const mutate of probeMutations)
      expect(() =>
        assertPolicyExclusivePromotionPreflight(mutate(preflightAuthority)),
      ).toThrow('policy-exclusive-promotion-unavailable')
    // Reissue through the test-only hasher so these prove semantic rejection,
    // rather than merely detecting a stale outer hash. Every retained deletion
    // row and observed launch field is independently closed.
    const { preflightAuthoritySha256: _preflightHash, ...preflightCore } =
      preflightAuthority
    expect(_preflightHash).toMatch(/^[a-f0-9]{64}$/u)
    const observedMutations: readonly ((
      value: typeof preflightCore,
    ) => unknown)[] = [
      ...preflightCore.capabilityProbe.deletionRecords.flatMap(
        (_record, index) => [
          (value: typeof preflightCore) => ({
            ...value,
            capabilityProbe: {
              ...value.capabilityProbe,
              deletionRecords: value.capabilityProbe.deletionRecords.filter(
                (_, current) => current !== index,
              ),
            },
          }),
          (value: typeof preflightCore) => ({
            ...value,
            capabilityProbe: {
              ...value.capabilityProbe,
              deletionRecords: value.capabilityProbe.deletionRecords.map(
                (record, current) =>
                  current === index
                    ? { ...record, childName: 'substituted' }
                    : record,
              ),
            },
          }),
        ],
      ),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          deletionRecords: [
            value.capabilityProbe.deletionRecords[1]!,
            value.capabilityProbe.deletionRecords[0]!,
            ...value.capabilityProbe.deletionRecords.slice(2),
          ],
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          fdMaps: value.capabilityProbe.fdMaps.map((entry, index) =>
            index === 2
              ? {
                  ...entry,
                  observed: {
                    ...entry.observed,
                    argvCount: 16,
                  },
                }
              : entry,
          ),
        },
      }),
      (value) => ({
        ...value,
        capabilityProbe: {
          ...value.capabilityProbe,
          promotion: {
            ...value.capabilityProbe.promotion,
            success: {
              ...value.capabilityProbe.promotion.success,
              lifecycle: {
                ...value.capabilityProbe.promotion.success.lifecycle,
                childTargets: [3, 4, 5],
              },
            },
          },
        },
      }),
    ]
    for (const mutate of observedMutations)
      expect(() =>
        createPolicyExclusivePromotionPreflightAuthorityForFixture(
          mutate(preflightCore) as never,
        ),
      ).toThrow('policy-exclusive-promotion-unavailable')
    for (const role of policyDeleteEntryRoles) {
      const transition = policyDeleteEntryTransitions[role]
      expect(() =>
        assertPolicyDeleteEntryTransitionForFixture({
          role,
          beforeEntries: transition.before,
          afterEntries: transition.after,
          beforeLinks: 2 + transition.before.length,
          afterLinks: 2 + transition.after.length,
          preflightAuthority,
        }),
      ).not.toThrow()
    }
    for (const fault of [
      { beforeLinks: 5, afterLinks: 5 },
      { beforeLinks: 5, afterLinks: 3 },
      { beforeLinks: 0, afterLinks: -1 },
    ])
      expect(() =>
        assertPolicyDeleteEntryTransitionForFixture({
          role: 'build-source',
          beforeEntries: policyDeleteEntryTransitions['build-source'].before,
          afterEntries: policyDeleteEntryTransitions['build-source'].after,
          preflightAuthority,
          ...fault,
        }),
      ).toThrow('policy-exclusive-promotion-unavailable')
    expect(() =>
      assertPolicyDeleteEntryTransitionForFixture({
        role: 'preflight-success-source-directory',
        beforeEntries:
          policyDeleteEntryTransitions['preflight-success-source-directory']
            .before,
        afterEntries: ['unrelated-entry'],
        beforeLinks: 7,
        afterLinks: 6,
        preflightAuthority,
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
    expect(() =>
      assertPolicyDeleteEntryTransitionForFixture({
        role: 'build-source',
        beforeEntries: policyDeleteEntryTransitions['build-source'].before,
        afterEntries: policyDeleteEntryTransitions['build-source'].after,
        beforeLinks: 5,
        afterLinks: 4,
        preflightAuthority: {
          ...preflightAuthority,
          preflightAuthoritySha256: 'f'.repeat(64),
        },
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
    expect(
      policyPreflightFixtureTable()['preflight-success-source-file'],
    ).toMatchObject({ byteCount: 43 })
    const fixtureBytes =
      policyPreflightFixtureTable()['preflight-success-source-file']!
    expect(
      createPolicyDeleteEntryInvocationForFixture(
        'preflight-success-source-file',
        {
          uid: '501',
          device: '7',
          inode: '20',
          links: '3',
          mode: String(0o700),
          size: 'na',
        },
        {
          uid: '501',
          device: '7',
          inode: '21',
          links: '1',
          mode: String(0o600),
          size: String(fixtureBytes.byteCount),
        },
      ),
    ).toMatchObject({
      arguments: [
        'delete-entry',
        'preflight-success-source-file',
        '501',
        '7',
        '20',
        '3',
        String(0o700),
        'na',
        '501',
        '7',
        '21',
        '1',
        String(0o600),
        String(fixtureBytes.byteCount),
      ],
      highestChildFd: 5,
    })
    expect(() =>
      createPolicyDeleteEntryInvocationForFixture(
        'preflight-success-source-file',
        {
          uid: '501',
          device: '7',
          inode: '20',
          links: '3',
          mode: String(0o700),
          size: 'na',
        },
        {
          uid: '501',
          device: '8',
          inode: '21',
          links: '1',
          mode: String(0o600),
          size: String(fixtureBytes.byteCount),
        },
      ),
    ).toThrow('policy-custody')
    expect(
      createPolicyExclusivePromotionInvocationForFixture(
        {
          phase: 'capture',
          files: [
            {
              name: 'capture.json',
              byteCount: 1,
              sha256: 'a'.repeat(64),
            },
          ],
        },
        {
          sourceParent: { device: '7', inode: '11', links: '8' },
          destinationParent: { device: '7', inode: '12', links: '2' },
          staging: { device: '7', inode: '13' },
        },
      ),
    ).toMatchObject({
      arguments: [
        'capture',
        '.policy-baseline-review.staging',
        'capture',
        '7',
        '11',
        '8',
        '7',
        '12',
        '2',
        '7',
        '13',
      ],
      sourceParentFd: 3,
      destinationParentFd: 4,
    })
    expect(() =>
      createPolicyExclusivePromotionInvocationForFixture(
        {
          phase: 'capture',
          files: [
            {
              name: 'wrong.json',
              byteCount: 1,
              sha256: 'a'.repeat(64),
            },
          ],
        } as never,
        {
          sourceParent: { device: '7', inode: '11', links: '8' },
          destinationParent: { device: '7', inode: '12', links: '2' },
          staging: { device: '7', inode: '13' },
        },
      ),
    ).toThrow('policy-custody')
    expect(policyExclusivePromotionPendingProvenance.status).toBe(
      'pending-provisional-builds-a-b-and-acceptance-c',
    )
    expect(() => assertPolicyExclusivePromotionProvenanceAccepted()).toThrow(
      'policy-exclusive-promotion-unavailable',
    )
    expect(
      mapPolicyExclusivePromotionHelperResult({
        code: 0,
        signal: null,
        stdoutBytes: 0,
        stderrBytes: 0,
        timedOut: false,
      }),
    ).toBe('success')
    expect(() =>
      mapPolicyExclusivePromotionHelperResult({
        code: 11,
        signal: null,
        stdoutBytes: 0,
        stderrBytes: 0,
        timedOut: false,
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')

    const provenanceToolchain = await syntheticToolchainAuthority()
    const fixturePreflight = await syntheticPreflightAuthority()
    const {
      preflightAuthoritySha256: _fixturePreflightSha256,
      ...fixturePreflightCore
    } = fixturePreflight
    void _fixturePreflightSha256
    const originalNodeEnvironment = process.env.NODE_ENV
    vi.stubEnv('NODE_ENV', 'production')
    expect(() =>
      createPolicyToolchainAuthorityForFixture({
        ...provenanceToolchain,
        authorityPackageSha256: undefined,
      } as never),
    ).toThrow('policy-wrapper-isolation')
    expect(() =>
      createPolicyExclusivePromotionPreflightAuthorityForFixture(
        fixturePreflightCore,
      ),
    ).toThrow('policy-wrapper-isolation')
    await expect(
      createPolicyPromotionPackage({
        stage: 'A',
        rootIdentitySha256: 'a'.repeat(64),
        toolchainAuthority: provenanceToolchain,
        helperBytes: Buffer.from('untrusted helper'),
        preflightAuthority: null,
        reviewAuthoritySha256: null,
      }),
    ).rejects.toThrow('policy-wrapper-isolation')
    vi.stubEnv('NODE_ENV', originalNodeEnvironment ?? 'test')
    const provenanceHelperBytes = Buffer.from('reproducible helper bytes')
    await expect(
      createPolicyPromotionPackage({
        stage: 'A',
        rootIdentitySha256: 'a'.repeat(64),
        toolchainAuthority: {
          ...provenanceToolchain,
          launcherSha256: 'f'.repeat(64),
        },
        helperBytes: provenanceHelperBytes,
        preflightAuthority: null,
        reviewAuthoritySha256: null,
      }),
    ).rejects.toThrow('policy-exclusive-promotion-unavailable')
    const provisionalA = await createPolicyPromotionPackage({
      stage: 'A',
      rootIdentitySha256: 'a'.repeat(64),
      toolchainAuthority: provenanceToolchain,
      helperBytes: provenanceHelperBytes,
      preflightAuthority: null,
      reviewAuthoritySha256: null,
    })
    const provisionalB = await createPolicyPromotionPackage({
      stage: 'B',
      rootIdentitySha256: 'b'.repeat(64),
      toolchainAuthority: provenanceToolchain,
      helperBytes: provenanceHelperBytes,
      preflightAuthority: await syntheticPreflightAuthority(),
      reviewAuthoritySha256: null,
    })
    await expect(
      createPolicyPromotionPackage({
        stage: 'B',
        rootIdentitySha256: 'b'.repeat(64),
        toolchainAuthority: provenanceToolchain,
        helperBytes: provenanceHelperBytes,
        preflightAuthority: null,
        reviewAuthoritySha256: null,
      }),
    ).rejects.toThrow('policy-exclusive-promotion-unavailable')
    const candidate = await createPolicyPromotionProvenanceCandidate(
      provisionalA,
      provisionalB,
    )
    expect(candidate.material.helperSha256).toBe(
      createHash('sha256').update(provenanceHelperBytes).digest('hex'),
    )
    expect(candidate.preflightAuthoritySha256).toBe(
      provisionalB.preflightAuthoritySha256,
    )
    const mismatchedB = await createPolicyPromotionPackage({
      stage: 'B',
      rootIdentitySha256: 'b'.repeat(64),
      toolchainAuthority: provenanceToolchain,
      helperBytes: Buffer.from('different helper bytes'),
      preflightAuthority: await syntheticPreflightAuthority(),
      reviewAuthoritySha256: null,
    })
    await expect(
      createPolicyPromotionProvenanceCandidate(provisionalA, mismatchedB),
    ).rejects.toThrow('policy-exclusive-promotion-unavailable')
    const accepted = await createAcceptedPolicyPromotionLiterals(
      candidate,
      'c'.repeat(64),
    )
    expect(accepted.preflightAuthoritySha256).toBe(
      provisionalB.preflightAuthoritySha256,
    )
    const acceptancePreflight = await syntheticPreflightAuthority('8')
    const acceptanceC = await createPolicyPromotionPackage({
      stage: 'C',
      rootIdentitySha256: 'd'.repeat(64),
      toolchainAuthority: provenanceToolchain,
      helperBytes: provenanceHelperBytes,
      preflightAuthority: acceptancePreflight,
      reviewAuthoritySha256: accepted.reviewAuthoritySha256,
    })
    await expect(
      syntheticHelperCapability(
        process.cwd(),
        provenanceHelperBytes,
        acceptanceC,
      ),
    ).resolves.toMatchObject({
      provenancePackageSha256: acceptanceC.packageSha256,
    })
    await expect(
      assertPolicyPromotionAcceptanceBuild({
        acceptanceBuild: acceptanceC,
        acceptedLiterals: accepted,
        provisionalRootIdentitySha256: [
          provisionalA.rootIdentitySha256!,
          provisionalB.rootIdentitySha256!,
        ],
        preflightAuthority: acceptancePreflight,
      }),
    ).resolves.toBeUndefined()
    await expect(
      assertPolicyPromotionAcceptanceBuild({
        acceptanceBuild: {
          ...acceptanceC,
          packageSha256: 'f'.repeat(64),
        },
        acceptedLiterals: accepted,
        provisionalRootIdentitySha256: [
          provisionalA.rootIdentitySha256!,
          provisionalB.rootIdentitySha256!,
        ],
        preflightAuthority: acceptancePreflight,
      }),
    ).rejects.toThrow('policy-exclusive-promotion-unavailable')
    expect(() =>
      assertPolicyPromotionBootstrapBoundary({
        stage: 'A',
        nodeLockPreflight: true,
        helperMetadataPreflight: false,
        helperFdPreflight: false,
        acceptedLiteralsPresent: false,
        policyCapability: false,
      }),
    ).not.toThrow()
    expect(() =>
      assertPolicyPromotionBootstrapBoundary({
        stage: 'A',
        nodeLockPreflight: true,
        helperMetadataPreflight: true,
        helperFdPreflight: false,
        acceptedLiteralsPresent: false,
        policyCapability: false,
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
    expect(() =>
      mapPolicyExclusivePromotionHelperResult({
        code: 0,
        signal: null,
        stdoutBytes: 1,
        stderrBytes: 0,
        timedOut: false,
      }),
    ).toThrow('policy-custody')
    const tamperedPreflight = {
      ...(await syntheticPreflightAuthority()),
      destinationUnchangedAfterCollision: false,
    }
    expect(() =>
      assertPolicyExclusivePromotionPreflight({
        ...tamperedPreflight,
      }),
    ).toThrow('policy-exclusive-promotion-unavailable')
  })

  it('requires the diagnostic control root to remain baseline-only with fixed direct absences', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), 'm45-policy-diagnostic-control-'),
    )
    const controlRoot = join(
      repositoryRoot,
      '.local/m45/policy-native-derivation',
    )
    const outputPath = join(controlRoot, '.policy-compiler-diagnostic-output')
    const temporaryObjectPath = join(controlRoot, 'fixture.o')
    try {
      await mkdir(controlRoot, { recursive: true, mode: 0o700 })
      await writeFile(
        join(controlRoot, 'shared-root-baseline.v1.json'),
        'fixture',
      )
      await expect(
        inspectPolicyDiagnosticControlStateForFixture({
          repositoryRoot,
          absentPaths: [outputPath, temporaryObjectPath],
        }),
      ).resolves.toBeUndefined()
      await expect(
        inspectPolicyDiagnosticControlStateForFixture({
          repositoryRoot,
          absentPaths: [join(repositoryRoot, 'outside.o')],
        }),
      ).rejects.toThrow('policy-native-authority')
      await writeFile(outputPath, 'unexpected')
      await expect(
        inspectPolicyDiagnosticControlStateForFixture({
          repositoryRoot,
          absentPaths: [outputPath],
        }),
      ).rejects.toThrow('policy-native-authority')
      await unlink(outputPath)
      await symlink('missing', temporaryObjectPath)
      await expect(
        inspectPolicyDiagnosticControlStateForFixture({
          repositoryRoot,
          absentPaths: [temporaryObjectPath],
        }),
      ).rejects.toThrow('policy-native-authority')
    } finally {
      vi.unstubAllEnvs()
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  const exactProvisionalABuildResidue = () => {
    const entries = {
      build: {
        kind: 'directory',
        uid: 501,
        device: 16777231,
        inode: 13734817,
        mode: 0o700,
        links: 5,
        size: 160,
      },
      source: {
        kind: 'file',
        uid: 501,
        device: 16777231,
        inode: 13734819,
        mode: 0o400,
        links: 1,
        size: 50_951,
      },
      helper: {
        kind: 'file',
        uid: 501,
        device: 16777231,
        inode: 13734827,
        mode: 0o500,
        links: 1,
        size: 53_736,
      },
      tmp: {
        kind: 'directory',
        uid: 501,
        device: 16777231,
        inode: 13734818,
        mode: 0o700,
        links: 2,
        size: 64,
      },
    }
    return {
      expectedUid: 501,
      held: structuredClone(entries),
      named: structuredClone(entries),
      buildEntries: [
        'exclusive-promotion-helper',
        'exclusive-promotion-helper.c',
        'tmp',
      ],
      tmpEntries: [],
      sourceSha256:
        '74b743c5831911de3cc966307aef0aff6cf105678157b5b4ac66f49035110d37',
      helperSha256:
        '981a19d6b514e20892b4fedda6273d97f32712aac60c6943369de29bdeeaca99',
    }
  }

  it('accepts only the exact provisional-A build residue projection', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(
      inspectPolicyProvisionalABuildResidueForFixture(
        exactProvisionalABuildResidue(),
      ),
    ).toBe(true)
    vi.unstubAllEnvs()
  })

  it('admits exact residue metadata before either bounded held-file read', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const reads: Array<readonly [string, number]> = []
    try {
      await expect(
        inspectPolicyProvisionalABuildResidueReadsForFixture(
          exactProvisionalABuildResidue(),
          (role, size) => reads.push([role, size]),
        ),
      ).resolves.toBe(true)
      expect(reads).toEqual([
        ['source', 50_951],
        ['helper', 53_736],
      ])

      const oversized = exactProvisionalABuildResidue()
      oversized.held.source.size = Number.MAX_SAFE_INTEGER
      reads.length = 0
      await expect(
        inspectPolicyProvisionalABuildResidueReadsForFixture(
          oversized,
          (role, size) => reads.push([role, size]),
        ),
      ).rejects.toThrow('policy-native-authority')
      expect(reads).toEqual([])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(
    (['held', 'named'] as const).flatMap((scope) =>
      (['build', 'source', 'helper', 'tmp'] as const).flatMap((role) =>
        (
          ['kind', 'uid', 'device', 'inode', 'mode', 'links', 'size'] as const
        ).map((field) => [scope, role, field] as const),
      ),
    ),
  )('rejects provisional-A residue %s %s %s drift', (scope, role, field) => {
    vi.stubEnv('NODE_ENV', 'test')
    const residue = exactProvisionalABuildResidue()
    const entry = residue[scope][role]
    if (field === 'kind') entry.kind = 'other'
    else entry[field] += 1
    expect(() =>
      inspectPolicyProvisionalABuildResidueForFixture(residue),
    ).toThrow('policy-native-authority')
    vi.unstubAllEnvs()
  })

  it.each([
    ['buildEntries', ['exclusive-promotion-helper.c', 'tmp']],
    ['tmpEntries', ['unexpected']],
    ['sourceSha256', '0'.repeat(64)],
    ['helperSha256', '0'.repeat(64)],
  ] as const)('rejects provisional-A residue %s drift', (field, value) => {
    vi.stubEnv('NODE_ENV', 'test')
    const residue = exactProvisionalABuildResidue()
    Object.assign(residue, { [field]: value })
    expect(() =>
      inspectPolicyProvisionalABuildResidueForFixture(residue),
    ).toThrow('policy-native-authority')
    vi.unstubAllEnvs()
  })

  it.each([0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])(
    'keeps residue helper exit %s behind exact pre/post custody checks',
    async (code) => {
      vi.stubEnv('NODE_ENV', 'test')
      await expect(
        runPolicyProvisionalABuildResidueLifecycleForFixture({
          failure: null,
          result: {
            code,
            stdoutBytes: 0,
            stderrBytes: 0,
            processGroupAbsent: true,
            streamsClosed: true,
          },
        }),
      ).resolves.toEqual({
        status: 'diagnosed',
        events: ['precheck', 'child', 'postcheck'],
        helperExitCode: code,
      })
      vi.unstubAllEnvs()
    },
  )

  it.each([
    ['precheck', ['precheck']],
    ['child', ['precheck', 'child']],
    ['postcheck', ['precheck', 'child', 'postcheck']],
  ] as const)(
    'stops residue helper lifecycle on %s failure without advancing',
    async (failure, events) => {
      vi.stubEnv('NODE_ENV', 'test')
      await expect(
        runPolicyProvisionalABuildResidueLifecycleForFixture({
          failure,
          result: {
            code: 0,
            stdoutBytes: 0,
            stderrBytes: 0,
            processGroupAbsent: true,
            streamsClosed: true,
          },
        }),
      ).resolves.toEqual({ status: 'stopped', events })
      vi.unstubAllEnvs()
    },
  )

  it.each([
    { code: 9 },
    { stdoutBytes: 1 },
    { stderrBytes: 1 },
    { processGroupAbsent: false },
    { streamsClosed: false },
  ])('rejects residue helper lifecycle drift %j', async (change) => {
    vi.stubEnv('NODE_ENV', 'test')
    await expect(
      runPolicyProvisionalABuildResidueLifecycleForFixture({
        failure: null,
        result: {
          code: 0,
          stdoutBytes: 0,
          stderrBytes: 0,
          processGroupAbsent: true,
          streamsClosed: true,
          ...change,
        },
      }),
    ).resolves.toEqual({
      status: 'stopped',
      events: ['precheck', 'child', 'postcheck'],
    })
    vi.unstubAllEnvs()
  })

  it('keeps child-process authority isolated to the exact native launcher dependency boundary', async () => {
    const repositoryRoot = process.cwd()
    const authorityPath = join(repositoryRoot, 'scripts/m45-policy-baseline.ts')
    const roots = [
      authorityPath,
      policyNativeLaunchContractPath,
      policyNativeLauncherPath,
      policyNativeAuthorityPath,
      policyLockPreflightWorkerPath,
    ]
    const importPattern =
      /(?:import\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/gu
    const sources = new Map<string, string>()
    const edges = new Map<string, string[]>()
    const resolveTrackedImport = async (from: string, specifier: string) => {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
      const base = specifier.startsWith('@/')
        ? resolve(repositoryRoot, 'src', specifier.slice(2))
        : resolve(dirname(from), specifier)
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.mjs`,
        join(base, 'index.ts'),
      ]) {
        try {
          await readFile(candidate)
          return candidate
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      throw new Error('unresolved tracked import')
    }
    const load = async (path: string): Promise<void> => {
      if (sources.has(path)) return
      const source = await readFile(path, 'utf8')
      sources.set(path, source)
      const dependencies: string[] = []
      for (const match of source.matchAll(importPattern)) {
        const dependency = await resolveTrackedImport(path, match[1]!)
        if (dependency !== null) dependencies.push(dependency)
      }
      edges.set(path, dependencies)
      for (const dependency of dependencies) await load(dependency)
    }
    for (const root of roots) await load(root)
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const assertAcyclic = (path: string) => {
      if (visiting.has(path)) throw new Error('policy dependency cycle')
      if (visited.has(path)) return
      visiting.add(path)
      for (const dependency of edges.get(path) ?? []) assertAcyclic(dependency)
      visiting.delete(path)
      visited.add(path)
    }
    for (const root of roots) assertAcyclic(root)
    const processImport =
      /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:node:)?child_process['"]/u
    for (const [path, source] of sources) {
      if (path === policyNativeLauncherPath)
        expect(source).toMatch(processImport)
      else expect(source).not.toMatch(processImport)
    }
    const launcher = await readFile(policyNativeLauncherPath, 'utf8')
    const contract = await readFile(policyNativeLaunchContractPath, 'utf8')
    const authority = await readFile(authorityPath, 'utf8')
    expect(launcher).not.toContain("from './m45-policy-baseline'")
    expect(contract).not.toContain('m45-policy-baseline-native-launcher')
    expect(contract).not.toContain("from './m45-policy-baseline'")
    expect(authority).not.toMatch(
      /export\s+(?:\*|\{[^}]*\})\s+from\s+['"][^'"]*native-launcher/u,
    )
    expect(launcher).not.toMatch(/export\s+(?:async\s+)?function\s+spawn/u)
    expect(launcher).not.toMatch(/export\s+\{[^}]*runClosedPlan/u)
    const nativeAuthority = await readFile(policyNativeAuthorityPath, 'utf8')
    expect(authority).toContain('runPolicyNativeToolchainDerivation')
    expect(authority).not.toContain('initializePolicyNativeOperationBroker')
    expect(nativeAuthority).toContain('initializePolicyNativeOperationBroker')
    const authorityExports = [
      ...nativeAuthority.matchAll(/export async function (\w+)/gu),
    ].map((match) => match[1])
    expect(authorityExports).toEqual([
      'inspectPolicySdkProtectedPathForFixture',
      'inspectPolicyDiagnosticControlStateForFixture',
      'runPolicyNativeToolchainDerivation',
      'diagnosePolicyProvisionalBuildAPrebuild',
      'runPolicyProvisionalAPrebuildDiagnosticForFixture',
      'runPolicyNativeChildFdLifecycleForFixture',
      'runPolicyNativePositioningForFixture',
      'runPolicyBCandidateLifecycleForFixture',
      'runPolicyCAcceptedLifecycleForFixture',
      'inspectPolicyProvisionalABuildResidueReadsForFixture',
      'reopenPolicyBCandidateCheckpointForFixture',
      'runPolicyProvisionalABuildResidueLifecycleForFixture',
      'finalizePolicyFdAdmissionProbeScratchForFixture',
      'recoverPolicyFdMapScratchForFixture',
      'runPolicyProvisionalBuildA',
      'diagnosePolicyProvisionalABuildResidue',
      'recoverPolicyProvisionalAFdMapScratch',
      'diagnosePolicyProvisionalAFdMap',
      'runPolicyProvisionalBuildB',
      'runPolicyProvisionalBuildC',
    ])
    expect(nativeAuthority).not.toMatch(
      /export async function .*?(?:Compiler|Helper|Contender|Cleanup)/u,
    )
    const diagnosticBridge = nativeAuthority.slice(
      nativeAuthority.indexOf(
        'export async function diagnosePolicyProvisionalBuildAPrebuild',
      ),
      nativeAuthority.indexOf('type ChildFdHandle'),
    )
    const diagnosticCoreName =
      'diagnosePolicyProvisionalBuildAPrebuildWithOperations'
    expect(
      nativeAuthority.match(new RegExp(diagnosticCoreName, 'gu')),
    ).toHaveLength(3)
    expect(diagnosticBridge).toContain(`return ${diagnosticCoreName}(input, {`)
    expect(diagnosticBridge).toContain(`result = await ${diagnosticCoreName}(`)
    const lockProbe = nativeAuthority.slice(
      nativeAuthority.indexOf('async function commandLockCapabilityProbe'),
      nativeAuthority.indexOf('type PositioningFixtureHarness'),
    )
    expect(lockProbe.match(/broker\.runLockContender/gu)).toHaveLength(2)
    for (const forbidden of [
      'buildAndCleanupA',
      'runPolicyProvisionalBuildA',
      'runPolicyProvisionalBuildB',
      'runPolicyProvisionalBuildC',
      'build-root',
      'preflight-root',
      'helper-capability',
      'acl-fixture',
      'accepted-literals',
      'review-candidate',
    ])
      expect(diagnosticBridge).not.toContain(forbidden)
    const residueDiagnosticBridge = nativeAuthority.slice(
      nativeAuthority.indexOf(
        'export async function diagnosePolicyProvisionalABuildResidue',
      ),
      nativeAuthority.indexOf(
        'export async function diagnosePolicyProvisionalAFdMap',
      ),
    )
    expect(residueDiagnosticBridge).toContain(
      'runPolicyNativeToolchainDerivation',
    )
    expect(residueDiagnosticBridge).toContain('commandLockCapabilityProbe')
    expect(residueDiagnosticBridge).toContain('openDerivationLock')
    expect(residueDiagnosticBridge).toContain("kind: 'metadata-check'")
    expect(residueDiagnosticBridge).toContain("role: 'command-lock'")
    expect(residueDiagnosticBridge).toContain(
      'provisionalABuildResidue.helper.sha256',
    )
    expect(residueDiagnosticBridge).toContain("'commandLock',\n  ])")
    expect(residueDiagnosticBridge).not.toContain("'probeSourceSha256'")
    expect(
      residueDiagnosticBridge.indexOf('buildHandle = await open'),
    ).toBeLessThan(
      residueDiagnosticBridge.indexOf('commandLockCapabilityProbe'),
    )
    expect(
      residueDiagnosticBridge.indexOf(
        'assertExactPolicyProvisionalABuildResidueMetadata(initialResidueMetadata)',
      ),
    ).toBeLessThan(
      residueDiagnosticBridge.indexOf('completeHeldBytes(sourceHandle'),
    )
    expect(
      residueDiagnosticBridge.indexOf(
        'assertExactPolicyProvisionalABuildResidueMetadata(currentResidueMetadata)',
      ),
    ).toBeLessThan(
      residueDiagnosticBridge.indexOf(
        'completeHeldBytes(\n          heldResidue.source',
      ),
    )
    for (const forbidden of [
      'buildAndCleanupA',
      'deleteBuildEntry',
      'deleteBuildTerminal',
      'runCompilerBuild',
      'runPolicyProvisionalBuildA',
      'runPolicyProvisionalBuildB',
      'runPolicyProvisionalBuildC',
      'mkdir(',
      'chmod(',
      'writeFile(',
      'unlink(',
      'rename(',
      'register',
    ])
      expect(residueDiagnosticBridge).not.toContain(forbidden)
    // Decision 119 retains the two non-overlapping filler lifetimes while
    // requiring every observed parent source FD above its child target.
    expect(nativeAuthority).toContain('positioningFillers')
    expect(nativeAuthority).toContain('withChildFillers')
    expect(nativeAuthority).toContain('highestChildAuthorityTarget === 6')
    expect(nativeAuthority).toContain('Number.isSafeInteger(fd)')
    expect(nativeAuthority).toContain(
      'positioningFds.some((fd) => !isSafeParentFd(fd, 6))',
    )
    expect(nativeAuthority).toContain(
      '!isSafeParentFd(fd, highestChildAuthorityTarget)',
    )
    expect(nativeAuthority).not.toContain('canonical([3, 4, 5, 6])')
    expect(nativeAuthority).toContain('right.fd - left.fd')
    expect(nativeAuthority).toContain('broker.abortBCandidateSession')
    expect(nativeAuthority).toContain('broker.beginBCandidateCleanup')
    expect(nativeAuthority).toContain('broker.runBCandidateCleanup')
    expect(nativeAuthority).toContain('broker.runCAcceptedCleanupInspection')
    expect(nativeAuthority).toContain('broker.rebaseCAcceptedCleanup')
    expect(nativeAuthority).toContain('runBrandedInspection')
    const cWorkflowSource = nativeAuthority.slice(
      nativeAuthority.indexOf("workflow === 'C-accepted'"),
    )
    expect(cWorkflowSource).not.toContain('runAcceptedHelper(')
    for (const source of [contract, launcher, nativeAuthority, authority]) {
      expect(source).not.toContain('registerBridgeProductionPreflight')
      expect(source).not.toContain('hasBridgeProductionPreflight')
      expect(source).not.toContain('productionPreflightHashes')
      expect(source).not.toContain('registerBCandidatePreflight')
    }
    expect(authority).toContain(
      'export async function createPolicyPromotionPackage',
    )
    expect(authority).toContain(
      "if (process.env.NODE_ENV !== 'test')\n    throw new PolicyBaselineError('policy-wrapper-isolation')",
    )
    expect(nativeAuthority).toContain('reopenBCandidateCheckpoint')
    expect(nativeAuthority).toContain('policy-b-candidate-checkpoint.v1')
    expect(nativeAuthority).toContain('recoveryCheckpointSha256')
    expect(nativeAuthority).toContain('canonicalMetadata')
    expect(nativeAuthority).toContain('specialMode')
    expect(nativeAuthority).toContain('expectedDirectoryLinks')
    expect(nativeAuthority).toContain('zeroAcl')
    expect(nativeAuthority).toContain(
      'cleanup-close-ambiguous-process-termination-required',
    )
    expect(nativeAuthority).toContain("action: 'inspect-empty'")
    expect(nativeAuthority).toContain("'inspect-fixture'")
    expect(launcher).toContain('expectedBCandidateOperations')
    expect(launcher).toContain('abortBCandidateSession')
    expect(launcher).toContain('cleanupOperationCursor')
    expect(launcher).toContain('failedCandidateSessions')
    expect(launcher).toContain('failedCleanupSessions')
    expect(launcher).toContain('createPolicyBCandidateCleanupCapability')
    expect(launcher).toContain('createPolicyBCandidateCleanupPlan')
    expect(launcher).toContain('createPolicyCAcceptedCleanupPlan')
    expect(launcher).toContain("schema: 'policy-c-accepted-cleanup.v1'")
    for (const field of [
      'cAcceptedHelperLaunchSha256',
      'acceptedHelperSha256',
      'observedHelperSha256',
      'checkpointSha256',
      'failedOperationFamily',
      'failedOperationIndex',
      'childLaunched',
      'lifecycleClosed',
      'commandLockEvidenceSha256',
      'permittedSuffix',
      'cAcceptedCleanupSessionSha256',
    ])
      expect(launcher).toContain(field)
    expect(nativeAuthority).toContain('policy-c-accepted-checkpoint.v1')
    expect(contract).toContain('bCandidateCleanupCapabilities')
    expect(contract).toContain('preflight-success-source-promotion')
    const activeDeleteRoles = contract.slice(
      contract.indexOf('const bCandidateDeleteRoles'),
      contract.indexOf('const bCandidateCleanupDeleteRoles'),
    )
    const cleanupDeleteRoles = contract.slice(
      contract.indexOf('const bCandidateCleanupDeleteRoles'),
      contract.indexOf('export function createPolicyBCandidateHelperPlan'),
    )
    expect(activeDeleteRoles).not.toContain(
      'preflight-success-source-promotion',
    )
    expect(cleanupDeleteRoles).toContain('preflight-success-source-promotion')
    expect(launcher).toMatch(
      /export function initializePolicyNativeOperationBroker/u,
    )
    expect(launcher).not.toMatch(/export async function runPolicy/u)
    const initializerConsumers = [...sources]
      .filter(
        ([path, source]) =>
          path !== policyNativeLauncherPath &&
          source.includes('initializePolicyNativeOperationBroker'),
      )
      .map(([path]) => path)
    expect(initializerConsumers).toEqual([policyNativeAuthorityPath])
    for (const [path, source] of sources) {
      if (
        path !== policyNativeLauncherPath &&
        path !== policyNativeAuthorityPath &&
        path !== authorityPath
      )
        continue
      expect(source).not.toMatch(/\b(?:eval|Function|createRequire)\s*\(/u)
      expect(source).not.toMatch(/from\s+['"]node:module['"]/u)
      expect(source).not.toMatch(/import\s*\(\s*[^'"\s]/u)
    }
    expect(authority).toContain(
      "if (process.env.NODE_ENV !== 'test')\n    throw new PolicyBaselineError('policy-wrapper-isolation')",
    )
    expect(authority).toContain('productionPolicyToolchainAuthorityHashes')
    for (const constructorName of [
      'createPolicyCompilerCapability',
      'createPolicyHelperCapability',
      'createPolicyBCandidateCleanupCapability',
      'createPolicyBCandidateCleanupPlan',
      'createPolicyCAcceptedCapability',
      'createPolicyCAcceptedCleanupPlan',
    ]) {
      const consumers = [...sources]
        .filter(
          ([path, source]) =>
            path !== policyNativeLaunchContractPath &&
            source.includes(constructorName),
        )
        .map(([path]) => path)
      expect(consumers).toEqual([policyNativeLauncherPath])
    }
    const productionSources = (
      await Promise.all(
        ['scripts', 'src'].map(async (root) => {
          const rootPath = join(repositoryRoot, root)
          const entries = await readdir(rootPath, { recursive: true })
          return entries
            .filter(
              (entry) =>
                typeof entry === 'string' &&
                (entry.endsWith('.ts') || entry.endsWith('.mjs')) &&
                !entry.endsWith('.test.ts'),
            )
            .map((entry) => join(rootPath, entry as string))
        }),
      )
    ).flat()
    for (const constructorName of [
      'createPolicyCompilerCapability',
      'createPolicyHelperCapability',
      'createPolicyBCandidateCleanupCapability',
      'createPolicyBCandidateCleanupPlan',
    ]) {
      const consumers: string[] = []
      for (const path of productionSources) {
        if (path === policyNativeLaunchContractPath) continue
        if ((await readFile(path, 'utf8')).includes(constructorName))
          consumers.push(path)
      }
      expect(consumers).toEqual([policyNativeLauncherPath])
    }
    const testFixtureConsumers: string[] = []
    for (const path of productionSources) {
      if (path === policyNativeAuthorityPath) continue
      if (
        (await readFile(path, 'utf8')).match(
          /(?:(?:assert|finalize)PolicyFdAdmissionProbe(?:FileSnapshot|ScratchSnapshot|Scratch)|assertPolicyFdMapRecovery(?:DirectorySnapshot|RequestShape|ScratchIdentity)|recoverPolicyFdMapScratch|inspectPolicy(?:DirectHeaderTables|HeaderSetMutation|ProtectedPathMetadata|ProvisionalABuildResidueReads|SdkProtectedPath)|parsePolicy(?:ClangDiagnostic|CompilerResourceOutput)|runPolicyNative(?:ChildFdLifecycle|Positioning)|runPolicyBCandidateLifecycle|reopenPolicyBCandidateCheckpoint)ForFixture/u,
        )
      )
        testFixtureConsumers.push(path)
    }
    expect(testFixtureConsumers).toEqual([])
    expect(nativeAuthority).toContain(
      "if (process.env.NODE_ENV !== 'test')\n    throw new Error('policy-wrapper-isolation')",
    )
  })

  it('keeps the FD-admission probe closed, silent, and distinct from the retained helper', async () => {
    const probe = await readFile(
      new URL(
        '../scripts/policy-baseline-review/fd-admission-probe.c',
        import.meta.url,
      ),
      'utf8',
    )
    for (const required of [
      'PROBE_EXACT = 0',
      'PROBE_FD3_INVALID = 21',
      'PROBE_UNEXPECTED_FD = 23',
      'PROBE_OPEN_MAX_INVALID = 24',
      'PROBE_SCAN_INDETERMINATE = 25',
      'sysconf(_SC_OPEN_MAX)',
      'fcntl(fd, F_GETFD)',
      'read_flags(3, &observed_errno)',
      'observed_errno == EBADF',
      'for (fd = 4; fd < open_max; fd++)',
    ])
      expect(probe).toContain(required)
    for (const forbidden of ['printf(', 'puts(', 'write(', 'open(', 'stat('])
      expect(probe).not.toContain(forbidden)
    const harness = await readFile(
      new URL(
        '../scripts/policy-baseline-review/fd-admission-probe-test-harness.c',
        import.meta.url,
      ),
      'utf8',
    )
    for (const mode of ['"exact"', '"missing"', '"extra"'])
      expect(harness).toContain(mode)
    expect(harness).toContain('for (fd = 3; fd < 1024; fd++)')
    expect(harness).toContain('execl(probe, probe, (char *)NULL)')
    const authority = await readFile(policyNativeAuthorityPath, 'utf8')
    const contract = await readFile(policyNativeLaunchContractPath, 'utf8')
    const fdMapBridge = authority.slice(
      authority.indexOf(
        'export async function diagnosePolicyProvisionalAFdMap',
      ),
      authority.indexOf('/**\n * Decision 111 B'),
    )
    expect(fdMapBridge).toContain('runFdAdmissionProbeWithCustodyChecks')
    expect(fdMapBridge).toContain('assertExactPolicyProvisionalABuildResidue')
    expect(fdMapBridge).not.toContain('runAcceptedHelper(')
    expect(fdMapBridge).not.toContain("kind: 'metadata-check'")
    expect(fdMapBridge).toContain('fdAdmissionProbeScratchRoot')
    expect(fdMapBridge).toContain(
      'runPolicyFdAdmissionProbeToolchainDerivation',
    )
    expect(fdMapBridge).not.toContain('runPolicyNativeToolchainDerivation')
    for (const forbiddenAuthority of [
      'runAcceptedHelper(',
      'deleteBuildEntry(',
      'deleteBuildTerminal(',
      'buildAndCleanupA(',
      'runPolicyProvisionalBuildA(',
      'runPolicyProvisionalBuildB(',
      'runPolicyProvisionalBuildC(',
      'createPolicyPromotionPackage(',
      'registerPolicy',
      'provider',
      'database',
      'uuid',
      'release',
    ])
      expect(fdMapBridge).not.toContain(forbiddenAuthority)
    expect(fdMapBridge).toContain('expectedProbeSourceSha256')
    expect(fdMapBridge).toContain("'probeSourceSha256'")
    expect(fdMapBridge).toContain("'revalidateOuter'")
    expect(fdMapBridge).not.toContain('runPolicyNativeToolchainDerivation')
    expect(
      fdMapBridge.indexOf('await commandLockCapabilityProbe'),
    ).toBeLessThan(fdMapBridge.indexOf('await openDerivationLock'))
    expect(fdMapBridge.indexOf('await openDerivationLock')).toBeLessThan(
      fdMapBridge.indexOf('runPolicyFdAdmissionProbeToolchainDerivation'),
    )
    expect(
      fdMapBridge.indexOf('runPolicyFdAdmissionProbeToolchainDerivation'),
    ).toBeLessThan(fdMapBridge.indexOf('runFdAdmissionProbeCompiler'))
    expect(fdMapBridge.indexOf('runFdAdmissionProbeCompiler')).toBeLessThan(
      fdMapBridge.indexOf('runFdAdmissionProbeWithCustodyChecks'),
    )
    expect(contract).toContain('PolicyFdAdmissionProbeCompilerCapability')
    expect(contract).toContain('probeSourceSha256')
    const probeToolchain = authority.slice(
      authority.indexOf(
        'async function runPolicyFdAdmissionProbeToolchainDerivation',
      ),
      authority.indexOf(
        'export async function runPolicyNativeToolchainDerivation',
      ),
    )
    for (const child of [
      'broker.runXcrunCompilerPath',
      'broker.runXcrunSdkPath',
      'broker.runCompilerResourceDir',
      'broker.runFdAdmissionProbeCompilerDiagnostic',
    ])
      expect(
        probeToolchain.match(new RegExp(child.replaceAll('.', '\\.'), 'gu')),
      ).toHaveLength(1)
    expect(probeToolchain).not.toContain('exclusive-promotion-helper.c')
    expect(probeToolchain).not.toContain('runPolicyNativeToolchainDerivation')
  })

  it('shares the fail-closed scratch finalization sequence with production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const sequence = [
      'close-probe',
      'validate-probe-for-unlink',
      'unlink-probe',
      'validate-empty-for-removal',
      'close-scratch',
      'remove-scratch',
      'assert-absent-and-final',
    ] as const
    try {
      await expect(
        finalizePolicyFdAdmissionProbeScratchForFixture({
          cleanupPermitted: true,
        }),
      ).resolves.toEqual(sequence)
      await expect(
        finalizePolicyFdAdmissionProbeScratchForFixture({
          cleanupPermitted: false,
        }),
      ).resolves.toEqual(['close-probe'])

      for (const [index, failAt] of sequence.entries()) {
        const events: string[] = []
        await expect(
          finalizePolicyFdAdmissionProbeScratchForFixture({
            cleanupPermitted: true,
            failAt,
            onEvent: (event) => events.push(event),
          }),
        ).rejects.toThrow('fixture-failure')
        expect(events).toEqual(sequence.slice(0, index + 1))
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('shares the closed FD-map scratch recovery lifecycle with production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const primary = [
      'admit',
      'open-lock',
      'validate-lock-after-open',
      'open-parent',
      'validate-parent-after-open',
      'open-scratch',
      'validate-before-first-inventory',
      'enumerate-first',
      'validate-first-snapshot',
      'validate-before-second-inventory',
      'enumerate-second',
      'validate-second-snapshot',
      'validate-immediately-before-close',
      'close-scratch',
      'validate-before-removal',
      'remove-scratch',
      'assert-absent',
      'validate-final',
    ] as const
    const cleanup = ['close-resources', 'close-lock'] as const
    const sequence = [...primary, ...cleanup]
    try {
      await expect(recoverPolicyFdMapScratchForFixture({})).resolves.toEqual(
        sequence,
      )
      for (const [index, failAt] of sequence.entries()) {
        const events: string[] = []
        await expect(
          recoverPolicyFdMapScratchForFixture({
            failAt,
            onEvent: (event) => events.push(event),
          }),
        ).rejects.toThrow('fixture-failure')
        expect(events).toEqual(
          index < primary.length
            ? [...primary.slice(0, index + 1), ...cleanup]
            : sequence,
        )
      }

      for (const [entries, expected] of [
        [
          { firstEntries: ['entry'] },
          [
            ...primary.slice(0, primary.indexOf('validate-first-snapshot') + 1),
            ...cleanup,
          ],
        ],
        [
          { secondEntries: ['entry'] },
          [
            ...primary.slice(
              0,
              primary.indexOf('validate-second-snapshot') + 1,
            ),
            ...cleanup,
          ],
        ],
      ] as const) {
        const events: string[] = []
        await expect(
          recoverPolicyFdMapScratchForFixture({
            ...entries,
            onEvent: (event) => events.push(event),
          }),
        ).rejects.toThrow('policy-native-authority')
        expect(events).toEqual(expected)
        expect(events).not.toContain('remove-scratch')
        expect(events).not.toContain('assert-absent')
        expect(events).not.toContain('validate-final')
      }

      const rejectingClose: string[] = []
      await expect(
        recoverPolicyFdMapScratchForFixture({
          failAt: 'close-scratch',
          onEvent: (event) => rejectingClose.push(event),
        }),
      ).rejects.toThrow('fixture-failure')
      expect(
        rejectingClose.filter((event) => event === 'close-scratch'),
      ).toHaveLength(1)
      expect(rejectingClose).not.toContain('remove-scratch')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('binds every recovery parent and scratch predicate while ignoring directory size', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const parent = {
      kind: 'directory' as const,
      dev: 16777231,
      ino: 13457399,
      uid: 0,
      mode: 0o1777,
      nlink: 8,
      size: 256,
    }
    const scratch = {
      kind: 'directory' as const,
      dev: 16777231,
      ino: 13940765,
      uid: 501,
      mode: 0o700,
      nlink: 2,
      size: 64,
    }
    const snapshot = {
      parentHeld: parent,
      parentNamed: { ...parent, size: 288 },
      scratchHeld: scratch,
      scratchNamed: { ...scratch, size: 96 },
      entries: [],
    }
    const identity = {
      scratchUid: 501,
      scratchDevice: 16777231,
      scratchInode: 13940765,
      scratchMode: 0o700,
      scratchLinks: 2,
    }
    const request = {
      repositoryRoot: '/repo',
      nativeAuthoritySha256: 'a'.repeat(64),
      rootNonceSha256: 'b'.repeat(64),
      commandLock: {},
      ...identity,
      revalidateOuter: async () => {},
    }
    try {
      expect(() =>
        assertPolicyFdMapRecoveryRequestShapeForFixture(request),
      ).not.toThrow()
      for (const key of Object.keys(request) as Array<keyof typeof request>) {
        const omitted = { ...request } as Partial<typeof request>
        delete omitted[key]
        expect(() =>
          assertPolicyFdMapRecoveryRequestShapeForFixture(omitted),
        ).toThrow('policy-native-authority')
      }
      expect(() =>
        assertPolicyFdMapRecoveryRequestShapeForFixture({
          ...request,
          extra: true,
        }),
      ).toThrow('policy-native-authority')
      expect(() =>
        assertPolicyFdMapRecoveryScratchIdentityForFixture(identity),
      ).not.toThrow()
      for (const key of Object.keys(identity) as Array<keyof typeof identity>) {
        const omitted = { ...identity } as Partial<typeof identity>
        delete omitted[key]
        expect(() =>
          assertPolicyFdMapRecoveryScratchIdentityForFixture(omitted),
        ).toThrow('policy-native-authority')
        expect(() =>
          assertPolicyFdMapRecoveryScratchIdentityForFixture({
            ...identity,
            [key]: identity[key] + 1,
          }),
        ).toThrow('policy-native-authority')
      }
      expect(() =>
        assertPolicyFdMapRecoveryDirectorySnapshotForFixture(snapshot),
      ).not.toThrow()
      for (const changed of [
        { ...snapshot, parentHeld: { ...parent, kind: 'other' as const } },
        {
          ...snapshot,
          parentNamed: { ...snapshot.parentNamed, kind: 'other' as const },
        },
        { ...snapshot, parentHeld: { ...parent, uid: 501 } },
        { ...snapshot, parentHeld: { ...parent, dev: 7 } },
        { ...snapshot, parentHeld: { ...parent, mode: 0o777 } },
        { ...snapshot, parentNamed: { ...parent, uid: 501 } },
        { ...snapshot, parentNamed: { ...parent, dev: 7 } },
        { ...snapshot, parentHeld: { ...parent, ino: 1 } },
        { ...snapshot, parentNamed: { ...parent, ino: 1 } },
        { ...snapshot, parentNamed: { ...parent, mode: 0o777 } },
        { ...snapshot, scratchHeld: { ...scratch, kind: 'other' as const } },
        {
          ...snapshot,
          scratchNamed: { ...scratch, kind: 'other' as const },
        },
        { ...snapshot, scratchHeld: { ...scratch, uid: 0 } },
        { ...snapshot, scratchHeld: { ...scratch, dev: 7 } },
        { ...snapshot, scratchHeld: { ...scratch, mode: 0o755 } },
        { ...snapshot, scratchNamed: { ...scratch, uid: 0 } },
        { ...snapshot, scratchNamed: { ...scratch, dev: 7 } },
        { ...snapshot, scratchHeld: { ...scratch, ino: 1 } },
        { ...snapshot, scratchNamed: { ...scratch, ino: 1 } },
        { ...snapshot, scratchNamed: { ...scratch, mode: 0o755 } },
        { ...snapshot, scratchHeld: { ...scratch, nlink: 3 } },
        { ...snapshot, scratchNamed: { ...scratch, nlink: 3 } },
        { ...snapshot, entries: ['unobserved-entry'] },
      ])
        expect(() =>
          assertPolicyFdMapRecoveryDirectorySnapshotForFixture(changed),
        ).toThrow('policy-native-authority')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps FD-map scratch recovery fixed, zero-child, and cleanup-narrow', async () => {
    const authority = await readFile(policyNativeAuthorityPath, 'utf8')
    const recovery = authority.slice(
      authority.indexOf(
        'export async function recoverPolicyProvisionalAFdMapScratch',
      ),
      authority.indexOf(
        "/**\n * Decision 131's historical diagnostic remains available",
      ),
    )
    expect(recovery).toContain("const parentPath = '/private/tmp'")
    expect(recovery).toContain('fdAdmissionProbeScratchRoot')
    expect(recovery).toContain('assertFdMapRecoveryDirectorySnapshot')
    expect(recovery).toContain('await recoverFdMapScratch')
    expect(recovery).toContain('rmdir(fdAdmissionProbeScratchRoot)')
    expect(recovery.indexOf('scratchHandle = undefined')).toBeLessThan(
      recovery.indexOf('await activeScratch.close()'),
    )
    expect(recovery).toContain('await openDerivationLock')
    expect(recovery).toContain('await validateNamedLock')
    expect(recovery).toContain('await closeDerivationLock')
    const inventory = authority.slice(
      authority.indexOf('async function readFdMapRecoveryInventory'),
      authority.indexOf(
        'export function assertPolicyFdMapRecoveryDirectorySnapshotForFixture',
      ),
    )
    expect(inventory).toContain('await opendir(fdAdmissionProbeScratchRoot)')
    expect(inventory).toContain('await directory.read()')
    expect(inventory).not.toContain('readdir(')
    for (const forbidden of [
      'broker.',
      'commandLockCapabilityProbe',
      'runAcceptedHelper',
      'runPolicyFdAdmissionProbeToolchainDerivation',
      'runFdAdmissionProbeCompiler',
      'runXcrun',
      'execFile',
      'spawn',
      'child_process',
      'runPolicyProvisionalBuildA',
      'runPolicyProvisionalBuildB',
      'runPolicyProvisionalBuildC',
      'unlink(',
      'mkdir(',
      'chmod(',
      'rename(',
      'writeFile(',
      'provider',
      'database',
      'uuid',
      'release',
    ])
      expect(recovery).not.toContain(forbidden)
  })

  it('binds the FD-admission compiler capability to the exact probe build plan', () => {
    const repositoryRoot = '/fixture/repository'
    const sdkRoot = '/fixture/sdk'
    const scratchRoot = '/private/tmp/zedarchive-m45-fd-admission-probe'
    const probeSourceSha256 = '1'.repeat(64)
    const compileContractSha256 = createHash('sha256')
      .update(
        canonicalJson({
          arguments: [
            '-std=c17',
            '-Wall',
            '-Wextra',
            '-Werror',
            '-Wpedantic',
            '-O2',
            '-isysroot',
            sdkRoot,
            '-o',
            `${scratchRoot}/probe`,
            `${repositoryRoot}/scripts/policy-baseline-review/fd-admission-probe.c`,
          ],
          environment: { TMPDIR: scratchRoot },
        }),
      )
      .digest('hex')
    const authorityCore = {
      schema: 'policy-fd-admission-probe-toolchain-authority.v1',
      version: 1,
      compilerPath: '/fixture/clang',
      sdkRoot,
      xcrunSha256: '2'.repeat(64),
      xcrunDevice: '7',
      xcrunInode: '100',
      probeSourceSha256,
      compilerSha256: '3'.repeat(64),
      compilerDevice: '7',
      compilerInode: '101',
      sdkIdentitySha256: '4'.repeat(64),
      sdkDevice: '7',
      sdkInode: '102',
      compilerResourceRoot: '/fixture/compiler-resource',
      compilerResourceIdentitySha256: '5'.repeat(64),
      compilerResourceDevice: '7',
      compilerResourceInode: '103',
      headerSetSha256: '6'.repeat(64),
      diagnosticSha256: '7'.repeat(64),
      diagnosticSemanticSha256: '8'.repeat(64),
      linkerPath: '/fixture/ld',
      linkerIdentitySha256: '9'.repeat(64),
      linkerSha256: 'a'.repeat(64),
      linkerDevice: '7',
      linkerInode: '104',
      compileContractSha256,
      launchContractSha256: 'b'.repeat(64),
      launcherSha256: 'c'.repeat(64),
      nativeAuthoritySha256: 'd'.repeat(64),
      lockPreflightWorkerSha256: 'e'.repeat(64),
    } as const
    const authorityPackage = {
      ...authorityCore,
      authorityPackageSha256: createHash('sha256')
        .update(canonicalJson(authorityCore))
        .digest('hex'),
    }
    const capabilityInput = {
      repositoryRoot,
      compilerPath: authorityCore.compilerPath,
      sdkRoot,
      compilerResourceRoot: authorityCore.compilerResourceRoot,
      authorityPackage,
    }
    const capability =
      createPolicyFdAdmissionProbeCompilerCapability(capabilityInput)
    const planInput = { repositoryRoot, scratchRoot, probeSourceSha256 }
    expect(
      createPolicyFdAdmissionProbeCompilerPlan(capability, planInput),
    ).toMatchObject({
      cwd: repositoryRoot,
      environment: { TMPDIR: scratchRoot },
      arguments: expect.arrayContaining([
        `${scratchRoot}/probe`,
        `${repositoryRoot}/scripts/policy-baseline-review/fd-admission-probe.c`,
      ]),
    })
    for (const changed of [
      { ...planInput, probeSourceSha256: 'f'.repeat(64) },
      { ...planInput, repositoryRoot: '/fixture/other' },
      { ...planInput, scratchRoot: '/private/tmp/other' },
    ])
      expect(() =>
        createPolicyFdAdmissionProbeCompilerPlan(capability, changed),
      ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyFdAdmissionProbeCompilerCapability({
        ...capabilityInput,
        repositoryRoot: '/fixture/other',
      }),
    ).toThrow('policy-native-launch-contract')
    expect(() =>
      createPolicyFdAdmissionProbeCompilerCapability({
        ...capabilityInput,
        authorityPackage: {
          ...authorityPackage,
          probeSourceSha256: 'f'.repeat(64),
        },
      }),
    ).toThrow('policy-native-launch-contract')
  })

  it('rejects every FD-admission scratch and probe snapshot drift field', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const scratchMetadata = {
      kind: 'directory' as const,
      dev: 7,
      ino: 8,
      uid: 501,
      mode: 0o700,
      nlink: 2,
      size: 64,
    }
    const scratch = {
      held: scratchMetadata,
      named: scratchMetadata,
      expectedUid: 501,
      expectedDev: 7,
      expectedIno: 8,
      entries: ['probe'],
      expectedEntries: ['probe'],
    }
    const probeMetadata = {
      kind: 'file' as const,
      dev: 7,
      ino: 9,
      uid: 501,
      mode: 0o500,
      nlink: 1,
      size: 4096,
    }
    const probe = {
      held: probeMetadata,
      named: probeMetadata,
      expectedUid: 501,
      expectedDev: 7,
      expectedIno: 9,
      expectedSize: 4096,
      heldSha256: 'a'.repeat(64),
      expectedSha256: 'a'.repeat(64),
    }
    try {
      expect(() =>
        assertPolicyFdAdmissionProbeScratchSnapshotForFixture(scratch),
      ).not.toThrow()
      for (const changed of [
        { ...scratch, held: { ...scratch.held, kind: 'other' as const } },
        { ...scratch, named: { ...scratch.named, kind: 'other' as const } },
        { ...scratch, held: { ...scratch.held, dev: 70 } },
        { ...scratch, named: { ...scratch.named, ino: 80 } },
        { ...scratch, held: { ...scratch.held, uid: 502 } },
        { ...scratch, named: { ...scratch.named, mode: 0o755 } },
        { ...scratch, held: { ...scratch.held, nlink: 3 } },
        { ...scratch, named: { ...scratch.named, size: 65 } },
        { ...scratch, entries: ['probe', 'unexpected'] },
      ])
        expect(() =>
          assertPolicyFdAdmissionProbeScratchSnapshotForFixture(changed),
        ).toThrow('policy-native-authority')

      expect(() =>
        assertPolicyFdAdmissionProbeFileSnapshotForFixture(probe),
      ).not.toThrow()
      for (const changed of [
        { ...probe, held: { ...probe.held, kind: 'other' as const } },
        { ...probe, named: { ...probe.named, kind: 'other' as const } },
        { ...probe, held: { ...probe.held, dev: 70 } },
        { ...probe, named: { ...probe.named, dev: 70 } },
        { ...probe, held: { ...probe.held, ino: 90 } },
        { ...probe, named: { ...probe.named, ino: 90 } },
        { ...probe, held: { ...probe.held, uid: 502 } },
        { ...probe, named: { ...probe.named, uid: 502 } },
        { ...probe, held: { ...probe.held, mode: 0o700 } },
        { ...probe, named: { ...probe.named, mode: 0o700 } },
        { ...probe, held: { ...probe.held, nlink: 2 } },
        { ...probe, named: { ...probe.named, nlink: 2 } },
        { ...probe, held: { ...probe.held, size: 4097 } },
        { ...probe, named: { ...probe.named, size: 4097 } },
        { ...probe, heldSha256: 'b'.repeat(64) },
      ])
        expect(() =>
          assertPolicyFdAdmissionProbeFileSnapshotForFixture(changed),
        ).toThrow('policy-native-authority')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('runs the native FD-admission probe only in a disposable fixture root', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'd131-fd-probe-'))
    const probe = join(fixtureRoot, 'probe')
    const harness = join(fixtureRoot, 'harness')
    const probeSource = resolve(
      process.cwd(),
      'scripts/policy-baseline-review/fd-admission-probe.c',
    )
    const harnessSource = resolve(
      process.cwd(),
      'scripts/policy-baseline-review/fd-admission-probe-test-harness.c',
    )
    try {
      const compilerArguments = [
        '-std=c17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-Wpedantic',
        '-O2',
      ]
      await execFileAsync('cc', [
        ...compilerArguments,
        '-o',
        probe,
        probeSource,
      ])
      await execFileAsync('cc', [
        ...compilerArguments,
        '-DFD_ADMISSION_PROBE_TEST',
        '-o',
        harness,
        probeSource,
        harnessSource,
      ])
      const run = async (mode: 'exact' | 'missing' | 'extra') => {
        try {
          const result = await execFileAsync(harness, [mode, probe])
          return { code: 0, stdout: result.stdout, stderr: result.stderr }
        } catch (error) {
          const failure = error as NodeJS.ErrnoException & {
            code?: number
            stdout?: string
            stderr?: string
          }
          return {
            code: failure.code,
            stdout: failure.stdout ?? '',
            stderr: failure.stderr ?? '',
          }
        }
      }
      const exact = await run('exact')
      expect(exact).toEqual({ code: 0, stdout: '', stderr: '' })
      for (const [mode, expected] of [
        ['missing', 21],
        ['extra', 23],
      ] as const) {
        expect(await run(mode)).toEqual({
          code: expected,
          stdout: '',
          stderr: '',
        })
      }
      const classify = async (mode: string) => {
        try {
          const result = await execFileAsync(harness, [mode])
          return { code: 0, stdout: result.stdout, stderr: result.stderr }
        } catch (error) {
          const failure = error as NodeJS.ErrnoException & {
            code?: number
            stdout?: string
            stderr?: string
          }
          return {
            code: failure.code,
            stdout: failure.stdout ?? '',
            stderr: failure.stderr ?? '',
          }
        }
      }
      for (const [mode, expected] of [
        ['fixture-exact', 0],
        ['open-max-negative', 24],
        ['open-max-large', 24],
        ['fd3-cloexec', 21],
        ['fd3-eintr', 25],
        ['scan-eintr', 25],
      ] as const)
        expect(await classify(mode)).toEqual({
          code: expected,
          stdout: '',
          stderr: '',
        })
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('exhausts the Decision-113 B cleanup checkpoint and launched-state matrix', () => {
    expect(policyBCleanupCheckpointIds).toEqual(
      expect.arrayContaining([
        'B0',
        'B4',
        'P1',
        'P13',
        'O1',
        'O2',
        'O3',
        'R01i',
        'R01s',
        'R16',
        'T0',
        'T1',
        'T2',
        'TX',
      ]),
    )
    for (const checkpoint of policyBCleanupCheckpointIds) {
      for (const observedState of [
        'prestate',
        'poststate',
        'ambiguous',
      ] as const) {
        for (const childLaunched of [false, true]) {
          const result = runPolicyBCandidateFailureLifecycleForFixture({
            checkpoint,
            observedState,
            childLaunched,
          })
          expect(result.registrationPermitted).toBe(false)
          if (observedState === 'ambiguous' || checkpoint === 'TX') {
            expect(result.transition).toBe('active-to-closed')
            expect(result.category).toBe('ambiguous-residue-preserved')
          }
        }
      }
    }
    for (const checkpoint of ['B0', 'B1', 'B2', 'B3', 'B4'])
      expect(
        runPolicyBCandidateFailureLifecycleForFixture({
          checkpoint,
          observedState: 'prestate',
          childLaunched: false,
        }),
      ).toMatchObject({
        transition: 'active-to-closed',
        category: 'b-build-prefix',
        permittedSuffix: [],
      })
    for (let index = 1; index <= 12; index += 1)
      expect(
        runPolicyBCandidateFailureLifecycleForFixture({
          checkpoint: `P${index}`,
          observedState: 'prestate',
          childLaunched: false,
        }),
      ).toMatchObject({
        transition: 'active-to-closed',
        category: 'b-preflight-setup-prefix',
        permittedSuffix: [],
      })
    expect(
      runPolicyBCandidateFailureLifecycleForFixture({
        checkpoint: 'P13',
        observedState: 'prestate',
        childLaunched: true,
      }).permittedSuffix[0],
    ).toBe('R01i')
    expect(
      runPolicyBCandidateFailureLifecycleForFixture({
        checkpoint: 'O1',
        observedState: 'prestate',
        childLaunched: true,
      }).permittedSuffix.slice(0, 2),
    ).toEqual(['ACL-remove', 'R01i'])
    for (const checkpoint of ['O2', 'O3'])
      expect(
        runPolicyBCandidateFailureLifecycleForFixture({
          checkpoint,
          observedState: 'prestate',
          childLaunched: true,
        }).permittedSuffix[0],
      ).toBe('R01s')
    for (const checkpoint of [
      'R01i',
      'R01s',
      'R02',
      'R03',
      'R04',
      'R05',
      'R06',
      'R07',
      'R08',
      'R09',
      'R10',
      'R11',
      'R12',
      'R13',
      'R14',
      'R15',
      'R16',
    ]) {
      expect(
        runPolicyBCandidateFailureLifecycleForFixture({
          checkpoint,
          observedState: 'prestate',
          childLaunched: true,
        }).category,
      ).toBe('b-cleanup-row-retained')
      expect(
        runPolicyBCandidateFailureLifecycleForFixture({
          checkpoint,
          observedState: 'prestate',
          childLaunched: false,
        }).permittedSuffix[0],
      ).toBe(checkpoint)
    }
    expect(
      runPolicyBCandidateFailureLifecycleForFixture({
        checkpoint: 'T0',
        observedState: 'prestate',
        childLaunched: false,
      }).permittedSuffix,
    ).toEqual(['R16'])
    expect(
      runPolicyBCandidateFailureLifecycleForFixture({
        checkpoint: 'T0',
        observedState: 'prestate',
        childLaunched: true,
      }).permittedSuffix,
    ).toEqual([])
    for (const [checkpoint, category] of [
      ['T1', 'b-terminal-helper-unlinked'],
      ['T2', 'b-terminal-root-removed-unproved'],
      ['TX', 'ambiguous-residue-preserved'],
    ] as const)
      expect(
        runPolicyBCandidateFailureLifecycleForFixture({
          checkpoint,
          observedState: 'prestate',
          childLaunched: true,
        }),
      ).toMatchObject({
        transition: 'active-to-closed',
        category,
        permittedSuffix: [],
        registrationPermitted: false,
      })
  })

  it('maps the shared physical failure table to C-only residue categories', () => {
    for (const [checkpoint, category] of [
      ['B0', 'c-build-prefix'],
      ['P1', 'c-preflight-setup-prefix'],
      ['T1', 'c-terminal-helper-unlinked'],
      ['T2', 'c-terminal-root-removed-unproved'],
    ] as const)
      expect(
        runPolicyCAcceptedFailureLifecycleForFixture({
          checkpoint,
          observedState: 'prestate',
          childLaunched: false,
        }).category,
      ).toBe(category)
    expect(
      runPolicyCAcceptedFailureLifecycleForFixture({
        checkpoint: 'P13',
        observedState: 'prestate',
        childLaunched: false,
      }).permittedSuffix,
    ).toContain('R01i')
    expect(
      runPolicyCAcceptedFailureLifecycleForFixture({
        checkpoint: 'R01i',
        observedState: 'prestate',
        childLaunched: false,
      }).permittedSuffix,
    ).toContain('R01i')
    expect(
      runPolicyCAcceptedFailureLifecycleForFixture({
        checkpoint: 'R01i',
        observedState: 'prestate',
        childLaunched: true,
      }).category,
    ).toBe('c-cleanup-row-retained')
  })

  it('drives every B operation through the shared candidate runner into one-way cleanup custody', async () => {
    const candidateNames = [
      'metadata-check:command-lock',
      'metadata-check:build-root',
      'metadata-check:build-tmp',
      'metadata-check:build-source',
      'metadata-check:build-helper',
      'metadata-check:preflight-root',
      'metadata-check:preflight-directory',
      'metadata-check:preflight-file',
      'acl-fixture:install',
      'metadata-check:preflight-directory',
      'acl-fixture:remove',
      'preflight-promotion:success',
      'preflight-promotion:collision',
      'delete-entry:preflight-success-destination-promotion',
      'delete-entry:preflight-collision-source-promotion',
      'delete-entry:preflight-collision-destination-promotion',
      'delete-entry:preflight-success-source-file',
      'delete-entry:preflight-success-destination-file',
      'delete-entry:preflight-collision-source-file',
      'delete-entry:preflight-collision-destination-file',
      'delete-entry:preflight-success-source-directory',
      'delete-entry:preflight-success-destination-directory',
      'delete-entry:preflight-collision-source-directory',
      'delete-entry:preflight-collision-destination-directory',
      'delete-entry:preflight-acl-fixture-directory',
      'delete-entry:preflight-root',
      'delete-entry:build-source',
      'delete-entry:build-tmp',
      'delete-build-terminal',
    ] as const
    const cleanupNames = [
      'delete-entry:preflight-success-destination-promotion',
      'delete-entry:preflight-collision-source-promotion',
      'delete-entry:preflight-collision-destination-promotion',
      'delete-entry:preflight-success-source-file',
      'delete-entry:preflight-success-destination-file',
      'delete-entry:preflight-collision-source-file',
      'delete-entry:preflight-collision-destination-file',
      'delete-entry:preflight-success-source-directory',
      'delete-entry:preflight-success-destination-directory',
      'delete-entry:preflight-collision-source-directory',
      'delete-entry:preflight-collision-destination-directory',
      'delete-entry:preflight-acl-fixture-directory',
      'delete-entry:preflight-root',
      'delete-entry:build-source',
      'delete-entry:build-tmp',
      'delete-build-terminal',
    ] as const
    const entry = (name: string, index: number) => ({
      name,
      highest: name.startsWith('preflight-promotion')
        ? (6 as const)
        : (3 as const),
      operation: Object.freeze({ name, index }),
    })
    const exact = () => ({
      code: 0,
      stdoutBytes: 0,
      stderrBytes: 0,
      processGroupAbsent: true,
      streamsClosed: true,
    })
    const failureResult = (
      dimension: NonNullable<
        Parameters<
          typeof runPolicyBCandidateLifecycleForFixture
        >[0]['lifecycleFailure']
      >,
    ) => {
      if (dimension === 'exit') return { ...exact(), code: 1 }
      if (dimension === 'stdout') return { ...exact(), stdoutBytes: 1 }
      if (dimension === 'stderr') return { ...exact(), stderrBytes: 1 }
      if (dimension === 'stream') return { ...exact(), streamsClosed: false }
      if (dimension === 'group')
        return { ...exact(), processGroupAbsent: false }
      return exact()
    }
    const attempt = async (input: {
      operationIndex: number
      phase: 'before' | 'after'
      lifecycleFailure?: NonNullable<
        Parameters<
          typeof runPolicyBCandidateLifecycleForFixture
        >[0]['lifecycleFailure']
      >
      failCleanupAt?: number
    }) => {
      const events: string[] = []
      const active = new WeakSet<object>()
      const cleanup = new WeakSet<object>()
      let cleanupUsed = false
      let cleanupOperation = 0
      let lockClosed = false
      const result = await runPolicyBCandidateLifecycleForFixture({
        operations: candidateNames.map(entry),
        cleanupSuffix: cleanupNames.map(entry),
        failAt: { operationIndex: input.operationIndex, phase: input.phase },
        lifecycleFailure: input.lifecycleFailure,
        dependencies: {
          withChild: async (_highest, run) =>
            run(
              async () => ({ fd: 99 }) as never,
              () => ({
                highestTarget: 3,
                fillerParentFds: [4, 5, 6],
                authorityParentFds: [99],
                commandLockParentFd: 98,
              }),
            ),
          runOperation: async (phase, session, operation, dimension) => {
            events.push(
              `${phase}:run:${(operation as { index: number }).index}`,
            )
            if (phase === 'active') {
              expect(active.has(session)).toBe(true)
              if (
                dimension === 'spawn' ||
                dimension === 'timeout' ||
                dimension === 'signal'
              )
                throw new Error(`fixture-${dimension}`)
              return dimension === undefined
                ? exact()
                : failureResult(dimension)
            }
            expect(cleanup.has(session)).toBe(true)
            if (cleanupOperation++ === input.failCleanupAt)
              throw new Error('fixture-cleanup-failure')
            return exact()
          },
          beginActive: (session) => {
            active.add(session)
            events.push('broker:active-token')
          },
          beginCleanup: (session, admission) => {
            expect(active.has(session)).toBe(true)
            expect(cleanupUsed).toBe(false)
            expect(admission).toMatchObject({
              checkpoint: 'O2',
              lifecycleClosed: true,
              failedOperationIndex: input.operationIndex,
            })
            active.delete(session)
            cleanupUsed = true
            const token = Object.freeze({})
            cleanup.add(token)
            events.push('broker:cleanup-token')
            return token
          },
          closeCleanup: (session) => {
            expect(cleanup.has(session)).toBe(true)
            cleanup.delete(session)
            events.push('broker:cleanup-closed')
          },
          validateLock: async () => {
            expect(lockClosed).toBe(false)
            events.push('lock:validated')
          },
          closeLock: async () => {
            expect(lockClosed).toBe(false)
            lockClosed = true
            events.push('lock:closed')
          },
        },
      })
      return { result, events, lockClosed, cleanupUsed }
    }

    // A fresh active token is minted only inside each inert attempt. Its
    // membership is established by the fixture broker before the first child.
    // This setup models the production bridge's opaque ordinary token.
    for (const operationIndex of candidateNames.keys()) {
      for (const phase of ['before', 'after'] as const) {
        const dimensions =
          phase === 'before'
            ? ([undefined] as const)
            : ([
                'spawn',
                'exit',
                'stdout',
                'stderr',
                'timeout',
                'signal',
                'stream',
                'group',
                'postcheck',
              ] as const)
        for (const lifecycleFailure of dimensions) {
          const current = await attempt({
            operationIndex,
            phase,
            lifecycleFailure,
          })
          expect(current.result).toMatchObject({
            outcome: 'cleaned-no-authority',
            registrationPermitted: false,
          })
          expect(current.cleanupUsed).toBe(true)
          expect(current.lockClosed).toBe(true)
          expect(current.result.events.at(-1)).toBe('lock:closed-last')
          expect(current.events.at(-1)).toBe('lock:closed')
          const activeRuns = current.events.filter((event) =>
            event.startsWith('active:run:'),
          )
          expect(activeRuns).toHaveLength(
            phase === 'before' ? operationIndex : operationIndex + 1,
          )
          expect(new Set(activeRuns).size).toBe(activeRuns.length)
          expect(activeRuns).not.toContain(`active:run:${operationIndex + 1}`)
          expect(
            current.result.events.filter(
              (event) => event === 'broker:registration',
            ),
          ).toEqual([])
        }
      }
    }

    const retained = await attempt({
      operationIndex: 13,
      phase: 'after',
      lifecycleFailure: 'exit',
      failCleanupAt: 0,
    })
    expect(retained.result).toMatchObject({
      outcome: 'retained-no-authority',
      registrationPermitted: false,
    })
    expect(
      retained.events.filter((event) => event.startsWith('cleanup:run:')),
    ).toHaveLength(1)
    expect(retained.result.events).toContain('cleanup:retained')
    expect(retained.result.events.at(-1)).toBe('lock:closed-last')
  })

  it('reopens every Decision-113 residue row through the production classifier', async () => {
    const source = Buffer.from('fixture-source\n')
    const helper = Buffer.from('fixture-helper\n')
    const sourceSha256 = sha256(source)
    const helperSha256 = sha256(helper)
    const fixtureBytes = {
      'success-source': 'zedarchive-m45-exclusive-success-source-v1\n',
      'success-destination':
        'zedarchive-m45-exclusive-success-destination-v1\n',
      'collision-source': 'zedarchive-m45-exclusive-collision-source-v1\n',
      'collision-destination':
        'zedarchive-m45-exclusive-collision-destination-v1\n',
    } as const
    const checkpoints = policyBCleanupCheckpointIds.filter(
      (checkpoint) => checkpoint !== 'TX',
    )
    const makeDirectory = async (path: string) => {
      await mkdir(path, { recursive: true, mode: 0o700 })
      await chmod(path, 0o700)
    }
    const writeExact = async (
      path: string,
      bytes: Uint8Array,
      mode: number,
    ) => {
      await writeFile(path, bytes, { flag: 'wx', mode })
      await chmod(path, mode)
    }
    const remove = async (path: string) => {
      await rm(path, { recursive: true, force: true })
    }
    const assemble = async (
      repositoryRoot: string,
      checkpoint: string,
      shared = false,
    ) => {
      const m45 = join(repositoryRoot, '.local/m45')
      const build = join(m45, '.policy-exclusive-promotion-build')
      const preflight = join(m45, '.policy-exclusive-promotion-preflight')
      await makeDirectory(m45)
      if (shared) {
        for (const name of [
          'candidate-review',
          'discovery',
          'predecessor-review',
        ]) {
          await makeDirectory(join(m45, name))
          await chmod(join(m45, name), 0o755)
        }
        const control = join(m45, 'policy-native-derivation')
        await makeDirectory(control)
        await writeExact(
          join(control, 'shared-root-baseline.v1.json'),
          Buffer.from('baseline\n'),
          0o600,
        )
        await writeExact(
          join(control, 'stage-a.v1.json'),
          Buffer.from('stage-a\n'),
          0o600,
        )
      }
      const sharedEvidence = async (name: string) => {
        const metadata = await lstat(join(m45, name))
        return {
          uid: String(metadata.uid),
          device: String(metadata.dev),
          inode: String(metadata.ino),
          links: String(metadata.nlink),
          mode: String(metadata.mode & 0o7777),
          size: 'na' as const,
        }
      }
      const sharedSiblings = shared
        ? {
            'candidate-review': await sharedEvidence('candidate-review'),
            discovery: await sharedEvidence('discovery'),
            'predecessor-review': await sharedEvidence('predecessor-review'),
            'policy-native-derivation': await sharedEvidence(
              'policy-native-derivation',
            ),
          }
        : undefined
      await writeExact(
        join(m45, '.policy-exclusive-promotion.lock'),
        Buffer.alloc(0),
        0o600,
      )
      const needsBuild = checkpoint !== 'B0' && checkpoint !== 'T2'
      if (needsBuild) await makeDirectory(build)
      if (!['B0', 'B1', 'R16', 'T0', 'T1', 'T2'].includes(checkpoint)) {
        await makeDirectory(join(build, 'tmp'))
      }
      if (
        !['B0', 'B1', 'B2', 'R15', 'R16', 'T0', 'T1', 'T2'].includes(checkpoint)
      )
        await writeExact(
          join(build, 'exclusive-promotion-helper.c'),
          source,
          0o400,
        )
      if (!['B0', 'B1', 'B2', 'B3', 'T1', 'T2'].includes(checkpoint))
        await writeExact(
          join(build, 'exclusive-promotion-helper'),
          helper,
          0o500,
        )

      const needsPreflight = /^(?:P|O|R(?:01|0[2-9]|1[0-3]))/u.test(checkpoint)
      if (!needsPreflight) return { m45, build, preflight, sharedSiblings }
      await makeDirectory(preflight)
      const addDirectory = async (name: keyof typeof fixtureBytes) => {
        const directory = join(preflight, name)
        await makeDirectory(directory)
        await writeExact(
          join(directory, 'fixture.bin'),
          Buffer.from(fixtureBytes[name]),
          0o600,
        )
      }
      const prefix = [
        'success-source',
        'success-destination',
        'collision-source',
        'collision-destination',
      ] as const
      const prefixIndex = {
        P1: 0,
        P2: 1,
        P3: 1,
        P4: 1,
        P5: 2,
        P6: 2,
        P7: 3,
        P8: 3,
        P9: 3,
        P10: 4,
        P11: 4,
        P12: 4,
      } as const
      if (checkpoint in prefixIndex) {
        const count = prefixIndex[checkpoint as keyof typeof prefixIndex]
        for (const name of prefix.slice(0, count)) await addDirectory(name)
        if (checkpoint === 'P2')
          await remove(join(preflight, 'success-source/fixture.bin'))
        if (checkpoint === 'P5')
          await remove(join(preflight, 'success-destination/fixture.bin'))
        if (!['P1', 'P2', 'P3'].includes(checkpoint))
          await makeDirectory(join(preflight, 'success-source/promotion'))
        if (checkpoint === 'P7')
          await remove(join(preflight, 'collision-source/fixture.bin'))
        if (['P9', 'P10', 'P11', 'P12'].includes(checkpoint))
          await makeDirectory(join(preflight, 'collision-source/promotion'))
        if (checkpoint === 'P10')
          await remove(join(preflight, 'collision-destination/fixture.bin'))
        if (checkpoint === 'P12')
          await makeDirectory(
            join(preflight, 'collision-destination/promotion'),
          )
        return { m45, build, preflight, sharedSiblings }
      }
      for (const name of prefix) await addDirectory(name)
      for (const name of [
        'success-source',
        'collision-source',
        'collision-destination',
      ] as const)
        await makeDirectory(join(preflight, `${name}/promotion`))
      await makeDirectory(join(preflight, 'acl-fixture'))
      if (
        checkpoint === 'R01s' ||
        /^(?:O[23]|R(?:0[2-9]|1[0-3]))$/u.test(checkpoint)
      ) {
        await rename(
          join(preflight, 'success-source/promotion'),
          join(preflight, 'success-destination/promotion'),
        )
      }
      if (/^R(?:0[2-9]|1[0-3])$/u.test(checkpoint))
        await remove(join(preflight, 'success-destination/promotion'))
      const removeForRow: Record<string, readonly string[]> = {
        R03: ['collision-source/promotion'],
        R04: ['collision-source/promotion', 'collision-destination/promotion'],
        R05: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
        ],
        R06: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
        ],
        R07: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
        ],
        R08: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
          'collision-destination/fixture.bin',
        ],
        R09: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
          'collision-destination/fixture.bin',
          'success-source',
        ],
        R10: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
          'collision-destination/fixture.bin',
          'success-source',
          'success-destination',
        ],
        R11: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
          'collision-destination/fixture.bin',
          'success-source',
          'success-destination',
          'collision-source',
        ],
        R12: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
          'collision-destination/fixture.bin',
          'success-source',
          'success-destination',
          'collision-source',
          'collision-destination',
        ],
        R13: [
          'collision-source/promotion',
          'collision-destination/promotion',
          'success-source/fixture.bin',
          'success-destination/fixture.bin',
          'collision-source/fixture.bin',
          'collision-destination/fixture.bin',
          'success-source',
          'success-destination',
          'collision-source',
          'collision-destination',
          'acl-fixture',
        ],
      }
      for (const path of removeForRow[checkpoint] ?? [])
        await remove(join(preflight, path))
      return { m45, build, preflight, sharedSiblings }
    }

    for (const checkpoint of checkpoints) {
      const directory = await mkdtemp(join(tmpdir(), 'm45-d113-reopen-'))
      try {
        await assemble(directory, checkpoint)
        const reopened = await reopenPolicyBCandidateCheckpointForFixture({
          repositoryRoot: directory,
          sourceSha256,
          helperSha256,
          cleanupPhase: /^(?:R|T)/u.test(checkpoint),
          terminalLaunched: checkpoint === 'T2',
          failedOperationFamily:
            checkpoint === 'T0'
              ? 'delete-build-terminal'
              : checkpoint === 'O3'
                ? 'preflight-promotion'
                : 'fixture',
          lastChildExitCode: checkpoint === 'O3' ? 10 : undefined,
          acl: async () => (checkpoint === 'O1' ? 'fixture' : 'empty'),
        })
        expect(reopened?.checkpoint).toBe(checkpoint)
        expect(reopened?.checkpointSha256).toMatch(/^[a-f0-9]{64}$/u)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }

    for (const name of [
      'candidate-review',
      'discovery',
      'predecessor-review',
      'policy-native-derivation',
    ]) {
      const directory = await mkdtemp(join(tmpdir(), 'm45-d116-base-drift-'))
      try {
        const assembled = await assemble(directory, 'B0', true)
        if (name === 'policy-native-derivation')
          await writeExact(
            join(assembled.m45, name, 'extra'),
            Buffer.from('extra\n'),
            0o600,
          )
        else await chmod(join(assembled.m45, name), 0o700)
        await expect(
          reopenPolicyBCandidateCheckpointForFixture({
            repositoryRoot: directory,
            sourceSha256,
            helperSha256,
            sharedSiblings: assembled.sharedSiblings,
          }),
        ).resolves.toBeNull()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }

    for (const checkpoint of checkpoints) {
      const directory = await mkdtemp(join(tmpdir(), 'm45-d116-shared-reopen-'))
      try {
        const assembled = await assemble(directory, checkpoint, true)
        const reopened = await reopenPolicyBCandidateCheckpointForFixture({
          repositoryRoot: directory,
          sourceSha256,
          helperSha256,
          sharedSiblings: assembled.sharedSiblings,
          cleanupPhase: /^(?:R|T)/u.test(checkpoint),
          terminalLaunched: checkpoint === 'T2',
          failedOperationFamily:
            checkpoint === 'T0'
              ? 'delete-build-terminal'
              : checkpoint === 'O3'
                ? 'preflight-promotion'
                : 'fixture',
          lastChildExitCode: checkpoint === 'O3' ? 10 : undefined,
          acl: async () => (checkpoint === 'O1' ? 'fixture' : 'empty'),
        })
        expect(reopened?.checkpoint).toBe(checkpoint)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }

    type ReopenFixtureOptions = Omit<
      Parameters<typeof reopenPolicyBCandidateCheckpointForFixture>[0],
      'repositoryRoot' | 'sourceSha256' | 'helperSha256'
    >
    const classifyP13 = async (
      input: ReopenFixtureOptions,
      mutate?: (paths: Readonly<{ preflight: string }>) => Promise<void>,
    ) => {
      const directory = await mkdtemp(join(tmpdir(), 'm45-d113-drift-'))
      try {
        const paths = await assemble(directory, 'P13')
        await mutate?.(paths)
        return await reopenPolicyBCandidateCheckpointForFixture({
          repositoryRoot: directory,
          sourceSha256,
          helperSha256,
          ...input,
        })
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
    for (const [role, field, value] of [
      ['build', 'kind', 'file'],
      ['build', 'uid', 'not-the-effective-user'],
      ['build', 'device', 'other-device'],
      ['build', 'links', '99'],
      ['build', 'mode', '0'],
      ['build', 'specialMode', '2048'],
      ['helper', 'size', '0'],
      ['helper', 'sha256', '0'.repeat(64)],
    ] as const)
      expect(
        await classifyP13({
          amendEvidence: (currentRole, _kind, _entries, evidence) =>
            currentRole === role ? { ...evidence, [field]: value } : evidence,
        }),
      ).toBeNull()
    expect(
      await classifyP13({}, async ({ preflight }) =>
        writeExact(join(preflight, 'unexpected'), Buffer.from('x'), 0o600),
      ),
    ).toBeNull()
    expect(
      await classifyP13({ zeroAcl: async (role) => role !== 'build' }),
    ).toBeNull()
    expect(
      await classifyP13({ zeroAcl: async (role) => role !== 'command-lock' }),
    ).toBeNull()
    expect(
      await classifyP13({
        beforeNamed: async (role, path) => {
          if (role !== 'helper') return
          await rename(path, `${path}.held`)
          await writeExact(path, helper, 0o500)
        },
      }),
    ).toBeNull()
  })

  it('injects every Decision-112 child filler and authority failure without opening a next child', async () => {
    type FixtureHandle = Readonly<{ fd: number; close: () => Promise<void> }>
    const run = async (
      input: Readonly<{
        highest: 3 | 6
        failOpenAt?: number
        failCloseFd?: number
        fillerFds?: readonly number[]
        lockFd?: number
        authorityFds?: readonly number[]
        failChild?: boolean
      }>,
    ) => {
      const events: string[] = []
      let opened = 0
      let childRuns = 0
      let registered = false
      const handle = (fd: number): FixtureHandle => ({
        fd,
        close: async () => {
          events.push(`close:${fd}`)
          if (fd === input.failCloseFd) throw new Error('injected-close')
        },
      })
      const lock = {
        ...handle(input.lockFd ?? 20),
        close: async () => {
          events.push('close:lock')
        },
      }
      const result = (async () => {
        await runPolicyNativeChildFdLifecycleForFixture({
          highestChildAuthorityTarget: input.highest,
          lock,
          open: async (path) => {
            opened += 1
            events.push(`open:${path}:${opened}`)
            if (opened === input.failOpenAt) throw new Error('injected-open')
            const fillerCount = input.highest === 6 ? 4 : 3
            const fd =
              opened <= fillerCount
                ? (input.fillerFds?.[opened - 1] ?? input.highest + opened)
                : (input.authorityFds?.[opened - fillerCount - 1] ??
                  10 + opened)
            return handle(fd)
          },
          validate: async () => {
            events.push('validate:lock')
          },
          run: async (openChildAuthority) => {
            childRuns += 1
            const fillerCount = input.highest === 6 ? 4 : 3
            expect(opened).toBe(fillerCount)
            await openChildAuthority('/authority-one', 0)
            await openChildAuthority('/authority-two', 0)
            if (input.failChild) throw new Error('injected-child')
          },
        })
        registered = true
      })()
      return {
        result,
        events,
        childRuns: () => childRuns,
        registered: () => registered,
        lock,
      }
    }

    for (const highest of [3, 6] as const) {
      const fillerCount = highest === 6 ? 4 : 3
      for (let failure = 1; failure <= fillerCount; failure += 1) {
        const attempt = await run({ highest, failOpenAt: failure })
        await expect(attempt.result).rejects.toThrow('injected-open')
        expect(attempt.childRuns()).toBe(0)
        expect(attempt.registered()).toBe(false)
      }
      const observedParentFds = highest === 6 ? [14, 12, 13, 15] : [14, 12, 13]
      const observed = await run({
        highest,
        fillerFds: observedParentFds,
        authorityFds: [21, 22],
      })
      await expect(observed.result).resolves.toBeUndefined()
      expect(observed.childRuns()).toBe(1)
      expect(observed.registered()).toBe(true)
      for (const fillerFds of [
        [highest, ...observedParentFds.slice(1)],
        [Number.NaN, ...observedParentFds.slice(1)],
        [Number.POSITIVE_INFINITY, ...observedParentFds.slice(1)],
        [
          observedParentFds[0]!,
          observedParentFds[0]!,
          ...observedParentFds.slice(2),
        ],
      ]) {
        const rejected = await run({ highest, fillerFds })
        await expect(rejected.result).rejects.toThrow('policy-native-authority')
        expect(rejected.childRuns()).toBe(0)
      }
      const lockCollision = await run({
        highest,
        lockFd: highest + fillerCount,
      })
      await expect(lockCollision.result).rejects.toThrow(
        'policy-native-authority',
      )
      expect(lockCollision.childRuns()).toBe(0)
      const invalidLock = await run({ highest, lockFd: Number.NaN })
      await expect(invalidLock.result).rejects.toThrow(
        'policy-native-authority',
      )
      expect(invalidLock.childRuns()).toBe(0)
      for (let fd = highest + 1; fd <= highest + fillerCount; fd += 1) {
        const attempt = await run({ highest, failCloseFd: fd })
        await expect(attempt.result).rejects.toThrow('injected-close')
        expect(attempt.childRuns()).toBe(1)
        expect(attempt.registered()).toBe(false)
        expect(attempt.events).toContain(`close:${fd}`)
      }
      for (const authorityFds of [
        [highest, highest + 8],
        [highest + 8, highest],
        [highest + 8, highest + 8],
        [Number.NaN, highest + 8],
      ]) {
        const attempt = await run({ highest, authorityFds })
        await expect(attempt.result).rejects.toThrow('policy-native-authority')
        expect(attempt.childRuns()).toBe(1)
        expect(attempt.registered()).toBe(false)
      }
      for (const failOpenAt of [fillerCount + 1, fillerCount + 2]) {
        const attempt = await run({ highest, failOpenAt })
        await expect(attempt.result).rejects.toThrow('injected-open')
        expect(attempt.childRuns()).toBe(1)
        expect(attempt.registered()).toBe(false)
      }
      for (const authorityFd of [10 + fillerCount + 1, 10 + fillerCount + 2]) {
        const attempt = await run({ highest, failCloseFd: authorityFd })
        await expect(attempt.result).rejects.toThrow('injected-close')
        expect(attempt.childRuns()).toBe(1)
        expect(attempt.registered()).toBe(false)
        expect(attempt.events).toContain(`close:${authorityFd}`)
      }
    }

    const invalidHighest = await run({ highest: 4 as 3 })
    await expect(invalidHighest.result).rejects.toThrow(
      'policy-native-authority',
    )
    expect(invalidHighest.childRuns()).toBe(0)

    const childFailure = await run({ highest: 6, failChild: true })
    await expect(childFailure.result).rejects.toThrow('injected-child')
    expect(childFailure.childRuns()).toBe(1)
    expect(childFailure.registered()).toBe(false)
    expect(
      childFailure.events.filter((event) => event === 'close:lock'),
    ).toEqual([])
    await childFailure.lock.close()
    expect(childFailure.events.at(-1)).toBe('close:lock')
  })

  it('injects every Decision-112 positioning and lock failure with lock-last teardown', async () => {
    const attempt = (input: {
      failFillerOpenAt?: number
      failFillerCloseFd?: number
      failLockOpen?: boolean
      failLockClose?: boolean
      failValidationAt?: number
      failFinalValidation?: boolean
      driftFillerAt?: number
      fillerFds?: readonly number[]
      lockFd?: number
    }) => {
      const events: string[] = []
      let fillerOpen = 0
      let validation = 0
      const handle = (fd: number) => ({
        fd,
        close: async () => {
          events.push(`close:${fd}`)
          if (
            fd === input.failFillerCloseFd ||
            (fd === 20 && input.failLockClose)
          )
            throw new Error(fd === 20 ? 'close-lock' : 'close-filler')
        },
      })
      return {
        events,
        result: runPolicyNativePositioningForFixture({
          openFiller: async () => {
            fillerOpen += 1
            events.push(`open:filler:${fillerOpen}`)
            if (fillerOpen === input.failFillerOpenAt)
              throw new Error('open-filler')
            return handle(input.fillerFds?.[fillerOpen - 1] ?? fillerOpen + 6)
          },
          inspectFiller: async (filler) =>
            filler.fd === input.driftFillerAt
              ? { device: 'drift', inode: 'drift' }
              : { device: 'test-dev-null', inode: 'test-dev-null' },
          openLock: async () => {
            events.push('open:lock')
            if (input.failLockOpen) throw new Error('open-lock')
            return handle(input.lockFd ?? 20)
          },
          validateLock: async () => {
            validation += 1
            events.push(`validate:${validation}`)
            if (validation === input.failValidationAt)
              throw new Error('validate-lock')
          },
          validateFinalLock: async () => {
            events.push('validate:final')
            if (input.failFinalValidation) throw new Error('validate-final')
          },
        }),
      }
    }
    const noncontiguous = attempt({ fillerFds: [14, 12, 13, 15] })
    await expect(noncontiguous.result).resolves.toBeUndefined()
    expect(noncontiguous.events).toContain('close:15')
    expect(noncontiguous.events).toContain('close:12')
    for (const fillerFds of [
      [6, 8, 9, 10],
      [Number.NaN, 8, 9, 10],
      [7, 8, 8, 10],
    ]) {
      const invalid = attempt({ fillerFds })
      await expect(invalid.result).rejects.toThrow('policy-native-authority')
      expect(invalid.events).not.toContain('open:lock')
    }
    const positioningLockCollision = attempt({ lockFd: 10 })
    await expect(positioningLockCollision.result).rejects.toThrow(
      'policy-native-authority',
    )
    const invalidPositioningLock = attempt({ lockFd: Number.NaN })
    await expect(invalidPositioningLock.result).rejects.toThrow(
      'policy-native-authority',
    )
    for (let failure = 1; failure <= 4; failure += 1) {
      const current = attempt({ failFillerOpenAt: failure })
      await expect(current.result).rejects.toThrow('open-filler')
      expect(current.events).toEqual([
        ...Array.from(
          { length: failure },
          (_, index) => `open:filler:${index + 1}`,
        ),
        ...Array.from(
          { length: failure - 1 },
          (_, index) => `close:${failure - index + 5}`,
        ),
      ])
    }
    const lockOpen = attempt({ failLockOpen: true })
    await expect(lockOpen.result).rejects.toThrow('open-lock')
    expect(lockOpen.events).toEqual([
      'open:filler:1',
      'open:filler:2',
      'open:filler:3',
      'open:filler:4',
      'open:lock',
      'close:10',
      'close:9',
      'close:8',
      'close:7',
    ])
    for (const fd of [7, 8, 9, 10]) {
      const closeFailure = attempt({ failFillerCloseFd: fd })
      await expect(closeFailure.result).rejects.toThrow(
        'policy-native-positioning-ambiguous',
      )
      expect(closeFailure.events).toEqual([
        'open:filler:1',
        'open:filler:2',
        'open:filler:3',
        'open:filler:4',
        'open:lock',
        'validate:1',
        'close:10',
        'close:9',
        'close:8',
        'close:7',
        'validate:2',
        'close:20',
      ])
    }
    const validationFailure = attempt({ failValidationAt: 1 })
    await expect(validationFailure.result).rejects.toThrow('validate-lock')
    expect(validationFailure.events.at(-1)).toBe('close:20')
    const drift = attempt({ driftFillerAt: 8 })
    await expect(drift.result).rejects.toThrow('policy-native-authority')
    expect(drift.events).toEqual([
      'open:filler:1',
      'open:filler:2',
      'close:8',
      'close:7',
    ])
    const driftCloseFailure = attempt({
      driftFillerAt: 8,
      failFillerCloseFd: 8,
    })
    await expect(driftCloseFailure.result).rejects.toThrow(
      'policy-native-positioning-ambiguous',
    )
    expect(driftCloseFailure.events).toEqual([
      'open:filler:1',
      'open:filler:2',
      'close:8',
      'close:7',
    ])
    const finalValidation = attempt({ failFinalValidation: true })
    await expect(finalValidation.result).rejects.toThrow('validate-final')
    expect(finalValidation.events.slice(-2)).toEqual([
      'validate:final',
      'close:20',
    ])
    const finalClose = attempt({ failLockClose: true })
    await expect(finalClose.result).rejects.toThrow('close-lock')
    expect(finalClose.events.slice(-2)).toEqual(['validate:final', 'close:20'])
    const finalAmbiguity = attempt({
      failFinalValidation: true,
      failLockClose: true,
    })
    await expect(finalAmbiguity.result).rejects.toThrow(
      'policy-native-lock-finalization-ambiguous',
    )
    expect(finalAmbiguity.events.slice(-2)).toEqual([
      'validate:final',
      'close:20',
    ])
  })

  it('binds parent ownership, modes, devices, ACLs, and phase-specific link counts', () => {
    const evidence = {
      phase: 'role-input' as const,
      effectiveOwner: 501,
      sourceOwner: 501,
      destinationOwner: 501,
      sourceMode: 0o700,
      destinationMode: 0o700,
      sourceDevice: 7,
      destinationDevice: 7,
      sourceLinks: 5,
      expectedSourceLinksFromInventory: 5,
      destinationLinks: 3,
      sourceAclTrivial: true,
      destinationAclTrivial: true,
    }
    expect(() =>
      assertPolicyExclusivePromotionParentEvidence(evidence),
    ).not.toThrow()
    expect(() =>
      assertPolicyExclusivePromotionParentEvidence({
        ...evidence,
        expectedSourceLinksFromInventory: 4,
      }),
    ).toThrow('policy-custody')
    expect(() =>
      assertPolicyExclusivePromotionParentEvidence({
        ...evidence,
        destinationMode: 0o2700,
      }),
    ).toThrow('policy-custody')
  })

  it('accepts only the exact successful build inventory before cleanup', () => {
    const file = {
      owner: 501,
      links: 1,
      device: 7,
      parentDevice: 7,
      sha256: 'a'.repeat(64),
      aclTrivial: true,
    }
    const inventory = {
      owner: 501,
      effectiveOwner: 501,
      mode: 0o700,
      links: 5,
      aclTrivial: true,
      entries: [
        'exclusive-promotion-helper.c',
        'exclusive-promotion-helper',
        'tmp',
      ],
      source: { ...file, mode: 0o400 },
      helper: { ...file, mode: 0o500 },
      temporaryDirectory: {
        owner: 501,
        mode: 0o700,
        links: 2,
        device: 7,
        parentDevice: 7,
        aclTrivial: true,
        entries: [] as readonly string[],
      },
    }
    expect(() =>
      assertPolicyExclusivePromotionBuildInventory(inventory),
    ).not.toThrow()
    expect(() =>
      assertPolicyExclusivePromotionBuildInventory({
        ...inventory,
        entries: [...inventory.entries, 'compiler-residue'],
      }),
    ).toThrow('policy-custody')
  })

  it.runIf(process.platform === 'darwin')(
    'snapshots source create-new and performs exact child-wise cleanup on Darwin',
    async () => {
      const parent = await mkdtemp(join(tmpdir(), 'm45-promotion-build-'))
      const buildRoot = join(parent, 'build')
      const filesystem = syntheticFilesystem(buildRoot)
      try {
        await mkdir(buildRoot, { mode: 0o700 })
        await chmod(buildRoot, 0o700)
        const snapshot = await snapshotPolicyExclusivePromotionSourceForFixture(
          buildRoot,
          filesystem,
        )
        const helperBytes = Buffer.from('synthetic-reviewed-helper')
        await writeFile(
          join(buildRoot, 'exclusive-promotion-helper'),
          helperBytes,
          {
            flag: 'wx',
            mode: 0o500,
          },
        )
        await mkdir(join(buildRoot, 'tmp'), { mode: 0o700 })
        expect((await lstat(buildRoot)).nlink).toBe(5)
        await cleanupPolicyExclusivePromotionBuildForFixture(
          buildRoot,
          {
            sourceSha256: snapshot.sha256,
            helperSha256: sha256(helperBytes),
          },
          async (role) => {
            if (role === 'build-source')
              await unlink(join(buildRoot, 'exclusive-promotion-helper.c'))
            else if (role === 'build-helper')
              await unlink(join(buildRoot, 'exclusive-promotion-helper'))
            else if (role === 'build-tmp') await rmdir(join(buildRoot, 'tmp'))
            else await rmdir(buildRoot)
          },
          filesystem,
        )
        await expect(lstat(buildRoot)).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await rm(parent, { recursive: true, force: true })
      }
    },
  )

  it('binds held-file reads to pre/post identity, ACL, path, bytes, and inode', async () => {
    const bytes = Buffer.from('held-public-fixture')
    const effectiveUid = process.geteuid?.()
    expect(effectiveUid).toBeDefined()
    const expected = {
      uid: effectiveUid ?? -1,
      device: 7,
      inode: 11,
      mode: 0o600,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    }
    let aclChecks = 0
    let pathChecks = 0
    const stat = () => ({
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      uid: expected.uid,
      ino: expected.inode,
      nlink: 1,
      dev: expected.device,
      mode: expected.mode,
      size: expected.size,
    })
    await expect(
      readPolicyHeldFileForFixture({
        role: 'custody-file',
        expected,
        statHeld: async () => stat(),
        validateHeldAcl: async () => {
          aclChecks += 1
        },
        readHeld: async () => bytes,
        validatePathIdentity: async () => {
          pathChecks += 1
        },
      }),
    ).resolves.toEqual(bytes)
    expect({ aclChecks, pathChecks }).toEqual({ aclChecks: 2, pathChecks: 2 })

    let statCalls = 0
    await expect(
      readPolicyHeldFileForFixture({
        role: 'custody-file',
        expected,
        statHeld: async () => {
          statCalls += 1
          return { ...stat(), ino: statCalls === 1 ? expected.inode : 12 }
        },
        validateHeldAcl: async () => undefined,
        readHeld: async () => bytes,
        validatePathIdentity: async () => undefined,
      }),
    ).rejects.toThrow('policy-custody')
  })

  it('rehashes the same held file before and after native delete authority', async () => {
    const bytes = Buffer.from('zedarchive-m45-exclusive-success-source-v1\n')
    const expected = {
      byteCount: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
    let deleted = false
    let validations = 0
    await expect(
      deletePolicyHeldFileForFixture({
        role: 'preflight-success-source-file',
        expected,
        validateHeld: async () => {
          validations += 1
        },
        validateNameBoundBeforeDelete: async () => {
          expect(deleted).toBe(false)
        },
        readHeld: async () => bytes,
        invokeNativeDelete: async () => {
          deleted = true
        },
        proveNameAbsent: async () => {
          expect(deleted).toBe(true)
        },
        transition: {
          beforeEntries:
            policyDeleteEntryTransitions['preflight-success-source-file']
              .before,
          afterEntries:
            policyDeleteEntryTransitions['preflight-success-source-file'].after,
          beforeLinks: 3,
          afterLinks: 2,
          preflightAuthority: await syntheticPreflightAuthority(),
        },
      }),
    ).resolves.toBeUndefined()
    expect(validations).toBe(4)

    deleted = false
    await expect(
      deletePolicyHeldFileForFixture({
        role: 'preflight-success-source-file',
        expected,
        validateHeld: async () => undefined,
        validateNameBoundBeforeDelete: async () => undefined,
        readHeld: async () =>
          deleted ? Buffer.from('substituted held bytes') : bytes,
        invokeNativeDelete: async () => {
          deleted = true
        },
        proveNameAbsent: async () => undefined,
        transition: {
          beforeEntries:
            policyDeleteEntryTransitions['preflight-success-source-file']
              .before,
          afterEntries:
            policyDeleteEntryTransitions['preflight-success-source-file'].after,
          beforeLinks: 3,
          afterLinks: 2,
          preflightAuthority: await syntheticPreflightAuthority(),
        },
      }),
    ).rejects.toThrow('policy-byte-drift')
  })

  it('classifies only the three exact terminal build residue states with matching helper bytes', () => {
    expect(policyProductionBuildCleanupSequence).toEqual([
      'build-source',
      'build-tmp',
      'delete-build-terminal',
    ])
    expect(policyProductionBuildCleanupSequence).not.toContain('build-helper')
    expect(policyProductionBuildCleanupSequence).not.toContain('build-root')
    const before = {
      helperShaMatches: true,
      parentEntries: [
        '.policy-exclusive-promotion.lock',
        '.policy-exclusive-promotion-build',
      ],
      parentLinks: 4,
      buildEntries: ['exclusive-promotion-helper'],
      buildLinks: 3,
      helperLinks: 1,
      helperNamePresent: true,
      buildNamePresent: true,
    }
    expect(classifyPolicyTerminalBuildStateForFixture(before)).toBe(
      'terminal-prestate',
    )
    expect(
      classifyPolicyTerminalBuildStateForFixture({
        ...before,
        buildEntries: [],
        buildLinks: 2,
        helperLinks: 0,
        helperNamePresent: false,
      }),
    ).toBe('terminal-helper-unlinked')
    expect(
      classifyPolicyTerminalBuildStateForFixture({
        ...before,
        parentEntries: ['.policy-exclusive-promotion.lock'],
        parentLinks: 3,
        buildEntries: [],
        buildLinks: 0,
        helperLinks: 0,
        helperNamePresent: false,
        buildNamePresent: false,
      }),
    ).toBe('terminal-root-removed-unproved')
    for (const fault of [
      { helperShaMatches: false },
      { buildEntries: ['substituted-helper'] },
      { parentLinks: 5 },
      { helperLinks: 0 },
      { helperNamePresent: false },
      { buildNamePresent: false },
    ])
      expect(
        classifyPolicyTerminalBuildStateForFixture({ ...before, ...fault }),
      ).toBe('terminal-unclassifiable')
  })

  it('kills a native process group on its first forbidden byte and closes non-lock handles in order', async () => {
    const closed: number[] = []
    const handle = (
      fd: number,
      role: 'filler' | 'authority' | 'command-lock',
    ) => ({
      fd,
      role,
      close: async () => {
        closed.push(fd)
      },
    })
    let fillerFd = 5
    const fillers = await openPolicyNativeFillersForFixture(async () => {
      fillerFd += 1
      return {
        ...handle(fillerFd, 'filler'),
        kind: 'character-device' as const,
        distinctIdentity: 'fixed-dev-null',
      }
    })
    const authority = [handle(9, 'authority'), handle(10, 'authority')]
    const commandLock = handle(11, 'command-lock')
    let killed = 0
    let revalidated = 0
    await expect(
      runPolicyNativeProcessForFixture({
        stdoutLimit: 0,
        stderrLimit: 0,
        combinedLimit: 0,
        fillers,
        authority,
        commandLock,
        revalidateCommandLock: async () => {
          revalidated += 1
        },
        spawn: async (onDiagnostic) => ({
          pid: 42,
          waitForClose: async () => {
            onDiagnostic('stdout', Buffer.from('x'))
            expect(killed).toBe(1)
            onDiagnostic('stderr', Buffer.from('later'))
            return {
              code: null,
              signal: 'SIGKILL',
              streamsClosed: true,
              epipe: false,
              spawnError: false,
            }
          },
          requestProcessGroupKill: () => {
            killed += 1
          },
          proveProcessGroupAbsent: async () => true,
          closePipes: async () => undefined,
        }),
        armTimeout: () => () => undefined,
      }),
    ).rejects.toThrow('policy-custody')
    expect(killed).toBe(1)
    expect(revalidated).toBe(4)
    expect(closed).toEqual([10, 9, 8, 7, 6])
    expect(closed).not.toContain(commandLock.fd)
  })

  it('fails closed on missing PID, timeout, spawn error, EPIPE, and lingering group', async () => {
    const cases = [
      { name: 'missing-pid', pid: undefined, spawnError: false },
      { name: 'spawn-error', pid: 42, spawnError: true },
      { name: 'epipe', pid: 42, epipe: true },
      { name: 'lingering-group', pid: 42, groupAbsent: false },
      { name: 'timeout', pid: 42, timeout: true },
    ] as const
    for (const fault of cases) {
      const closed: number[] = []
      let killed = 0
      const makeHandle = (
        fd: number,
        role: 'filler' | 'authority' | 'command-lock',
      ) => ({
        fd,
        role,
        close: async () => {
          closed.push(fd)
        },
      })
      await expect(
        runPolicyNativeProcessForFixture({
          stdoutLimit: 64,
          stderrLimit: 64,
          combinedLimit: 96,
          fillers: [
            makeHandle(6, 'filler'),
            makeHandle(7, 'filler'),
            makeHandle(8, 'filler'),
          ],
          authority: [makeHandle(9, 'authority')],
          commandLock: makeHandle(10, 'command-lock'),
          revalidateCommandLock: async () => undefined,
          spawn: async () => {
            if (fault.name === 'spawn-error') throw new Error('synthetic spawn')
            return {
              pid: fault.pid,
              waitForClose: async () => ({
                code: 0,
                signal: null,
                streamsClosed: true,
                epipe: 'epipe' in fault && fault.epipe,
                spawnError: false,
              }),
              requestProcessGroupKill: () => {
                killed += 1
              },
              proveProcessGroupAbsent: async () =>
                !('groupAbsent' in fault) || fault.groupAbsent,
              closePipes: async () => undefined,
            }
          },
          armTimeout: (onTimeout) => {
            if ('timeout' in fault && fault.timeout) onTimeout()
            return () => undefined
          },
        }),
      ).rejects.toThrow('policy-custody')
      if (fault.name === 'missing-pid' || fault.name === 'spawn-error')
        expect(killed).toBe(0)
      expect(closed).toEqual([9, 8, 7, 6])
    }
  })

  it('reaps after a close-wait fault and attempts every pipe and descriptor close', async () => {
    const closed: number[] = []
    let waits = 0
    let pipesClosed = 0
    const makeHandle = (
      fd: number,
      role: 'filler' | 'authority' | 'command-lock',
      closeFails = false,
    ) => ({
      fd,
      role,
      close: async () => {
        closed.push(fd)
        if (closeFails) throw new Error('synthetic close failure')
      },
    })
    await expect(
      runPolicyNativeProcessForFixture({
        stdoutLimit: 0,
        stderrLimit: 0,
        combinedLimit: 0,
        fillers: [
          makeHandle(6, 'filler'),
          makeHandle(7, 'filler'),
          makeHandle(8, 'filler'),
        ],
        authority: [
          makeHandle(9, 'authority', true),
          makeHandle(10, 'authority'),
        ],
        commandLock: makeHandle(11, 'command-lock'),
        revalidateCommandLock: async () => undefined,
        spawn: async () => ({
          pid: 42,
          waitForClose: async () => {
            waits += 1
            if (waits === 1) throw new Error('synthetic wait failure')
            return {
              code: null,
              signal: 'SIGKILL',
              streamsClosed: true,
              epipe: false,
              spawnError: false,
            }
          },
          requestProcessGroupKill: () => undefined,
          proveProcessGroupAbsent: async () => true,
          closePipes: async () => {
            pipesClosed += 1
          },
        }),
        armTimeout: () => () => undefined,
      }),
    ).rejects.toThrow('policy-custody')
    expect(waits).toBe(2)
    expect(pipesClosed).toBe(1)
    expect(closed).toEqual([10, 9, 8, 7, 6])
  })

  it('uses only named native launcher operations with bounded synthetic process mechanics', async () => {
    const launches: Array<{
      executable: string
      arguments: string[]
      options: Record<string, unknown>
    }> = []
    let launchMode: 'diagnostic-success' | 'forbidden-helper-output' =
      'diagnostic-success'
    let liveGroupProbesRemaining = 0
    const spawnMock = vi.fn(
      (
        executable: string,
        arguments_: string[],
        options: Record<string, unknown>,
      ) => {
        launches.push({ executable, arguments: arguments_, options })
        const child = new EventEmitter() as EventEmitter & {
          pid: number
          stdout: EventEmitter & { destroy: () => void }
          stderr: EventEmitter & { destroy: () => void }
        }
        child.pid = 4242
        child.stdout = Object.assign(new EventEmitter(), {
          destroy: () => undefined,
        })
        child.stderr = Object.assign(new EventEmitter(), {
          destroy: () => undefined,
        })
        queueMicrotask(() => {
          if (launchMode === 'diagnostic-success') {
            child.stdout.emit('data', Buffer.from('/compiler\n'))
            child.emit('close', 0, null)
          } else {
            child.stdout.emit('data', Buffer.from('forbidden'))
            child.emit('close', null, 'SIGKILL')
          }
        })
        return child
      },
    )
    vi.doMock('node:child_process', () => ({ spawn: spawnMock }))
    vi.resetModules()
    const kill = vi.spyOn(process, 'kill').mockImplementation((_, signal) => {
      if (signal === 0) {
        if (liveGroupProbesRemaining > 0) {
          liveGroupProbesRemaining -= 1
          return true
        }
        const error = new Error(
          'synthetic absent group',
        ) as NodeJS.ErrnoException
        error.code = 'ESRCH'
        throw error
      }
      return true
    })
    try {
      const launcher =
        await import('@/../scripts/m45-policy-baseline-native-launcher')
      const broker = launcher.initializePolicyNativeOperationBroker()
      expect(() => launcher.initializePolicyNativeOperationBroker()).toThrow(
        'policy-native-launch-initialized',
      )
      const repositoryRoot = '/Users/fixture/zedarchive'
      const xcrun = await broker.runXcrunCompilerPath({
        repositoryRoot,
      })
      expect(xcrun).toMatchObject({
        code: 0,
        stdoutBytes: 10,
        stderrBytes: 0,
        processGroupAbsent: true,
        streamsClosed: true,
      })
      expect(launches[0]).toEqual({
        executable: '/usr/bin/xcrun',
        arguments: ['--find', 'clang'],
        options: {
          cwd: repositoryRoot,
          env: {},
          shell: false,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      })

      launchMode = 'forbidden-helper-output'
      liveGroupProbesRemaining = 2
      const helperBytes = Buffer.from('synthetic launcher helper')
      const helperPackage = await createPolicyPromotionPackage({
        stage: 'B',
        rootIdentitySha256: 'b'.repeat(64),
        toolchainAuthority: await syntheticToolchainAuthority(),
        helperBytes,
        preflightAuthority: await syntheticPreflightAuthority(),
        reviewAuthoritySha256: null,
      })
      const helperPath = `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build/exclusive-promotion-helper`
      const heldCore = {
        helperPath,
        helperSha256: helperPackage.material.helperSha256,
        device: '7',
        inode: '8',
        byteCount: helperBytes.byteLength,
      }
      await expect(
        broker.runHelper(
          {
            repositoryRoot,
            helperPath,
            device: '7',
            inode: '8',
            byteCount: helperBytes.byteLength,
            provenancePackage: helperPackage,
            heldEvidenceSha256: createHash('sha256')
              .update(canonicalJson(heldCore))
              .digest('hex'),
          },
          {
            kind: 'metadata-check',
            role: 'command-lock',
            evidence: {
              uid: '501',
              device: '7',
              inode: '9',
              links: '1',
              mode: String(0o600),
              size: '0',
            },
            authorityFd: 9,
          },
        ),
      ).rejects.toThrow('policy-native-launch-failed')
      expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL')
      expect(launches[1]?.options).toMatchObject({
        cwd: repositoryRoot,
        env: {},
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 9],
      })

      // The fixture verifier is deliberately broker-private in production. It
      // reparses the retained C cleanup core, so every mutation below proves
      // the real admission/hash boundary rather than a copied test parser.
      const aPackage = await createPolicyPromotionPackage({
        stage: 'A',
        rootIdentitySha256: 'a'.repeat(64),
        toolchainAuthority: await syntheticToolchainAuthority(),
        helperBytes,
        preflightAuthority: null,
        reviewAuthoritySha256: null,
      })
      const bPreflight = await syntheticPreflightAuthority()
      const bPackage = await createPolicyPromotionPackage({
        stage: 'B',
        rootIdentitySha256: 'b'.repeat(64),
        toolchainAuthority: await syntheticToolchainAuthority(),
        helperBytes,
        preflightAuthority: bPreflight,
        reviewAuthoritySha256: null,
      })
      const candidate = await createPolicyPromotionProvenanceCandidate(
        aPackage,
        bPackage,
      )
      const accepted = await createAcceptedPolicyPromotionLiterals(
        candidate,
        'c'.repeat(64),
      )
      const buildRoot = `${repositoryRoot}/.local/m45/.policy-exclusive-promotion-build`
      const canonicalSha256 = (value: unknown) =>
        createHash('sha256').update(canonicalJson(value)).digest('hex')
      const held = (
        role: string,
        path: string,
        mode: number,
        links: number,
        size: string,
        helperSha256: string | null,
      ) => {
        const core = {
          role,
          path,
          uid: '501',
          device: '7',
          inode: String(10 + links),
          mode: String(mode),
          links: String(links),
          size,
          sha256: helperSha256,
        }
        return { ...core, evidenceSha256: canonicalSha256(core) }
      }
      const heldEvidence = {
        'command-lock': held(
          'command-lock',
          `${repositoryRoot}/.local/m45/.policy-exclusive-promotion.lock`,
          0o600,
          1,
          '0',
          null,
        ),
        'build-root': held('build-root', buildRoot, 0o700, 5, 'na', null),
        'build-tmp': held(
          'build-tmp',
          `${buildRoot}/tmp`,
          0o700,
          2,
          'na',
          null,
        ),
        'build-source': held(
          'build-source',
          `${buildRoot}/exclusive-promotion-helper.c`,
          0o400,
          1,
          '12',
          'd'.repeat(64),
        ),
        'build-helper': held(
          'build-helper',
          `${buildRoot}/exclusive-promotion-helper`,
          0o500,
          1,
          String(helperBytes.byteLength),
          accepted.material.helperSha256,
        ),
      }
      const cCore = {
        schema: 'policy-c-accepted-helper-launch.v1',
        version: 1,
        workflow: 'C-accepted',
        repositoryRoot,
        acceptedLiterals: accepted,
        aRootIdentitySha256: aPackage.rootIdentitySha256,
        bRootIdentitySha256: bPackage.rootIdentitySha256,
        cRootIdentitySha256: 'e'.repeat(64),
        heldEvidence,
        buildInventorySha256: canonicalSha256(
          canonicalJson([
            'exclusive-promotion-helper',
            'exclusive-promotion-helper.c',
            'tmp',
          ]),
        ),
        trackedCommitments: {
          sourceSha256: accepted.material.sourceSha256,
          launchContractSha256: accepted.material.launchContractSha256,
          launcherSha256: accepted.material.launcherSha256,
          nativeAuthoritySha256: accepted.material.nativeAuthoritySha256,
          lockPreflightWorkerSha256:
            accepted.material.lockPreflightWorkerSha256,
        },
      }
      const cSession = broker.beginCAcceptedSession({
        ...cCore,
        cAcceptedHelperLaunchSha256: canonicalSha256(cCore),
      })
      const cCleanup = broker.beginCAcceptedCleanup(cSession, {
        workflow: 'C-accepted',
        checkpoint: 'P13',
        checkpointSha256: 'f'.repeat(64),
        checkpointWorkflow: 'C-accepted',
        childLaunched: true,
        failedOperationFamily: 'preflight-promotion',
        failedOperationIndex: 12,
        lifecycleClosed: true,
      })
      const cSnapshot = broker.snapshotCAcceptedCleanupForFixture(cCleanup)
      expect(() =>
        broker.verifyCAcceptedCleanupForFixture(cCleanup, cSnapshot),
      ).not.toThrow()
      for (const [field, value] of Object.entries(cSnapshot)) {
        const drift = {
          ...cSnapshot,
          [field]:
            typeof value === 'boolean'
              ? !value
              : typeof value === 'number'
                ? value + 1
                : Array.isArray(value)
                  ? [...value, 'substituted']
                  : field.includes('Sha256')
                    ? '0'.repeat(64)
                    : `${value}-substituted`,
        }
        expect(() =>
          broker.verifyCAcceptedCleanupForFixture(cCleanup, drift),
        ).toThrow('policy-native-c-accepted-cleanup')
      }
      await expect(
        Promise.resolve().then(() =>
          broker.beginCAcceptedCleanup(Object.freeze({}), {
            workflow: 'B-candidate',
            checkpoint: 'P13',
            checkpointSha256: 'f'.repeat(64),
            checkpointWorkflow: 'B-candidate',
            childLaunched: true,
            failedOperationFamily: 'preflight-promotion',
            failedOperationIndex: 12,
            lifecycleClosed: true,
          }),
        ),
      ).rejects.toThrow('policy-native-c-accepted-cleanup')
    } finally {
      kill.mockRestore()
      vi.doUnmock('node:child_process')
    }
  })

  it('uses an injected, fixed launch plan and kills a failed process group', async () => {
    const values = fixture()
    const directory = await mkdtemp(join(tmpdir(), 'm45-policy-reviewer-'))
    const filesystem = syntheticFilesystem(directory)
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
    const filesystem = syntheticFilesystem(directory)
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
