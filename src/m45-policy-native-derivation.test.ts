import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  createPolicySyntheticNativeDerivationFixture,
  executePolicyNativeDerivationCli,
  runPolicyNativeDerivationCommand,
  type PolicyNativeDerivationSeams,
} from '@/../scripts/m45-policy-native-derivation'
import {
  createAcceptedPolicyPromotionLiterals,
  inspectPolicyExclusivePromotionSource,
  inspectPolicyLockPreflightWorker,
  inspectPolicyNativeLaunchSources,
} from '@/../scripts/m45-policy-baseline'
import {
  runPolicyProvisionalAPrebuildDiagnosticForFixture,
  runPolicyProvisionalBuildC,
} from '@/../scripts/m45-policy-baseline-native-authority'
import { createPolicySharedTerminalPlanForFixture } from '@/../scripts/m45-policy-baseline-native-launch-contract'

const root = '/repo'
const m45 = `${root}/.local/m45`
const control = `${m45}/policy-native-derivation`
const digest = 'a'.repeat(64)
const tracked = {
  commit: 'b'.repeat(40),
  runnerSha256: digest,
  sourceSha256: digest,
  launchContractSha256: digest,
  launcherSha256: digest,
  nativeAuthoritySha256: digest,
  lockPreflightWorkerSha256: digest,
}

