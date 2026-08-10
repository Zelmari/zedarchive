import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  runPolicyNativeDerivationCommand,
  type PolicyNativeDerivationSeams,
} from '@/../scripts/m45-policy-native-derivation'
import { createAcceptedPolicyPromotionLiterals } from '@/../scripts/m45-policy-baseline'
import { runPolicyProvisionalBuildC } from '@/../scripts/m45-policy-baseline-native-authority'
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

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function stageAPackage() {
  const material = {
    xcrunSha256: digest,
    xcrunDevice: '1',
    xcrunInode: '1',
    sourceSha256: digest,
    compilerSha256: digest,
    compilerDevice: '1',
    compilerInode: '1',
    sdkIdentitySha256: digest,
    sdkDevice: '1',
    sdkInode: '1',
    headerSetSha256: digest,
    diagnosticSha256: digest,
    compileContractSha256: digest,
    launchContractSha256: digest,
    launcherSha256: digest,
    nativeAuthoritySha256: digest,
    lockPreflightWorkerSha256: digest,
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
    parent: directory('10', '7'),
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
      'policy-native-derivation': directory('16'),
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

function fixture(options: Readonly<{ substituteBeforeChmod?: boolean }> = {}) {
  let inode = 100
  const entries = new Map<string, Entry>()
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
  const filesystem = {
    lstat: vi.fn(async (path: string) => {
      const value = entries.get(path)
      if (!value) {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
        throw error
      }
      return { ...value.metadata }
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
        if (canonical(value.metadata) !== canonical(expected))
          throw new Error('substitution')
        value.metadata.mode = mode
        return { ...value.metadata }
      },
    ),
    heldRead: vi.fn(async (path: string) => {
      const value = entries.get(path)
      if (!value?.bytes) throw new Error('not-file')
      return {
        before: { ...value.metadata },
        bytes: Buffer.from(value.bytes),
        after: { ...value.metadata },
      }
    }),
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
    nonce: () => digest,
    deriveA: vi.fn(),
    deriveB: vi.fn(),
  }
  return { entries, filesystem, seams }
}

describe('Decision 115 native policy derivation runner', () => {
  it('accepts only the exact closed command grammar', async () => {
    const { seams } = fixture()
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
        ['preflight', '--confirm-m45-policy-native-derivation-v1', 'extra'],
        seams,
      ),
    ).rejects.toThrow()
  })

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

  it('passes a fixed shared-a terminal tuple only to the high-level A wrapper', async () => {
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
    ).resolves.toMatchObject({ status: 'a-derived' })
    expect(deriveA).toHaveBeenCalledWith(
      expect.objectContaining({
        sharedTerminal: expect.objectContaining({
          phase: 'shared-a',
          siblings: expect.objectContaining({
            'candidate-review': expect.any(Object),
            discovery: expect.any(Object),
            'predecessor-review': expect.any(Object),
            'policy-native-derivation': expect.any(Object),
          }),
        }),
      }),
    )
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
