import { glob, readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

const moduleUrl = new URL(
  '../scripts/m45-public-fd-residue-classifier.mjs',
  import.meta.url,
).href
const classifier = (await import(moduleUrl)) as {
  runPublicFdResidueClassifierForFixture: (
    argv: readonly string[],
    dependencies: Record<string, unknown>,
  ) => Promise<Readonly<{ scratchState: string }>>
  formatPublicFdResidueResultForFixture: (
    result: unknown,
  ) => Readonly<{ line: string; exitCode: number }>
  writePublicFdResidueResultForFixture: (
    line: unknown,
    write: unknown,
  ) => Promise<number>
  executePublicFdResidueClassifierForFixture: (
    argv: readonly string[],
    dependencies: Record<string, unknown>,
    write: (line: string) => Promise<void>,
  ) => Promise<number>
}

const argv = [
  'classify-a-fd-map-residue',
  '--confirm-m45-public-a-fd-map-residue-classifier-v1',
] as const
const repositoryRoot = '/Users/zelmari/projects/zedarchive'
const parentPath = '/private/tmp'
const scratchPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const parent = {
  uid: 0,
  gid: 0,
  dev: 16777231,
  ino: 13457399,
  mode: 0o1777,
  nlink: 11,
  size: 352,
  directory: true,
  symbolicLink: false,
}
const scratch = {
  uid: 501,
  gid: 20,
  dev: 16777231,
  ino: 42,
  mode: 0o700,
  nlink: 2,
  size: 64,
  directory: true,
  symbolicLink: false,
}

const metadata = (value: typeof scratch) => ({
  ...value,
  isDirectory: () => value.directory,
  isSymbolicLink: () => value.symbolicLink,
})

function fixture(
  options: {
    absent?: boolean
    firstOccupied?: boolean
    secondOccupied?: boolean
    scratchPresence?: readonly ('absent' | 'present')[]
    rejectedScratch?: Partial<typeof scratch>
    fail?: string
    failAt?: { event: string; occurrence: number }
    observations?: Partial<
      Record<
        'parentHeld' | 'parentNamed' | 'scratchHeld' | 'scratchNamed',
        readonly Partial<typeof scratch>[]
      >
    >
    host?: Partial<{
      environmentKeys: readonly string[]
      platform: string
      nodeVersion: string
      execPath: string
      cwd: string
      euid: number
      flags: {
        directory: number
        noFollow: number
        closeOnExec: number | undefined
      }
      values: Record<string, string>
    }>
    drift?: {
      role: 'parent' | 'scratch'
      scope: 'held' | 'named'
      field?: keyof typeof scratch
    }
  } = {},
) {
  const events: string[] = []
  const host = {
    environmentKeys: [
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'TZ',
      '__CF_USER_TEXT_ENCODING',
    ],
    platform: 'darwin',
    nodeVersion: '24.18.1',
    execPath: '/opt/homebrew/Cellar/node@24/24.18.1/bin/node',
    cwd: repositoryRoot,
    euid: 501,
    flags: {
      directory: 0x00100000,
      noFollow: 0x00000100,
      closeOnExec: undefined,
    },
    values: { LANG: 'C', LC_ALL: 'C', TMPDIR: '/private/tmp', TZ: 'UTC' },
    ...options.host,
  }
  let occupancy = 0
  let scratchLookup = 0
  const eventOccurrences = new Map<string, number>()
  const observationOccurrences = new Map<string, number>()
  const record = (event: string) => {
    events.push(event)
    const occurrence = (eventOccurrences.get(event) ?? 0) + 1
    eventOccurrences.set(event, occurrence)
    return (
      options.fail === event ||
      (options.failAt?.event === event &&
        options.failAt.occurrence === occurrence)
    )
  }
  const observed = (role: 'parent' | 'scratch', scope: 'held' | 'named') => {
    const base =
      role === 'parent' ? parent : { ...scratch, ...options.rejectedScratch }
    const sequenceKey = `${role}${scope === 'held' ? 'Held' : 'Named'}` as
      'parentHeld' | 'parentNamed' | 'scratchHeld' | 'scratchNamed'
    const sequenceIndex = observationOccurrences.get(sequenceKey) ?? 0
    observationOccurrences.set(sequenceKey, sequenceIndex + 1)
    const sequenced = {
      ...base,
      ...(options.observations?.[sequenceKey]?.[sequenceIndex] ?? {}),
    }
    if (options.drift?.role !== role || options.drift.scope !== scope)
      return sequenced
    const field = options.drift.field ?? 'ino'
    if (field === 'directory')
      return { ...sequenced, directory: !sequenced.directory }
    if (field === 'symbolicLink')
      return { ...sequenced, symbolicLink: !sequenced.symbolicLink }
    return { ...sequenced, [field]: Number(sequenced[field]) + 1 }
  }
  const handle = (role: 'parent' | 'scratch') => ({
    stat: vi.fn(async () => {
      if (record(`stat-${role}`)) throw new Error('private-stat')
      return metadata(observed(role, 'held') as typeof scratch)
    }),
    close: vi.fn(async () => {
      if (record(`close-${role}`)) throw new Error('private-close')
    }),
  })
  const handles = { parent: handle('parent'), scratch: handle('scratch') }
  const dependencies = {
    hostReaders: {
      environmentKeys: vi.fn(() => [...host.environmentKeys]),
      environmentValue: vi.fn((key: string) => host.values[key]),
      platform: vi.fn(() => host.platform),
      nodeVersion: vi.fn(() => host.nodeVersion),
      execPath: vi.fn(() => host.execPath),
      cwd: vi.fn(() => host.cwd),
      euid: vi.fn(() => host.euid),
      flagValues: vi.fn(() => ({ ...host.flags })),
    },
    realpath: vi.fn(async () => {
      if (record('realpath')) throw new Error('private-realpath')
      return repositoryRoot
    }),
    openDirectory: vi.fn(async (path: string) => {
      const role = path === parentPath ? 'parent' : 'scratch'
      if (record(`open-${role}`)) throw new Error('private-open')
      return handles[role]
    }),
    lstat: vi.fn(async (path: string) => {
      const role = path === parentPath ? 'parent' : 'scratch'
      if (record(`lstat-${role}`)) throw new Error('private-lstat')
      const presence =
        role === 'scratch'
          ? options.scratchPresence?.[scratchLookup++]
          : undefined
      if (role === 'scratch' && (options.absent || presence === 'absent')) {
        const error = new Error('private-absent') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
      return metadata(observed(role, 'named') as typeof scratch)
    }),
    openOccupancy: vi.fn(async (_path: string, settings: unknown) => {
      occupancy += 1
      if (record(`open-occupancy-${occupancy}`))
        throw new Error('private-occupancy-open')
      const occupied =
        occupancy === 1 ? options.firstOccupied : options.secondOccupied
      const privateEntry = new Proxy(
        {},
        {
          get: (_target, key) => {
            if (key === 'then') return undefined
            throw new Error('private-dirent-property-read')
          },
          getOwnPropertyDescriptor: () => {
            throw new Error('private-dirent-reflection')
          },
          ownKeys: () => {
            throw new Error('private-dirent-reflection')
          },
        },
      )
      return {
        read: vi.fn(async () => {
          if (record(`read-occupancy-${occupancy}`))
            throw new Error('private-occupancy-read')
          return occupied ? privateEntry : null
        }),
        close: vi.fn(async () => {
          if (record(`close-occupancy-${occupancy}`))
            throw new Error('private-occupancy-close')
        }),
        settings,
      }
    }),
    formResult: vi.fn((scratchState: string) => {
      record('form-result')
      if (options.fail === 'form-result') throw new Error('private-result')
      return Object.freeze({ scratchState })
    }),
  }
  return { dependencies, events, handles }
}

const run = async (
  current: ReturnType<typeof fixture>,
  args: readonly string[] = argv,
) =>
  classifier.runPublicFdResidueClassifierForFixture(args, current.dependencies)

describe('Decision 142 public FD residue classifier', () => {
  it('keeps every fixture seam test-only', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const current = fixture()
    try {
      await expect(run(current)).rejects.toThrow('fixture-only')
      expect(() =>
        classifier.formatPublicFdResidueResultForFixture({}),
      ).toThrow('fixture-only')
      await expect(
        classifier.writePublicFdResidueResultForFixture('', vi.fn()),
      ).rejects.toThrow('fixture-only')
      expect(current.dependencies.realpath).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [{ absent: true }, 'absent'],
    [{}, 'observed-empty-candidate'],
    [{ firstOccupied: true }, 'present-unclassified'],
    [{ firstOccupied: false, secondOccupied: true }, 'present-unclassified'],
    [{ rejectedScratch: { mode: 0o755 } }, 'present-unclassified'],
    [{ rejectedScratch: { directory: false } }, 'present-unclassified'],
    [{ rejectedScratch: { symbolicLink: true } }, 'present-unclassified'],
  ] as const)('classifies synthetic state %# as %s', async (options, state) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      await expect(run(fixture(options))).resolves.toEqual({
        scratchState: state,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('uses two one-read occupancy handles without accessing Dirent properties', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = fixture()
    try {
      await expect(run(current)).resolves.toEqual({
        scratchState: 'observed-empty-candidate',
      })
      expect(
        current.events.filter((event) => event.startsWith('read-occupancy')),
      ).toEqual(['read-occupancy-1', 'read-occupancy-2'])
      expect(
        current.events.filter((event) => event.startsWith('close-occupancy')),
      ).toEqual(['close-occupancy-1', 'close-occupancy-2'])
      expect(current.dependencies.openOccupancy).toHaveBeenNthCalledWith(
        1,
        scratchPath,
        { encoding: 'utf8', bufferSize: 1, recursive: false },
      )
      expect(current.dependencies.openOccupancy).toHaveBeenNthCalledWith(
        2,
        scratchPath,
        { encoding: 'utf8', bufferSize: 1, recursive: false },
      )
      expect(current.dependencies.openDirectory).toHaveBeenNthCalledWith(
        1,
        parentPath,
        0x01100100,
      )
      expect(current.dependencies.openDirectory).toHaveBeenNthCalledWith(
        2,
        scratchPath,
        0x01100100,
      )
      expect(current.dependencies.hostReaders.flagValues).toHaveReturnedWith({
        directory: 0x00100000,
        noFollow: 0x00000100,
        closeOnExec: undefined,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not open the scratch for absent or stable rejected states and stops after one occupied read', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const options of [
        { absent: true },
        { rejectedScratch: { mode: 0o755 } },
      ]) {
        const current = fixture(options)
        await run(current)
        expect(current.dependencies.openDirectory).toHaveBeenCalledTimes(1)
        expect(current.dependencies.openOccupancy).not.toHaveBeenCalled()
        expect(current.events.slice(-2)).toEqual([
          'close-parent',
          'form-result',
        ])
      }
      const occupied = fixture({ firstOccupied: true })
      await run(occupied)
      expect(occupied.dependencies.openOccupancy).toHaveBeenCalledTimes(1)
      expect(
        occupied.events.filter((event) => event.startsWith('read-occupancy')),
      ).toEqual(['read-occupancy-1'])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rejects historical and malformed argv before host or filesystem access', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const args of [
        [],
        ['classify-a-fd-map-residue'],
        [...argv, 'extra'],
        ['classify-a-fd-map-residue', '--invented'],
        [
          'diagnose-a-fd-map',
          '--confirm-m45-policy-native-a-fd-map-diagnostic-v3',
        ],
        [
          'recover-a-fd-map-scratch',
          '--confirm-m45-policy-native-a-fd-map-scratch-recovery-v1',
        ],
        [
          'classify-public-scratch-xattr',
          '--confirm-m45-public-scratch-xattr-classifier-v3',
        ],
        [
          'classify-public-scratch-xattr',
          '--confirm-m45-public-scratch-xattr-classifier-v2',
        ],
        [
          'classify-public-scratch-xattr',
          '--confirm-m45-public-scratch-xattr-classifier-v1',
        ],
        [
          'diagnose-public-scratch-classifier-stop',
          '--confirm-m45-public-scratch-classifier-stop-v1',
        ],
        [
          'diagnose-public-host-admission',
          '--confirm-m45-public-host-admission-v1',
        ],
        [
          'classify-public-host-environment-keyset',
          '--confirm-m45-public-host-environment-keyset-v1',
        ],
      ]) {
        const current = fixture()
        await expect(run(current, args)).rejects.toThrow('classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      }
      const accessor = [...argv]
      Object.defineProperty(accessor, '0', {
        enumerable: true,
        configurable: true,
        get: () => {
          throw new Error('private-argv')
        },
      })
      const current = fixture()
      await expect(run(current, accessor)).rejects.toThrow('classifier-stopped')
      expect(current.dependencies.realpath).not.toHaveBeenCalled()
      for (const malformed of [
        new Array(2),
        new Proxy([...argv], {}),
        Object.assign([...argv], { extra: true }),
      ]) {
        const rejected = fixture()
        await expect(run(rejected, malformed)).rejects.toThrow(
          'classifier-stopped',
        )
        expect(rejected.dependencies.realpath).not.toHaveBeenCalled()
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rejects host, environment, cwd, and flag mismatches before data-plane access', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const host of [
        { platform: 'linux' },
        { nodeVersion: '24.18.0' },
        { execPath: '/usr/bin/node' },
        { cwd: '/tmp' },
        { euid: 0 },
        { environmentKeys: ['LANG', 'LC_ALL', 'TMPDIR', 'TZ'] },
        {
          environmentKeys: [
            'EXTRA',
            'LANG',
            'LC_ALL',
            'TMPDIR',
            'TZ',
            '__CF_USER_TEXT_ENCODING',
          ],
        },
        {
          values: { LANG: 'x', LC_ALL: 'C', TMPDIR: '/private/tmp', TZ: 'UTC' },
        },
        {
          values: {
            LANG: 'C',
            LC_ALL: 'x',
            TMPDIR: '/private/tmp',
            TZ: 'UTC',
          },
        },
        {
          values: { LANG: 'C', LC_ALL: 'C', TMPDIR: '/tmp', TZ: 'UTC' },
        },
        {
          values: { LANG: 'C', LC_ALL: 'C', TMPDIR: '/private/tmp', TZ: 'x' },
        },
        { flags: { directory: 1, noFollow: 0x100, closeOnExec: 0x1000000 } },
        { flags: { directory: 0x100000, noFollow: 1, closeOnExec: 0x1000000 } },
        { flags: { directory: 0x100000, noFollow: 0x100, closeOnExec: 1 } },
      ]) {
        const current = fixture({ host })
        await expect(run(current)).rejects.toThrow('classifier-stopped')
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      }
      const current = fixture({ fail: 'realpath' })
      await expect(run(current)).rejects.toThrow('classifier-stopped')
      expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      const resolvedDrift = fixture()
      resolvedDrift.dependencies.realpath.mockResolvedValue('/private/tmp')
      await expect(run(resolvedDrift)).rejects.toThrow('classifier-stopped')
      expect(resolvedDrift.dependencies.openDirectory).not.toHaveBeenCalled()
      for (const environmentKeys of [
        new Proxy(
          ['LANG', 'LC_ALL', 'TMPDIR', 'TZ', '__CF_USER_TEXT_ENCODING'],
          {},
        ),
        Object.defineProperty(
          ['LANG', 'LC_ALL', 'TMPDIR', 'TZ', '__CF_USER_TEXT_ENCODING'],
          '0',
          { enumerable: true, configurable: true, get: () => 'LANG' },
        ),
      ]) {
        const malformed = fixture()
        malformed.dependencies.hostReaders.environmentKeys.mockReturnValue(
          environmentKeys,
        )
        await expect(run(malformed)).rejects.toThrow('classifier-stopped')
        expect(malformed.dependencies.realpath).not.toHaveBeenCalled()
      }
      const injectedValue = vi.fn((key: string) => {
        if (key === '__CF_USER_TEXT_ENCODING')
          throw new Error('private-cf-value')
        const values: Record<string, string> = {
          LANG: 'C',
          LC_ALL: 'C',
          TMPDIR: '/private/tmp',
          TZ: 'UTC',
        }
        return values[key]
      })
      const cf = fixture()
      cf.dependencies.hostReaders.environmentValue = injectedValue
      await expect(run(cf)).resolves.toEqual({
        scratchState: 'observed-empty-candidate',
      })
      expect(injectedValue).not.toHaveBeenCalledWith('__CF_USER_TEXT_ENCODING')
      const exactDefinedCloseOnExec = fixture({
        host: {
          flags: {
            directory: 0x00100000,
            noFollow: 0x00000100,
            closeOnExec: 0x01000000,
          },
        },
      })
      await expect(run(exactDefinedCloseOnExec)).resolves.toEqual({
        scratchState: 'observed-empty-candidate',
      })
      expect(
        exactDefinedCloseOnExec.dependencies.openDirectory,
      ).toHaveBeenNthCalledWith(1, parentPath, 0x01100100)
      const validReaders = fixture().dependencies.hostReaders
      for (const malformedReaders of [
        new Proxy(validReaders, {}),
        { ...validReaders, extra: vi.fn() },
        Object.fromEntries(
          Object.entries(validReaders).filter(([key]) => key !== 'platform'),
        ),
        Object.defineProperty({ ...validReaders }, 'platform', {
          enumerable: true,
          configurable: true,
          get: () => vi.fn(() => 'darwin'),
        }),
      ]) {
        const malformed = fixture()
        malformed.dependencies.hostReaders =
          malformedReaders as typeof validReaders
        await expect(run(malformed)).rejects.toThrow('classifier-stopped')
        expect(malformed.dependencies.realpath).not.toHaveBeenCalled()
      }
      for (const malformedFlags of [
        new Proxy(
          { directory: 0x100000, noFollow: 0x100, closeOnExec: 0x1000000 },
          {},
        ),
        { directory: 0x100000, noFollow: 0x100 },
        {
          directory: 0x100000,
          noFollow: 0x100,
          closeOnExec: 0x1000000,
          extra: 1,
        },
        Object.defineProperty(
          { directory: 0x100000, noFollow: 0x100 },
          'closeOnExec',
          { enumerable: true, get: () => 0x1000000 },
        ),
      ]) {
        const malformed = fixture()
        malformed.dependencies.hostReaders.flagValues.mockReturnValue(
          malformedFlags as {
            directory: number
            noFollow: number
            closeOnExec: number
          },
        )
        await expect(run(malformed)).rejects.toThrow('classifier-stopped')
        expect(malformed.dependencies.realpath).not.toHaveBeenCalled()
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('closes occupancy, scratch, and parent in order and suppresses safe results on failure', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const fail of [
        'open-parent',
        'stat-parent',
        'lstat-parent',
        'open-scratch',
        'stat-scratch',
        'lstat-scratch',
        'open-occupancy-1',
        'read-occupancy-1',
        'close-occupancy-1',
        'open-occupancy-2',
        'read-occupancy-2',
        'close-occupancy-2',
        'close-scratch',
        'close-parent',
      ]) {
        const current = fixture({ fail })
        await expect(run(current)).rejects.toThrow('classifier-stopped')
        if (current.handles.parent.close.mock.calls.length !== 0)
          expect(current.events.at(-1)).toBe('close-parent')
      }
      const current = fixture()
      await run(current)
      expect(current.events.slice(-3)).toEqual([
        'close-scratch',
        'close-parent',
        'form-result',
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('classifies ENOENT only at the fixed-name lookup boundary', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture()
      const malformed = metadata(scratch)
      Object.defineProperty(malformed, 'uid', {
        enumerable: true,
        configurable: true,
        get: () => {
          const error = new Error('private-metadata') as NodeJS.ErrnoException
          error.code = 'ENOENT'
          throw error
        },
      })
      current.dependencies.lstat.mockImplementation(async (path: string) =>
        path === scratchPath ? malformed : metadata(parent as typeof scratch),
      )
      await expect(run(current)).rejects.toThrow('classifier-stopped')
      expect(current.events.at(-1)).toBe('close-parent')
      expect(current.dependencies.openDirectory).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('suppresses safe classes when any close rejects without an error value', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const occupancy = fixture()
      occupancy.dependencies.openOccupancy.mockImplementationOnce(async () => ({
        read: vi.fn(async () => null),
        close: vi.fn(async () => Promise.reject()),
        settings: {},
      }))
      await expect(run(occupancy)).rejects.toThrow('classifier-stopped')
      expect(occupancy.events.at(-1)).toBe('close-parent')

      for (const role of ['scratch', 'parent'] as const) {
        const current = fixture()
        current.handles[role].close.mockImplementationOnce(async () =>
          Promise.reject(),
        )
        await expect(run(current)).rejects.toThrow('classifier-stopped')
        expect(current.handles.parent.close).toHaveBeenCalledTimes(1)
        expect(current.handles.scratch.close).toHaveBeenCalledTimes(1)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('stops at every repeated custody observation and preserves the exact acquired-handle close suffix', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const baseline = fixture()
      await run(baseline)
      for (const event of [
        'stat-parent',
        'lstat-parent',
        'stat-scratch',
        'lstat-scratch',
      ]) {
        const count = baseline.events.filter((value) => value === event).length
        for (let occurrence = 1; occurrence <= count; occurrence += 1) {
          const current = fixture({ failAt: { event, occurrence } })
          await expect(run(current)).rejects.toThrow('classifier-stopped')
          const closes = current.events.filter(
            (value) => value === 'close-scratch' || value === 'close-parent',
          )
          expect(closes).toEqual(
            current.events.includes('open-scratch')
              ? ['close-scratch', 'close-parent']
              : ['close-parent'],
          )
        }
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('stops on temporal absence, identity, and occupancy-boundary substitutions', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const scratchPresence of [
        ['absent', 'present'],
        ['present', 'absent'],
      ] as const)
        await expect(run(fixture({ scratchPresence }))).rejects.toThrow(
          'classifier-stopped',
        )

      for (const observations of [
        {
          scratchNamed: [{}, {}, {}, { ino: scratch.ino + 1 }],
        },
        {
          scratchNamed: [{}, {}, { ino: scratch.ino + 1 }],
        },
        {
          scratchNamed: [{}, {}, {}, {}, { ino: scratch.ino + 1 }],
        },
        {
          scratchHeld: [{}, { ino: scratch.ino + 1 }],
        },
        {
          parentNamed: [{}, {}, {}, {}, { ino: parent.ino + 1 }],
        },
      ])
        await expect(run(fixture({ observations }))).rejects.toThrow(
          'classifier-stopped',
        )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('forms the result only after the exact successful close suffix', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture()
      await run(current)
      expect(current.events.slice(-3)).toEqual([
        'close-scratch',
        'close-parent',
        'form-result',
      ])
      const failed = fixture({ fail: 'form-result' })
      await expect(run(failed)).rejects.toThrow('classifier-stopped')
      expect(failed.events.slice(-3)).toEqual([
        'close-scratch',
        'close-parent',
        'form-result',
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('stops on held or named identity drift', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const role of ['parent', 'scratch'] as const)
        for (const scope of ['held', 'named'] as const)
          await expect(
            run(fixture({ drift: { role, scope } })),
          ).rejects.toThrow('classifier-stopped')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('binds every parent and admitted scratch field without using directory size as a constant', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const field of [
        'uid',
        'gid',
        'dev',
        'ino',
        'mode',
        'directory',
        'symbolicLink',
      ] as const)
        await expect(
          run(
            fixture({
              drift: { role: 'parent', scope: 'named', field },
            }),
          ),
        ).rejects.toThrow('classifier-stopped')
      for (const field of ['gid', 'ino', 'size'] as const)
        await expect(
          run(
            fixture({
              drift: { role: 'scratch', scope: 'named', field },
            }),
          ),
        ).rejects.toThrow('classifier-stopped')
      for (const field of [
        'uid',
        'dev',
        'mode',
        'nlink',
        'directory',
        'symbolicLink',
      ] as const)
        await expect(
          run(
            fixture({
              drift: { role: 'scratch', scope: 'named', field },
            }),
          ),
        ).resolves.toEqual({ scratchState: 'present-unclassified' })
      await expect(
        run(fixture({ rejectedScratch: { size: 96 } })),
      ).resolves.toEqual({ scratchState: 'observed-empty-candidate' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('formats only frozen ordinary closed results and writes once', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const scratchState of [
        'absent',
        'observed-empty-candidate',
        'present-unclassified',
      ]) {
        const line = `{"mode":"classify-a-fd-map-residue","status":"a-fd-map-residue-classified","scratchState":"${scratchState}"}\n`
        expect(
          classifier.formatPublicFdResidueResultForFixture(
            Object.freeze({ scratchState }),
          ),
        ).toEqual({ line, exitCode: 0 })
      }
      const stopped =
        '{"mode":"classify-a-fd-map-residue","status":"stopped"}\n'
      expect(
        classifier.formatPublicFdResidueResultForFixture(
          Object.freeze({ stopped: true }),
        ),
      ).toEqual({ line: stopped, exitCode: 1 })
      for (const malformed of [
        undefined,
        { scratchState: 'absent' },
        Object.freeze({}),
        Object.freeze({ scratchState: 'unknown' }),
        Object.freeze({ scratchState: 'absent', extra: true }),
        Object.freeze({ stopped: true, scratchState: 'absent' }),
        Object.create({ scratchState: 'absent' }),
        new Proxy(Object.freeze({ scratchState: 'absent' }), {}),
        Object.freeze(
          Object.defineProperty({}, 'scratchState', {
            enumerable: true,
            get: () => {
              throw new Error('private-result')
            },
          }),
        ),
        Object.freeze(
          Object.defineProperty({ scratchState: 'absent' }, Symbol('extra'), {
            value: true,
          }),
        ),
        Object.freeze(
          Object.defineProperty({ scratchState: 'absent' }, 'extra', {
            value: true,
          }),
        ),
      ])
        expect(
          classifier.formatPublicFdResidueResultForFixture(malformed),
        ).toEqual({
          line: stopped,
          exitCode: 1,
        })
      const write = vi.fn(async () => {})
      await expect(
        classifier.writePublicFdResidueResultForFixture(stopped, write),
      ).resolves.toBe(1)
      expect(write).toHaveBeenCalledExactlyOnceWith(stopped)
      await expect(
        classifier.writePublicFdResidueResultForFixture(stopped, async () => {
          throw new Error('private-write')
        }),
      ).resolves.toBe(1)
      await expect(
        classifier.writePublicFdResidueResultForFixture('private\n', write),
      ).resolves.toBe(1)
      await expect(
        classifier.writePublicFdResidueResultForFixture(stopped, null),
      ).resolves.toBe(1)
      expect(write).toHaveBeenCalledTimes(1)
      for (const scratchState of [
        'absent',
        'observed-empty-candidate',
        'present-unclassified',
      ]) {
        const line = `{"mode":"classify-a-fd-map-residue","status":"a-fd-map-residue-classified","scratchState":"${scratchState}"}\n`
        const safeWrite = vi.fn(async () => {})
        await expect(
          classifier.writePublicFdResidueResultForFixture(line, safeWrite),
        ).resolves.toBe(0)
        expect(safeWrite).toHaveBeenCalledExactlyOnceWith(line)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('uses the production-shared execute catch, formatter, writer, and exit-code path without default access', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const safe = fixture({ absent: true })
      const safeWrite = vi.fn(async () => {})
      await expect(
        classifier.executePublicFdResidueClassifierForFixture(
          argv,
          safe.dependencies,
          safeWrite,
        ),
      ).resolves.toBe(0)
      expect(safeWrite).toHaveBeenCalledExactlyOnceWith(
        '{"mode":"classify-a-fd-map-residue","status":"a-fd-map-residue-classified","scratchState":"absent"}\n',
      )

      const stopped = fixture({ fail: 'realpath' })
      const stoppedWrite = vi.fn(async () => {})
      await expect(
        classifier.executePublicFdResidueClassifierForFixture(
          argv,
          stopped.dependencies,
          stoppedWrite,
        ),
      ).resolves.toBe(1)
      expect(stoppedWrite).toHaveBeenCalledExactlyOnceWith(
        '{"mode":"classify-a-fd-map-residue","status":"stopped"}\n',
      )

      const rejected = fixture()
      const rejectedWrite = vi.fn(async () => {})
      await expect(
        classifier.executePublicFdResidueClassifierForFixture(
          ['invented', 'mode'],
          new Proxy(rejected.dependencies, {
            ownKeys: () => {
              throw new Error('dependencies-read')
            },
          }),
          rejectedWrite,
        ),
      ).resolves.toBe(1)
      expect(rejectedWrite).toHaveBeenCalledExactlyOnceWith(
        '{"mode":"classify-a-fd-map-residue","status":"stopped"}\n',
      )
      expect(rejected.dependencies.realpath).not.toHaveBeenCalled()

      await expect(
        classifier.executePublicFdResidueClassifierForFixture(
          argv,
          fixture({ absent: true }).dependencies,
          async () => Promise.reject(),
        ),
      ).resolves.toBe(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('statically retires the old classifier and excludes privacy, mutation, and child authority', async () => {
    const source = await readFile(new URL(moduleUrl), 'utf8')
    expect(
      [...source.matchAll(/^import .* from '([^']+)'$/gmu)].map(
        (match) => match[1],
      ),
    ).toEqual(['node:fs', 'node:fs/promises', 'node:url', 'node:util'])
    expect(source).not.toMatch(/child_process|\bspawn\b|\bexec(?:File)?\b/u)
    expect(source).not.toMatch(
      /\b(?:writeFile|appendFile|mkdir|chmod|rename|unlink|rmdir|rm)\b/u,
    )
    expect(source).not.toMatch(
      /xattr|acl|readFile|createHash|readdir|recursive:\s*true/iu,
    )
    expect(source).not.toMatch(
      /node:(?:net|http|https|tls|dns|dgram)|\bfetch\b|WebSocket|database|postgres|provider|uuid|randomUUID|retry|persist|application\//iu,
    )
    expect(source).not.toContain('.name')
    expect(source).toContain('bufferSize: 1')
    expect(source).toContain('recursive: false')
    expect(source).not.toContain('m45-public-scratch-xattr-classifier')
    expect(source).not.toContain('resolve(process.argv[1])')
    expect(source).toContain(
      'process.argv[1] === fileURLToPath(import.meta.url)',
    )
    expect(source).toContain('directory: fsConstants.O_DIRECTORY')
    expect(source).toContain('noFollow: fsConstants.O_NOFOLLOW')
    expect(source).toContain('closeOnExec: fsConstants.O_CLOEXEC')
    expect(source).toContain('flags.closeOnExec !== undefined')
    expect(source).toContain('flags.closeOnExec !== darwinCloseOnExec')
    expect(source).toContain('flags.noFollow |\n      darwinCloseOnExec')
    const resultFormation = source.indexOf(
      'return dependencies.formResult(scratchState)',
    )
    expect(resultFormation).toBeGreaterThan(0)
    expect(
      source.lastIndexOf('await active.close()', resultFormation),
    ).toBeGreaterThan(0)
    expect(
      source.lastIndexOf('await active.close()', resultFormation),
    ).toBeLessThan(resultFormation)
    await expect(
      readFile(
        new URL(
          '../scripts/m45-public-scratch-xattr-classifier.mjs',
          import.meta.url,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(
        new URL(
          './m45-public-scratch-xattr-classifier.test.ts',
          import.meta.url,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    const retiredPatterns = [
      'm45-public-scratch-xattr-classifier',
      'classify-public-scratch-xattr',
      '--confirm-m45-public-scratch-xattr-classifier-v3',
    ]
    for await (const path of glob(
      ['scripts/**/*.{js,mjs,ts,tsx}', 'src/**/*.{js,mjs,ts,tsx}'],
      {
        cwd: repositoryRoot,
        exclude: (candidate) => candidate.includes('.test.'),
      },
    )) {
      const currentSource = await readFile(`${repositoryRoot}/${path}`, 'utf8')
      for (const pattern of retiredPatterns)
        expect(currentSource).not.toContain(pattern)
    }
  })
})