async function residueFailure(): Promise<never> {
  throw new Error('residue')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function exactEntriesForFixture(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return canonical([...left].sort()) === canonical([...right].sort())
}

function rewriteSelfHashedArtifact(
  entries: Map<string, Entry>,
  filename: string,
  mutate: (artifact: Record<string, unknown>) => void,
): void {
  const entry = entries.get(`${control}/${filename}`)!
  const artifact = JSON.parse(entry.bytes!.toString('utf8')) as Record<
    string,
    unknown
  >
  mutate(artifact)
  delete artifact.artifactSha256
  artifact.artifactSha256 = createHash('sha256')
    .update(canonical(artifact))
    .digest('hex')
  entry.bytes = Buffer.from(`${canonical(artifact)}\n`)
  entry.metadata.size = entry.bytes.byteLength
}

function stageAPackage() {
  const material = {
    xcrunSha256: digest,
    xcrunDevice: '1',
    xcrunInode: '1',
    sourceSha256: tracked.sourceSha256,
    compilerSha256: digest,
    compilerDevice: '1',
    compilerInode: '1',
    sdkIdentitySha256: digest,
    sdkDevice: '1',
    sdkInode: '1',
    headerSetSha256: digest,
    diagnosticSha256: digest,
    compileContractSha256: digest,
    launchContractSha256: tracked.launchContractSha256,
    launcherSha256: tracked.launcherSha256,
    nativeAuthoritySha256: tracked.nativeAuthoritySha256,
    lockPreflightWorkerSha256: tracked.lockPreflightWorkerSha256,
    helperSha256: digest,
  }
  const core = {
    schema: 'policy-exclusive-promotion-provenance.v1',
    version: 1,
    stage: 'A',
    rootIdentitySha256: digest,
    material,
    preflightAuthoritySha256: null,
    reviewAuthoritySha256: null,
    cleanupProved: true,
  }
  return {
    ...core,
    packageSha256: createHash('sha256').update(canonical(core)).digest('hex'),
  }
}

function stageBPackage() {
  const stageA = stageAPackage()
  const stageACore = Object.fromEntries(
    Object.entries(stageA).filter(([key]) => key !== 'packageSha256'),
  ) as Omit<typeof stageA, 'packageSha256'>
  const core = {
    ...stageACore,
    stage: 'B',
    rootIdentitySha256: 'd'.repeat(64),
    preflightAuthoritySha256: 'e'.repeat(64),
  }
  return {
    ...core,
    packageSha256: createHash('sha256').update(canonical(core)).digest('hex'),
  }
}

async function actualStagePackages() {
  const [source, launch, worker] = await Promise.all([
    inspectPolicyExclusivePromotionSource(),
    inspectPolicyNativeLaunchSources(),
    inspectPolicyLockPreflightWorker(),
  ])
  tracked.sourceSha256 = source.sha256
  tracked.launchContractSha256 = launch.launchContractSha256
  tracked.launcherSha256 = launch.launcherSha256
  tracked.nativeAuthoritySha256 = launch.nativeAuthoritySha256
  tracked.lockPreflightWorkerSha256 = worker.sha256
  const create = (stage: 'A' | 'B') => {
    const seed = stage === 'A' ? stageAPackage() : stageBPackage()
    const core = Object.fromEntries(
      Object.entries(seed).filter(([key]) => key !== 'packageSha256'),
    ) as Omit<typeof seed, 'packageSha256'>
    const material = {
      ...core.material,
      sourceSha256: source.sha256,
      launchContractSha256: launch.launchContractSha256,
      launcherSha256: launch.launcherSha256,
      nativeAuthoritySha256: launch.nativeAuthoritySha256,
      lockPreflightWorkerSha256: worker.sha256,
    }
    const actualCore = { ...core, material }
    return {
      ...actualCore,
      packageSha256: createHash('sha256')
        .update(canonical(actualCore))
        .digest('hex'),
    }
  }
  return { stageA: create('A'), stageB: create('B') }
}

function sharedTerminalOperation(phase: 'shared-a' | 'shared-b') {
  const directory = (inode: string, links = '2', mode = '448') => ({
    uid: '501',
    device: '9',
    inode,
    links,
    mode,
    size: 'na',
  })
  return {
    kind: 'delete-build-terminal-shared' as const,
    phase,
    parent: directory('10', '8'),
    buildRoot: directory('11', '3'),
    helper: {
      uid: '501',
      device: '9',
      inode: '12',
      links: '1',
      mode: '320',
      size: '10',
    },
    siblings: {
      'candidate-review': directory('13'),
      discovery: directory('14'),
      'predecessor-review': directory('15'),
      'policy-native-derivation': directory(
        '16',
        phase === 'shared-a' ? '3' : '4',
      ),
    },
    commandLockFd: 7,
    parentFd: 8,
    buildRootFd: 9,
    helperFd: 10,
  }
}

type Entry = {
  metadata: {
    uid: number
    dev: number
    ino: number
    mode: number
    nlink: number
    size: number
    file: boolean
    directory: boolean
    symbolicLink: boolean
  }
  bytes?: Buffer
  entries?: Set<string>
}

function fixture(
  options: Readonly<{
    substituteBeforeChmod?: boolean
    syntheticLegacy?: boolean
    substituteDuringHeldFile?: string
    wrongPostNlinkPath?: string
    deriveALockTransition?: boolean
  }> = {},
) {
  let inode = 100
  const fixtureOptions = options
  const entries = new Map<string, Entry>()
  const directoryInventoryReads: string[] = []
  const heldFileReads: string[] = []
  const heldMetadataPaths = new Set<string>()
  const wrongPostNlinkPaths = new Set(
    options.wrongPostNlinkPath ? [options.wrongPostNlinkPath] : [],
  )
  const wrongInitialNlinkPaths = new Set<string>()
  const syntheticFixture = options.syntheticLegacy
    ? createPolicySyntheticNativeDerivationFixture()
    : undefined
  const addDirectory = (
    path: string,
    entryNames: string[] = [],
    mode = 0o700,
  ) => {
    entries.set(path, {
      metadata: {
        uid: 501,
        dev: 9,
        ino: inode++,
        mode,
        nlink: 2,
        size: 0,
        file: false,
        directory: true,
        symbolicLink: false,
      },
      entries: new Set(entryNames),
    })
  }
  addDirectory(root)
  addDirectory(`${root}/.local`)
  addDirectory(
    m45,
    ['candidate-review', 'discovery', 'predecessor-review'],
    0o755,
  )
  for (const name of ['candidate-review', 'discovery', 'predecessor-review'])
    addDirectory(`${m45}/${name}`)
  if (options.syntheticLegacy) {
    const synthetic = syntheticFixture!.residue
    entries.set(m45, {
      metadata: { ...synthetic.root },
      entries: new Set([
        'candidate-review',
        'discovery',
        'predecessor-review',
        'policy-native-derivation',
      ]),
    })
    for (const [name, metadata] of Object.entries(synthetic.siblings))
      entries.set(`${m45}/${name}`, {
        metadata: { ...metadata },
        entries: new Set(),
      })
    entries.set(control, {
      metadata: { ...synthetic.control },
      entries: new Set(['shared-root-baseline.v1.json']),
    })
    entries.set(`${control}/shared-root-baseline.v1.json`, {
      metadata: { ...synthetic.baseline },
      bytes: Buffer.from(synthetic.baselineBytes),
    })
  }
  const addCommandLock = () => {
    const path = `${m45}/.policy-exclusive-promotion.lock`
    if (entries.has(path)) throw new Error('lock-exists')
    entries.set(path, {
      metadata: {
        ...(syntheticFixture?.residue.lock ?? {
          uid: 501,
          dev: 9,
          ino: inode++,
          mode: 0o600,
          nlink: 1,
          size: 0,
        }),
        file: true,
        directory: false,
        symbolicLink: false,
      },
    })
    entries.get(m45)!.entries!.add('.policy-exclusive-promotion.lock')
    if (syntheticFixture)
      entries.get(m45)!.metadata.size =
        syntheticFixture.residue.lockOnlyRoot.size
  }
  const filesystem = {
    lstat: vi.fn(async (path: string) => {
      const value = entries.get(path)
      if (!value) {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
        throw error
      }
      return {
        ...value.metadata,
        nlink: value.metadata.directory
          ? 2 + (value.entries?.size ?? 0)
          : value.metadata.nlink,
      }
    }),
    readdir: vi.fn(async (path: string) => {
      const value = entries.get(path)
      if (!value?.entries) throw new Error('not-directory')
      return [...value.entries]
    }),
    readFile: vi.fn(async (path: string) => {
      const value = entries.get(path)
      if (!value?.bytes) throw new Error('not-file')
      return Buffer.from(value.bytes)
    }),
    realpath: vi.fn(async (path: string) => path),
    mkdir: vi.fn(async (path: string, options: { mode: number }) => {
      if (entries.has(path)) throw new Error('exists')
      addDirectory(path, [], options.mode)
      const parent = entries.get(path.slice(0, path.lastIndexOf('/')))
      parent?.entries?.add(path.slice(path.lastIndexOf('/') + 1))
    }),
    writeFile: vi.fn(
      async (
        path: string,
        content: string,
        options: { flag: string; mode: number },
      ) => {
        if (options.flag !== 'wx' || entries.has(path))
          throw new Error('exists')
        const bytes = Buffer.from(content)
        entries.set(path, {
          metadata: {
            uid: 501,
            dev: 9,
            ino: inode++,
            mode: options.mode,
            nlink: 1,
            size: bytes.byteLength,
            file: true,
            directory: false,
            symbolicLink: false,
          },
          bytes,
        })
        const parent = entries.get(path.slice(0, path.lastIndexOf('/')))
        parent?.entries?.add(path.slice(path.lastIndexOf('/') + 1))
      },
    ),
    chmodHeldDirectory: vi.fn(
      async (path: string, mode: number, expected: Entry['metadata']) => {
        const value = entries.get(path)
        if (!value) throw new Error('missing')
        if (options.substituteBeforeChmod) value.metadata.ino += 1
        const current = {
          ...value.metadata,
          nlink: value.metadata.directory
            ? 2 + (value.entries?.size ?? 0)
            : value.metadata.nlink,
        }
        if (canonical(current) !== canonical(expected))
          throw new Error('substitution')
        value.metadata.mode = mode
        return { ...current, mode }
      },
    ),
    heldDirectory: vi.fn(async (path: string) => {
      const value = entries.get(path)
      if (!value?.entries) throw new Error('not-directory')
      const metadata = {
        ...value.metadata,
        nlink: 2 + value.entries.size,
      }
      return {
        before: metadata,
        entries: [...value.entries],
        after: { ...metadata },
        pathAfter: { ...metadata },
      }
    }),
    withHeldDirectory: async <T>(
      path: string,
      readEntries: boolean,
      postEntries:
        readonly string[] | (() => readonly string[] | undefined) | undefined,
      operation: (
        metadata: Entry['metadata'],
        entries: readonly string[] | undefined,
        revalidate: (expectedEntries?: readonly string[]) => Promise<void>,
      ) => Promise<T>,
    ) => {
      const value = entries.get(path)
      if (!value?.entries) throw new Error('not-directory')
      if (readEntries) directoryInventoryReads.push(path)
      const beforeEntries = [...value.entries]
      const before = {
        ...value.metadata,
        nlink:
          2 + value.entries.size + (wrongInitialNlinkPaths.has(path) ? 1 : 0),
      }
      const revalidate = async (
        expectedEntries = (typeof postEntries === 'function'
          ? postEntries()
          : postEntries) ?? beforeEntries,
      ) => {
        const after = {
          ...value.metadata,
          nlink:
            2 + value.entries!.size + (wrongPostNlinkPaths.has(path) ? 1 : 0),
        }
        if (
          before.uid !== after.uid ||
          before.dev !== after.dev ||
          before.ino !== after.ino ||
          before.mode !== after.mode ||
          before.file !== after.file ||
          before.directory !== after.directory ||
          before.symbolicLink !== after.symbolicLink ||
          (!readEntries && canonical(before) !== canonical(after)) ||
          (readEntries &&
            (!exactEntriesForFixture(expectedEntries, [...value.entries!]) ||
              after.nlink !== 2 + expectedEntries.length))
        )
          throw new Error('drift')
      }
      const result = await operation(
        before,
        readEntries ? [...value.entries] : undefined,
        revalidate,
      )
      await revalidate()
      return result
    },
    withHeldFile: async <T>(
      path: string,
      expectedSize: number | undefined,
      operation: (
        metadata: Entry['metadata'],
        bytes: Buffer,
        revalidate: () => Promise<void>,
      ) => Promise<T>,
    ) => {
      const value = entries.get(path)
      if (!value?.bytes) throw new Error('not-file')
      const before = { ...value.metadata }
      if (
        !Number.isSafeInteger(before.size) ||
        before.size <= 0 ||
        before.size > 16 * 1024 * 1024 ||
        (expectedSize !== undefined && before.size !== expectedSize)
      )
        throw new Error('held-file-size')
      heldFileReads.push(path)
      const beforeBytes = Buffer.from(value.bytes)
      const revalidate = async () => {
        if (
          canonical(before) !== canonical(value.metadata) ||
          !beforeBytes.equals(value.bytes!)
        )
          throw new Error('drift')
      }
      const result = await operation(before, beforeBytes, revalidate)
      if (path.endsWith(`/${fixtureOptions.substituteDuringHeldFile}`))
        value.metadata.ino++
      await revalidate()
      return result
    },
    withHeldMetadataFile: async <T>(
      path: string,
      operation: (
        metadata: Entry['metadata'],
        revalidate: () => Promise<void>,
      ) => Promise<T>,
    ) => {
      const value = entries.get(path)
      if (!value || value.bytes || value.entries) throw new Error('not-file')
      const before = { ...value.metadata }
      const revalidate = async () => {
        if (canonical(before) !== canonical(value.metadata))
          throw new Error('drift')
      }
      heldMetadataPaths.add(path)
      try {
        const result = await operation(before, revalidate)
        await revalidate()
        return result
      } finally {
        heldMetadataPaths.delete(path)
      }
    },
  }
  const seams: Partial<PolicyNativeDerivationSeams> = {
    filesystem,
    platform: 'darwin',
    nodeVersion: '24.18.1',
    executablePath: '/opt/homebrew/Cellar/node@24/24.18.1/bin/node',
    npmUserAgent: 'npm/11.18.0 node/v24.18.1 darwin arm64 workspaces/false',
    effectiveUid: 501,
    cwd: root,
    tracked: vi.fn(async () => tracked),
    revalidateTracked: vi.fn(async (_repositoryRoot, expected) => expected),
    nonce: () => digest,
    deriveA: vi.fn(),
    deriveB: vi.fn(),
    diagnoseA: vi.fn(),
  }
  const baseRun = syntheticFixture?.run ?? runPolicyNativeDerivationCommand
  const run = (
    argv: readonly string[],
    overrides: Partial<PolicyNativeDerivationSeams> = {},
  ) => {
    const deriveA = overrides.deriveA
    const effectiveOverrides =
      argv[0] === 'derive-a' &&
      deriveA !== undefined &&
      fixtureOptions.deriveALockTransition !== false
        ? {
            ...overrides,
            deriveA: async (
              input: Parameters<PolicyNativeDerivationSeams['deriveA']>[0],
            ) => {
              try {
                return await deriveA(input)
              } finally {
                if (!entries.has(`${m45}/.policy-exclusive-promotion.lock`))
                  addCommandLock()
              }
            },
          }
        : overrides
    return baseRun(argv, effectiveOverrides)
  }
  return {
    entries,
    filesystem,
    seams,
    directoryInventoryReads,
    heldFileReads,
    heldMetadataPaths,
    wrongPostNlinkPaths,
    wrongInitialNlinkPaths,
    syntheticResidue: syntheticFixture?.residue,
    run,
  }
}

describe('Decisions 115–116 native policy derivation runner', () => {
  it('accepts only the exact closed command grammar', async () => {
    const { seams, filesystem } = fixture()
    await expect(
      runPolicyNativeDerivationCommand(['check'], seams),
    ).resolves.toMatchObject({ status: 'checked' })
    await expect(
      runPolicyNativeDerivationCommand(
        ['check', '--confirm-m45-policy-native-derivation-v1'],
        seams,
      ),
    ).rejects.toThrow()
    await expect(
      runPolicyNativeDerivationCommand(
        ['derive-a', '--confirm-m45-policy-native-review-v1'],
        seams,
      ),
    ).rejects.toThrow()
    await expect(
      runPolicyNativeDerivationCommand(
        ['diagnose-a', '--confirm-m45-policy-native-derivation-v1'],
        seams,
      ),
    ).rejects.toThrow()
    await expect(
      runPolicyNativeDerivationCommand(
        ['preflight', '--confirm-m45-policy-native-derivation-v1', 'extra'],
        seams,
      ),
    ).rejects.toThrow()
    await expect(
      runPolicyNativeDerivationCommand(
        ['recover-preflight', '--confirm-m45-policy-native-recovery-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(filesystem.mkdir).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(filesystem.chmodHeldDirectory).not.toHaveBeenCalled()
  })

  it('recovers the fixed synthetic residue idempotently without mutation', async () => {
    const { seams, filesystem, run } = fixture({ syntheticLegacy: true })
    const command = [
      'recover-preflight',
      '--confirm-m45-policy-native-recovery-v1',
    ] as const
    await expect(run(command, seams)).resolves.toMatchObject({
      status: 'preflight-recovered',
    })
    await expect(run(command, seams)).resolves.toMatchObject({
      status: 'preflight-recovered',
    })
    expect(filesystem.mkdir).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(filesystem.chmodHeldDirectory).not.toHaveBeenCalled()
  })

  it('admits diagnose-a only from the exact D117 lock-only custody state', async () => {
    const { seams, entries, heldFileReads, run } = fixture({
      syntheticLegacy: true,
    })
    const diagnostic = vi.fn(async () => ({
      lastSuccessfulBoundary: 'toolchain-authority' as const,
      derivationLockCycleClosed: true as const,
    }))
    await expect(
      run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
        ...seams,
        diagnoseA: diagnostic,
      }),
    ).rejects.toThrow()
    expect(diagnostic).not.toHaveBeenCalled()

    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(residueFailure),
      }),
    ).resolves.toMatchObject({ status: 'a-residue-preserved' })
    const lockPath = `${m45}/.policy-exclusive-promotion.lock`
    const before = { ...entries.get(lockPath)!.metadata }
    await expect(
      run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
        ...seams,
        diagnoseA: diagnostic,
      }),
    ).resolves.toMatchObject({
      mode: 'diagnose-a',
      status: 'diagnostic-stopped',
      lastSuccessfulBoundary: 'toolchain-authority',
      derivationLockCycleClosed: true,
    })
    expect(diagnostic).toHaveBeenCalledOnce()
    expect(entries.get(lockPath)?.metadata).toEqual(before)
    expect(heldFileReads).not.toContain(lockPath)
  })

  it('emits the toolchain commitment only after the closed diagnostic boundary', async () => {
    const { seams, filesystem, run } = fixture({ syntheticLegacy: true })
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(residueFailure),
    })
    await expect(
      run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
        ...seams,
        diagnoseA: vi.fn(async () => ({
          lastSuccessfulBoundary: 'derivation-lock-cycle-closed' as const,
          derivationLockCycleClosed: true as const,
          authorityPackageSha256: digest,
        })),
      }),
    ).resolves.toMatchObject({
      status: 'diagnostic-complete',
      lastSuccessfulBoundary: 'derivation-lock-cycle-closed',
      commitments: { toolchainAuthorityPackageSha256: digest },
    })
    expect(filesystem.mkdir).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(filesystem.chmodHeldDirectory).not.toHaveBeenCalled()
  })

  it('rejects malformed diagnostic bridge material without adding authority', async () => {
    const { seams, run } = fixture({ syntheticLegacy: true })
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(residueFailure),
    })
    await expect(
      run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
        ...seams,
        diagnoseA: vi.fn(async () => ({
          lastSuccessfulBoundary: 'compiler-diagnostic' as const,
          authorityPackageSha256: digest,
        })),
      }),
    ).rejects.toThrow()
  })

  it('rejects diagnostic bridge material with any extra field', async () => {
    const { seams, run } = fixture({ syntheticLegacy: true })
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(residueFailure),
    })
    await expect(
      run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
        ...seams,
        diagnoseA: vi.fn(async () => ({
          lastSuccessfulBoundary: 'derivation-lock-cycle-closed' as const,
          derivationLockCycleClosed: true as const,
          authorityPackageSha256: digest,
          paths: ['/private/compiler'],
        })),
      }),
    ).rejects.toThrow()
  })

  it.each([
    [
      'root identity',
      (entries: Map<string, Entry>) => entries.get(m45)!.metadata.ino++,
    ],
    [
      'control identity',
      (entries: Map<string, Entry>) => entries.get(control)!.metadata.ino++,
    ],
    [
      'baseline bytes',
      (entries: Map<string, Entry>) =>
        entries.get(`${control}/shared-root-baseline.v1.json`)!.bytes!.fill(0),
    ],
    [
      'preserved sibling identity',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/discovery`)!.metadata.ino++,
    ],
    [
      'lock identity',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.ino++,
    ],
    [
      'fixed absence',
      (entries: Map<string, Entry>) =>
        entries.get(m45)!.entries!.add('.policy-exclusive-promotion-build'),
    ],
  ] as const)(
    'rejects diagnostic %s drift before its native bridge',
    async (_label, mutate) => {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(residueFailure),
      })
      mutate(entries)
      const diagnoseA = vi.fn()
      await expect(
        run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
          ...seams,
          diagnoseA,
        }),
      ).rejects.toThrow()
      expect(diagnoseA).not.toHaveBeenCalled()
    },
  )

  it('collapses post-diagnostic tracked-source or outer-custody drift', async () => {
    for (const drift of ['tracked', 'custody'] as const) {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(residueFailure),
      })
      let trackedChecks = 0
      const diagnoseA = vi.fn(async () => {
        if (drift === 'custody') entries.get(m45)!.metadata.ino++
        return {
          lastSuccessfulBoundary: 'toolchain-authority' as const,
          derivationLockCycleClosed: true as const,
        }
      })
      await expect(
        run(['diagnose-a', '--confirm-m45-policy-native-a-diagnostic-v1'], {
          ...seams,
          diagnoseA,
          revalidateTracked: vi.fn(async (_repositoryRoot, expected) => {
            trackedChecks += 1
            return drift === 'tracked' && trackedChecks === 2
              ? { ...expected, commit: 'd'.repeat(40) }
              : expected
          }),
        }),
      ).rejects.toThrow()
      expect(diagnoseA).toHaveBeenCalledOnce()
    }
  })

  it('runs the exact five-child diagnostic bridge in fixed order with closed safe output', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const observed = await runPolicyProvisionalAPrebuildDiagnosticForFixture({
      faultAt: null,
    })
    expect(observed).toEqual({
      output: {
        status: 'diagnostic-complete',
        lastSuccessfulBoundary: 'derivation-lock-cycle-closed',
        derivationLockCycleClosed: true,
        authorityPackageSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      childOrder: [
        'held-lock-contender',
        'released-lock-contender',
        'xcrun-compiler-resolver',
        'xcrun-sdk-resolver',
        'compiler-diagnostic',
      ],
      lifecycle: [
        'capability-open',
        'held-contender-child',
        'held-contender-lifecycle',
        'held-contender-postcheck',
        'released-contender-child',
        'released-contender-lifecycle',
        'released-contender-postcheck',
        'derivation-lock-open',
        'compiler-child',
        'compiler-lifecycle',
        'compiler-output',
        'sdk-child',
        'sdk-lifecycle',
        'sdk-output',
        'attestation-protected-stat',
        'attestation-protected-read',
        'diagnostic-child',
        'diagnostic-lifecycle',
        'postcheck-xcrun',
        'postcheck-tracked-source',
        'postcheck-compiler',
        'postcheck-compiler-bytes',
        'postcheck-sdk',
        'postcheck-sdk-headers',
        'authority-package',
        'lock-final-validation',
        'lock-close',
      ],
      boundaryOrder: [
        'entry-custody',
        'lock-capability',
        'derivation-lock-open',
        'xcrun-compiler-resolution',
        'xcrun-sdk-resolution',
        'toolchain-input-attestation',
        'compiler-diagnostic',
        'toolchain-authority',
        'derivation-lock-cycle-closed',
      ],
      genericStopped: false,
    })
    expect(Object.keys(observed.output).sort()).toEqual([
      'authorityPackageSha256',
      'derivationLockCycleClosed',
      'lastSuccessfulBoundary',
      'status',
    ])
    vi.unstubAllEnvs()
  })

  it.each([
    'capability-open',
    'held-contender-child',
    'held-contender-lifecycle',
    'held-contender-postcheck',
    'released-contender-child',
    'released-contender-lifecycle',
    'released-contender-postcheck',
    'derivation-lock-open',
    'lock-final-validation',
    'lock-close',
    'journal-duplicate',
    'journal-omission',
    'journal-reorder',
  ] as const)('collapses %s ambiguity to generic stopped', async (faultAt) => {
    vi.stubEnv('NODE_ENV', 'test')
    const observed = await runPolicyProvisionalAPrebuildDiagnosticForFixture({
      faultAt,
    })
    expect(observed.output).toEqual({ status: 'stopped' })
    expect(observed.genericStopped).toBe(true)
    expect(observed.childOrder.length).toBeLessThanOrEqual(5)
    vi.unstubAllEnvs()
  })

  it.each([
    ['compiler-child', 'derivation-lock-open'],
    ['compiler-lifecycle', 'derivation-lock-open'],
    ['compiler-output', 'derivation-lock-open'],
    ['sdk-child', 'xcrun-compiler-resolution'],
    ['sdk-lifecycle', 'xcrun-compiler-resolution'],
    ['sdk-output', 'xcrun-compiler-resolution'],
    ['attestation-protected-stat', 'xcrun-sdk-resolution'],
    ['attestation-protected-read', 'xcrun-sdk-resolution'],
    ['diagnostic-child', 'toolchain-input-attestation'],
    ['diagnostic-lifecycle', 'toolchain-input-attestation'],
    ['postcheck-tracked-source', 'toolchain-input-attestation'],
    ['postcheck-xcrun', 'toolchain-input-attestation'],
    ['postcheck-compiler', 'toolchain-input-attestation'],
    ['postcheck-compiler-bytes', 'toolchain-input-attestation'],
    ['postcheck-sdk', 'toolchain-input-attestation'],
    ['postcheck-sdk-headers', 'toolchain-input-attestation'],
    ['authority-package', 'compiler-diagnostic'],
  ] as const)(
    'reports only the preceding completed boundary for %s',
    async (faultAt, expectedBoundary) => {
      vi.stubEnv('NODE_ENV', 'test')
      const observed = await runPolicyProvisionalAPrebuildDiagnosticForFixture({
        faultAt,
      })
      expect(observed.output).toEqual({
        status: 'diagnostic-stopped',
        lastSuccessfulBoundary: expectedBoundary,
        derivationLockCycleClosed: true,
      })
      expect(observed.genericStopped).toBe(false)
      expect(observed.childOrder.length).toBeLessThanOrEqual(5)
      vi.unstubAllEnvs()
    },
  )

  it('prints one generic safe CLI line for a rejected diagnostic invocation', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await expect(
      executePolicyNativeDerivationCli([
        'diagnose-a',
        '--confirm-m45-policy-native-derivation-v1',
      ]),
    ).resolves.toBe(1)
    expect(write).toHaveBeenCalledOnce()
    const line = String(write.mock.calls[0]![0])
    expect(line).toBe('{"mode":"diagnose-a","status":"stopped"}\n')
    expect(line).not.toMatch(
      /path|stderr|stdout|error|cause|stack|environment|fd|pid/iu,
    )
    write.mockRestore()
  })

  it('rejects an exact post-inventory when its held directory link count is wrong', async () => {
    const { seams, filesystem, run } = fixture({
      syntheticLegacy: true,
      wrongPostNlinkPath: control,
    })
    await expect(
      run(
        ['recover-preflight', '--confirm-m45-policy-native-recovery-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, 16 * 1024 * 1024 + 1])(
    'rejects invalid variable artifact size %s before reading bytes',
    async (invalidSize) => {
      const { seams, entries, heldFileReads, run } = fixture({
        syntheticLegacy: true,
      })
      const packages = await actualStagePackages()
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(async () => packages.stageA),
      })
      heldFileReads.length = 0
      const stageAPath = `${control}/stage-a.v1.json`
      entries.get(stageAPath)!.metadata.size = invalidSize
      await expect(
        run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveB: vi.fn(),
        }),
      ).rejects.toThrow()
      expect(heldFileReads).not.toContain(stageAPath)
    },
  )

  it('rejects a fixed baseline size mismatch before reading bytes', async () => {
    const { seams, entries, heldFileReads, run } = fixture({
      syntheticLegacy: true,
    })
    const baselinePath = `${control}/shared-root-baseline.v1.json`
    entries.get(baselinePath)!.metadata.size++
    await expect(
      run(
        ['recover-preflight', '--confirm-m45-policy-native-recovery-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(heldFileReads).not.toContain(baselinePath)
  })

  it('keeps fresh preflight fresh-only against the retained residue', async () => {
    const { seams, filesystem, run } = fixture({ syntheticLegacy: true })
    await expect(
      run(['preflight', '--confirm-m45-policy-native-derivation-v1'], seams),
    ).rejects.toThrow()
    expect(filesystem.chmodHeldDirectory).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it('rejects successful A output when the native transition leaves no persistent lock', async () => {
    const { seams, entries, run } = fixture({
      syntheticLegacy: true,
      deriveALockTransition: false,
    })
    const deriveA = vi.fn(async () => stageAPackage())
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(deriveA).toHaveBeenCalledOnce()
    expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
  })

  it('derives A directly through the same exact synthetic residue validator and binds it', async () => {
    const {
      seams,
      entries,
      directoryInventoryReads,
      heldFileReads,
      syntheticResidue,
      run,
    } = fixture({
      syntheticLegacy: true,
    })
    const deriveA = vi.fn(async () => stageAPackage())
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).resolves.toMatchObject({ status: 'a-derived' })
    expect(deriveA).toHaveBeenCalledTimes(1)
    expect(directoryInventoryReads).not.toContain(`${m45}/candidate-review`)
    expect(directoryInventoryReads).not.toContain(`${m45}/discovery`)
    expect(directoryInventoryReads).not.toContain(`${m45}/predecessor-review`)
    const lockPath = `${m45}/.policy-exclusive-promotion.lock`
    expect(entries.get(m45)!.entries).toContain(
      '.policy-exclusive-promotion.lock',
    )
    expect(entries.get(m45)!.entries!.size).toBe(5)
    expect(entries.get(lockPath)).toMatchObject({
      metadata: {
        uid: 501,
        dev: 9,
        mode: 0o600,
        nlink: 1,
        size: 0,
        file: true,
        directory: false,
        symbolicLink: false,
      },
    })
    expect(entries.get(lockPath)!.bytes).toBeUndefined()
    expect(heldFileReads).not.toContain(lockPath)
    expect(directoryInventoryReads).not.toContain(lockPath)
    const stageA = JSON.parse(
      entries.get(`${control}/stage-a.v1.json`)!.bytes!.toString('utf8'),
    ) as Record<string, unknown>
    expect(stageA.legacyBaselineRawSha256).toBe(
      syntheticResidue!.baseline.sha256,
    )
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(deriveA).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'type',
      (entry: Entry): void => {
        entry.metadata.file = false
        entry.metadata.directory = true
      },
    ],
    [
      'owner',
      (entry: Entry): void => {
        entry.metadata.uid++
      },
    ],
    [
      'device',
      (entry: Entry): void => {
        entry.metadata.dev++
      },
    ],
    [
      'mode',
      (entry: Entry): void => {
        entry.metadata.mode = 0o644
      },
    ],
    [
      'link',
      (entry: Entry): void => {
        entry.metadata.nlink++
      },
    ],
    [
      'size',
      (entry: Entry): void => {
        entry.metadata.size++
      },
    ],
    [
      'symlink',
      (entry: Entry): void => {
        entry.metadata.symbolicLink = true
      },
    ],
  ] as const)(
    'rejects command-lock %s drift before B without reading lock contents',
    async (_name, mutate) => {
      const { seams, entries, heldFileReads, run } = fixture({
        syntheticLegacy: true,
      })
      const packages = await actualStagePackages()
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(async () => packages.stageA),
      })
      const lockPath = `${m45}/.policy-exclusive-promotion.lock`
      mutate(entries.get(lockPath)!)
      const deriveB = vi.fn()
      await expect(
        run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveB,
        }),
      ).rejects.toThrow()
      expect(deriveB).not.toHaveBeenCalled()
      expect(heldFileReads).not.toContain(lockPath)
    },
  )

  it('requires lock presence at B entry', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const packages = await actualStagePackages()
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(async () => packages.stageA),
    })
    entries.get(m45)!.entries!.delete('.policy-exclusive-promotion.lock')
    entries.delete(`${m45}/.policy-exclusive-promotion.lock`)
    const deriveB = vi.fn()
    await expect(
      run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveB,
      }),
    ).rejects.toThrow()
    expect(deriveB).not.toHaveBeenCalled()
  })

  it('requires lock presence at review entry', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const packages = await actualStagePackages()
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(async () => packages.stageA),
    })
    await run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveB: vi.fn(async () => ({
        preflight: { schema: 'fixture' },
        package: packages.stageB,
      })),
    })
    entries.get(m45)!.entries!.delete('.policy-exclusive-promotion.lock')
    entries.delete(`${m45}/.policy-exclusive-promotion.lock`)
    await expect(
      run(['review-candidate', '--confirm-m45-policy-native-review-v1'], seams),
    ).rejects.toThrow()
    expect(entries.has(`${control}/review-input.v1.json`)).toBe(false)
  })

  it.each(['derive-b', 'review-candidate'] as const)(
    'rejects an off-by-one held root link count during %s',
    async (phase) => {
      const { seams, wrongPostNlinkPaths, run } = fixture({
        syntheticLegacy: true,
      })
      const packages = await actualStagePackages()
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(async () => packages.stageA),
      })
      if (phase === 'review-candidate')
        await run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveB: vi.fn(async () => ({
            preflight: { schema: 'fixture' },
            package: packages.stageB,
          })),
        })
      wrongPostNlinkPaths.add(m45)
      await expect(
        phase === 'derive-b'
          ? run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
              ...seams,
              deriveB: vi.fn(async () => ({
                preflight: { schema: 'fixture' },
                package: packages.stageB,
              })),
            })
          : run(
              ['review-candidate', '--confirm-m45-policy-native-review-v1'],
              seams,
            ),
      ).rejects.toThrow()
    },
  )

  it('revalidates the full gate on a fresh A invocation after a safe no-artifact failure', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const deriveA = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('residue'))
      .mockResolvedValue(stageAPackage())
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).resolves.toMatchObject({ status: 'a-residue-preserved' })
    expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
    expect(entries.has(`${m45}/.policy-exclusive-promotion.lock`)).toBe(true)
    entries.get(`${m45}/discovery`)!.metadata.ino++
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(deriveA).toHaveBeenCalledTimes(1)
  })

  it('admits one exact lock-only re-entry without recreating or rewriting the lock', async () => {
    const { seams, entries, filesystem, heldMetadataPaths, run } = fixture({
      syntheticLegacy: true,
    })
    const deriveA = vi
      .fn<
        (
          input: Parameters<PolicyNativeDerivationSeams['deriveA']>[0],
        ) => Promise<unknown>
      >()
      .mockRejectedValueOnce(new Error('residue'))
      .mockImplementationOnce(async () => {
        expect(
          heldMetadataPaths.has(`${m45}/.policy-exclusive-promotion.lock`),
        ).toBe(true)
        return stageAPackage()
      })
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).resolves.toMatchObject({ status: 'a-residue-preserved' })
    const lockPath = `${m45}/.policy-exclusive-promotion.lock`
    const lockBefore = { ...entries.get(lockPath)!.metadata }
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).resolves.toMatchObject({ status: 'a-derived' })
    expect(deriveA).toHaveBeenCalledTimes(2)
    expect(deriveA.mock.calls[1]![0].commandLock).toEqual({
      uid: '501',
      device: '9',
      inode: String(lockBefore.ino),
      links: '1',
      mode: '384',
      size: '0',
    })
    expect(entries.get(lockPath)?.metadata).toEqual(lockBefore)
    expect(filesystem.writeFile).toHaveBeenCalledTimes(1)
  })

  it.each(['before', 'during', 'after'] as const)(
    'rejects lock substitution %s a lock-only A seam',
    async (timing) => {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      const first = vi.fn(async () => {
        throw new Error('residue')
      })
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: first,
      })
      const lockPath = `${m45}/.policy-exclusive-promotion.lock`
      const second = vi.fn(async () => {
        if (timing === 'during') entries.get(lockPath)!.metadata.ino++
        return stageAPackage()
      })
      if (timing === 'before') entries.get(lockPath)!.metadata.ino++
      const baseFilesystem = seams.filesystem!
      const filesystem =
        timing === 'after'
          ? {
              ...baseFilesystem,
              writeFile: async (
                ...args: Parameters<typeof baseFilesystem.writeFile>
              ) => {
                await baseFilesystem.writeFile(...args)
                entries.get(lockPath)!.metadata.ino++
              },
            }
          : baseFilesystem
      await expect(
        run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          filesystem,
          deriveA: second,
        }),
      ).rejects.toThrow()
      expect(entries.has(`${control}/stage-a.v1.json`)).toBe(timing === 'after')
      expect(second).toHaveBeenCalledTimes(timing === 'before' ? 0 : 1)
    },
  )

  it('maps malformed seam output to residue-preserved without a retry', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const deriveA = vi.fn(async () => ({}))
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).resolves.toMatchObject({ status: 'a-residue-preserved' })
    expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
    expect(deriveA).toHaveBeenCalledOnce()
  })

  it.each([
    ['derived B', () => stageBPackage()],
    [
      'wrong native authority',
      () => {
        const value = stageAPackage()
        const { packageSha256: _packageSha256, ...packageCore } = value
        void _packageSha256
        const core = {
          ...packageCore,
          material: {
            ...value.material,
            nativeAuthoritySha256: 'f'.repeat(64),
          },
        }
        return {
          ...core,
          packageSha256: createHash('sha256')
            .update(canonical(core))
            .digest('hex'),
        }
      },
    ],
  ] as const)(
    'preserves a %s seam result as residue',
    async (_name, result) => {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      await expect(
        run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveA: vi.fn(async () => result()),
        }),
      ).resolves.toMatchObject({ status: 'a-residue-preserved' })
      expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
    },
  )

  it('maps a no-artifact Stage-A write failure to residue-preserved', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const filesystem = {
      ...seams.filesystem!,
      writeFile: vi.fn(async () => {
        throw new Error('write-failed')
      }),
    }
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        filesystem,
        deriveA: vi.fn(async () => stageAPackage()),
      }),
    ).resolves.toMatchObject({ status: 'a-residue-preserved' })
    expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
    expect(filesystem.writeFile).toHaveBeenCalledOnce()
  })

  it('maps an arbitrary in-seam rejection to residue-preserved', async () => {
    const { seams, filesystem, run } = fixture({ syntheticLegacy: true })
    const result = await run(
      ['derive-a', '--confirm-m45-policy-native-derivation-v1'],
      {
        ...seams,
        deriveA: vi.fn(async () => {
          throw new Error('uncertain-lifecycle')
        }),
      },
    )
    expect(result).toMatchObject({ status: 'a-residue-preserved' })
    const line = `${JSON.stringify(result)}\n`
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(line).not.toMatch(/\/repo|descriptor|uncertain-lifecycle/iu)
    expect(seams.tracked).toHaveBeenCalledOnce()
    expect(seams.revalidateTracked).toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it('keeps nonce construction before the A seam and outer-stopped', async () => {
    const { seams, filesystem, run } = fixture({ syntheticLegacy: true })
    const deriveA = vi.fn()
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        nonce: () => {
          throw new Error('nonce')
        },
        deriveA,
      }),
    ).rejects.toThrow()
    expect(deriveA).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it('rejects deletion of the lock-only checkpoint as a false fresh base', async () => {
    const { seams, entries, filesystem, run } = fixture({
      syntheticLegacy: true,
    })
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(residueFailure),
    })
    entries.get(m45)!.entries!.delete('.policy-exclusive-promotion.lock')
    entries.delete(`${m45}/.policy-exclusive-promotion.lock`)
    const deriveA = vi.fn()
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(entries.get(m45)!.metadata.size).toBe(
      createPolicySyntheticNativeDerivationFixture().residue.lockOnlyRoot.size,
    )
    expect(deriveA).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it.each([
    [
      'root uid',
      (entries: Map<string, Entry>) => entries.get(m45)!.metadata.uid++,
    ],
    [
      'root dev',
      (entries: Map<string, Entry>) => entries.get(m45)!.metadata.dev++,
    ],
    [
      'root ino',
      (entries: Map<string, Entry>) => entries.get(m45)!.metadata.ino++,
    ],
    [
      'root mode',
      (entries: Map<string, Entry>) =>
        (entries.get(m45)!.metadata.mode = 0o755),
    ],
    [
      'root size',
      (entries: Map<string, Entry>) => entries.get(m45)!.metadata.size++,
    ],
    [
      'root type',
      (entries: Map<string, Entry>) =>
        (entries.get(m45)!.metadata.directory = false),
    ],
    [
      'root inventory',
      (entries: Map<string, Entry>) =>
        entries.get(m45)!.entries!.add('unknown'),
    ],
    [
      'control uid',
      (entries: Map<string, Entry>) => entries.get(control)!.metadata.uid++,
    ],
    [
      'control dev',
      (entries: Map<string, Entry>) => entries.get(control)!.metadata.dev++,
    ],
    [
      'control ino',
      (entries: Map<string, Entry>) => entries.get(control)!.metadata.ino++,
    ],
    [
      'control mode',
      (entries: Map<string, Entry>) =>
        (entries.get(control)!.metadata.mode = 0o755),
    ],
    [
      'control size',
      (entries: Map<string, Entry>) => entries.get(control)!.metadata.size++,
    ],
    [
      'control type',
      (entries: Map<string, Entry>) =>
        (entries.get(control)!.metadata.directory = false),
    ],
    [
      'control inventory',
      (entries: Map<string, Entry>) =>
        entries.get(control)!.entries!.add('unknown'),
    ],
    [
      'baseline uid',
      (entries: Map<string, Entry>) =>
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.uid++,
    ],
    [
      'baseline dev',
      (entries: Map<string, Entry>) =>
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.dev++,
    ],
    [
      'baseline ino',
      (entries: Map<string, Entry>) =>
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.ino++,
    ],
    [
      'baseline mode',
      (entries: Map<string, Entry>) =>
        (entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.mode =
          0o400),
    ],
    [
      'baseline nlink',
      (entries: Map<string, Entry>) =>
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata
          .nlink++,
    ],
    [
      'baseline size',
      (entries: Map<string, Entry>) =>
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.size++,
    ],
    [
      'baseline type',
      (entries: Map<string, Entry>) =>
        (entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.file =
          false),
    ],
    [
      'sibling uid',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/discovery`)!.metadata.uid++,
    ],
    [
      'sibling dev',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/discovery`)!.metadata.dev++,
    ],
    [
      'sibling ino',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/discovery`)!.metadata.ino++,
    ],
    [
      'sibling mode',
      (entries: Map<string, Entry>) =>
        (entries.get(`${m45}/discovery`)!.metadata.mode = 0o700),
    ],
    [
      'sibling nlink',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/discovery`)!.entries!.add('opaque'),
    ],
    [
      'sibling size',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/discovery`)!.metadata.size++,
    ],
    [
      'sibling type',
      (entries: Map<string, Entry>) =>
        (entries.get(`${m45}/discovery`)!.metadata.directory = false),
    ],
    [
      'lock uid',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.uid++,
    ],
    [
      'lock dev',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.dev++,
    ],
    [
      'lock ino',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.ino++,
    ],
    [
      'lock mode',
      (entries: Map<string, Entry>) =>
        (entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.mode =
          0o644),
    ],
    [
      'lock nlink',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata
          .nlink++,
    ],
    [
      'lock size',
      (entries: Map<string, Entry>) =>
        entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.size++,
    ],
    [
      'lock type',
      (entries: Map<string, Entry>) =>
        (entries.get(`${m45}/.policy-exclusive-promotion.lock`)!.metadata.file =
          false),
    ],
  ] satisfies readonly (readonly [
    string,
    (entries: Map<string, Entry>) => unknown,
  ])[])('rejects lock-only pre-seam %s drift', async (_name, mutate) => {
    const { seams, entries, filesystem, run } = fixture({
      syntheticLegacy: true,
    })
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(residueFailure),
    })
    mutate(entries)
    const deriveA = vi.fn()
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(deriveA).not.toHaveBeenCalled()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it.each([
    [
      'bytes',
      (bytes: Buffer) => {
        bytes[0] ^= 1
      },
    ],
    [
      'schema',
      (bytes: Buffer) => {
        const index = bytes.indexOf('m45-policy-native-shared-root-baseline')
        bytes[index] = 'n'.charCodeAt(0)
      },
    ],
    [
      'profile',
      (bytes: Buffer) => {
        const index = bytes.indexOf('c'.repeat(40))
        bytes[index] = 'd'.charCodeAt(0)
      },
    ],
  ] as const)(
    'rejects lock-only baseline %s drift before the seam',
    async (_name, mutate) => {
      const { seams, entries, filesystem, run } = fixture({
        syntheticLegacy: true,
      })
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(residueFailure),
      })
      mutate(entries.get(`${control}/shared-root-baseline.v1.json`)!.bytes!)
      const deriveA = vi.fn()
      await expect(
        run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveA,
        }),
      ).rejects.toThrow()
      expect(deriveA).not.toHaveBeenCalled()
      expect(filesystem.writeFile).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['build', m45, '.policy-exclusive-promotion-build'],
    ['preflight', m45, '.policy-exclusive-promotion-preflight'],
    ['stage A', control, 'stage-a.v1.json'],
    ['stage B', control, 'stage-b.v1.json'],
    ['candidate', control, 'candidate.v1.json'],
    ['review', control, 'review-input.v1.json'],
  ] as const)(
    'rejects lock-only fixed %s presence before the seam',
    async (_name, parent, entry) => {
      const { seams, entries, filesystem, run } = fixture({
        syntheticLegacy: true,
      })
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(residueFailure),
      })
      entries.get(parent)!.entries!.add(entry)
      const deriveA = vi.fn()
      await expect(
        run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveA,
        }),
      ).rejects.toThrow()
      expect(deriveA).not.toHaveBeenCalled()
      expect(filesystem.writeFile).not.toHaveBeenCalled()
    },
  )

  it.each([m45, control])(
    'rejects a lock-only held nlink mismatch at %s',
    async (path) => {
      const { seams, filesystem, wrongInitialNlinkPaths, run } = fixture({
        syntheticLegacy: true,
      })
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(residueFailure),
      })
      wrongInitialNlinkPaths.add(path)
      const deriveA = vi.fn()
      await expect(
        run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveA,
        }),
      ).rejects.toThrow()
      expect(deriveA).not.toHaveBeenCalled()
      expect(filesystem.writeFile).not.toHaveBeenCalled()
    },
  )

  it('preserves a Stage-A write collision as closed residue', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(async () => {
        throw new Error('residue')
      }),
    })
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(async () => {
          entries.set(`${control}/stage-a.v1.json`, {
            metadata: {
              uid: 501,
              dev: 9,
              ino: 999,
              mode: 0o600,
              nlink: 1,
              size: 1,
              file: true,
              directory: false,
              symbolicLink: false,
            },
            bytes: Buffer.from('x'),
          })
          entries.get(control)!.entries!.add('stage-a.v1.json')
          return stageAPackage()
        }),
      }),
    ).resolves.toMatchObject({ status: 'a-residue-preserved' })
  })

  it('keeps a classifier failure outer-stopped', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const deriveA = vi.fn(async () => {
      entries.get(control)!.entries!.add('unclassified')
      throw new Error('residue')
    })
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(deriveA).toHaveBeenCalledOnce()
  })

  it.each([
    [
      'root-owner',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.metadata.uid++
      },
    ],
    [
      'root-inode',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.metadata.ino++
      },
    ],
    [
      'root-device',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.metadata.dev++
      },
    ],
    [
      'root-mode',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.metadata.mode = 0o755
      },
    ],
    [
      'root-size',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.metadata.size++
      },
    ],
    [
      'root-type',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.metadata.directory = false
        entries.get(m45)!.metadata.file = true
      },
    ],
    [
      'root-inventory',
      (entries: Map<string, Entry>): void => {
        entries.get(m45)!.entries!.add('extra')
      },
    ],
    [
      'control-mode',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.metadata.mode = 0o755
      },
    ],
    [
      'control-entry',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.entries!.add('extra')
      },
    ],
    [
      'control-owner',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.metadata.uid++
      },
    ],
    [
      'control-device',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.metadata.dev++
      },
    ],
    [
      'control-inode',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.metadata.ino++
      },
    ],
    [
      'control-size',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.metadata.size++
      },
    ],
    [
      'control-type',
      (entries: Map<string, Entry>): void => {
        entries.get(control)!.metadata.directory = false
        entries.get(control)!.metadata.file = true
      },
    ],
    [
      'sibling-mode',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.metadata.mode = 0o700
      },
    ],
    [
      'sibling-owner',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.metadata.uid++
      },
    ],
    [
      'sibling-device',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.metadata.dev++
      },
    ],
    [
      'sibling-inode',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.metadata.ino++
      },
    ],
    [
      'sibling-link',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.entries!.add('opaque-child')
      },
    ],
    [
      'sibling-size',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.metadata.size++
      },
    ],
    [
      'sibling-type',
      (entries: Map<string, Entry>): void => {
        entries.get(`${m45}/discovery`)!.metadata.directory = false
        entries.get(`${m45}/discovery`)!.metadata.file = true
      },
    ],
    [
      'baseline-link',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.nlink =
          2
      },
    ],
    [
      'baseline-owner',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.uid++
      },
    ],
    [
      'baseline-device',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.dev++
      },
    ],
    [
      'baseline-inode',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.ino++
      },
    ],
    [
      'baseline-mode',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.mode =
          0o400
      },
    ],
    [
      'baseline-size',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.metadata.size++
      },
    ],
    [
      'baseline-type',
      (entries: Map<string, Entry>): void => {
        const metadata = entries.get(
          `${control}/shared-root-baseline.v1.json`,
        )!.metadata
        metadata.file = false
        metadata.directory = true
      },
    ],
    [
      'baseline-bytes',
      (entries: Map<string, Entry>): void => {
        entries.get(`${control}/shared-root-baseline.v1.json`)!.bytes![0] ^= 1
      },
    ],
    [
      'baseline-schema',
      (entries: Map<string, Entry>): void => {
        const bytes = entries.get(
          `${control}/shared-root-baseline.v1.json`,
        )!.bytes!
        const index = bytes.indexOf('m45-policy-native-shared-root-baseline')
        bytes[index] = 'n'.charCodeAt(0)
      },
    ],
    [
      'baseline-profile',
      (entries: Map<string, Entry>): void => {
        const bytes = entries.get(
          `${control}/shared-root-baseline.v1.json`,
        )!.bytes!
        const index = bytes.indexOf('c'.repeat(40))
        bytes[index] = 'd'.charCodeAt(0)
      },
    ],
  ] as const)('rejects synthetic legacy drift: %s', async (_name, mutate) => {
    const { seams, entries, filesystem, run } = fixture({
      syntheticLegacy: true,
    })
    mutate(entries)
    await expect(
      run(
        ['recover-preflight', '--confirm-m45-policy-native-recovery-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it.each([
    ['root', m45],
    ['control', control],
    ['baseline', `${control}/shared-root-baseline.v1.json`],
    ['sibling', `${m45}/discovery`],
  ] as const)(
    'rejects a %s named-path substitution across the derive transition',
    async (_name, path) => {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      const deriveA = vi.fn(async () => {
        entries.get(path)!.metadata.ino++
        return stageAPackage()
      })
      await expect(
        run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
          ...seams,
          deriveA,
        }),
      ).rejects.toThrow()
      expect(deriveA).toHaveBeenCalledOnce()
      expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
    },
  )

  it('seals the exact preserved sibling baseline and tightens the held root', async () => {
    const { entries, filesystem, seams } = fixture()
    await expect(
      runPolicyNativeDerivationCommand(
        ['preflight', '--confirm-m45-policy-native-derivation-v1'],
        seams,
      ),
    ).resolves.toMatchObject({ status: 'preflight-ready' })
    expect(filesystem.chmodHeldDirectory).toHaveBeenCalledWith(
      m45,
      0o700,
      expect.objectContaining({ mode: 0o755 }),
    )
    expect(entries.get(m45)?.metadata.mode).toBe(0o700)
    expect(entries.get(control)?.metadata.mode).toBe(0o700)
    expect(
      entries.get(`${control}/shared-root-baseline.v1.json`)?.metadata.mode,
    ).toBe(0o600)
  })

  it('stops before a mutation when the shared root has an unexpected entry', async () => {
    const { entries, filesystem, seams } = fixture()
    entries.get(m45)?.entries?.add('unexpected')
    await expect(
      runPolicyNativeDerivationCommand(
        ['preflight', '--confirm-m45-policy-native-derivation-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(filesystem.chmodHeldDirectory).not.toHaveBeenCalled()
  })

  it('stops before chmod when the held root no longer matches its preflight identity', async () => {
    const { entries, seams } = fixture({ substituteBeforeChmod: true })
    await expect(
      runPolicyNativeDerivationCommand(
        ['preflight', '--confirm-m45-policy-native-derivation-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(entries.get(m45)?.metadata.mode).toBe(0o755)
    expect(entries.has(control)).toBe(false)
  })

  it('refuses to treat a newly written baseline as the immutable recovered residue', async () => {
    const { seams } = fixture()
    const deriveA = vi.fn(async () => stageAPackage())
    await runPolicyNativeDerivationCommand(
      ['preflight', '--confirm-m45-policy-native-derivation-v1'],
      seams,
    )
    await expect(
      runPolicyNativeDerivationCommand(
        ['derive-a', '--confirm-m45-policy-native-derivation-v1'],
        { ...seams, deriveA },
      ),
    ).rejects.toThrow()
    expect(deriveA).not.toHaveBeenCalled()
  })

  it.each(['shared-a', 'shared-b'] as const)(
    'uses the exact shared terminal ABI boundary for %s',
    (phase) => {
      const plan = createPolicySharedTerminalPlanForFixture(
        sharedTerminalOperation(phase),
      )
      expect(plan.arguments).toHaveLength(44)
      expect(plan.arguments).toEqual(
        expect.arrayContaining(['delete-build-terminal-shared', phase]),
      )
      expect(plan.stdio).toEqual(['ignore', 'pipe', 'pipe', 7, 8, 9, 10])
      expect(plan.arguments.slice(2)).toHaveLength(42)
    },
  )

  it('rejects each old shared terminal link tuple', () => {
    for (const phase of ['shared-a', 'shared-b'] as const) {
      const oldParent = sharedTerminalOperation(phase)
      oldParent.parent.links = '7'
      expect(() =>
        createPolicySharedTerminalPlanForFixture(oldParent),
      ).toThrow()

      const oldControl = sharedTerminalOperation(phase)
      oldControl.siblings['policy-native-derivation'].links = '2'
      expect(() =>
        createPolicySharedTerminalPlanForFixture(oldControl),
      ).toThrow()
    }
  })

  it.each(['stage-a.v1.json', 'stage-b.v1.json', 'candidate.v1.json'])(
    'rejects a detached or mutated %s review chain artifact',
    async (filename) => {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      const packages = await actualStagePackages()
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(async () => packages.stageA),
      })
      await run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveB: vi.fn(async () => ({
          preflight: { schema: 'fixture' },
          package: packages.stageB,
        })),
      })
      const artifact = entries.get(`${control}/${filename}`)!
      artifact.bytes![Math.floor(artifact.bytes!.byteLength / 2)] ^= 1
      await expect(
        run(
          ['review-candidate', '--confirm-m45-policy-native-review-v1'],
          seams,
        ),
      ).rejects.toThrow()
      expect(entries.has(`${control}/review-input.v1.json`)).toBe(false)
    },
  )

  it.each([
    [
      'stage-a.v1.json',
      'legacy',
      (artifact: Record<string, unknown>) => {
        artifact.legacyBaselineRawSha256 = 'f'.repeat(64)
      },
    ],
    [
      'stage-a.v1.json',
      'tracked',
      (artifact: Record<string, unknown>) => {
        artifact.tracked = {
          ...(artifact.tracked as object),
          commit: 'f'.repeat(40),
        }
      },
    ],
    [
      'stage-b.v1.json',
      'stage-a binding',
      (artifact: Record<string, unknown>) => {
        artifact.stageAArtifactSha256 = 'f'.repeat(64)
      },
    ],
    [
      'candidate.v1.json',
      'stage-b binding',
      (artifact: Record<string, unknown>) => {
        artifact.stageBArtifactSha256 = 'f'.repeat(64)
      },
    ],
    [
      'candidate.v1.json',
      'legacy',
      (artifact: Record<string, unknown>) => {
        artifact.legacyBaselineRawSha256 = 'f'.repeat(64)
      },
    ],
  ] as const)(
    'rejects a re-self-hashed %s %s mutation',
    async (filename, _field, mutate) => {
      const { seams, entries, run } = fixture({ syntheticLegacy: true })
      const packages = await actualStagePackages()
      await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA: vi.fn(async () => packages.stageA),
      })
      await run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveB: vi.fn(async () => ({
          preflight: { schema: 'fixture' },
          package: packages.stageB,
        })),
      })
      rewriteSelfHashedArtifact(entries, filename, mutate)
      await expect(
        run(
          ['review-candidate', '--confirm-m45-policy-native-review-v1'],
          seams,
        ),
      ).rejects.toThrow()
      expect(entries.has(`${control}/review-input.v1.json`)).toBe(false)
    },
  )

  it('completes the synthetic A/B/review chain with exact bindings', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const packages = await actualStagePackages()
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(async () => packages.stageA),
    })
    await run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveB: vi.fn(async () => ({
        preflight: { schema: 'fixture' },
        package: packages.stageB,
      })),
    })
    await expect(
      run(['review-candidate', '--confirm-m45-policy-native-review-v1'], seams),
    ).resolves.toMatchObject({ status: 'review-ready' })
    expect(entries.has(`${control}/review-input.v1.json`)).toBe(true)
    expect(entries.get(control)!.entries!.size).toBe(5)
  })

  it('rereads the held baseline after A returns and rejects byte drift', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const deriveA = vi.fn(async () => {
      entries.get(`${control}/shared-root-baseline.v1.json`)!.bytes![0] ^= 1
      return stageAPackage()
    })
    await expect(
      run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveA,
      }),
    ).rejects.toThrow()
    expect(entries.has(`${control}/stage-a.v1.json`)).toBe(false)
  })

  it('rereads held stage A after B returns and rejects byte drift', async () => {
    const { seams, entries, run } = fixture({ syntheticLegacy: true })
    const packages = await actualStagePackages()
    await run(['derive-a', '--confirm-m45-policy-native-derivation-v1'], {
      ...seams,
      deriveA: vi.fn(async () => packages.stageA),
    })
    const deriveB = vi.fn(async () => {
      entries.get(`${control}/stage-a.v1.json`)!.bytes![0] ^= 1
      return { preflight: { schema: 'fixture' }, package: packages.stageB }
    })
    await expect(
      run(['derive-b', '--confirm-m45-policy-native-derivation-v1'], {
        ...seams,
        deriveB,
      }),
    ).rejects.toThrow()
    expect(entries.has(`${control}/stage-b.v1.json`)).toBe(false)
  })

  it.each([
    ['stage A', 'stage-a.v1.json'],
    ['stage B', 'stage-b.v1.json'],
    ['candidate', 'candidate.v1.json'],
    ['review', 'review-input.v1.json'],
  ] as const)(
    'rejects control substitution during the %s write',
    async (_phase, target) => {
      const { seams, entries, run } = fixture({
        syntheticLegacy: true,
        substituteDuringHeldFile: target,
      })
      const packages = await actualStagePackages()
      const deriveA = { ...seams, deriveA: vi.fn(async () => packages.stageA) }
      if (target === 'stage-a.v1.json') {
        await expect(
          run(
            ['derive-a', '--confirm-m45-policy-native-derivation-v1'],
            deriveA,
          ),
        ).resolves.toMatchObject({ status: 'a-residue-preserved' })
        return
      }
      await run(
        ['derive-a', '--confirm-m45-policy-native-derivation-v1'],
        deriveA,
      )
      const deriveB = {
        ...seams,
        deriveB: vi.fn(async () => ({
          preflight: { schema: 'fixture' },
          package: packages.stageB,
        })),
      }
      if (target === 'stage-b.v1.json' || target === 'candidate.v1.json') {
        await expect(
          run(
            ['derive-b', '--confirm-m45-policy-native-derivation-v1'],
            deriveB,
          ),
        ).rejects.toThrow()
        return
      }
      await run(
        ['derive-b', '--confirm-m45-policy-native-derivation-v1'],
        deriveB,
      )
      await expect(
        run(
          ['review-candidate', '--confirm-m45-policy-native-review-v1'],
          seams,
        ),
      ).rejects.toThrow()
      expect(entries.get(`${control}/${target}`)!.metadata.ino).toBeGreaterThan(
        105,
      )
    },
  )

  it('keeps the D113 and native C sources pinned to D116 shared arithmetic', async () => {
    const [authority, helper] = await Promise.all([
      readFile(
        new URL(
          '../scripts/m45-policy-baseline-native-authority.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../scripts/policy-baseline-review/exclusive-promotion-helper.c',
          import.meta.url,
        ),
        'utf8',
      ),
    ])
    expect(authority).toContain('String(2 + expected.length)')
    expect(authority).toContain(
      "'shared-root-baseline.v1.json', 'stage-a.v1.json'",
    )
    expect(helper).toContain('parent_expected.links != 8')
    expect(helper).toContain('parent_after.st_nlink != 7')
    expect(helper).not.toContain('parent_expected.links != 7')
    expect(helper).not.toContain('parent_after.st_nlink != 6')
  })

  it('keeps D117 re-entry fixed, non-mutating, and retry-selector-free', async () => {
    const [runner, authority] = await Promise.all([
      readFile(
        new URL('../scripts/m45-policy-native-derivation.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL(
          '../scripts/m45-policy-baseline-native-authority.ts',
          import.meta.url,
        ),
        'utf8',
      ),
    ])
    const existingLockOpen = authority.slice(
      authority.indexOf('async function openCommandLock'),
      authority.indexOf('function closedContender'),
    )
    expect(existingLockOpen).toContain(
      'if (mustExist) return open(lockPath, lockExistingFlags)',
    )
    expect(existingLockOpen).not.toMatch(/truncate|chmod|unlink|rename/u)
    const existingLockFlags = authority.slice(
      authority.indexOf('const lockExistingFlags'),
      authority.indexOf('const sdkHeaderPaths'),
    )
    expect(existingLockFlags).not.toMatch(/O_CREAT|O_TRUNC/u)
    expect(existingLockFlags).toContain('darwinFlags.noFollow')
    expect(existingLockFlags).toContain('darwinFlags.exclusiveLock')
    expect(authority).toContain(
      'canonical(identity) !== canonical(expectedReentryLock)',
    )
    expect(runner).not.toMatch(
      /export[^\n]*(?:retry|profile|inode|path)[A-Za-z0-9_]*/iu,
    )
    expect(runner).not.toContain('while (')
    expect(runner).not.toContain('for (;;')
    const classifierTrackedCheck = runner.slice(
      runner.indexOf('async function defaultRevalidateTracked'),
      runner.indexOf('function defaultSeams'),
    )
    expect(classifierTrackedCheck).not.toMatch(/execFile|\bgit\(/u)
    expect(runner).not.toContain('a-failed-no-authority')
    expect(runner).toContain("| 'a-residue-preserved'")
  })

  it('records the staged diagnostic path only as a non-causal hypothesis', async () => {
    const authority = await readFile(
      new URL(
        '../scripts/m45-policy-baseline-native-authority.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(authority).toContain(
      'D118 records only a hypothesis: the `-###` plan names these staged paths',
    )
    expect(authority).toContain(
      'that driver mode need not open or compile the staged source',
    )
    expect(authority).not.toMatch(
      /`-###` (?:opens|compiles) the staged source/u,
    )
  })

  it('rejects a non-Darwin, non-pinned-node, or noncanonical cwd before custody work', async () => {
    const { seams, filesystem } = fixture()
    await expect(
      runPolicyNativeDerivationCommand(['check'], {
        ...seams,
        platform: 'linux',
      }),
    ).rejects.toThrow()
    await expect(
      runPolicyNativeDerivationCommand(['check'], {
        ...seams,
        executablePath: '/usr/local/bin/node',
      }),
    ).rejects.toThrow()
    await expect(
      runPolicyNativeDerivationCommand(['check'], { ...seams, cwd: '/repo/.' }),
    ).rejects.toThrow()
    expect(filesystem.lstat).not.toHaveBeenCalled()
  })

  it('keeps the review mode incapable of terminal, native, and acceptance operations', async () => {
    const { seams } = fixture()
    await expect(
      runPolicyNativeDerivationCommand(
        ['review-candidate', '--confirm-m45-policy-native-review-v1'],
        seams,
      ),
    ).rejects.toThrow()
    expect(seams.deriveA).not.toHaveBeenCalled()
    expect(seams.deriveB).not.toHaveBeenCalled()
  })

  it('keeps generic acceptance and every production C entrypoint disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(
      createAcceptedPolicyPromotionLiterals({}, digest),
    ).rejects.toThrow()
    await expect(runPolicyProvisionalBuildC({})).rejects.toThrow()
    vi.unstubAllEnvs()
  })
})
